import type { RealtimeChannel } from '@supabase/supabase-js';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { normalizeAttachments, type MailAttachment } from './mailThreads';
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

/**
 * A mailbox the company sends and receives from. Rows live in `email_accounts`;
 * nothing here hardcodes an address, so adding a third mailbox is a row, not a
 * deploy.
 */
export interface EmailAccount {
  id: string;
  slug: string | null;
  emailAddress: string;
  label: string | null;
  /** Hex, straight from the row — used for the dot beside a message. */
  color: string | null;
  isDefault: boolean;
  sortOrder: number;
}

/**
 * "Partners", "Info" — the one word that fits on a badge.
 *
 * Taken from the slug rather than the label because the labels are long by
 * design ("Homesta Cars — Info / Customers") and a badge has room for a word.
 */
export function shortAccountName(account: Pick<EmailAccount, 'slug' | 'emailAddress'>): string {
  const tail = (account.slug ?? '').split('-').pop() ?? '';
  const word = tail || account.emailAddress.split('@')[0];
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : '—';
}

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
  /** Which mailbox this message belongs to. Null only for pre-accounts rows. */
  accountId: string | null;
  accountSlug: string | null;
  accountLabel: string | null;
  accountEmail: string | null;
  accountColor: string | null;
  /** RFC ids, for threading rows that have no thread_key. Filled by listMailbox only. */
  messageId: string | null;
  inReplyTo: string | null;
  hasAttachments: boolean;
}

export interface EmailBody {
  id: string;
  bodyHtml: string | null;
  bodyText: string | null;
  ccEmails: string[];
  messageId: string | null;
  inReplyTo: string | null;
  attachments: MailAttachment[];
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
  'source_priority, contact_id, contact_name, preview, ' +
  'account_id, account_slug, account_label, account_email, account_color';

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
    accountId: (raw.account_id as string) ?? null,
    accountSlug: (raw.account_slug as string) ?? null,
    accountLabel: (raw.account_label as string) ?? null,
    accountEmail: (raw.account_email as string) ?? null,
    accountColor: (raw.account_color as string) ?? null,
    messageId: null,
    inReplyTo: null,
    hasAttachments: false,
  };
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function listAccounts(): Promise<EmailAccount[]> {
  const { data, error } = await supabase
    .from('email_accounts')
    .select('id, slug, email_address, label, color, is_default, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const raw = r as unknown as Record<string, unknown>;
    return {
      id: String(raw.id),
      slug: (raw.slug as string) ?? null,
      emailAddress: String(raw.email_address ?? ''),
      label: (raw.label as string) ?? null,
      color: (raw.color as string) ?? null,
      isDefault: raw.is_default === true,
      sortOrder: typeof raw.sort_order === 'number' ? raw.sort_order : 0,
    };
  });
}

/** Unread inbound per mailbox, keyed by account id — one request for all tabs. */
export async function unreadByAccount(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('email_unread_counts').select('account_id, unread');
  if (error) throw new Error(error.message);

  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    const raw = r as unknown as Record<string, unknown>;
    out[String(raw.account_id)] = Number(raw.unread ?? 0);
  }
  return out;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * The archived filter is the only one that *shows* archived mail; every other
 * filter hides it, which is what makes archiving useful at all.
 */
export async function listInbox(
  filter: InboxFilter,
  sourceId?: string | null,
  accountId?: string | null,
): Promise<InboxItem[]> {
  let q = supabase.from('inbox_view').select(VIEW_COLUMNS);

  if (filter === 'archived') q = q.eq('is_archived', true);
  else q = q.eq('is_archived', false);

  if (filter === 'unread') q = q.eq('is_read', false);
  if (filter === 'starred') q = q.eq('is_starred', true);
  if (filter === 'inbound') q = q.eq('direction', 'inbound');
  if (filter === 'outbound') q = q.eq('direction', 'outbound');
  if (sourceId) q = q.eq('source_id', sourceId);
  if (accountId) q = q.eq('account_id', accountId);

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
    attachments: normalizeAttachments(raw.attachments),
    matchedBy: (raw.matched_by as string) ?? null,
  };
}

/**
 * Ids of messages whose full text matches — the list only carries the first 160
 * characters, so a word further down needs the server.
 */
export async function searchMessageIds(query: string, accountIds: string[] | null): Promise<Set<string>> {
  // PostgREST pattern characters and filter syntax are dropped, not escaped.
  const term = query.trim().replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (term.length < 3 || (accountIds && accountIds.length === 0)) return new Set();
  let q = supabase.from('email_messages').select('id').ilike('body_text', `%${term}%`);
  if (accountIds) q = q.in('account_id', accountIds);
  const { data, error } = await q.limit(MAILBOX_LIMIT);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => String((r as { id: string }).id)));
}

