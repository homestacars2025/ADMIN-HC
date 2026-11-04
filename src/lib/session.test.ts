import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { authFetch } from './authFetch';
import {
  endSession,
  ensureFreshSession,
  isNetworkFailure,
  resetSessionKeeperForTests,
  RETRY_EVERY_MS,
  RETRY_FOR_MS,
  sessionHealth,
  startSessionKeeper,
} from './session';

type Listener = (event: string, session: unknown) => void;
let mockEmit: Listener = () => undefined;
const mockAuth = {
  getSession: jest.fn(),
  refreshSession: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChange: jest.fn(),
};
jest.mock('./supabase', () => ({ supabase: { get auth() { return mockAuth; } } }));

const MIN = 60 * 1000;
const session = (token: string, minutesLeft: number) => ({
  access_token: token,
  refresh_token: `r-${token}`,
  expires_at: Math.floor((Date.now() + minutesLeft * MIN) / 1000),
  user: { id: 'u1', email: 'admin@homestacars.com' },
});
const network = () => new AuthRetryableFetchError('Failed to fetch', 0);
const rejected = () => new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found');
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

let current: ReturnType<typeof session> | null;
const signIn = (s: ReturnType<typeof session>) => { current = s; mockEmit('SIGNED_IN', s); };

beforeEach(() => {
  jest.useFakeTimers();
  resetSessionKeeperForTests();
  current = null;
  mockAuth.getSession.mockReset().mockImplementation(async () => ({ data: { session: current }, error: null }));
  mockAuth.refreshSession.mockReset();
  mockAuth.onAuthStateChange.mockImplementation((listener: Listener) => {
    mockEmit = listener;
    return { data: { subscription: { unsubscribe: () => undefined } } };
  });
  mockAuth.signOut.mockReset().mockImplementation(async () => { current = null; mockEmit('SIGNED_OUT', null); return { error: null }; });
  startSessionKeeper();
});

afterEach(() => {
  resetSessionKeeperForTests();
  jest.useRealTimers();
});

describe('a fresh token', () => {
  it('is refreshed before a write when it has under ten minutes left', async () => {
    signIn(session('old', 5));
    mockAuth.refreshSession.mockResolvedValue({ data: { session: session('new', 60) }, error: null });
    expect(await ensureFreshSession()).toBe('new');
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('is left alone with more than ten minutes left', async () => {
    signIn(session('good', 30));
    expect(await ensureFreshSession()).toBe('good');
    expect(mockAuth.refreshSession).not.toHaveBeenCalled();
  });

  it('is refreshed when a background tab comes back, and on focus, online and pageshow', async () => {
    signIn(session('stale', 2));
    mockAuth.refreshSession.mockImplementation(async () => ({ data: { session: session('woken', 60) }, error: null }));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);

    for (const event of ['focus', 'online', 'pageshow']) {
      current = session('stale', 2);
      window.dispatchEvent(new Event(event));
      await flush();
    }
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(4);
  });

  it('shares one refresh between writes that ask at the same time', async () => {
    signIn(session('old', 1));
    mockAuth.refreshSession.mockResolvedValue({ data: { session: session('new', 60) }, error: null });
    expect(await Promise.all([ensureFreshSession(), ensureFreshSession(), ensureFreshSession()])).toEqual(['new', 'new', 'new']);
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);
  });
});

