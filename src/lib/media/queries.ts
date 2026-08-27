import { mediaDb } from './client';
import type {
  LookupTable,
  MediaFormat,
  MediaGoal,
  MediaIdea,
  MediaInfluencer,
  MediaPost,
} from './types';

/*
 * Reads never throw. Every query logs its error and returns [] — a broken lookup
 * degrades to "no goals available", never to a blank page. Errors surface to the
 * user only on write, via toasts.
 *
 * Select strings are single literals, never concatenations: supabase-js infers the
 * row shape from the literal, and concatenation collapses that inference.
 */

const LOOKUP_SELECT = 'key, label, color, is_active, sort_order';

const IDEA_SELECT =
  'id, title, content, category, format_key, goal_key, posted, is_approved, note, converted_post_id, created_by, created_at, updated_at';

const POST_SELECT =
  'id, post_date, week_no, week_label, goal_key, format_key, objective, visual_script, caption, cta, media_link, posted, source_idea_id, created_by, created_at, updated_at';

const INFLUENCER_SELECT =
  'id, name, followers_count, url, email_contact, type, country, notes, messaging_status, final_decision, created_by, created_at, updated_at';

function logged<T>(label: string, error: { message: string } | null, rows: T[] | null): T[] {
  if (error) {
    // eslint-disable-next-line no-console
    console.error(`[media] ${label}:`, error.message);
    return [];
  }
  return rows ?? [];
}

/** Active goals only — what the option lists offer. */
export async function getGoals(): Promise<MediaGoal[]> {
  const { data, error } = await mediaDb()
    .from('goals')
    .select(LOOKUP_SELECT)
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('label', { ascending: true });
  return logged('getGoals', error, data as MediaGoal[] | null);
}

export async function getFormats(): Promise<MediaFormat[]> {
  const { data, error } = await mediaDb()
    .from('formats')
    .select(LOOKUP_SELECT)
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('label', { ascending: true });
  return logged('getFormats', error, data as MediaFormat[] | null);
}

/**
 * Every row including deactivated ones — the Lists management panel needs to see
 * and revive what the option lists filter out.
 */
export async function getAllLookups(table: LookupTable): Promise<MediaGoal[]> {
  const { data, error } = await mediaDb()
    .from(table)
    .select(LOOKUP_SELECT)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('label', { ascending: true });
  return logged(`getAllLookups(${table})`, error, data as MediaGoal[] | null);
}

export async function getIdeas(): Promise<MediaIdea[]> {
  const { data, error } = await mediaDb()
    .from('ideas')
    .select(IDEA_SELECT)
    .order('created_at', { ascending: false });
  return logged('getIdeas', error, data as MediaIdea[] | null);
}

/**
 * The whole calendar in one call. A media plan is a few hundred rows at most, and
 * holding it client-side makes month navigation and the List/Calendar toggle
 * instant with zero round-trips.
 */
export async function getPosts(): Promise<MediaPost[]> {
  const { data, error } = await mediaDb()
    .from('posts')
    .select(POST_SELECT)
    .order('post_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  return logged('getPosts', error, data as MediaPost[] | null);
}

export async function getInfluencers(): Promise<MediaInfluencer[]> {
  const { data, error } = await mediaDb()
    .from('influencers')
    .select(INFLUENCER_SELECT)
    .order('created_at', { ascending: false });
  return logged('getInfluencers', error, data as MediaInfluencer[] | null);
}

/**
 * How many ideas and posts reference each key of a lookup table.
 *
 * `key` is the PK and the FK target with no ON DELETE clause, so deleting a row
 * something references raises 23503. The Lists panel uses these counts to disable
 * delete before the user can trip that error.
 */
export async function getLookupUsage(table: LookupTable): Promise<Record<string, number>> {
  const column = table === 'goals' ? 'goal_key' : 'format_key';
  const usage: Record<string, number> = {};

  const [ideas, posts] = await Promise.all([
    mediaDb().from('ideas').select(column),
    mediaDb().from('posts').select(column),
  ]);

  for (const result of [ideas, posts]) {
    if (result.error) {
      // eslint-disable-next-line no-console
      console.error(`[media] getLookupUsage(${table}):`, result.error.message);
      continue;
    }
    for (const row of (result.data ?? []) as Array<Record<string, string | null>>) {
      const key = row[column];
      if (key) usage[key] = (usage[key] ?? 0) + 1;
    }
  }

  return usage;
}
