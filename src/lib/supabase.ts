import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

// Default client — public schema, auth, realtime
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Dedicated client for the social schema — all sm_* tables
export const socialSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'social' },
});
