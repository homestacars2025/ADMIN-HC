import { friendlyError, mediaDb, requireAdmin, trimmed } from './client';
import { istanbulToday } from './dates';
import {
  EDITABLE_POST_FIELDS,
  type ActionResult,
  type ConvertResult,
  type EditablePostField,
  type IdeaInput,
  type InfluencerInput,
  type LookupTable,
  type PostInput,
  type SaveResult,
} from './types';

/*
 * Every action re-verifies the admin against the live profile row before touching
 * a table, then returns a plain result object — nothing here throws. The route
 * guard is not treated as evidence: it ran on the last navigation, not on this write.
 *
 * `updated_at` is stamped by BEFORE UPDATE triggers in the database, so no action
 * sends it.
 */

// ── Ideas ─────────────────────────────────────────────────────────────────────

export async function saveIdea(input: IdeaInput): Promise<SaveResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Title is required' };

  const payload = {
    title,
    content: trimmed(input.content),
    category: trimmed(input.category),
    goal_key: trimmed(input.goal_key),
    format_key: trimmed(input.format_key),
    note: trimmed(input.note),
  };

  if (input.id) {
    const { error } = await mediaDb().from('ideas').update(payload).eq('id', input.id);
    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true, id: input.id };
  }

  const { data, error } = await mediaDb()
    .from('ideas')
    .insert({ ...payload, created_by: auth.profileId })
    .select('id')
    .single();

  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Admin-only columns, written directly. The `guard_admin_columns` trigger rejects
 * these for staff; here they are the point of the section.
 */
export async function setIdeaFlag(
  ideaId: string,
  field: 'posted' | 'is_approved',
  value: boolean,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await mediaDb()
    .from('ideas')
    .update({ [field]: value })
    .eq('id', ideaId);

  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

/**
 * Deletes an idea, first releasing the post that points back at it.
 *
 * `posts.source_idea_id` references `ideas.id` with no ON DELETE clause, so a
 * converted idea cannot be removed while its post still claims it — Postgres
 * answers 23503. Clearing the provenance link first keeps the post (real work)
 * and drops only the idea the admin asked to remove.
 */
export async function deleteIdea(ideaId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error: unlinkError } = await mediaDb()
    .from('posts')
    .update({ source_idea_id: null })
    .eq('source_idea_id', ideaId);

  if (unlinkError) return { ok: false, error: friendlyError(unlinkError) };

  const { error } = await mediaDb().from('ideas').delete().eq('id', ideaId);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

export async function convertIdeaToPost(ideaId: string): Promise<ConvertResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = mediaDb();

  const { data: idea, error: readError } = await db
    .from('ideas')
    .select('id, title, content, goal_key, format_key, converted_post_id')
    .eq('id', ideaId)
    .single();

  if (readError) return { ok: false, error: friendlyError(readError) };
  if (!idea) return { ok: false, error: 'Idea not found' };

  // Idempotent: already converted → return the existing post, create nothing.
  const existing = (idea as { converted_post_id: string | null }).converted_post_id;
  if (existing) return { ok: true, postId: existing };

  const source = idea as {
    id: string;
    title: string | null;
    content: string | null;
    goal_key: string | null;
    format_key: string | null;
  };

  const { data: post, error: insertError } = await db
    .from('posts')
    .insert({
      post_date: istanbulToday(), // today, so it lands somewhere visible in the grid
      goal_key: source.goal_key,
      format_key: source.format_key,
      objective: source.title, // title  → objective
      caption: source.content, // content → caption
      source_idea_id: source.id,
      created_by: auth.profileId,
    })
    .select('id')
    .single();

  if (insertError) return { ok: false, error: friendlyError(insertError) };

  const postId = (post as { id: string }).id;

  const { error: linkError } = await db
    .from('ideas')
    .update({ converted_post_id: postId })
    .eq('id', ideaId);

  // Partial success is kept, not rolled back — losing real work to a bookkeeping
  // error is worse than a stale "not converted" flag the admin can retry.
  if (linkError) {
    return {
      ok: true,
      postId,
      warning: "Post created, but the idea couldn't be marked as converted.",
    };
  }

  return { ok: true, postId };
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function savePost(input: PostInput): Promise<SaveResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const payload = {
    post_date: trimmed(input.post_date),
    week_label: trimmed(input.week_label),
    goal_key: trimmed(input.goal_key),
    format_key: trimmed(input.format_key),
    objective: trimmed(input.objective),
    visual_script: trimmed(input.visual_script),
    caption: trimmed(input.caption),
    cta: trimmed(input.cta),
    media_link: trimmed(input.media_link),
  };

  if (input.id) {
    const { error } = await mediaDb().from('posts').update(payload).eq('id', input.id);
    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true, id: input.id };
  }

  const { data, error } = await mediaDb()
    .from('posts')
    .insert({ ...payload, created_by: auth.profileId })
    .select('id')
    .single();

  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, id: (data as { id: string }).id };
}

