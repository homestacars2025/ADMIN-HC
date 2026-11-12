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
  /**
   * Not in `inbox_view`; read from `email_messages` alongside it (see
   * `withMeta`). They drive the paperclip and conversation grouping.
   */
  hasAttachments: boolean;
  messageId: string | null;
  inReplyTo: string | null;
}

/** Attachment metadata as stored; the content itself is not kept. */
export interface EmailAttachment {
  name: string;
  type: string | null;
  size: number | null;
  url: string | null;
}

/** Rows were written by more than one sender over time, so both spellings occur. */
function mapAttachment(raw: unknown, index: number): EmailAttachment {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (...keys: string[]) => {
    for (const k of keys) if (typeof a[k] === 'string' && a[k]) return a[k] as string;
    return null;
  };
  const size = [a.size, a.bytes, a.size_bytes].find((v) => typeof v === 'number') as number | undefined;
  return {
    name: str('name', 'filename', 'file_name') ?? `Attachment ${index + 1}`,
    type: str('type', 'contentType', 'content_type', 'mime_type'),
    size: size ?? null,
    url: str('url', 'download_url'),
  };
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
    hasAttachments: false,
    messageId: null,
    inReplyTo: null,
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

const LIST_LIMIT = 500;
const META_COLUMNS = 'id, has_attachments, attachments, message_id, in_reply_to';

/**
 * The archived filter is the only one that *shows* archived mail; every other
 * filter hides it, which is what makes archiving useful at all.
 */
export async function listInbox(
  filter: InboxFilter,
  sourceId?: string | null,
  accountId?: string | null,
): Promise<InboxItem[]> {
  // The same filters go on the view and on the table, so the two reads return
  // the same rows and can run side by side instead of one after the other.
  const conditions: Array<[string, unknown]> = [['is_archived', filter === 'archived']];
  if (filter === 'unread') conditions.push(['is_read', false]);
  if (filter === 'starred') conditions.push(['is_starred', true]);
  if (filter === 'inbound') conditions.push(['direction', 'inbound']);
  if (filter === 'outbound') conditions.push(['direction', 'outbound']);
  if (sourceId) conditions.push(['source_id', sourceId]);
  if (accountId) conditions.push(['account_id', accountId]);

  let viewQuery = supabase.from('inbox_view').select(VIEW_COLUMNS);
  let metaQuery = supabase.from('email_messages').select(META_COLUMNS);
  for (const [column, value] of conditions) {
    viewQuery = viewQuery.eq(column, value);
    metaQuery = metaQuery.eq(column, value);
  }

  const [view, meta] = await Promise.all([
    viewQuery
      .order('email_date', { ascending: false, nullsFirst: false })
      .limit(LIST_LIMIT),
    metaQuery
      .order('email_date', { ascending: false, nullsFirst: false })
      .limit(LIST_LIMIT),
  ]);
  if (view.error) throw new Error(view.error.message);
  return withMeta(view.data ?? [], meta.data ?? []);
}

/**
 * Merges the header fields onto the view rows. A failed meta read only costs
 * the paperclip and header-based grouping, never the list itself.
 */
function withMeta(viewRows: readonly unknown[], metaRows: readonly unknown[]): InboxItem[] {
  const meta = new Map<string, Record<string, unknown>>();
  for (const r of metaRows) {
    const raw = r as Record<string, unknown>;
    meta.set(String(raw.id), raw);
  }
  return viewRows.map((r) => {
    const item = mapItem(r as Record<string, unknown>);
    const m = meta.get(item.id);
    if (!m) return item;
    const attachments = Array.isArray(m.attachments) ? m.attachments.length : 0;
    return {
      ...item,
      hasAttachments: m.has_attachments === true || attachments > 0,
      messageId: (m.message_id as string) ?? null,
      inReplyTo: (m.in_reply_to as string) ?? null,
    };
  });
}

export async function getBody(id: string): Promise<EmailBody> {
  const { data, error } = await supabase.from('email_messages').select(BODY_COLUMNS).eq('id', id).single();
  if (error) throw new Error(error.message);
  return mapBody((data ?? {}) as Record<string, unknown>);
}

const BODY_COLUMNS = 'id, body_html, body_text, cc_emails, message_id, in_reply_to, attachments, matched_by';

function mapBody(raw: Record<string, unknown>): EmailBody {
  return {
    id: String(raw.id),
    bodyHtml: (raw.body_html as string) ?? null,
    bodyText: (raw.body_text as string) ?? null,
    ccEmails: strArray(raw.cc_emails),
    messageId: (raw.message_id as string) ?? null,
    inReplyTo: (raw.in_reply_to as string) ?? null,
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map(mapAttachment) : [],
    matchedBy: (raw.matched_by as string) ?? null,
  };
}

/** Every body of a conversation in one request, keyed by message id. */
export async function getBodies(ids: readonly string[]): Promise<Record<string, EmailBody>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from('email_messages').select(BODY_COLUMNS).in('id', [...ids]);
  if (error) throw new Error(error.message);
  const out: Record<string, EmailBody> = {};
  for (const r of data ?? []) {
    const body = mapBody(r as unknown as Record<string, unknown>);
    out[body.id] = body;
  }
  return out;
}

