import { useEffect, useState } from 'react';
import {
  fetchPendingApprovalsCount,
  fetchUnreadCmoCount,
  fetchScheduledTodayCount,
  fetchUrgentCount,
  socialFrom,
} from '../lib/socialClient';
import type { SmApproval, SmChatMessage } from '../types/marketing';

// ------------------------------------------------------------------
// Live counts (used in MarketingLayout badges + Overview stats)
// ------------------------------------------------------------------

export function useApprovalsCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPendingApprovalsCount().then(n => { if (!cancelled) setCount(n); });
    return () => { cancelled = true; };
  }, []);
  return count;
}

export function useUnreadCmoCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchUnreadCmoCount().then(n => { if (!cancelled) setCount(n); });
    return () => { cancelled = true; };
  }, []);
  return count;
}

// ------------------------------------------------------------------
// Overview page data
// ------------------------------------------------------------------

export interface OverviewStats {
  pendingApprovals: number;
  unreadCmo: number;
  scheduledToday: number;
  urgentItems: number;
}

export function useOverviewStats() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchPendingApprovalsCount(),
      fetchUnreadCmoCount(),
      fetchScheduledTodayCount(),
      fetchUrgentCount(),
    ]).then(([pendingApprovals, unreadCmo, scheduledToday, urgentItems]) => {
      if (!cancelled) {
        setStats({ pendingApprovals, unreadCmo, scheduledToday, urgentItems });
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  };

  useEffect(load, []);
  return { stats, loading, refetch: load };
}

export function useLatestCmoMessages(limit = 5) {
  const [messages, setMessages] = useState<SmChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await socialFrom('sm_chat_with_cmo')
        .select('id, sender, message, is_read, created_at')
        .eq('sender', 'cmo')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!cancelled) {
        setMessages((data as SmChatMessage[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [limit]);

  return { messages, loading };
}

export function useLatestApprovals(limit = 5) {
  const [approvals, setApprovals] = useState<SmApproval[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await socialFrom('sm_approvals_queue')
        .select('id, title, item_type, status, priority, bot_who_created, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!cancelled) {
        setApprovals((data as SmApproval[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [limit]);

  return { approvals, loading };
}

// CMO bot status derived from most recent message timestamp
export type CmoStatus = 'active' | 'idle';

export function useCmoStatus(): CmoStatus {
  const [status, setStatus] = useState<CmoStatus>('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await socialFrom('sm_chat_with_cmo')
        .select('created_at')
        .eq('sender', 'cmo')
        .order('created_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = (data ?? [])[0] as { created_at: string } | undefined;
      if (!row) {
        setStatus('idle');
        return;
      }
      const ageMs = Date.now() - new Date(row.created_at).getTime();
      setStatus(ageMs < 60 * 60 * 1000 ? 'active' : 'idle');
    })();
    return () => { cancelled = true; };
  }, []);

  return status;
}

// Pending task counts grouped by bot (for Team Status section)
export function useBotTaskCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await socialFrom('sm_coordinator_tasks')
        .select('to_bot')
        .in('status', ['pending', 'in_progress']);
      if (!cancelled) {
        const tally: Record<string, number> = {};
        (data ?? []).forEach((row: { to_bot: string }) => {
          tally[row.to_bot] = (tally[row.to_bot] ?? 0) + 1;
        });
        setCounts(tally);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { counts, loading };
}
