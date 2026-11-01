import { useSyncExternalStore } from 'react';
import { fetchCarCompliance, type CarCompliance } from './carCompliance';

/**
 * The one copy of the problem cars, so the sign-in alert, the sidebar badge and
 * Home always agree, and a date fixed on the Cars page clears all of them at once.
 */
const REFRESH_AFTER_MS = 60_000;

let cars: CarCompliance[] | null = null;
let loadedAt = 0;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function publishCompliance(next: CarCompliance[]): void {
  cars = next;
  loadedAt = Date.now();
  listeners.forEach((listener) => listener());
}

/** Safe to call on every page change. If the read fails, the last list stays. */
export async function refreshCompliance(): Promise<void> {
  if (cars && Date.now() - loadedAt < REFRESH_AFTER_MS) return;
  try {
    publishCompliance(await fetchCarCompliance());
  } catch {
    // Nothing on screen depends on this working. The Cars page reports its own failure.
  }
}

/** Null until the first read finishes. */
export function useComplianceCars(): CarCompliance[] | null {
  return useSyncExternalStore(subscribe, () => cars);
}

// ─── Once per browser session ─────────────────────────────────────────────────

const SEEN_KEY = 'hc_compliance_alert_seen';
let seenThisLoad = false;

/** Called after a real sign-in, which always shows the alert, even in the same tab. */
export function resetComplianceAlert(): void {
  seenThisLoad = false;
  try { sessionStorage.removeItem(SEEN_KEY); } catch { /* Blocked storage: `seenThisLoad` covers it. */ }
}

/** True the first time it's called in a browser session, and false after that. */
export function claimComplianceAlert(): boolean {
  if (seenThisLoad) return false;
  seenThisLoad = true;
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return false;
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Blocked storage: it shows once per page load instead.
  }
  return true;
}
