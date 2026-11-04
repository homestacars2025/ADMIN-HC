/**
 * The fetch every Supabase request goes through. It keeps a request from failing,
 * or the user from being signed out, just because a token went stale:
 *
 * - A write (anything but GET and HEAD) first asks for a fresh token, and sends it.
 * - A 401 refreshes once and tries again.
 * - A token refresh that meets a server error or a rate limit reads as a network
 *   failure. The auth client then keeps the session and retries, where it would
 *   otherwise delete the session as if the refresh token were invalid.
 *
 * The session logic lives in `session.ts`, which registers itself here, so this
 * file can be handed to `createClient` without importing the client back.
 */

export interface AuthFetchHooks {
  /** A fresh access token for a write, or null to send the request as it is. */
  beforeWrite: () => Promise<string | null>;
  /** After a 401: a new access token to retry with, or null to give up. */
  onUnauthorized: (sentToken: string | null) => Promise<string | null>;
}

let hooks: AuthFetchHooks | null = null;

export function registerAuthFetchHooks(next: AuthFetchHooks | null): void {
  hooks = next;
}

const urlOf = (input: RequestInfo | URL): string => (
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
);

const bearer = (headers: Headers): string | null => {
  const value = headers.get('Authorization');
  return value?.startsWith('Bearer ') ? value.slice(7) : null;
};

/** A body that was read once can't be sent again. */
const canResend = (body: BodyInit | null | undefined): boolean => (
  !(typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
);

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = urlOf(input);
  const { pathname, searchParams } = new URL(url, 'http://localhost');

  if (pathname.startsWith('/auth/v1/')) {
    const response = await fetch(input, init);
    const refreshing = pathname.endsWith('/token') && searchParams.get('grant_type') === 'refresh_token';
    if (refreshing && (response.status >= 500 || response.status === 429)) {
      throw new TypeError(`Token refresh unavailable (${response.status})`);
    }
    return response;
  }

  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));

  if (hooks && method !== 'GET' && method !== 'HEAD') {
    const token = await hooks.beforeWrite();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, { ...init, headers });
  if (response.status !== 401 || !hooks || !canResend(init.body)) return response;

  const token = await hooks.onUnauthorized(bearer(headers));
  if (!token) return response;
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