/** Bodies for a whole conversation in one request, keyed by message id. */
export async function getBodies(ids: string[]): Promise<Record<string, EmailBody>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('email_messages')
    .select('id, body_html, body_text, cc_emails, message_id, in_reply_to, attachments, matched_by')
    .in('id', ids);
  if (error) throw new Error(error.message);
  const out: Record<string, EmailBody> = {};
  (data ?? []).forEach((r) => {
    const raw = r as unknown as Record<string, unknown>;
    out[String(raw.id)] = {
      id: String(raw.id),
      bodyHtml: (raw.body_html as string) ?? null,
      bodyText: (raw.body_text as string) ?? null,
      ccEmails: strArray(raw.cc_emails),
      messageId: (raw.message_id as string) ?? null,
      inReplyTo: (raw.in_reply_to as string) ?? null,
      attachments: normalizeAttachments(raw.attachments),
      matchedBy: (raw.matched_by as string) ?? null,
    };
  });
  return out;
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

const MAILBOX_LIMIT = 500;

/**
 * Everything in the given mailboxes (all of them when `accountIds` is null), for
 * the client to thread and filter. inbox_view carries the joins; the RFC ids and
 * the attachment flag are not on it, so they come from the table alongside, in
 * the same request round.
 */
export async function listMailbox(accountIds: string[] | null): Promise<InboxItem[]> {
  if (accountIds && accountIds.length === 0) return [];
  let view = supabase.from('inbox_view').select(VIEW_COLUMNS);
  let meta = supabase.from('email_messages').select('id, message_id, in_reply_to, has_attachments, attachments');
  if (accountIds) {
    view = view.in('account_id', accountIds);
    meta = meta.in('account_id', accountIds);
  }
  const [rows, extra] = await Promise.all([
    view.order('email_date', { ascending: false, nullsFirst: false }).limit(MAILBOX_LIMIT),
    meta.order('email_date', { ascending: false, nullsFirst: false }).limit(MAILBOX_LIMIT),
  ]);
  if (rows.error) throw new Error(rows.error.message);
  if (extra.error) throw new Error(extra.error.message);

  const byId = new Map<string, Record<string, unknown>>();
  (extra.data ?? []).forEach((r) => {
    const raw = r as unknown as Record<string, unknown>;
    byId.set(String(raw.id), raw);
  });

  return (rows.data ?? []).map((r) => {
    const item = mapItem(r as unknown as Record<string, unknown>);
    const raw = byId.get(item.id);
    if (!raw) return item;
    return {
      ...item,
      messageId: (raw.message_id as string) ?? null,
      inReplyTo: (raw.in_reply_to as string) ?? null,
      hasAttachments: raw.has_attachments === true || normalizeAttachments(raw.attachments).length > 0,
    };
  });
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
export const markUnread = (id: string) => patch(id, { is_read: false });

async function patchMany(ids: string[], fields: Record<string, unknown>): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('email_messages').update(fields).in('id', ids);
  if (error) throw new Error(error.message);
}

/** A conversation is read, archived or deleted as a whole, the way a mail app does it. */
export const setReadMany = (ids: string[], value: boolean) => patchMany(ids, { is_read: value });
export const setArchivedMany = (ids: string[], value: boolean) => patchMany(ids, { is_archived: value });

export async function deleteMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('email_messages').delete().in('id', ids);
  if (error) throw new Error(error.message);
}
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
  /**
   * The mailbox to send from. `accountId` stamps the row; `accountSlug` is what
   * the Edge Function resolves the actual From address from — it re-resolves
   * server-side rather than trusting either of these.
   */
  accountId?: string | null;
  accountSlug?: string | null;
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
      account_id: input.accountId ?? null,
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
      account_slug: input.accountSlug ?? undefined,
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

export interface MailChange {
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  /** The new row on insert and update; empty on delete. */
  row: {
    id?: string;
    account_id?: string | null;
    direction?: EmailDirection;
    from_name?: string | null;
    from_email?: string | null;
    subject?: string | null;
  };
}

let channelSeq = 0;

