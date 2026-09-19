import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Hands an outbound message to the n8n send webhook.
 *
 * The webhook secret lives here and nowhere else: the dashboard is a CRA build,
 * so anything it could read would be inlined into the public bundle. The browser
 * only says "send row X"; this function is what proves it is allowed to.
 *
 * The row itself is created by the caller before invoking this. That ordering is
 * deliberate — a message that exists but failed to send is recoverable from the
 * inbox, one that was never written is simply lost.
 *
 * It also decides which of the mailboxes in `email_accounts` the message leaves
 * from, and stamps that account onto the row.
 */

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const WEBHOOK_URL = 'https://n8n-n8n.gdsddq.easypanel.host/webhook/homesta-cars-send';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface Payload {
  to?: string;
  cc?: string;
  subject?: string;
  body_html?: string;
  message_row_id?: string;
  /** Which mailbox to send from, e.g. `homestacars-partners`. Optional. */
  account_slug?: string;
}

interface Account {
  id: string;
  slug: string | null;
  email_address: string;
  label: string | null;
}

const ACCOUNT_COLUMNS = 'id, slug, email_address, label';

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server is not configured.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // ── Authorise the caller ───────────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Missing authorization header.' }, 401);

  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller.user) return json({ error: 'Invalid or expired session.' }, 401);

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .single();
  if (profileErr) return json({ error: 'Could not verify your account role.' }, 403);
  if (profile?.role !== 'admin') return json({ error: 'Admin role required.' }, 403);

  const secret = Deno.env.get('HOMESTA_WEBHOOK_SECRET');
  if (!secret) {
    return json(
      { error: 'HOMESTA_WEBHOOK_SECRET is not set on this function. Add it in Supabase → Edge Functions → Secrets.' },
      500,
    );
  }

  // ── Validate ───────────────────────────────────────────────────────────────
  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const to = (payload.to ?? '').trim();
  const subject = (payload.subject ?? '').trim();
  const bodyHtml = (payload.body_html ?? '').trim();
  const rowId = (payload.message_row_id ?? '').trim();

  if (!to) return json({ error: 'A recipient is required.' }, 400);
  if (!subject) return json({ error: 'A subject is required.' }, 400);
  if (!bodyHtml) return json({ error: 'The message body is empty.' }, 400);
  if (!rowId) return json({ error: 'message_row_id is required.' }, 400);

  // The row must exist and be an outbound message — this endpoint may not be
  // used to trigger sends for arbitrary ids.
  const { data: row, error: rowErr } = await admin
    .from('email_messages')
    .select('id, direction, send_status, account_id')
    .eq('id', rowId)
    .single();
  if (rowErr || !row) return json({ error: 'That message row does not exist.' }, 404);
  if (row.direction !== 'outbound') return json({ error: 'That row is not an outbound message.' }, 400);
  if (row.send_status === 'sent') return json({ error: 'That message has already been sent.' }, 409);

  // ── Resolve the sending mailbox ────────────────────────────────────────────
  //
  // Resolved here rather than taken from the browser: the From address is what
  // the recipient replies to, and a reply that lands in the wrong inbox is not
  // something the dashboard should be able to cause by sending a stray field.
  //
  // An unknown slug is refused outright. Quietly falling back to the default
  // would send partner mail from info@, which is the exact confusion the second
  // mailbox exists to prevent.
  const slug = (payload.account_slug ?? '').trim();
  let account: Account | null = null;

  if (slug) {
    const { data } = await admin
      .from('email_accounts')
      .select(ACCOUNT_COLUMNS)
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    if (!data) return json({ error: `No active mailbox with the slug "${slug}".` }, 400);
    account = data as Account;
  } else if (row.account_id) {
    // A reply inherits the mailbox of the conversation it belongs to.
    const { data } = await admin
      .from('email_accounts')
      .select(ACCOUNT_COLUMNS)
      .eq('id', row.account_id)
      .maybeSingle();
    account = (data as Account) ?? null;
  }

  if (!account) {
    const { data } = await admin
      .from('email_accounts')
      .select(ACCOUNT_COLUMNS)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle();
    account = (data as Account) ?? null;
  }

  if (!account) {
    return json({ error: 'No active sending mailbox is configured in email_accounts.' }, 500);
  }

  // Keep the row honest: it must show the mailbox the message actually left from.
  if (row.account_id !== account.id) {
    await admin.from('email_messages').update({ account_id: account.id }).eq('id', rowId);
  }

  // ── Forward ────────────────────────────────────────────────────────────────
  let upstream: Response;
  try {
    upstream = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-homesta-secret': secret },
      body: JSON.stringify({
        to,
        cc: (payload.cc ?? '').trim(),
        subject,
        body_html: bodyHtml,
        message_row_id: rowId,
        // n8n uses these for the Resend `from` and `reply_to`; it falls back to
        // its own env defaults only if they are missing.
        account_slug: account.slug,
        from_email: account.email_address,
        from_name: account.label ?? '',
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send webhook unreachable.';
    await admin.from('email_messages').update({ send_status: 'failed', error_note: message }).eq('id', rowId);
    return json({ error: `Send webhook unreachable: ${message}` }, 502);
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    await admin
      .from('email_messages')
      .update({ send_status: 'failed', error_note: `Webhook ${upstream.status}: ${text.slice(0, 300)}` })
      .eq('id', rowId);
    return json({ error: `Send webhook returned ${upstream.status}.`, upstream: text.slice(0, 500) }, 502);
  }

  // n8n flips the row to 'sent' once Resend accepts it. Marking it queued here
  // means the UI never shows a handed-off message as a draft.
  await admin.from('email_messages').update({ send_status: 'queued' }).eq('id', rowId);

  return json({ ok: true, message_row_id: rowId, from: account.email_address });
});
