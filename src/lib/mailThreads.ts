import type { InboxItem } from './mail';

/**
 * Conversation logic for the Mail page, kept free of React and Supabase so it
 * can be tested on plain rows.
 *
 * A conversation is what the list shows as one row: every message that belongs
 * to the same exchange. `thread_key` is the authority; rows written before it
 * existed fall back to the RFC headers (`in_reply_to` → `message_id`) and, last,
 * to the subject with its "Re:"/"Fwd:" prefixes stripped, but only between the
 * same two parties, so two unrelated "Hello" mails never merge.
 */

export interface Conversation {
  /** Stable for as long as the conversation exists: the earliest message's id. */
  key: string;
  /** Oldest first, the reading order. */
  messages: InboxItem[];
  latest: InboxItem;
  subject: string | null;
  unreadCount: number;
  starred: boolean;
  hasAttachments: boolean;
  hasInbound: boolean;
  hasOutbound: boolean;
}

const PREFIX = /^\s*((re|fw|fwd|aw|wg|sv|vs|tr|rv|ynt|ilt)\s*(\[\d+\])?\s*:\s*)+/i;

/** "Re: Fwd: Re: Booking" → "booking". */
export function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? '').replace(PREFIX, '').trim().toLowerCase();
}

/** The other party's address, lowercased: the sender of what we received, the first recipient of what we sent. */
export function counterpartyAddress(item: InboxItem): string {
  const raw = item.direction === 'outbound' ? item.toEmails[0] : item.fromEmail;
  return (raw ?? '').trim().toLowerCase();
}

/** Who the message is with, for display. */
export function counterpartyName(item: InboxItem): string {
  if (item.direction === 'outbound') return item.toEmails.join(', ') || 'Unknown';
  return item.fromName || item.fromEmail || 'Unknown';
}

function time(item: InboxItem): number {
  const t = item.emailDate ? Date.parse(item.emailDate) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Groups rows into conversations, newest conversation first.
 *
 * Union–find over three kinds of link, in order of trust. Each row starts as its
 * own group; a link merges two groups and never splits one.
 */
export function groupConversations(items: readonly InboxItem[]): Conversation[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    // Path compression keeps repeated lookups flat.
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) as string;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (const item of items) parent.set(item.id, item.id);

  const byThreadKey = new Map<string, string>();
  const byMessageId = new Map<string, string>();
  const bySubject = new Map<string, string>();

  for (const item of items) {
    if (item.threadKey) {
      const seen = byThreadKey.get(item.threadKey);
      if (seen) union(seen, item.id);
      else byThreadKey.set(item.threadKey, item.id);
    }
    if (item.messageId) byMessageId.set(item.messageId, item.id);
  }

  for (const item of items) {
    if (item.inReplyTo) {
      const target = byMessageId.get(item.inReplyTo);
      if (target) union(target, item.id);
    }
  }

  // Subject fallback only for rows the headers could not place.
  for (const item of items) {
    if (item.threadKey) continue;
    const subject = normalizeSubject(item.subject);
    const party = counterpartyAddress(item);
    if (!subject || !party) continue;
    const key = `${item.accountId ?? ''}|${party}|${subject}`;
    const seen = bySubject.get(key);
    if (seen) union(seen, item.id);
    else bySubject.set(key, item.id);
  }

  const groups = new Map<string, InboxItem[]>();
  for (const item of items) {
    const root = find(item.id);
    const list = groups.get(root);
    if (list) list.push(item);
    else groups.set(root, [item]);
  }

  const conversations: Conversation[] = [];
  groups.forEach((messages) => {
    messages.sort((a, b) => time(a) - time(b));
    const latest = messages[messages.length - 1];
    conversations.push({
      key: messages[0].id,
      messages,
      latest,
      subject: messages.find((m) => m.subject)?.subject ?? null,
      unreadCount: messages.filter((m) => m.direction === 'inbound' && !m.isRead).length,
      starred: messages.some((m) => m.isStarred),
      hasAttachments: messages.some((m) => m.hasAttachments),
      hasInbound: messages.some((m) => m.direction === 'inbound'),
      hasOutbound: messages.some((m) => m.direction === 'outbound'),
    });
  });

  return conversations.sort((a, b) => time(b.latest) - time(a.latest));
}

/**
 * The names a conversation row shows: "Ahmed, me (3)". Inbound senders by name,
 * "me" for anything we sent, in the order they first spoke.
 */
