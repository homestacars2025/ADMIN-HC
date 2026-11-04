import { createClient } from '@supabase/supabase-js';
import { authFetch } from './authFetch';

const supabaseUrl     = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

// ── Primary singleton — public schema, auth, realtime ─────────────────────────
// The session lives in localStorage and refreshes itself; `session.ts` keeps it
// alive through background tabs and failed refreshes.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    storage:            typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  global: { fetch: authFetch },
});

// ── Social schema client ───────────────────────────────────────────────────────
// Borrows the primary client's token rather than holding a session of its own.
// A second auth client would refresh with the same refresh token, and spending
// it twice can get the whole session revoked.
export const socialSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'social' },
  accessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  global: { fetch: authFetch },
});
