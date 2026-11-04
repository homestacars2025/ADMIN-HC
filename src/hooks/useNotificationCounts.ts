import { useCallback, useEffect, useState } from 'react';
import { getOpenTasksCount, getUnreadCount, markAllRead, markRead } from '../lib/notifications';

const POLL_MS = 30_000;
const SOON_MS = 300;

/*
 * One store drives both the bell badge and the sidebar's Tasks badge.
 *
 * Realtime keeps these current, so the 30s poll only runs while that channel is
 * down. A module-level store keeps the bell and the sidebar on one timer and one
 * request pair, instead of each mounting its own.
 */

interface Counts {
  unread: number;
  openTasks: number;
  live: boolean;
}

let counts: Counts = { unread: 0, openTasks: 0, live: false };
const listeners = new Set<(next: Counts) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let soon: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let again = false;
// A count asked for before a mark-read landed would put the old number back.
let edits = 0;
let pendingEdits = 0;

function publish(next: Counts) {
  counts = next;
  listeners.forEach((listener) => listener(counts));
}

async function refresh(): Promise<void> {
  // One request at a time; a call that arrives meanwhile runs once it's done.
  if (inFlight) {
    again = true;
    return;
  }
  inFlight = true;
  const stamp = edits;
  try {
    const [unread, openTasks] = await Promise.all([getUnreadCount(), getOpenTasksCount()]);
    const current = stamp === edits && pendingEdits === 0;
    publish({ ...counts, unread: current ? unread : counts.unread, openTasks });
  } catch {
    // A failed poll leaves the last known counts on screen; the next tick
    // retries. A badge is not worth an error toast every 30 seconds.
  } finally {
    inFlight = false;
    if (again) {
      again = false;
      refresh();
    }
  }
}

/** Mark all as read writes one row per notification, so its realtime events come in a burst. */
export function refreshSoon() {
  if (soon) clearTimeout(soon);
  soon = setTimeout(() => {
    soon = null;
    refresh();
  }, SOON_MS);
}

/** The badge moves at once; the real count follows once the write lands, or fails. */
async function applyRead(change: number | 'all', write: () => Promise<void>): Promise<void> {
  edits += 1;
  pendingEdits += 1;
  publish({ ...counts, unread: change === 'all' ? 0 : Math.max(0, counts.unread - change) });
  try {
    await write();
  } finally {
    pendingEdits -= 1;
    refresh();
  }
}

export const readNotification = (id: string) => applyRead(1, () => markRead(id));
export const readAllNotifications = () => applyRead('all', markAllRead);

function syncTimer() {
  const shouldPoll = listeners.size > 0 && !counts.live;
  if (shouldPoll && !timer) {
    timer = setInterval(refresh, POLL_MS);
  } else if (!shouldPoll && timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Called as the realtime channel connects and drops. */
export function setCountsLive(live: boolean) {
  if (live === counts.live) return;
  publish({ ...counts, live });
  syncTimer();
  // Whatever arrived while the channel was down, catch up on it now.
  if (live) refresh();
}

function subscribe(listener: (next: Counts) => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) refresh();
  syncTimer();

  return () => {
    listeners.delete(listener);
    syncTimer();
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
