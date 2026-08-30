import { useCallback, useEffect, useState } from 'react';
import { getOpenTasksCount, getUnreadCount } from '../lib/notifications';

const POLL_MS = 30_000;

/*
 * One 30s poll drives both the bell badge and the sidebar's Tasks badge.
 *
 * Deliberately polling rather than Realtime: `notifications_v2` is not in the
 * `supabase_realtime` publication, so a postgres_changes subscription on it
 * would connect and then silently never fire. The project does use Realtime
 * elsewhere (chat, presence) — those tables *are* published.
 *
 * A module-level store keeps the bell and the sidebar on one timer and one
 * request pair, instead of each mounting its own.
 */

interface Counts {
  unread: number;
  openTasks: number;
}

let counts: Counts = { unread: 0, openTasks: 0 };
const listeners = new Set<(next: Counts) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

async function refresh(): Promise<void> {
  // Overlapping polls would be wasted work if a request runs long.
  if (inFlight) return;
  inFlight = true;
  try {
    const [unread, openTasks] = await Promise.all([getUnreadCount(), getOpenTasksCount()]);
    counts = { unread, openTasks };
    listeners.forEach((listener) => listener(counts));
  } catch {
    // A failed poll leaves the last known counts on screen; the next tick
    // retries. A badge is not worth an error toast every 30 seconds.
  } finally {
    inFlight = false;
  }
}

function subscribe(listener: (next: Counts) => void): () => void {
  listeners.add(listener);

  if (!timer) {
    refresh();
    timer = setInterval(refresh, POLL_MS);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNotificationCounts() {
  const [value, setValue] = useState<Counts>(counts);

  useEffect(() => subscribe(setValue), []);

  // Called after an action that changes a count, so the badge updates at once
  // instead of waiting out the rest of the interval.
  const refreshNow = useCallback(() => {
    refresh();
  }, []);

  return { ...value, refreshNow };
}
