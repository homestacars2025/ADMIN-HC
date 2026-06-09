// Vercel Serverless Function — HomestaCars Image Generator
//
// NOTE: This is a framework-agnostic Vercel Function (this app is Create React
// App, NOT Next.js — there is no App Router). On Vercel, files under the root
// `/api` directory are deployed as Node.js serverless functions regardless of
// the frontend framework, and are reachable same-origin at `/api/generate-image`
// (no CORS, no separate deploy). It is a direct port of the former Supabase
// Edge Function — same logic, different runtime.
//
// Uses the canonical Vercel Node signature `(req, res)` (NOT the web-standard
// Request/Response form, which @vercel/node may not invoke correctly for a
// non-Next /api function — that produced FUNCTION_INVOCATION_FAILED). req/res
// are typed loosely as `any` to avoid pulling in the @vercel/node types as a
// dependency. All clients are lazy-initialised inside the handler so missing
// env vars surface as readable JSON instead of crashing the function.
//
// Runtime: Node.js (default — required; Edge has payload size limits that break
// large base64 image uploads). maxDuration raised for slower Gemini responses.
export const config = { maxDuration: 120 };

import { createClient } from '@supabase/supabase-js';

const MOODS = ['daylight', 'golden_hour', 'blue_hour_night', 'overcast'] as const;
const ENVS = ['city', 'coastal', 'mountains', 'forest', 'highway', 'architecture'] as const;

function pickMood(recentMoods: string[]): string {
  if (Math.random() < 0.6) return 'daylight';
  const others = (MOODS as readonly string[]).filter((m) => m !== 'daylight');
  const unused = others.filter((m) => !recentMoods.includes(m));
  const pool = unused.length > 0 ? unused : others;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickEnv(recentEnvs: string[]): string {
  const available = (ENVS as readonly string[]).filter((e) => !recentEnvs.includes(e));
  const pool = available.length > 0 ? available : [...ENVS];
  return pool[Math.floor(Math.random() * pool.length)];
}

// Vercel auto-parses JSON bodies into req.body, but be defensive about string /
// Buffer bodies too.
function parseBody(req: any): any {
  const b = req?.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString('utf8'));
    } catch {
      return {};
    }
  }
  return b;
}

