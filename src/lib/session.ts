import { isAuthRetryableFetchError, type AuthError, type Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { registerAuthFetchHooks } from './authFetch';
import { supabase } from './supabase';

/**
 * Keeps the admin signed in. Nobody is ever signed out by a timer, a failed
 * refresh or a 401: only by Logout, or when the account is disabled.
 *
 * - A token with under 10 minutes left is refreshed when the tab comes back
 *   (iOS Safari stops timers in the background) and before every write.
 * - A refresh that can't reach the server retries quietly every 10 s for up to
 *   5 minutes, behind a small "Reconnecting…" banner, and the page stays as it is.
 * - Only a refresh token the server rejects ends the session, and then the login
 *   opens over the page. Writes waiting on it carry on once the admin signs in.
 */

export const FRESH_FOR_MS = 10 * 60 * 1000;
export const RETRY_EVERY_MS = 10 * 1000;
export const RETRY_FOR_MS = 5 * 60 * 1000;
/** A 401 forces a refresh at most this often, so a burst of them makes one. */
const FORCED_REFRESH_GAP_MS = 30 * 1000;
/** A check this slow is waiting on the network. */
const SLOW_CHECK_MS = 2500;

export interface SessionHealth {
  /** A refresh couldn't reach the server, and is being retried. */
  reconnecting: boolean;
  /** Retrying stopped after five minutes; it starts again on the next focus or reconnect. */
  gaveUp: boolean;
  /** The server rejected the refresh token, so the admin has to sign in again. */
  expired: boolean;
  /** Who was signed in, to fill in the login and to notice someone else signing in. */
  email: string | null;
  userId: string | null;
}

const HEALTHY: SessionHealth = { reconnecting: false, gaveUp: false, expired: false, email: null, userId: null };

let health: SessionHealth = HEALTHY;
const listeners = new Set<() => void>();

function setHealth(next: Partial<SessionHealth>): void {
  const merged = { ...health, ...next };
  if (Object.keys(merged).every((key) => merged[key as keyof SessionHealth] === health[key as keyof SessionHealth])) return;
  health = merged;
  listeners.forEach((listener) => listener());
}

export const sessionHealth = (): SessionHealth => health;

export function useSessionHealth(): SessionHealth {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    sessionHealth,
  );
}

export const expiresInMs = (session: Pick<Session, 'expires_at'>, now = Date.now()): number => (
  session.expires_at ? session.expires_at * 1000 - now : Infinity
);

/** The server or the network was out of reach, as opposed to the server saying no. */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (isAuthRetryableFetchError(error)) return true;
  const status = (error as AuthError | null)?.status;
  return status === undefined || status === 0 || status === 429 || status >= 500;
}

// ─── State ────────────────────────────────────────────────────────────────────

let signedIn = false;
let signingOut = false;
let lastForcedRefresh = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStartedAt = 0;
let pending: Promise<string | null> | null = null;
let waiters: Array<(token: string | null) => void> = [];

function stopRetrying(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function markHealthy(session: Session): void {
  signedIn = true;
  stopRetrying();
  setHealth({ reconnecting: false, gaveUp: false, expired: false, email: session.user.email ?? health.email, userId: session.user.id });
  const resolve = waiters;
  waiters = [];
  resolve.forEach((done) => done(session.access_token));
}

function markExpired(): void {
  if (!signedIn || signingOut) return;
  stopRetrying();
  setHealth({ reconnecting: false, gaveUp: false, expired: true });
}

function scheduleRetry(): void {
  stopRetrying();
  retryTimer = setTimeout(() => { void retryNow(); }, RETRY_EVERY_MS);
}

function startRetrying(): void {
  if (!health.reconnecting || health.gaveUp) retryStartedAt = Date.now();
  setHealth({ reconnecting: true, gaveUp: false });
  scheduleRetry();
}

async function retryNow(): Promise<void> {
  retryTimer = null;
  const { data, error } = await supabase.auth.refreshSession();
  if (!error && data.session) { markHealthy(data.session); return; }
  if (error && !isNetworkFailure(error)) { markExpired(); return; }
  if (Date.now() - retryStartedAt >= RETRY_FOR_MS) { setHealth({ gaveUp: true }); return; }
  scheduleRetry();
}

/** After a failed refresh: retry a network failure, end the session on a rejection. */
function refreshFailed(error: AuthError, fallback: string | null): string | null {
  if (isNetworkFailure(error)) startRetrying();
  else markExpired();
  return fallback;
}

async function refreshIfNeeded(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  // An expired token whose refresh couldn't get through comes back as an error with no session.
  if (error) return refreshFailed(error, null);
  const session = data.session;
  if (!session) return null;
  if (expiresInMs(session) >= FRESH_FOR_MS) { markHealthy(session); return session.access_token; }

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) {
    const stillValid = expiresInMs(session) > 0 ? session.access_token : null;
    return refreshed.error ? refreshFailed(refreshed.error, stillValid) : stillValid;
  }
  markHealthy(refreshed.data.session);
  return refreshed.data.session.access_token;
}

