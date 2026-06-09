// Vercel Serverless Function — HomestaCars Image Generator
//
// NOTE: This is a framework-agnostic Vercel Function (this app is Create React
// App, NOT Next.js — there is no App Router). On Vercel, files under the root
// `/api` directory are deployed as Node.js serverless functions regardless of
// the frontend framework, and are reachable same-origin at `/api/generate-image`
// (no CORS, no separate deploy). It is a direct port of the former Supabase
// Edge Function — same logic, different runtime.
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type CarRow = {
  id: number;
  model_group_id: number | null;
  car_photo_urls: { url: string; name: string; uploaded_at: string }[] | null;
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.REACT_APP_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.REACT_APP_SUPABASE_SERVICE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!supabaseUrl || !serviceKey) {
    return json(
      { ok: false, error: 'Supabase URL or service role key not configured on the server.' },
      500,
    );
  }
  if (!geminiKey) {
    return json(
      { ok: false, error: 'GEMINI_API_KEY is not set on the server (add it to Vercel env vars).' },
      500,
    );
  }

  const publicSupa = createClient(supabaseUrl, serviceKey);
  const socialSupa = createClient(supabaseUrl, serviceKey, { db: { schema: 'social' } });

  // ── Parse body ──────────────────────────────────────────────────────────────
  let contentId: string;
  let mode: 'create' | 'regenerate';
  try {
    const body = await req.json();
    contentId = body.content_id;
    mode = body.mode === 'regenerate' ? 'regenerate' : 'create';
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  if (!contentId) {
    return json({ ok: false, error: 'content_id is required' }, 400);
  }

  try {
    // ── 1. Read the content row ─────────────────────────────────────────────────
    const { data: post, error: postErr } = await socialSupa
      .from('sm_content_social')
      .select('*')
      .eq('id', contentId)
      .single();

    if (postErr || !post) {
      return json({ ok: false, error: 'Content row not found' }, 404);
    }
    if (post.status !== 'approved') {
      return json({ ok: false, error: 'Text not approved yet — approve the content first.' }, 400);
    }

    // ── 2. Read constitutions ───────────────────────────────────────────────────
    const { data: bots } = await socialSupa
      .from('sm_bots')
      .select('bot_name, constitution')
      .in('bot_name', ['general', 'image_generator'])
      .eq('is_active', true);

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
    const { data: allCars } = await publicSupa
      .from('cars')
      .select('id, model_group_id, car_photo_urls')
      .eq('is_active', true);

    const carsWithPhotos: CarRow[] = ((allCars ?? []) as CarRow[]).filter(
      (c) => Array.isArray(c.car_photo_urls) && c.car_photo_urls.length > 0,
    );

    if (carsWithPhotos.length === 0) {
      return json(
        { ok: false, error: 'No active cars with photos found. Upload car photos first.' },
        422,
      );
    }

    const preferredCars = carsWithPhotos.filter((c) => !recentModelGroups.includes(c.model_group_id!));
    const carPool = preferredCars.length > 0 ? preferredCars : carsWithPhotos;
    const chosenCar = carPool[Math.floor(Math.random() * carPool.length)];

    // ── 5. Pick one photo ───────────────────────────────────────────────────────
    const photos = chosenCar.car_photo_urls!;
    const chosenPhoto = photos[Math.floor(Math.random() * photos.length)];
    const photoUrl = chosenPhoto.url;

    // ── 6. Download photo → base64 ──────────────────────────────────────────────
    const photoRes = await fetch(photoUrl);
    if (!photoRes.ok) {
      return json({ ok: false, error: `Failed to download car photo: HTTP ${photoRes.status}` }, 500);
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
      await socialSupa
        .from('sm_content_social')
        .update({ image_status: 'not_started' })
        .eq('id', contentId);
      return json({ ok: false, error: `Gemini request failed: ${String(fetchErr)}` }, 502);
    } finally {
      clearTimeout(timeout);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      await socialSupa
        .from('sm_content_social')
        .update({ image_status: 'not_started' })
        .eq('id', contentId);
      return json(
        { ok: false, error: `Gemini API error ${geminiRes.status}: ${errText.slice(0, 200)}` },
        502,
      );
    }

    const geminiData = await geminiRes.json();

    // ── 11. Extract the image ────────────────────────────────────────────────────
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
      await socialSupa
        .from('sm_content_social')
        .update({ image_status: 'not_started' })
        .eq('id', contentId);
      const textPart = parts.find((p: { text?: string }) => p.text)?.text ?? '';
      return json(
        { ok: false, error: `Gemini returned no image. Model response: ${textPart.slice(0, 200)}` },
        502,
      );
    }

    // ── 12. Upload to storage ────────────────────────────────────────────────────
    const imgBytes = Buffer.from(imageBase64, 'base64');
    const storagePath = `poster_${contentId}_${Date.now()}.png`;

    const { error: uploadErr } = await publicSupa.storage
      .from('generated-images')
      .upload(storagePath, imgBytes, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadErr) {
      await socialSupa
        .from('sm_content_social')
        .update({ image_status: 'not_started' })
        .eq('id', contentId);
      return json({ ok: false, error: `Storage upload failed: ${uploadErr.message}` }, 500);
    }

    const {
      data: { publicUrl },
    } = publicSupa.storage.from('generated-images').getPublicUrl(storagePath);

    // ── 13. Update the row ───────────────────────────────────────────────────────
    await socialSupa
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

    // ── 14. Return ───────────────────────────────────────────────────────────────
    return json({
      ok: true,
      image_url: publicUrl,
      model_used: 'gemini-2.5-flash-image',
      environment: chosenEnv,
      mood: chosenMood,
    });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
