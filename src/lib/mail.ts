import type { RealtimeChannel } from '@supabase/supabase-js';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Unified email inbox.
 *
 * Reads come from the `inbox_view` view (list) and `email_messages` (body), both
 * of which the dashboard's ordinary authenticated client can reach — RLS is off
 * and the route is admin-gated. Sending is the exception: it needs the n8n
 * webhook secret, which must never be inlined into the public bundle, so it goes
 * through the `send-email` Edge Function.
 */

export type EmailDirection = 'inbound' | 'outbound';
export type EmailSendStatus =
  | 'draft'
  | 'pending_approval'
  | 'queued'
  | 'sent'
  | 'failed'
  | 'received';

export type SourcePriority = 'top' | 'high' | 'medium' | 'low';

export interface InboxItem {
  id: string;
  direction: EmailDirection;
  sendStatus: EmailSendStatus;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmails: string[];
  emailDate: string | null;
  isRead: boolean;
  isArchived: boolean;
  isStarred: boolean;
  threadKey: string | null;
  sourceId: string | null;
  sourceName: string | null;
  sourceSlug: string | null;
  sourcePriority: SourcePriority | null;
  contactId: string | null;
  contactName: string | null;
  preview: string | null;
}

export interface EmailAttachment {
  filename?: string;
  url?: string;
  size?: number;
  contentType?: string;
}

export interface EmailBody {
  id: string;
  bodyHtml: string | null;
  bodyText: string | null;
  ccEmails: string[];
  messageId: string | null;
  inReplyTo: string | null;
  attachments: EmailAttachment[];
  matchedBy: string | null;
}

export type InboxFilter =
  | 'all'
  | 'unread'
  | 'starred'
  | 'inbound'
  | 'outbound'
  | 'archived';

const VIEW_COLUMNS =
  'id, direction, send_status, subject, from_email, from_name, to_emails, email_date, ' +
  'is_read, is_archived, is_starred, thread_key, source_id, source_name, source_slug, ' +
  'source_priority, contact_id, contact_name, preview';

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function mapItem(raw: Record<string, unknown>): InboxItem {
  return {
    id: String(raw.id),
    direction: (raw.direction as EmailDirection) ?? 'inbound',
    sendStatus: (raw.send_status as EmailSendStatus) ?? 'received',
    subject: (raw.subject as string) ?? null,
    fromEmail: (raw.from_email as string) ?? null,
    fromName: (raw.from_name as string) ?? null,
    toEmails: strArray(raw.to_emails),
    emailDate: (raw.email_date as string) ?? null,
    isRead: raw.is_read === true,
    isArchived: raw.is_archived === true,
    isStarred: raw.is_starred === true,
    threadKey: (raw.thread_key as string) ?? null,
    sourceId: (raw.source_id as string) ?? null,
    sourceName: (raw.source_name as string) ?? null,
    sourceSlug: (raw.source_slug as string) ?? null,
    sourcePriority: (raw.source_priority as SourcePriority) ?? null,
    contactId: (raw.contact_id as string) ?? null,
    contactName: (raw.contact_name as string) ?? null,
    preview: (raw.preview as string) ?? null,
  };
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * The archived filter is the only one that *shows* archived mail; every other
 * filter hides it, which is what makes archiving useful at all.
 */
export async function listInbox(filter: InboxFilter, sourceId?: string | null): Promise<InboxItem[]> {
  let q = supabase.from('inbox_view').select(VIEW_COLUMNS);

  if (filter === 'archived') q = q.eq('is_archived', true);
  else q = q.eq('is_archived', false);

  if (filter === 'unread') q = q.eq('is_read', false);
  if (filter === 'starred') q = q.eq('is_starred', true);
  if (filter === 'inbound') q = q.eq('direction', 'inbound');
  if (filter === 'outbound') q = q.eq('direction', 'outbound');
  if (sourceId) q = q.eq('source_id', sourceId);

  const { data, error } = await q.order('email_date', { ascending: false, nullsFirst: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapItem(r as unknown as Record<string, unknown>));
}

export async function getBody(id: string): Promise<EmailBody> {
  const { data, error } = await supabase
    .from('email_messages')
    .select('id, body_html, body_text, cc_emails, message_id, in_reply_to, attachments, matched_by')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);

  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    id: String(raw.id),
    bodyHtml: (raw.body_html as string) ?? null,
    bodyText: (raw.body_text as string) ?? null,
    ccEmails: strArray(raw.cc_emails),
    messageId: (raw.message_id as string) ?? null,
    inReplyTo: (raw.in_reply_to as string) ?? null,
    attachments: Array.isArray(raw.attachments) ? (raw.attachments as EmailAttachment[]) : [],
    matchedBy: (raw.matched_by as string) ?? null,
  };
}

