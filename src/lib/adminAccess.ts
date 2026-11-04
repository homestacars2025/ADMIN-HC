import { endSession } from './session';
import { supabase } from './supabase';

/**
 * Who may use this app. A failed lookup is never read as "no": it says nothing
 * about the account, and signing someone out over it is exactly the bug the
 * session keeper exists to prevent.
 */
export type AdminAccess = 'allowed' | 'not_admin' | 'disabled' | 'unreachable';

export async function checkAdminAccess(userId: string): Promise<AdminAccess> {
  const { data, error } = await supabase.from('profiles').select('role, status').eq('id', userId).maybeSingle();
  if (error) return 'unreachable';
  const profile = data as { role: string | null; status: string | null } | null;
  if (profile?.role !== 'admin') return 'not_admin';
  if (profile.status === 'disabled') return 'disabled';
  return 'allowed';
}

export const ACCESS_MESSAGES: Record<Exclude<AdminAccess, 'allowed'>, string> = {
  not_admin: 'Access denied. This portal is restricted to administrators only.',
  disabled: 'This account has been disabled. Ask an administrator to turn it back on.',
  unreachable: "Couldn't reach the server to check your account. Try again.",
};

/** Signs in and checks the account. Returns why it didn't work, or null when it did. */
export async function signInAsAdmin(email: string, password: string): Promise<string | null> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return error.message;
  const userId = data.session?.user.id;
  if (!userId) return 'Authentication failed. Please try again.';

  const access = await checkAdminAccess(userId);
  if (access === 'allowed') return null;
  // A refused account doesn't stay signed in. An unanswered check does: trying again just works.
  if (access !== 'unreachable') await endSession();
  return ACCESS_MESSAGES[access];
}
