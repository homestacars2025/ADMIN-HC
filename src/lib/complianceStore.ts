import { useSyncExternalStore } from 'react';
import { fetchCarCompliance, type CarCompliance } from './carCompliance';
import { fetchFines, unpaidFines, type Fine } from './fines';

/**
 * The one copy of the problem cars, so the sign-in alert, the sidebar badge and
 * Home always agree, and a date fixed on the Cars page clears all of them at once.
 */
const REFRESH_AFTER_MS = 60_000;

let cars: CarCompliance[] | null = null;
let fines: Fine[] | null = null;
let loadedAt = 0;
let finesLoadedAt = 0;
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

export function publishUnpaidFines(next: Fine[]): void {
  fines = unpaidFines(next);
  finesLoadedAt = Date.now();
  listeners.forEach((listener) => listener());
}

/**
 * Safe to call on every page change. If a read fails the last list stays, or an empty
 * one on the first try, so one failed read can't hold back the other alert.
 */
export async function refreshCompliance(): Promise<void> {
  const now = Date.now();
  await Promise.all([
    now - loadedAt < REFRESH_AFTER_MS ? null : fetchCarCompliance().then(publishCompliance).catch(() => {
      if (cars === null) { cars = []; listeners.forEach((listener) => listener()); }
    }),
    now - finesLoadedAt < REFRESH_AFTER_MS ? null : fetchFines().then(publishUnpaidFines).catch(() => {
      if (fines === null) { fines = []; listeners.forEach((listener) => listener()); }
    }),
  ]);
}

/** Null until the first read finishes. */
export function useComplianceCars(): CarCompliance[] | null {
  return useSyncExternalStore(subscribe, () => cars);
}

/** Null until the first read finishes. */
export function useUnpaidFines(): Fine[] | null {
  return useSyncExternalStore(subscribe, () => fines);
}

// ─── Once per browser session ─────────────────────────────────────────────────

const SEEN_KEY = 'hc_compliance_alert_seen';
let seenThisLoad = false;
let onScreen = false;

/** Called after a real sign-in, which always shows the alert, even in the same tab. */
export function resetComplianceAlert(): void {
  seenThisLoad = false;
  onScreen = false;
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
  onScreen = true;
  return true;
}

export function releaseComplianceAlert(): void {
  onScreen = false;
}

/** True while the sign-in alert is still to come or open, so the Cars page doesn't stack its own. */
export function signInAlertActive(): boolean {
  if (onScreen) return true;
  if (seenThisLoad) return false;
  try {
    return !sessionStorage.getItem(SEEN_KEY);
  } catch {
    return true;
  }
}
