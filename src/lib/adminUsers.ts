import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Client side of the `admin-users` Edge Function.
 *
 * These operations need the service_role key. That key must never be readable
 * from the browser — every REACT_APP_* variable is inlined into the public
 * bundle at build time — so it stays on the server and the browser only asks
 * for the operation. `functions.invoke` attaches the caller's session JWT, and
 * the function re-checks that the caller is an admin before doing anything.
 */

type AdminAction = 'create' | 'update_password' | 'delete';

/**
 * `functions.invoke` reports any non-2xx as the generic "Edge Function returned
 * a non-2xx status code" and hides the real reason in the response body, which
 * would turn every "Email already registered" into an unactionable message.
 * This unwraps it so the modals keep showing what actually went wrong.
 */
async function readErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body && typeof body.error === 'string' && body.error) return body.error;
    } catch {
      // Non-JSON error body — the generic message below is the best we have.
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function invoke<T>(
  action: AdminAction,
  body: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action, ...body },
  });
  if (error) throw new Error(await readErrorMessage(error, fallback));
  return data as T;
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role: 'admin' | 'staff';
}

/** Creates the auth user (email pre-confirmed) and stamps its profile row. */
export async function createUser(input: CreateUserInput): Promise<{ user_id: string }> {
  return invoke<{ user_id: string }>(
    'create',
    {
      email: input.email,
      password: input.password,
      full_name: input.fullName,
      role: input.role,
    },
    'Failed to create user.',
  );
}

export async function updateUserPassword(userId: string, password: string): Promise<void> {
  await invoke('update_password', { user_id: userId, password }, 'Failed to update password.');
}

export async function deleteUser(userId: string): Promise<void> {
  await invoke('delete', { user_id: userId }, 'Failed to delete user.');
}