/** Every message sharing a thread_key, oldest first — the reading order. */
export async function getThread(threadKey: string): Promise<InboxItem[]> {
  const { data, error } = await supabase
    .from('inbox_view')
    .select(VIEW_COLUMNS)
    .eq('thread_key', threadKey)
    .order('email_date', { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapItem(r as unknown as Record<string, unknown>));
}

export async function unreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('email_messages')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
    .eq('direction', 'inbound');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ── Writes ────────────────────────────────────────────────────────────────────

async function patch(id: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('email_messages').update(fields).eq('id', id);
  if (error) throw new Error(error.message);
}

export const markRead = (id: string) => patch(id, { is_read: true });
export const setStarred = (id: string, value: boolean) => patch(id, { is_starred: value });
export const setArchived = (id: string, value: boolean) => patch(id, { is_archived: value });

/** Manual source assignment for mail the matcher could not place. */
export const assignSource = (id: string, sourceId: string) =>
  patch(id, { source_id: sourceId, matched_by: 'manual' });

// ── Sending ───────────────────────────────────────────────────────────────────

export interface SendInput {
  to: string;
  cc?: string;
  subject: string;
  bodyHtml: string;
  /** Set on a reply so the new message joins the existing conversation. */
  threadKey?: string | null;
  /** The original message's RFC `message_id`, for correct threading in clients. */
  inReplyTo?: string | null;
  sourceId?: string | null;
  contactId?: string | null;
}

/**
 * Creates the outbound row, then asks the Edge Function to hand it to n8n.
 *
 * The row is written first and deliberately kept even if the webhook call fails:
 * a draft sitting in the inbox marked `failed` is recoverable, a silently lost
 * message is not.
 */
export async function sendEmail(input: SendInput): Promise<string> {
  const toList = input.to.split(',').map((s) => s.trim()).filter(Boolean);
  const ccList = (input.cc ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const { data, error } = await supabase
    .from('email_messages')
    .insert({
      direction: 'outbound',
      send_status: 'draft',
      to_emails: toList,
      cc_emails: ccList.length ? ccList : null,
      subject: input.subject,
      body_html: input.bodyHtml,
      thread_key: input.threadKey ?? null,
      in_reply_to: input.inReplyTo ?? null,
      source_id: input.sourceId ?? null,
      contact_id: input.contactId ?? null,
      email_date: new Date().toISOString(),
      is_read: true,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  const rowId = String((data as { id: string }).id);

  const { error: fnError } = await supabase.functions.invoke('send-email', {
    body: {
      to: toList.join(','),
      cc: ccList.join(','),
      subject: input.subject,
      body_html: input.bodyHtml,
      message_row_id: rowId,
    },
  });

  if (fnError) {
    let message = 'Could not hand the message to the sender.';
    if (fnError instanceof FunctionsHttpError) {
      try {
        const body = await fnError.context.json();
        if (body && typeof body.error === 'string') message = body.error;
      } catch {
        // Non-JSON error body — keep the generic message.
      }
    } else if (fnError instanceof Error && fnError.message) {
      message = fnError.message;
    }
    // Mark it so the row does not sit as a silent draft forever.
    await patch(rowId, { send_status: 'failed', error_note: message }).catch(() => {});
    throw new Error(message);
  }

  return rowId;
}

// ── Realtime ──────────────────────────────────────────────────────────────────

/** Fires on every new row in `email_messages`. Returns an unsubscribe function. */
export function subscribeToMail(onChange: () => void): () => void {
  const channel: RealtimeChannel = supabase
    .channel('mail-inbox')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'email_messages' }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'email_messages' }, onChange)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

// ── Formatting ────────────────────────────────────────────────────────────────

const ABSOLUTE = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "5m ago" / "3h ago" / "12 Sep" — the inbox list wants glanceable, not exact. */
export function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';

  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' }).format(d);
}

export function absoluteTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : ABSOLUTE.format(d);
}

export const STATUS_LABEL: Record<EmailSendStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Awaiting approval',
  queued: 'Queued',
  sent: 'Sent',
  failed: 'Failed',
  received: 'Received',
};

/** Tailwind classes per send_status — muted for the quiet states, loud for failure. */
export const STATUS_CLASS: Record<EmailSendStatus, string> = {
  draft: 'bg-black/[0.05] text-black/55 border-black/10',
  pending_approval: 'bg-[#d99a3d]/10 text-[#a6702a] border-[#d99a3d]/25',
  queued: 'bg-[#6ea4e7]/10 text-[#1f64bb] border-[#6ea4e7]/25',
  sent: 'bg-[#3f9b6d]/10 text-[#2f7553] border-[#3f9b6d]/25',
  failed: 'bg-[#d4183d]/10 text-[#d4183d] border-[#d4183d]/25',
  received: 'bg-black/[0.04] text-black/50 border-black/[0.08]',
};

export const PRIORITY_CLASS: Record<SourcePriority, string> = {
  top: 'bg-[#d4183d]/10 text-[#d4183d] border-[#d4183d]/25',
  high: 'bg-[#d99a3d]/12 text-[#a6702a] border-[#d99a3d]/25',
  medium: 'bg-[#6ea4e7]/12 text-[#1f64bb] border-[#6ea4e7]/25',
  low: 'bg-black/[0.05] text-black/50 border-black/10',
};