/**
 * When the newest inbound message was stored, by the database's clock. The
 * new-mail check counts from here rather than from the browser's clock, which
 * may be minutes off.
 */
export async function latestInboundAt(): Promise<string | null> {
  const { data, error } = await supabase
    .from('email_messages')
    .select('created_at')
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { created_at?: string } | null)?.created_at ?? null;
}

/**
 * Inbound mail that arrived after `sinceIso`, newest last. This is what the
 * page polls to announce new mail: a few columns, usually zero rows.
 */
export async function inboundSince(sinceIso: string): Promise<Array<{
  id: string; createdAt: string; fromName: string | null; fromEmail: string | null; subject: string | null; accountId: string | null;
}>> {
  const { data, error } = await supabase
    .from('email_messages')
    .select('id, created_at, from_name, from_email, subject, account_id')
    .eq('direction', 'inbound')
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const raw = r as unknown as Record<string, unknown>;
    return {
      id: String(raw.id),
      createdAt: String(raw.created_at),
      fromName: (raw.from_name as string) ?? null,
      fromEmail: (raw.from_email as string) ?? null,
      subject: (raw.subject as string) ?? null,
      accountId: (raw.account_id as string) ?? null,
    };
  });
}

/** Every message sharing a thread_key, oldest first — the reading order. */
export async function getThread(threadKey: string): Promise<InboxItem[]> {
  const [view, meta] = await Promise.all([
    supabase
      .from('inbox_view')
      .select(VIEW_COLUMNS)
      .eq('thread_key', threadKey)
      .order('email_date', { ascending: true, nullsFirst: true }),
    supabase.from('email_messages').select(META_COLUMNS).eq('thread_key', threadKey),
  ]);
  if (view.error) throw new Error(view.error.message);
  return withMeta(view.data ?? [], meta.data ?? []);
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

async function patchMany(ids: readonly string[], fields: Record<string, unknown>): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('email_messages').update(fields).in('id', [...ids]);
  if (error) throw new Error(error.message);
}

/** One request for a whole conversation, not one per message. */
export const setReadMany = (ids: readonly string[], value: boolean) => patchMany(ids, { is_read: value });
export const setArchivedMany = (ids: readonly string[], value: boolean) => patchMany(ids, { is_archived: value });

/**
 * Permanent: `email_messages` has no trash column, so a deleted message is gone.
 * The page asks first, and offers Archive as the reversible choice.
 */
export async function deleteMessages(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('email_messages').delete().in('id', [...ids]);
  if (error) throw new Error(error.message);
}

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

// ── Mailboxes ─────────────────────────────────────────────────────────────────

export interface CreateMailboxInput {
  localPart: string;
  label: string;
  color: string;
  /** Profiles to give access straight away. */
  grantProfiles: string[];
}

export interface CreatedMailbox {
  id: string;
  email: string;
  slug: string;
  label: string;
}

const MAILBOX_ERRORS: Record<string, string> = {
  'admin only': 'Only an admin can create a mailbox.',
  'invalid local part': 'Use letters, numbers, dots, dashes or underscores for the address.',
  'mailbox already exists': 'That address already exists.',
};

/**
 * `create_mailbox` checks the admin role itself, cleans the local part and
 * refuses duplicates; it answers `{ ok: false, error }` rather than raising, so
 * both paths are turned into an Error here.
 */
export async function createMailbox(input: CreateMailboxInput): Promise<CreatedMailbox> {
  const { data, error } = await supabase.rpc('create_mailbox', {
    p_local_part: input.localPart,
    p_label: input.label,
    p_color: input.color,
    p_grant_profiles: input.grantProfiles.length ? input.grantProfiles : null,
  });
  if (error) throw new Error(error.message);

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok !== true) {
    const code = typeof result.error === 'string' ? result.error : '';
    throw new Error(MAILBOX_ERRORS[code] ?? (code || 'Could not create the mailbox.'));
  }
  return {
    id: String(result.id),
    email: String(result.email ?? ''),
    slug: String(result.slug ?? ''),
    label: String(result.label ?? ''),
  };
}

export interface TeamMemberOption {
  profileId: string;
  name: string;
  email: string | null;
  position: string | null;
  avatarUrl: string | null;
}

/** Active team members, for granting mailbox access. */
export async function listTeamMembers(): Promise<TeamMemberOption[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('profile_id, position, profile:profiles(full_name, email, avatar_url)')
    .eq('is_active', true);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((r) => {
      const raw = r as unknown as Record<string, unknown>;
      const embedded = raw.profile;
      const p = (Array.isArray(embedded) ? embedded[0] : embedded) as Record<string, unknown> | null;
      const email = (p?.email as string) ?? null;
      return {
        profileId: String(raw.profile_id),
        name: (p?.full_name as string) || email || 'Team member',
        email,
        position: (raw.position as string) ?? null,
        avatarUrl: (p?.avatar_url as string) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
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
