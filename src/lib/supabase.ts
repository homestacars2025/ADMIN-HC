import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

// ── Primary singleton — public schema, auth, realtime ─────────────────────────
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Social schema client ───────────────────────────────────────────────────────
// Uses a unique storageKey so GoTrueClient doesn't conflict with the primary
// client.  Session is kept in sync via the listener below.
export const socialSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'social' },
  auth: {
    storageKey:        'sb-social-session',
    autoRefreshToken:  false,   // primary client handles token refresh
    detectSessionInUrl: false,
  },
});

// Bootstrap: if the user is already logged in when the module loads, forward
// that session to socialSupabase immediately.
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    socialSupabase.auth.setSession({
      access_token:  session.access_token,
      refresh_token: session.refresh_token,
    });
  }
});

// Keep socialSupabase in sync on every auth event (login, logout, token refresh).
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    socialSupabase.auth.setSession({
      access_token:  session.access_token,
      refresh_token: session.refresh_token,
    });
  }
});
