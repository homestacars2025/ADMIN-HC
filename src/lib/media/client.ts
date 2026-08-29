import { supabase } from '../supabase';

/**
 * Every media read and write goes through the `media` schema. `.schema()` reuses
 * the primary client's session, so there is no second GoTrueClient to keep in sync.
 */
export function mediaDb() {
  return supabase.schema('media');
}

export interface PostgrestLikeError {
  code?: string;
  message: string;
}

/**
 * Turns a PostgREST failure into something an admin can act on. The RLS and
 * foreign-key cases are the ones that actually reach a user.
 */
export function friendlyError(error: PostgrestLikeError | null | undefined): string {
  if (!error) return 'Something went wrong.';
  const code = error.code ?? '';
  const msg = (error.message ?? '').toLowerCase();

  if (code === 'PGRST106' || msg.includes('invalid schema'))
    return "Media tables aren't reachable — the `media` schema is not exposed in Supabase.";
  if (code === '42501' || msg.includes('row-level security'))
    return "You don't have permission to change this.";
  if (msg.includes('only admin can change'))
    return 'Only an admin can change that field.';
  if (code === '23503')
    return 'That reference is still in use, or no longer exists. Refresh and try again.';
  if (code === '23505')
    return 'A record with those details already exists.';
  return error.message;
}

/**
 * Re-verifies the caller is an admin against the live profile row.
 *
 * The route guard already gates the whole dashboard on `role === 'admin'`, but a
 * guard that ran on the last navigation is not evidence about this write — a role
 * downgrade mid-session would otherwise sail straight through. Every action calls
 * this before touching a table.
 */
export async function requireAdmin(): Promise<
  { ok: true; profileId: string } | { ok: false; error: string }
> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { ok: false, error: 'Not authenticated' };

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (error) return { ok: false, error: friendlyError(error) };
  if (!profile) return { ok: false, error: 'Not authenticated' };
  if (profile.role !== 'admin') return { ok: false, error: 'Admins only' };

  return { ok: true, profileId: profile.id as string };
}

/** `""` and whitespace-only both become `null`, so "unset" has one representation. */
export function trimmed(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/**
 * Reference links only: a bare host gets `https://` so the href never resolves
 * relative to the dashboard. Applied on the server as well as in the field, so
 * the inline editor and every other write path get it too.
 */
export function normalizedUrl(value: string | null | undefined): string | null {
  const v = trimmed(value);
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