describe('a refresh that cannot reach the server', () => {
  it('never signs out: it shows Reconnecting, retries every 10 s for 5 minutes, then waits for the next wake', async () => {
    signIn(session('old', 3));
    mockAuth.refreshSession.mockResolvedValue({ data: { session: null }, error: network() });

    expect(await ensureFreshSession()).toBe('old'); // still valid for three minutes, so the write goes ahead
    expect(sessionHealth()).toMatchObject({ reconnecting: true, gaveUp: false, expired: false });

    jest.advanceTimersByTime(RETRY_EVERY_MS);
    await flush();
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(2);

    for (let elapsed = RETRY_EVERY_MS; elapsed < RETRY_FOR_MS; elapsed += RETRY_EVERY_MS) {
      jest.advanceTimersByTime(RETRY_EVERY_MS);
      await flush();
    }
    expect(sessionHealth().gaveUp).toBe(true);
    const calls = mockAuth.refreshSession.mock.calls.length;
    jest.advanceTimersByTime(RETRY_EVERY_MS * 3);
    await flush();
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(calls);
    expect(mockAuth.signOut).not.toHaveBeenCalled();

    // Back online: it tries again, gets through, and the banner goes.
    mockAuth.refreshSession.mockResolvedValue({ data: { session: session('back', 60) }, error: null });
    window.dispatchEvent(new Event('online'));
    jest.advanceTimersByTime(RETRY_EVERY_MS);
    await flush();
    expect(sessionHealth()).toMatchObject({ reconnecting: false, gaveUp: false, expired: false });
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });

  it('shows Reconnecting while a check hangs on the network, and clears it once it answers', async () => {
    signIn(session('good', 30));
    let answer: (value: unknown) => void = () => undefined;
    mockAuth.getSession.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    void ensureFreshSession();
    jest.advanceTimersByTime(2500);
    expect(sessionHealth().reconnecting).toBe(true);
    answer({ data: { session: session('good', 30) }, error: null });
    await flush();
    expect(sessionHealth().reconnecting).toBe(false);
  });

  it('is told apart from a server that says no', () => {
    expect(isNetworkFailure(network())).toBe(true);
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(new AuthApiError('Too many requests', 429, 'over_request_rate_limit'))).toBe(true);
    expect(isNetworkFailure(new AuthApiError('boom', 500, 'unexpected_failure'))).toBe(true);
    expect(isNetworkFailure(rejected())).toBe(false);
  });
});

describe('a rejected refresh token', () => {
  it('opens the login over the page, and a write waiting on it carries on after signing in', async () => {
    signIn(session('old', 1));
    mockAuth.refreshSession.mockResolvedValue({ data: { session: null }, error: rejected() });

    let token: string | null | undefined;
    void ensureFreshSession().then((value) => { token = value; });
    await flush();
    expect(sessionHealth()).toMatchObject({ expired: true, email: 'admin@homestacars.com', userId: 'u1' });
    expect(token).toBeUndefined();
    expect(mockAuth.signOut).not.toHaveBeenCalled();

    signIn(session('after-login', 60));
    await flush();
    expect(token).toBe('after-login');
    expect(sessionHealth().expired).toBe(false);
  });

  it('opens the login when the session ends elsewhere, but not on Logout', async () => {
    signIn(session('a', 60));
    mockEmit('SIGNED_OUT', null);
    expect(sessionHealth().expired).toBe(true);

    signIn(session('b', 60));
    await endSession();
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
    expect(sessionHealth().expired).toBe(false);
  });
});

describe('requests', () => {
  const mockFetch = jest.fn();
  beforeEach(() => { global.fetch = mockFetch as unknown as typeof fetch; mockFetch.mockReset(); });
  const ok = () => new Response('[]', { status: 200 });
  const sentToken = (call: number) => (mockFetch.mock.calls[call][1].headers as Headers).get('Authorization');

  it('send a write with a token refreshed first, and leave a read as it is', async () => {
    signIn(session('old', 4));
    mockAuth.refreshSession.mockResolvedValue({ data: { session: session('fresh', 60) }, error: null });
    mockFetch.mockResolvedValue(ok());

    await authFetch('https://x.supabase.co/rest/v1/rpc/admin_delete_envelope', { method: 'POST', headers: { Authorization: 'Bearer old' }, body: '{}' });
    expect(sentToken(0)).toBe('Bearer fresh');

    await authFetch('https://x.supabase.co/rest/v1/cars?select=id', { method: 'GET', headers: { Authorization: 'Bearer fresh' } });
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('retry a 401 once with a refreshed token, instead of going to the login', async () => {
    signIn(session('expired', 30));
    mockAuth.refreshSession.mockImplementation(async () => { current = session('renewed', 60); return { data: { session: current }, error: null }; });
    mockFetch.mockResolvedValueOnce(new Response('{"message":"JWT expired"}', { status: 401 })).mockResolvedValueOnce(ok());

    const response = await authFetch('https://x.supabase.co/rest/v1/cars?select=id', { method: 'GET', headers: { Authorization: 'Bearer expired' } });
    expect(response.status).toBe(200);
    expect(sentToken(1)).toBe('Bearer renewed');
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });

  it('turn a server error on the token refresh into a network failure, so the session is kept', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 500 }));
    await expect(authFetch('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' })).rejects.toBeInstanceOf(TypeError);
    mockFetch.mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }));
    expect((await authFetch('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' })).status).toBe(400);
  });
});