const waitForLogin = (): Promise<string | null> => new Promise((resolve) => { waiters.push(resolve); });

/**
 * One check at a time: everything asking meanwhile shares its answer. The auth
 * client keeps retrying a refresh it can't send for up to 30 s before it reports
 * back, so a slow check shows the banner rather than nothing for that long.
 */
function checkSession(): Promise<string | null> {
  if (pending) return pending;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (signedIn && offline) setHealth({ reconnecting: true });
  const slow = setTimeout(() => { if (signedIn) setHealth({ reconnecting: true }); }, SLOW_CHECK_MS);
  pending = refreshIfNeeded().finally(() => {
    clearTimeout(slow);
    pending = null;
    // Nothing left to retry: whatever the check found, it wasn't a connection problem.
    if (!retryTimer && !health.gaveUp) setHealth({ reconnecting: false });
  });
  return pending;
}

/**
 * A token good for ten more minutes, for a write about to go out. While the
 * session is waiting on the login, this waits too, so the write carries on after.
 */
export async function ensureFreshSession(): Promise<string | null> {
  if (health.expired) return waitForLogin();
  const token = await checkSession();
  return health.expired ? waitForLogin() : token;
}

async function afterUnauthorized(sentToken: string | null): Promise<string | null> {
  if (health.expired) return waitForLogin();
  const { data } = await supabase.auth.getSession();
  const current = data.session;
  if (!current) return null;
  // Someone already refreshed since this request left.
  if (sentToken && current.access_token !== sentToken) return current.access_token;
  if (Date.now() - lastForcedRefresh < FORCED_REFRESH_GAP_MS) return null;
  lastForcedRefresh = Date.now();
  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) {
    if (refreshed.error) refreshFailed(refreshed.error, null);
    return health.expired ? waitForLogin() : null;
  }
  markHealthy(refreshed.data.session);
  return refreshed.data.session.access_token;
}

/** The only way the app signs anyone out: Logout, or an account that may no longer be used. */
export async function endSession(): Promise<void> {
  signingOut = true;
  stopRetrying();
  try {
    await supabase.auth.signOut();
  } finally {
    signedIn = false;
    setHealth(HEALTHY);
    signingOut = false;
  }
}

// ─── Wiring ───────────────────────────────────────────────────────────────────

let stop: (() => void) | null = null;

/** Starts once, for the life of the page. Returns a stop for tests. */
export function startSessionKeeper(): () => void {
  if (stop) return stop;

  registerAuthFetchHooks({ beforeWrite: ensureFreshSession, onUnauthorized: afterUnauthorized });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      markHealthy(session);
      return;
    }
    // Not from Logout: the refresh token was rejected, or another tab signed out.
    if (event === 'SIGNED_OUT') markExpired();
  });

  const wake = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (health.gaveUp) startRetrying();
    if (signedIn && !health.expired) void checkSession();
  };
  const onVisibility = () => { if (document.visibilityState === 'visible') wake(); };
  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);
  window.addEventListener('pageshow', wake);
  document.addEventListener('visibilitychange', onVisibility);

  stop = () => {
    subscription.unsubscribe();
    window.removeEventListener('focus', wake);
    window.removeEventListener('online', wake);
    window.removeEventListener('pageshow', wake);
    document.removeEventListener('visibilitychange', onVisibility);
    registerAuthFetchHooks(null);
    stopRetrying();
    stop = null;
  };
  return stop;
}

/** For tests: back to a fresh page. */
export function resetSessionKeeperForTests(): void {
  stop?.();
  health = HEALTHY;
  signedIn = false;
  signingOut = false;
  lastForcedRefresh = 0;
  pending = null;
  waiters = [];
}