export async function updatePostField(
  postId: string,
  field: EditablePostField,
  value: string | null,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  // `week_no` is generated and `posted` has its own action — a typo must not
  // silently become an update to a column this path is not meant to reach.
  if (!EDITABLE_POST_FIELDS.includes(field)) {
    return { ok: false, error: 'That field cannot be edited here.' };
  }

  const { error } = await mediaDb()
    .from('posts')
    .update({ [field]: value })
    .eq('id', postId);

  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

export async function setPostPosted(postId: string, value: boolean): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await mediaDb().from('posts').update({ posted: value }).eq('id', postId);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

/**
 * Deletes a post, first releasing the idea that points at it.
 *
 * `ideas.converted_post_id` references `posts.id` with no ON DELETE clause.
 * Clearing it also restores that idea's "Convert to Post" button, which is the
 * behaviour an admin expects after removing the post it produced.
 */
export async function deletePost(postId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error: unlinkError } = await mediaDb()
    .from('ideas')
    .update({ converted_post_id: null })
    .eq('converted_post_id', postId);

  if (unlinkError) return { ok: false, error: friendlyError(unlinkError) };

  const { error } = await mediaDb().from('posts').delete().eq('id', postId);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

// ── Influencers ───────────────────────────────────────────────────────────────

export async function saveInfluencer(input: InfluencerInput): Promise<SaveResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Name is required' };

  const payload = {
    name,
    followers_count: trimmed(input.followers_count),
    url: trimmed(input.url),
    email_contact: trimmed(input.email_contact),
    type: trimmed(input.type),
    country: trimmed(input.country),
    notes: trimmed(input.notes),
    messaging_status: trimmed(input.messaging_status),
    final_decision: trimmed(input.final_decision),
  };

  if (input.id) {
    const { error } = await mediaDb().from('influencers').update(payload).eq('id', input.id);
    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true, id: input.id };
  }

  const { data, error } = await mediaDb()
    .from('influencers')
    .insert({ ...payload, created_by: auth.profileId })
    .select('id')
    .single();

  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateInfluencerStatus(
  influencerId: string,
  field: 'messaging_status' | 'final_decision',
  value: string | null,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (field !== 'messaging_status' && field !== 'final_decision') {
    return { ok: false, error: "That field can't be edited here." };
  }

  const { error } = await mediaDb()
    .from('influencers')
    .update({ [field]: value })
    .eq('id', influencerId);

  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

export async function deleteInfluencer(influencerId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await mediaDb().from('influencers').delete().eq('id', influencerId);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

// ── Lookup tables (goals / formats) ───────────────────────────────────────────

/**
 * Derives a storage key from a label. Called exactly once, at creation.
 *
 * `key` is the primary key AND the FK target for `ideas`/`posts` with no
 * ON UPDATE clause, so it can never be edited afterwards without orphaning every
 * row that references it. The UI reflects that: the key field is shown read-only
 * after create.
 */
export function deriveKey(label: string, taken: readonly string[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'item';

  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export async function createLookup(
  table: LookupTable,
  input: { label: string; color: string | null; sortOrder: number; takenKeys: readonly string[] },
): Promise<SaveResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const label = input.label.trim();
  if (!label) return { ok: false, error: 'Label is required' };

  const key = deriveKey(label, input.takenKeys);

  const { error } = await mediaDb().from(table).insert({
    key,
    label,
    color: trimmed(input.color),
    is_active: true,
    sort_order: input.sortOrder,
  });

  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, id: key };
}

/** Label, colour and active state are editable. `key` deliberately is not. */
export async function updateLookup(
  table: LookupTable,
  key: string,
  patch: { label?: string; color?: string | null; is_active?: boolean },
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const payload: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (!label) return { ok: false, error: 'Label is required' };
    payload.label = label;
  }
  if (patch.color !== undefined) payload.color = trimmed(patch.color);
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;

  if (Object.keys(payload).length === 0) return { ok: true };

  const { error } = await mediaDb().from(table).update(payload).eq('key', key);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

/** Writes the new order as consecutive `sort_order` values, in one pass. */
export async function reorderLookups(
  table: LookupTable,
  orderedKeys: readonly string[],
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const results = await Promise.all(
    orderedKeys.map((key, index) =>
      mediaDb().from(table).update({ sort_order: index + 1 }).eq('key', key),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: friendlyError(failed.error) };
  return { ok: true };
}

/**
 * Deletes a lookup row. The caller blocks this for in-use keys; this re-checks
 * anyway, because the count it decided on could be a few seconds old.
 */
export async function deleteLookup(table: LookupTable, key: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const column = table === 'goals' ? 'goal_key' : 'format_key';
  const [ideas, posts] = await Promise.all([
    mediaDb().from('ideas').select('id').eq(column, key).limit(1),
    mediaDb().from('posts').select('id').eq(column, key).limit(1),
  ]);

  const inUse = (ideas.data ?? []).length > 0 || (posts.data ?? []).length > 0;
  if (inUse) {
    return {
      ok: false,
      error: 'That entry is still in use. Deactivate it instead of deleting it.',
    };
  }

  const { error } = await mediaDb().from(table).delete().eq('key', key);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}
