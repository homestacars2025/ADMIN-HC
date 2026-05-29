import { socialSupabase } from './supabase';

export const socialFrom = (table: string) => socialSupabase.from(table);

// ------------------------------------------------------------------
// Count helpers (used by hooks and the layout badge)
// ------------------------------------------------------------------

export async function fetchPendingApprovalsCount(): Promise<number> {
  const { count, error } = await socialFrom('sm_approvals_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return 0;
  return count ?? 0;
}

export async function fetchUnreadCmoCount(): Promise<number> {
  const { count, error } = await socialFrom('sm_chat_with_cmo')
    .select('*', { count: 'exact', head: true })
    .eq('sender', 'cmo')
    .eq('is_read', false);
  if (error) return 0;
  return count ?? 0;
}

export async function fetchScheduledTodayCount(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const start = `${today}T00:00:00`;
  const end   = `${today}T23:59:59`;
  const { count, error } = await socialFrom('sm_content_social')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .gte('scheduled_for', start)
    .lte('scheduled_for', end);
  if (error) return 0;
  return count ?? 0;
}

export async function fetchUrgentCount(): Promise<number> {
  const { count, error } = await socialFrom('sm_approvals_queue')
    .select('*', { count: 'exact', head: true })
    .eq('priority', 'urgent')
    .eq('status', 'pending');
  if (error) return 0;
  return count ?? 0;
}
