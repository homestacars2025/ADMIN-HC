// Shared types + helpers for the WhatsApp Inbox.
// Mirrors the HomestaCars chat_* schema exactly — this project has no
// `bot_paused` column and no date-fns, so both are handled locally.

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConversationStatus = 'open' | 'pending' | 'closed';
export type MessageDirection   = 'inbound' | 'outbound';
export type MessageStatus      = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

/** Left-list filter. Admin sees everything, so "all" is the default. */
export type ConversationFilter = 'all' | 'unread' | 'mine';

export interface ChatContact {
  id: string;
  display_name: string | null;
  identifier: string | null;
  avatar_url: string | null;
}

export interface ChatChannel {
  id: string;
  type: string;
  display_name: string | null;
}

/** Scalar columns of chat_conversations — the shape realtime delivers. */
export interface ChatConversationRow {
  id: string;
  channel_id: string;
  contact_id: string;
  assigned_to_profile_id: string | null;
  status: ConversationStatus;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: string | null;
  unread_count: number;
  internal_notes: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A conversation with its contact + channel merged in (joined in JS). */
export interface ChatConversation extends ChatConversationRow {
  contact: ChatContact | null;
  channel: ChatChannel | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  provider_message_id: string | null;
  direction: MessageDirection;
  sender_profile_id: string | null;
  content_type: string;
  text_content: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  media_filename: string | null;
  media_size_bytes: number | null;
  media_duration_seconds: number | null;
  media_thumbnail_url: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  location_name: string | null;
  reply_to_message_id: string | null;
  status: MessageStatus | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  title: string;
  body: string;
  category: string | null;
  sort_order: number;
}

// ─── Select column lists ──────────────────────────────────────────────────────

export const CONTACT_COLUMNS = 'id, display_name, identifier, avatar_url';
export const CHANNEL_COLUMNS = 'id, type, display_name';

export const CONVERSATION_COLUMNS = `
  id, channel_id, contact_id, assigned_to_profile_id, status,
  last_message_at, last_message_preview, last_message_direction,
  unread_count, internal_notes, archived_at, deleted_at, created_at, updated_at
`;

export const MESSAGE_COLUMNS = `
  id, conversation_id, provider_message_id, direction, sender_profile_id,
  content_type, text_content, media_url, media_mime_type, media_filename,
  media_size_bytes, media_duration_seconds, media_thumbnail_url,
  location_latitude, location_longitude, location_name, reply_to_message_id,
  status, error_message, sent_at, delivered_at, read_at, created_at
`;

/** Storage bucket that outbound attachments are uploaded to before sending. */
export const CHAT_MEDIA_BUCKET = 'chat-media';

// ─── Date helpers (native — this project has no date-fns) ─────────────────────

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Compact list timestamp: "now", "2m", "1h", "Mon", "10 May". */
export function relativeShort(date: string | null | undefined): string {
  if (!date) return '';
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();

  const mins = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS);
  if (days < 7) return then.toLocaleDateString('en-GB', { weekday: 'short' });

  return then.getFullYear() === now.getFullYear()
    ? then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Bubble timestamp: "14:32". */
export function messageTime(date: string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Date-separator label: "Today", "Yesterday", or "10 May 2026". */
export function dateSeparatorLabel(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY_MS);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.getFullYear() === new Date().getFullYear()
    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Stable per-day bucket key for grouping messages. */
export function dayKey(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Human-readable file size, e.g. "847 KB". Empty when unknown. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 || n >= 10 ? 0 : 1)} ${units[i]}`;
}

/** Up to two initials from a name, else a dash. */
export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** What to call this contact in the list / header. */
export function contactLabel(c: ChatConversation): string {
  return c.contact?.display_name?.trim() || c.contact?.identifier || 'Unknown contact';
}

const CHANNEL_NAMES: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
  telegram: 'Telegram',
};

export function channelLabel(channel: ChatChannel | null): string {
  if (!channel) return 'Direct';
  return channel.display_name || CHANNEL_NAMES[channel.type] || channel.type;
}

/** Brand tint per channel, used for the small channel dot in the list. */
export function channelColor(channel: ChatChannel | null): string {
  switch (channel?.type) {
    case 'whatsapp':  return '#25d366';
    case 'instagram': return '#d62976';
    case 'messenger': return '#0084ff';
    case 'telegram':  return '#29a9eb';
    default:          return '#9ca3af';
  }
}

export function isConversationUnread(c: { unread_count: number }): boolean {
  return c.unread_count > 0;
}

export function statusHint(status: MessageStatus | null): string {
  switch (status) {
    case 'queued':    return 'Queued';
    case 'sent':      return 'Sent';
    case 'delivered': return 'Delivered';
    case 'read':      return 'Read';
    case 'failed':    return 'Failed';
    default:          return '';
  }
}

/** Newest activity first; conversations with no activity sink to the bottom. */
export function sortConversations(list: ChatConversation[]): ChatConversation[] {
  return [...list].sort((a, b) => {
    const at = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bt - at;
  });
}

/** Preview text for the list when last_message_preview is empty. */
export function previewFallback(contentType: string | null): string {
  switch (contentType) {
    case 'image':    return '📷 Photo';
    case 'video':    return '🎥 Video';
    case 'audio':    return '🎙 Voice message';
    case 'document': return '📄 Document';
    case 'location': return '📍 Location';
    default:         return 'No messages yet';
  }
}

// ─── Media helpers ────────────────────────────────────────────────────────────

export const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

export const ACCEPT_ATTR =
  'image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt';

export type MediaContentType = 'image' | 'video' | 'audio' | 'document';

const DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt']);

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/wav': 'wav',
  'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
};

export function extForFile(file: File): string {
  const dot = file.name.lastIndexOf('.');
  if (dot !== -1 && dot < file.name.length - 1) return file.name.slice(dot + 1).toLowerCase();
  return MIME_EXT[file.type] ?? 'bin';
}

/** Map a File to the chat_messages.content_type value, or null if unsupported. */
export function contentTypeForFile(file: File): MediaContentType | null {
  const mime = file.type;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (DOC_MIMES.has(mime)) return 'document';
  // Some browsers report an empty MIME — fall back to the extension.
  if (DOC_EXTS.has(extForFile(file))) return 'document';
  return null;
}

export function newUuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}
