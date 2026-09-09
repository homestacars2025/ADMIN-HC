import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Privileged user administration.
 *
 * These three operations need the service_role key, which must never reach a
 * browser: anything prefixed REACT_APP_ is inlined into the public bundle at
 * build time. The key lives only here, injected by the platform as
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * The caller's admin role is verified here rather than trusted from the client.
 * ProtectedRoute only decides what the dashboard renders — it is not a control
 * anyone has to go through to reach this endpoint.
 */

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** The roles the Add User form offers. A caller may not invent others. */
const CREATABLE_ROLES = ['admin', 'staff'] as const;
type CreatableRole = (typeof CREATABLE_ROLES)[number];

const MIN_PASSWORD_LENGTH = 8;

interface CreatePayload {
  action: 'create';
  email: string;
  password: string;
  full_name: string;
  role: CreatableRole;
}

interface UpdatePasswordPayload {
  action: 'update_password';
  user_id: string;
  password: string;
}

interface DeletePayload {
  action: 'delete';
  user_id: string;
}

type Payload = CreatePayload | UpdatePasswordPayload | DeletePayload;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server is not configured for user administration.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // ── Authenticate and authorise the caller ──────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Missing authorization header.' }, 401);

  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller.user) return json({ error: 'Invalid or expired session.' }, 401);

  // Read through the service client on purpose: the true stored role, not
  // whatever the caller's own RLS view of `profiles` would allow.
  const { data: callerProfile, error: profileErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .single();

  if (profileErr) return json({ error: 'Could not verify your account role.' }, 403);
  if (callerProfile?.role !== 'admin') return json({ error: 'Admin role required.' }, 403);

  // ── Parse ──────────────────────────────────────────────────────────────────
  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  switch (payload.action) {
    // ── Create an auth user, then stamp its profile row ─────────────────────
    case 'create': {
      const email = str(payload.email);
      const password = str(payload.password);
      const fullName = str(payload.full_name);
      const role = payload.role;

      if (!email || !password || !fullName) {
        return json({ error: 'Email, password and full name are required.' }, 400);
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json(
          { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
          400,
        );
      }
      if (!CREATABLE_ROLES.includes(role)) {
        return json({ error: `Role must be one of: ${CREATABLE_ROLES.join(', ')}.` }, 400);
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) return json({ error: createErr.message }, 400);
      if (!created.user) return json({ error: 'User creation returned no user.' }, 500);

      // The profile row is created by a trigger on auth.users; this fills in the
      // fields the form collected. If it fails the auth user is removed again,
      // so a failed create cannot leave a half-provisioned account behind.
      const { error: patchErr } = await admin
        .from('profiles')
        .update({ full_name: fullName, role, status: 'active' })
        .eq('id', created.user.id);

      if (patchErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: `Profile setup failed, user was rolled back: ${patchErr.message}` }, 400);
      }

      return json({ user_id: created.user.id, email });
    }

    // ── Set a user's password ───────────────────────────────────────────────
    case 'update_password': {
      const userId = str(payload.user_id);
      const password = str(payload.password);

      if (!userId) return json({ error: 'user_id is required.' }, 400);
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json(
          { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
          400,
        );
      }

      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: error.message }, 400);

      return json({ user_id: userId });
    }

    // ── Delete a user ───────────────────────────────────────────────────────
    case 'delete': {
      const userId = str(payload.user_id);
      if (!userId) return json({ error: 'user_id is required.' }, 400);

      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);

      return json({ user_id: userId });
    }

    default:
      return json({ error: 'Unknown action.' }, 400);
  }
});