type CarRow = {
  id: number;
  model_group_id: number | null;
  car_photo_urls: { url: string; name: string; uploaded_at: string }[] | null;
};

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  // Stage tracking + extra context for the unified error response below.
  let stage = 'init';
  let extra: unknown = null;
  let contentId: string | undefined;
  let socialSupa: any;

  try {
    // ── 0. Env + clients ────────────────────────────────────────────────────────
    stage = 'init_supabase';
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.REACT_APP_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.REACT_APP_SUPABASE_SERVICE_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl) throw new Error('Missing SUPABASE_URL (or REACT_APP_SUPABASE_URL) env var');
    if (!serviceKey) {
      throw new Error(
        'Missing SUPABASE_SERVICE_ROLE_KEY (or REACT_APP_SUPABASE_SERVICE_KEY) env var',
      );
    }
    if (!geminiKey) throw new Error('Missing GEMINI_API_KEY env var');

    const publicSupa = createClient(supabaseUrl, serviceKey);
    socialSupa = createClient(supabaseUrl, serviceKey, { db: { schema: 'social' } });

    // ── Parse body ──────────────────────────────────────────────────────────────
    stage = 'parse_body';
    const body = parseBody(req);
    contentId = body.content_id;
    const mode: 'create' | 'regenerate' = body.mode === 'regenerate' ? 'regenerate' : 'create';
    if (!contentId) {
      throw new Error('content_id is required');
    }

    // ── 1. Read the content row ─────────────────────────────────────────────────
    stage = 'read_row';
    console.log('[generate-image] stage:read_row', { content_id: contentId });
    const { data: post, error: postErr } = await socialSupa
      .from('sm_content_social')
      .select('*')
      .eq('id', contentId)
      .single();

    if (postErr) {
      extra = postErr;
      throw new Error(`read_row failed: ${postErr.message}`);
    }
    if (!post) {
      throw new Error('Content row not found');
    }
    if (post.status !== 'approved') {
      throw new Error('Text not approved yet — approve the content first.');
    }

    // ── 2. Read constitutions ───────────────────────────────────────────────────
    stage = 'read_bots';
    console.log('[generate-image] stage:read_bots', { content_id: contentId });
    const { data: bots, error: botsErr } = await socialSupa
      .from('sm_bots')
      .select('bot_name, constitution')
      .in('bot_name', ['general', 'image_generator'])
      .eq('is_active', true);

    if (botsErr) {
      extra = botsErr;
      throw new Error(`read_bots failed: ${botsErr.message}`);
    }

    const generalConstitution =
      bots?.find((b: { bot_name: string }) => b.bot_name === 'general')?.constitution ?? '';
    const imageConstitution =
      bots?.find((b: { bot_name: string }) => b.bot_name === 'image_generator')?.constitution ?? '';

    // ── 3. Recent approved rows for variety ─────────────────────────────────────
    const { data: recentApproved } = await socialSupa
      .from('sm_content_social')
      .select('used_model_group_id, image_environment')
      .eq('image_status', 'image_approved')
      .order('image_generated_at', { ascending: false })
      .limit(3);

    const recentModelGroups = (recentApproved ?? [])
      .map((r: { used_model_group_id: number | null }) => r.used_model_group_id)
      .filter(Boolean) as number[];
    const recentEnvs = (recentApproved ?? [])
      .map((r: { image_environment: string | null }) => r.image_environment)
      .filter(Boolean) as string[];

    // ── 4. Pick a car with photos ───────────────────────────────────────────────
    stage = 'pick_car';
    const { data: allCars, error: carsErr } = await publicSupa
      .from('cars')
      .select('id, model_group_id, car_photo_urls')
      .eq('is_active', true);

    if (carsErr) {
      extra = carsErr;
      throw new Error(`pick_car query failed: ${carsErr.message}`);
    }

    const carsWithPhotos: CarRow[] = ((allCars ?? []) as CarRow[]).filter(
      (c) => Array.isArray(c.car_photo_urls) && c.car_photo_urls.length > 0,
    );
    console.log('[generate-image] stage:pick_car', { candidates_count: carsWithPhotos.length });

    if (carsWithPhotos.length === 0) {
      throw new Error('No active cars with photos found. Upload car photos first.');
    }

    const preferredCars = carsWithPhotos.filter((c) => !recentModelGroups.includes(c.model_group_id!));
    const carPool = preferredCars.length > 0 ? preferredCars : carsWithPhotos;
    const chosenCar = carPool[Math.floor(Math.random() * carPool.length)];

    // ── 5. Pick one photo ───────────────────────────────────────────────────────
    const photos = chosenCar.car_photo_urls!;
    const chosenPhoto = photos[Math.floor(Math.random() * photos.length)];
    const photoUrl = chosenPhoto.url;

    // ── 6. Download photo → base64 ──────────────────────────────────────────────
    stage = 'download_photo';
    console.log('[generate-image] stage:download_photo', { photo_url: photoUrl });
    const photoRes = await fetch(photoUrl);
    if (!photoRes.ok) {
      throw new Error(`Failed to download car photo: HTTP ${photoRes.status}`);
    }
    const photoBuffer = Buffer.from(await photoRes.arrayBuffer());
    const photoBase64 = photoBuffer.toString('base64');
    const mimeType = photoRes.headers.get('content-type') ?? 'image/jpeg';

    // ── 7. Pick mood + environment ──────────────────────────────────────────────
    const chosenMood = pickMood(recentEnvs);
    const chosenEnv = pickEnv(recentEnvs);

    // ── 8. Build prompt ─────────────────────────────────────────────────────────
    const concept =
      post.image_brief || post.caption || post.headline || 'Premium car advertisement';

    let prompt = '';
    if (mode === 'regenerate' && post.image_review_note) {
      prompt += `FIX THIS (the previous image was rejected because): ${post.image_review_note}\n\n`;
    }
    prompt += `Use the provided photo of this EXACT car as the base for image-to-image. Keep the same car: same model, color, body shape, badges and wheels. Do NOT change the vehicle. Relight and place it into a new cinematic scene.

CONCEPT: ${concept}
ENVIRONMENT: ${chosenEnv}
TIME MOOD: ${chosenMood}

COMPOSITION (STRICT): vertical 4:5 frame. The car and ground sit in the BOTTOM 40% only. The TOP 60% must be open, empty sky or backdrop with generous breathing space reserved for text later. Never center the car vertically. LOW camera angle near ground level looking slightly up at the car.

LOOK: cinematic, hyper realistic, like a real photograph on a 35mm lens at f/2.8, shallow depth of field, sharp car soft background. ONE dominant directional light with physically consistent shadows. Realistic reflections of sky and surroundings on the car body and ground. Calm slightly desaturated grade, soft contrast, deep gray shadows not pure black, highlights not blown out, subtle teal and orange cinematic grade, very faint film grain.

HARD RULES: no text, no logo, no watermark, no graphics. No deformed wheels, no fake badges, no readable fake plates, no distorted people. Photorealistic only, no HDR over saturation, no plastic over smooth look.

BRAND RULESET (grounding):
${generalConstitution}

${imageConstitution}`;

    // ── 9. Set to generating ────────────────────────────────────────────────────
    await socialSupa
      .from('sm_content_social')
      .update({ image_status: 'generating' })
      .eq('id', contentId);

    // ── 10. Call Gemini ─────────────────────────────────────────────────────────
    stage = 'gemini_call';
    console.log('[generate-image] stage:gemini_call', {
      prompt_length: prompt.length,
      base64_size_kb: Math.round(photoBase64.length / 1024),
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    let geminiRes: Response;
    try {
      geminiRes = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': geminiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: mimeType, data: photoBase64 } },
                ],
              },
            ],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
          signal: controller.signal,
        },
      );
    } catch (fetchErr) {
      await revertGenerating(socialSupa, contentId);
      extra = String(fetchErr);
      throw new Error(`Gemini request failed: ${String(fetchErr)}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      await revertGenerating(socialSupa, contentId);
      extra = errText.slice(0, 500);
      throw new Error(`Gemini API error ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();

    // ── 11. Extract the image ────────────────────────────────────────────────────
    stage = 'extract_image';
    const parts = geminiData?.candidates?.[0]?.content?.parts ?? [];
    let imageBase64: string | null = null;
    for (const part of parts) {
      const data = part?.inlineData?.data ?? part?.inline_data?.data;
      if (data) {
        imageBase64 = data;
        break;
      }
    }

    if (!imageBase64) {
      await revertGenerating(socialSupa, contentId);
      const textPart = parts.find((p: { text?: string }) => p.text)?.text ?? '';
      extra = textPart.slice(0, 500);
      throw new Error('Gemini returned no image');
    }

    // ── 12. Upload to storage ────────────────────────────────────────────────────
    stage = 'upload';
    const imgBytes = Buffer.from(imageBase64, 'base64');
    const storagePath = `poster_${contentId}_${Date.now()}.png`;
    console.log('[generate-image] stage:upload', { path: storagePath });

    const { error: uploadErr } = await publicSupa.storage
      .from('generated-images')
      .upload(storagePath, imgBytes, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadErr) {
      await revertGenerating(socialSupa, contentId);
      extra = uploadErr;
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    const {
      data: { publicUrl },
    } = publicSupa.storage.from('generated-images').getPublicUrl(storagePath);

    // ── 13. Update the row ───────────────────────────────────────────────────────
    stage = 'update_row';
    const { error: updateErr } = await socialSupa
      .from('sm_content_social')
      .update({
        generated_images: [{ url: publicUrl, order: 1 }],
        base_car_photo_url: photoUrl,
        used_car_id: chosenCar.id,
        used_model_group_id: chosenCar.model_group_id,
        image_status: 'pending_image_review',
        image_review_note: null,
        image_time_mood: chosenMood,
        image_environment: chosenEnv,
        image_generated_at: new Date().toISOString(),
      })
      .eq('id', contentId);

    if (updateErr) {
      extra = updateErr;
      throw new Error(`update_row failed: ${updateErr.message}`);
    }

    // ── 14. Return ───────────────────────────────────────────────────────────────
    stage = 'done';
    console.log('[generate-image] stage:done', { image_url: publicUrl });
    res.status(200).json({
      ok: true,
      image_url: publicUrl,
      model_used: 'gemini-2.5-flash-image',
      environment: chosenEnv,
      mood: chosenMood,
    });
  } catch (err) {
    const e = err as { message?: string; stack?: string };
    console.error(`[generate-image] FAILED at stage:${stage}`, e?.message, e?.stack);
    res.status(500).json({
      ok: false,
      stage,
      error_message: e?.message ?? String(err),
      error_stack_first_500: (e?.stack ?? '').slice(0, 500),
      extra,
    });
  }
}

// Best-effort revert of a row stuck in 'generating' back to 'not_started' so the
// admin can retry. Swallows its own errors — the caller is already failing.
async function revertGenerating(client: any, contentId: string): Promise<void> {
  try {
    await client
      .from('sm_content_social')
      .update({ image_status: 'not_started' })
      .eq('id', contentId);
  } catch {
    /* ignore */
  }
}