export function participantsLabel(conversation: Conversation): string {
  const names: string[] = [];
  for (const m of conversation.messages) {
    const name = m.direction === 'outbound' ? 'me' : (m.fromName || m.fromEmail || 'Unknown');
    if (!names.includes(name)) names.push(name);
  }
  // A conversation we started and nobody answered reads better as the recipient.
  if (names.length === 1 && names[0] === 'me') return `To: ${counterpartyName(conversation.latest)}`;
  const label = names.slice(0, 3).join(', ') + (names.length > 3 ? ', …' : '');
  return conversation.messages.length > 1 ? `${label} (${conversation.messages.length})` : label;
}

// ── Replying ─────────────────────────────────────────────────────────────────

export type ReplyMode = 'reply' | 'replyAll' | 'forward';

function uniqueAddresses(list: readonly string[], exclude: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const a = raw.trim();
    const k = a.toLowerCase();
    if (!a || exclude.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

/**
 * To and Cc for a reply. `own` is every address of ours, so reply-all never
 * mails our own mailbox back to itself.
 *
 * Replying to something we sent goes to the people we sent it to, as every mail
 * client does.
 */
export function replyRecipients(
  message: InboxItem,
  cc: readonly string[],
  own: readonly string[],
  mode: ReplyMode,
): { to: string[]; cc: string[] } {
  if (mode === 'forward') return { to: [], cc: [] };
  const mine = new Set(own.map((a) => a.toLowerCase()));

  const primary = message.direction === 'inbound'
    ? uniqueAddresses([message.fromEmail ?? ''], mine)
    : uniqueAddresses(message.toEmails, mine);

  if (mode === 'reply') return { to: primary, cc: [] };

  const taken = new Set([...mine, ...primary.map((a) => a.toLowerCase())]);
  const others = message.direction === 'inbound' ? [...message.toEmails, ...cc] : [...cc];
  return { to: primary, cc: uniqueAddresses(others, taken) };
}

export function replySubject(subject: string | null, mode: ReplyMode): string {
  const base = (subject ?? '').trim();
  if (mode === 'forward') return /^fwd?:/i.test(base) ? base : `Fwd: ${base}`.trim();
  return /^re:/i.test(base) ? base : `Re: ${base}`.trim();
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

/** Plain text as paragraphs, for bodies that arrived without HTML. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * The original message, quoted under a reply or forward.
 *
 * `originalHtml` must already be sanitized: it is pasted into mail we send.
 */
export function quoteBlock(
  message: InboxItem,
  originalHtml: string,
  mode: ReplyMode,
  dateLabel: string,
): string {
  const from = message.direction === 'outbound'
    ? escapeHtml(message.accountEmail ?? 'us')
    : (message.fromName && message.fromEmail
        ? `${escapeHtml(message.fromName)} &lt;${escapeHtml(message.fromEmail)}&gt;`
        : escapeHtml(message.fromEmail ?? message.fromName ?? 'Unknown'));

  if (mode === 'forward') {
    return (
      '<div style="margin-top:16px">---------- Forwarded message ---------<br>' +
      `From: ${from}<br>` +
      `Date: ${escapeHtml(dateLabel)}<br>` +
      `Subject: ${escapeHtml(message.subject ?? '')}<br>` +
      `To: ${escapeHtml(message.toEmails.join(', '))}<br><br>` +
      `${originalHtml}</div>`
    );
  }

  return (
    `<div style="margin-top:16px">On ${escapeHtml(dateLabel)}, ${from} wrote:<br>` +
    '<blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">' +
    `${originalHtml}</blockquote></div>`
  );
}

// ── Formatting ───────────────────────────────────────────────────────────────

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const LONG_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * The list's time column: "now", "5m ago", "3h ago", "Yesterday", "Mon",
 * "12 Sep", then "12 Sep 2025" once it is from another year.
 */
export function listTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const minutes = Math.floor((now.getTime() - d.getTime()) / 60000);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);

  if (days <= 0) {
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return WEEKDAY.format(d);
  return d.getFullYear() === now.getFullYear() ? SHORT_DATE.format(d) : LONG_DATE.format(d);
}

/** "2.4 MB" — attachments carry a byte count only sometimes. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** "PDF", "JPG" — the badge on an attachment card. */
export function fileKind(name: string | null | undefined, type: string | null | undefined): string {
  const ext = (name ?? '').split('.').pop();
  if (ext && ext !== name && ext.length <= 5) return ext.toUpperCase();
  const sub = (type ?? '').split('/').pop();
  return sub ? sub.toUpperCase().slice(0, 5) : 'FILE';
}

/** A comma list of addresses, or the first one that is not an address. */
export function invalidAddress(list: readonly string[]): string | null {
  const re = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
  return list.find((a) => !re.test(a)) ?? null;
}

export function splitAddresses(value: string): string[] {
  return value.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

/** What a mailbox's local part may contain, mirroring `create_mailbox`'s own cleaning. */
export function cleanLocalPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
}