/** Fires on every insert, update and delete in `email_messages`. Returns an unsubscribe function. */
export function subscribeToMail(onChange: (change: MailChange) => void): () => void {
  const handler = (payload: { eventType: string; new: unknown }) => onChange({
    event: payload.eventType as MailChange['event'],
    row: (payload.new ?? {}) as MailChange['row'],
  });
  channelSeq += 1;
  const channel: RealtimeChannel = supabase
    .channel(`mail-inbox-${channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'email_messages' }, handler)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

// ── Mailboxes ────────────────────────────────────────────────────────────────

export interface CreatedMailbox {
  id: string;
  email: string;
  slug: string;
  label: string;
}

const CREATE_ERRORS: Record<string, string> = {
  'admin only': 'Only admins can create mailboxes.',
  'invalid local part': 'Use letters, numbers, dots, dashes or underscores for the address.',
  'mailbox already exists': 'That address already exists.',
};

/** `<local>@homestacars.com`, ready to receive and send at once. */
export async function createMailbox(input: {
  localPart: string;
  label: string;
  color: string;
  grantProfiles: string[];
}): Promise<CreatedMailbox> {
  const { data, error } = await supabase.rpc('create_mailbox', {
    p_local_part: input.localPart,
    p_label: input.label,
    p_color: input.color,
    p_grant_profiles: input.grantProfiles.length ? input.grantProfiles : null,
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok !== true) {
    const code = String(result.error ?? '');
    throw new Error(CREATE_ERRORS[code] ?? (code || 'Could not create the mailbox.'));
  }
  return {
    id: String(result.id),
    email: String(result.email),
    slug: String(result.slug),
    label: String(result.label),
  };
}

// ── Who sees which mailbox ───────────────────────────────────────────────────

export interface TeamMember {
  profileId: string;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  avatarBg: string | null;
  gender: string | null;
  position: string | null;
}

export interface MailboxGrant {
  accountId: string;
  profileId: string;
  canSend: boolean;
}

/** Active team members, by name. */
export async function listTeamMembers(): Promise<TeamMember[]> {
  const [members, profiles] = await Promise.all([
    supabase.from('team_members').select('profile_id, position').eq('is_active', true),
    supabase.from('profiles').select('id, full_name, email, avatar_url, avatar_bg, gender'),
  ]);
  if (members.error) throw new Error(members.error.message);
  if (profiles.error) throw new Error(profiles.error.message);
  const byId = new Map(((profiles.data ?? []) as Array<Record<string, unknown>>).map((p) => [String(p.id), p]));
  return ((members.data ?? []) as Array<{ profile_id: string; position: string | null }>)
    .map((m) => {
      const p = byId.get(m.profile_id);
      return {
        profileId: m.profile_id,
        fullName: String(p?.full_name ?? '').trim() || String(p?.email ?? 'Team member'),
        email: (p?.email as string) ?? null,
        avatarUrl: (p?.avatar_url as string) ?? null,
        avatarBg: (p?.avatar_bg as string) ?? null,
        gender: (p?.gender as string) ?? null,
        position: m.position,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function listMailboxGrants(): Promise<MailboxGrant[]> {
  const { data, error } = await supabase.from('email_account_access').select('account_id, profile_id, can_send');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ account_id: string; profile_id: string; can_send: boolean }>).map((r) => ({
    accountId: r.account_id,
    profileId: r.profile_id,
    canSend: r.can_send === true,
  }));
}

export async function grantMailbox(accountId: string, profileId: string, canSend: boolean): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('email_account_access').insert({
    account_id: accountId,
    profile_id: profileId,
    can_send: canSend,
    granted_by: auth.user?.id ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function revokeMailbox(accountId: string, profileId: string): Promise<void> {
  const { error } = await supabase.from('email_account_access').delete().eq('account_id', accountId).eq('profile_id', profileId);
  if (error) throw new Error(error.message);
}

export async function setMailboxCanSend(accountId: string, profileId: string, canSend: boolean): Promise<void> {
  const { error } = await supabase
    .from('email_account_access')
    .update({ can_send: canSend })
    .eq('account_id', accountId)
    .eq('profile_id', profileId);
  if (error) throw new Error(error.message);
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
  pending_approval: 'bg-amber-500/10 text-amber-700 border-amber-500/25',
  queued: 'bg-primary/10 text-brand-hover border-primary/25',
  sent: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25',
  failed: 'bg-destructive/10 text-destructive border-destructive/25',
  received: 'bg-black/[0.04] text-black/50 border-black/[0.08]',
};

export const PRIORITY_CLASS: Record<SourcePriority, string> = {
  top: 'bg-destructive/10 text-destructive border-destructive/25',
  high: 'bg-amber-500/12 text-amber-700 border-amber-500/25',
  medium: 'bg-primary/12 text-brand-hover border-primary/25',
  low: 'bg-black/[0.05] text-black/50 border-black/10',
};
