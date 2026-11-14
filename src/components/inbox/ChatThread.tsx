import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { customersWithPhone } from '../../lib/customers';
import MessageBubble, { type OpenMedia } from './MessageBubble';
import type { AdminOption } from './ContactPanel';
import {
  AssignIcon,
  BackIcon,
  BRAND,
  ContactAvatar,
  DownIcon,
  InfoIcon,
  PaperclipIcon,
  ProfileIcon,
  ReadIcon,
  SendIcon,
  TemplateIcon,
  UnreadIcon,
} from './InboxParts';
import { Tooltip } from '../media/MediaUI';
import {
  ACCEPT_ATTR,
  CHAT_MEDIA_BUCKET,
  MAX_FILE_BYTES,
  MESSAGE_COLUMNS,
  type ChatConversation,
  type ChatMessage,
  type MessageTemplate,
  channelLine,
  contactLabel,
  contentTypeForFile,
  continuesRun,
  dateSeparatorLabel,
  dayKey,
  extForFile,
  newUuid,
} from '../../lib/inbox';

const NEAR_BOTTOM_PX = 120;

type PendingFile = { file: File; caption: string; localUrl: string };

interface Props {
  conversation: ChatConversation;
  profileId: string;
  templates: MessageTemplate[];
  onPatch: (id: string, patch: Partial<ChatConversation>) => void;
  onBack: () => void;
  onOpenMedia: OpenMedia;
  onToggleContactPanel: () => void;
  /** Staff the conversation can be given to. */
  admins: AdminOption[];
  onAssign: (profileId: string | null) => void;
  /** Flags it unread and closes it, so opening it doesn't read it again. */
  onMarkUnread: () => void;
}

/** Six lines of 20px, plus the padding. */
const COMPOSER_MAX = 6 * 20 + 20;

const ChatThread: React.FC<Props> = ({
  conversation, profileId, templates, onPatch, onBack, onOpenMedia, onToggleContactPanel, admins, onAssign, onMarkUnread,
}) => {
  const conversationId = conversation.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft]       = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending]   = useState(false);
  const [uploadingIds, setUploadingIds] = useState<Record<string, boolean>>({});
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const scrollRef   = useRef<HTMLDivElement>(null);
  const channelRef  = useRef<RealtimeChannel | null>(null);
  const nearBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFilesRef = useRef<Record<string, PendingFile>>({});
  const templatesWrapRef = useRef<HTMLDivElement>(null);

  // mark_conversation_read atomically zeroes unread_count and flips inbound
  // messages to read. Optimistic onPatch clears the badge instantly; the
  // realtime conversation UPDATE then confirms it.
  const markRead = useCallback(async () => {
    onPatch(conversationId, { unread_count: 0 });
    const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
    if (error) setLoadError(prev => prev ?? `Could not mark as read: ${error.message}`);
  }, [conversationId, onPatch]);

  // Latest markRead reachable from the subscribe-once effect without making it
  // a dependency (which would resubscribe on every render).
  const markReadRef = useRef(markRead);
  useEffect(() => { markReadRef.current = markRead; }, [markRead]);

  // ── History load + clear unread ────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setMessages([]);

    supabase
      .from('chat_messages')
      .select(MESSAGE_COLUMNS)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadError(error.message);
        setMessages((data ?? []) as unknown as ChatMessage[]);
        setLoading(false);
      });

    void markReadRef.current();

    return () => { active = false; };
  }, [conversationId]);

  // ── Realtime: one channel per open conversation ────────────────────────────
  // Tear down any previous channel before creating a new one and on cleanup, so
  // React Strict Mode never leaves a zombie subscription that stops delivering.
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`chat-messages-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
        (payload: RealtimePostgresChangesPayload<ChatMessage>) => {
          const incoming = payload.new as ChatMessage;
          setMessages(prev => (prev.some(m => m.id === incoming.id) ? prev : [...prev, incoming]));
          // Thread is open on screen — keep it read as inbound arrives rather
          // than flipping the row the admin is actively reading back to unread.
          if (incoming.direction === 'inbound') void markReadRef.current();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
        (payload: RealtimePostgresChangesPayload<ChatMessage>) => {
          const updated = payload.new as ChatMessage;
          setMessages(prev => prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m)));
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversationId]);

  // ── Scroll: open at newest, and only auto-follow if already near the bottom ──
  // Scrolled up, new messages are counted instead, behind a "New messages" button.
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const seenCountRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    nearBottomRef.current = true;
    setAwayFromBottom(false);
    setUnseen(0);
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    setAwayFromBottom(!near);
    if (near) setUnseen(0);
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const added = Math.max(0, messages.length - seenCountRef.current);
    seenCountRef.current = messages.length;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
    else if (!loading && added > 0) setUnseen((n) => n + added);
  }, [messages, loading]);

  useLayoutEffect(() => {
    nearBottomRef.current = true;
    seenCountRef.current = 0;
    setUnseen(0);
    setAwayFromBottom(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversationId]);

  // Photos and players grow after they load: stay pinned to the newest message meanwhile.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const el = scrollRef.current;
      if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Close the template popover on outside click
  useEffect(() => {
    if (!templatesOpen) return;
    const onDown = (e: MouseEvent) => {
      if (templatesWrapRef.current && !templatesWrapRef.current.contains(e.target as Node)) {
        setTemplatesOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [templatesOpen]);

  // ── Send text ──────────────────────────────────────────────────────────────
  // Sending is just an INSERT of a queued row. The notify_outbound_message
  // trigger hands it to n8n; status changes come back via realtime.
  const sendText = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setSendError(null);
    setDraft('');

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        direction: 'outbound',
        sender_profile_id: profileId,
        content_type: 'text',
        text_content: text,
        status: 'queued',
      })
      .select(MESSAGE_COLUMNS)
      .single();

    setSending(false);

    if (error) {
      setSendError(error.message);
      setDraft(text); // give the text back so nothing is lost
      return;
    }
    if (data) {
      const row = data as unknown as ChatMessage;
      setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]));
    }
  };

  // ── Send attachment ────────────────────────────────────────────────────────
  const sendFile = async (file: File) => {
    setSendError(null);

    if (file.size > MAX_FILE_BYTES) { setSendError('File is too large (max 100 MB).'); return; }
    const contentType = contentTypeForFile(file);
    if (!contentType) { setSendError("That file type isn't supported."); return; }

    const caption = draft.trim();
    const tempId  = newUuid();
    const localUrl = URL.createObjectURL(file);
    pendingFilesRef.current[tempId] = { file, caption, localUrl };
    setDraft('');

    // Optimistic bubble with a local preview while the upload runs.
    const optimistic: ChatMessage = {
      id: tempId,
      conversation_id: conversationId,
      provider_message_id: null,
      direction: 'outbound',
      sender_profile_id: profileId,
      content_type: contentType,
      text_content: caption || null,
      media_url: localUrl,
      media_mime_type: file.type || null,
      media_filename: file.name,
      media_size_bytes: file.size,
      media_duration_seconds: null,
      media_thumbnail_url: null,
      location_latitude: null,
      location_longitude: null,
      location_name: null,
      reply_to_message_id: null,
      status: 'queued',
      error_message: null,
      sent_at: null, delivered_at: null, read_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setUploadingIds(p => ({ ...p, [tempId]: true }));

    const cleanup = () => {
      URL.revokeObjectURL(localUrl);
      delete pendingFilesRef.current[tempId];
      setUploadingIds(p => { const n = { ...p }; delete n[tempId]; return n; });
    };
    const dropOptimistic = () => {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      cleanup();
    };

    try {
      const path = `outbound/${newUuid()}.${extForFile(file)}`;
      const { error: uploadError } = await supabase.storage
        .from(CHAT_MEDIA_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const publicUrl = supabase.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;

      const { data, error: insertError } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          direction: 'outbound',
          sender_profile_id: profileId,
          content_type: contentType,
          text_content: caption || null,
          media_url: publicUrl,
          media_mime_type: file.type || null,
          media_filename: file.name,
          media_size_bytes: file.size,
          status: 'queued',
        })
        .select(MESSAGE_COLUMNS)
        .single();
      if (insertError || !data) throw new Error(insertError?.message ?? 'Could not save the attachment.');

      const row = data as unknown as ChatMessage;
      setMessages(prev => [...prev.filter(m => m.id !== tempId), ...(prev.some(m => m.id === row.id) ? [] : [row])]);
      cleanup();
    } catch (e) {
      dropOptimistic();
      setSendError(e instanceof Error ? e.message : 'Could not send the attachment.');
      if (caption) setDraft(caption);
    }
  };

  // ── The customer behind this number, for "Open customer" ──────────────────
  const phone = conversation.contact?.identifier ?? null;
  const [customer, setCustomer] = useState<{ id: string; full_name: string } | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    setCustomer(undefined);
    if (!phone) { setCustomer(null); return undefined; }
    customersWithPhone(phone, null)
      .then((found) => { if (active) setCustomer(found[0] ?? null); })
      .catch(() => { if (active) setCustomer(null); });
    return () => { active = false; };
  }, [phone]);

  // ── Assign ─────────────────────────────────────────────────────────────────
  const [assignOpen, setAssignOpen] = useState(false);
  const assignWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!assignOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      if (assignWrapRef.current && !assignWrapRef.current.contains(e.target as Node)) setAssignOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAssignOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [assignOpen]);
  const assignee = admins.find((a) => a.id === conversation.assigned_to_profile_id) ?? null;

  // ── Composer grows with its text, up to six lines ─────────────────────────
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX)}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX ? 'auto' : 'hidden';
  }, [draft]);

  /** Your own message always brings the thread back to the bottom. */
  const send = () => {
    nearBottomRef.current = true;
    void sendText();
  };

  // ── Day-grouped thread, with runs from the same side ──────────────────────
  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; items: ChatMessage[] }> = [];
    for (const m of messages) {
      const k = dayKey(m.created_at);
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(m);
      else out.push({ key: k, label: dateSeparatorLabel(m.created_at), items: [m] });
    }
    return out;
  }, [messages]);

  const name = contactLabel(conversation);
  const unread = conversation.unread_count > 0;
  const canSend = Boolean(draft.trim()) && !sending;

  const headerButton = 'grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[#5B6474] transition-colors hover:bg-black/[0.05] hover:text-[#0f1117] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#4ba6ea]/35 disabled:pointer-events-none disabled:opacity-40 max-md:h-11 max-md:w-11';
  const toolButton = 'grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#6B7280] transition-colors hover:bg-black/[0.05] hover:text-[#0f1117] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#4ba6ea]/35 disabled:pointer-events-none disabled:opacity-35 max-md:h-11 max-md:w-11';

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-black/[0.06] bg-white px-3 py-2.5 sm:px-4">
        <button type="button" onClick={onBack} className={`inbox-back-btn ${headerButton}`} aria-label="Back to conversations">
          <BackIcon size={18} className="rtl:-scale-x-100" />
        </button>
        <ContactAvatar conversation={conversation} size={40} dot={false} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold leading-tight tracking-[-0.01em] text-[#0f1117]"><bdi dir="auto">{name}</bdi></div>
          <div className="mt-0.5 truncate text-[12px] text-[#8A94A6]">
            {conversation.contact?.identifier && <><bdi dir="ltr" className="tabular-nums">{conversation.contact.identifier}</bdi> · </>}
            {channelLine(conversation.channel)}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <div ref={assignWrapRef} className="relative">
            <Tooltip content={assignee ? `Assigned to ${assignee.full_name ?? 'someone'}` : 'Assign to a teammate'}>
              <button
                type="button"
                className={`${headerButton} ${assignee ? 'text-[#2F7FC4]' : ''}`}
                aria-label={assignee ? `Assigned to ${assignee.full_name ?? 'someone'}. Change` : 'Assign to a teammate'}
                aria-haspopup="menu"
                aria-expanded={assignOpen}
                onClick={() => setAssignOpen((o) => !o)}
              >
                <AssignIcon size={18} />
              </button>
            </Tooltip>
            {assignOpen && (
              <div role="menu" aria-label="Assign to" className="absolute end-0 top-[calc(100%+6px)] z-40 w-[230px] overflow-hidden rounded-xl border border-black/[0.07] bg-white py-1 shadow-[0_12px_32px_-8px_rgba(15,17,23,0.22)]">
                <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9CA3AF]">Assign to</div>
                {[{ id: '', full_name: 'Unassigned' }, ...admins].map((a) => {
                  const current = (conversation.assigned_to_profile_id ?? '') === a.id;
                  return (
                    <button
                      key={a.id || 'none'}
                      type="button"
                      role="menuitemradio"
                      aria-checked={current}
                      onClick={() => { onAssign(a.id || null); setAssignOpen(false); }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-[13px] transition-colors hover:bg-[#F5F7FA] ${current ? 'font-semibold text-[#2F7FC4]' : 'text-[#374151]'}`}
                    >
                      <span className="truncate">{a.full_name ?? a.id}{a.id === profileId ? ' (you)' : ''}</span>
                      {current && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Tooltip content={unread ? 'Mark as read' : 'Mark as unread'}>
            <button
              type="button"
              className={headerButton}
              aria-label={unread ? 'Mark as read' : 'Mark as unread'}
              onClick={() => (unread ? void markRead() : onMarkUnread())}
            >
              {unread ? <ReadIcon size={18} /> : <UnreadIcon size={18} />}
            </button>
          </Tooltip>

          <Tooltip content={customer ? `Open ${customer.full_name}'s profile` : customer === null ? 'No customer with this number' : 'Looking for the customer…'}>
            {customer ? (
              <Link to={`/dashboard/customers/${customer.id}`} className={headerButton} aria-label={`Open ${customer.full_name}'s profile`}>
                <ProfileIcon size={18} />
              </Link>
            ) : (
              <button type="button" className={headerButton} disabled aria-label="No customer profile for this number">
                <ProfileIcon size={18} />
              </button>
            )}
          </Tooltip>

          {/* The contact panel sits beside the thread, so it needs a wide screen. */}
          <Tooltip content="Contact details">
            <button type="button" onClick={onToggleContactPanel} className={`${headerButton} max-[860px]:hidden`} aria-label="Contact details">
              <InfoIcon size={18} />
            </button>
          </Tooltip>
        </div>
      </header>

      {/* Messages */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto bg-[#F7F8FA] px-3 pb-4 sm:px-6">
          <div ref={contentRef}>
            {loading && (
              <div aria-busy="true" aria-label="Loading messages" className="flex flex-col gap-2 pt-6">
                {[{ w: 52, out: false }, { w: 38, out: false }, { w: 60, out: true }, { w: 44, out: false }, { w: 34, out: true }, { w: 48, out: true }].map((b, i) => (
                  <div key={i} className={`h-10 animate-pulse rounded-2xl ${b.out ? 'self-end bg-[#4ba6ea]/20' : 'self-start bg-white shadow-[0_1px_1.5px_rgba(15,17,23,0.06)]'}`} style={{ width: `${b.w}%` }} />
                ))}
              </div>
            )}

            {!loading && loadError && (
              <div role="alert" className="mt-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-[12.5px] text-[#B91C1C]">{loadError}</div>
            )}

            {!loading && !loadError && messages.length === 0 && (
              <div className="py-16 text-center">
                <div className="text-[14px] font-semibold text-[#4B5563]">No messages yet</div>
                <div className="mt-1 text-[12.5px] text-[#9CA3AF]">Send the first message below.</div>
              </div>
            )}

            {groups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                <div className="sticky top-2 z-[1] flex justify-center pb-1 pt-4">
                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-[#6B7280] shadow-[0_1px_2px_rgba(15,17,23,0.08)]">{group.label}</span>
                </div>
                {group.items.map((m, index) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    uploading={uploadingIds[m.id]}
                    position={{ first: !continuesRun(group.items[index - 1], m), last: !continuesRun(m, group.items[index + 1]) }}
                    onOpenMedia={onOpenMedia}
                  />
                ))}
              </section>
            ))}
          </div>
        </div>

        {awayFromBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className={`absolute bottom-3 left-1/2 z-10 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12.5px] font-semibold shadow-[0_6px_18px_-4px_rgba(15,17,23,0.25)] ring-1 ring-black/[0.05] transition-colors hover:bg-[#F5F7FA] ${unseen > 0 ? 'text-[#2F7FC4]' : 'text-[#4B5563]'}`}
          >
            <DownIcon size={15} strokeWidth={2.2} />
            {unseen > 0 ? `${unseen} new ${unseen === 1 ? 'message' : 'messages'}` : 'Latest'}
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-black/[0.06] bg-white px-3 pb-3 pt-2.5 sm:px-4">
        {sendError && (
          <div role="alert" className="mb-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">{sendError}</div>
        )}

        <div className="flex items-end gap-1.5">
          <Tooltip content="Attach a file">
            <button type="button" onClick={() => fileInputRef.current?.click()} className={toolButton} aria-label="Attach a file">
              <PaperclipIcon size={19} />
            </button>
          </Tooltip>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void sendFile(f);
            }}
          />

          {/* Canned replies */}
          <div ref={templatesWrapRef} className="relative shrink-0">
            <Tooltip content={templates.length === 0 ? 'No canned replies yet' : 'Canned replies'}>
              <button
                type="button"
                onClick={() => setTemplatesOpen(o => !o)}
                disabled={templates.length === 0}
                className={toolButton}
                aria-label="Canned replies"
                aria-expanded={templatesOpen}
              >
                <TemplateIcon size={19} />
              </button>
            </Tooltip>

            {templatesOpen && templates.length > 0 && (
              <div className="absolute bottom-[calc(100%+8px)] start-0 z-40 max-h-[300px] w-[300px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-xl border border-black/[0.07] bg-white py-1 shadow-[0_12px_32px_-8px_rgba(15,17,23,0.22)]">
                <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9CA3AF]">Canned replies</div>
                {templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setDraft(d => (d ? `${d} ${t.body}` : t.body)); setTemplatesOpen(false); composerRef.current?.focus(); }}
                    className="block w-full px-3 py-2 text-start transition-colors hover:bg-[#F5F7FA]"
                  >
                    <span className="block text-[13px] font-semibold text-[#0f1117]" dir="auto">{t.title}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-[#6B7280]" dir="auto">{t.body}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <textarea
            ref={composerRef}
            rows={1}
            dir="auto"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            placeholder="Type a message…"
            aria-label="Message"
            title="Enter to send · Shift+Enter for a new line"
            className="min-h-[40px] min-w-0 flex-1 resize-none rounded-[20px] border border-black/[0.08] bg-[#F5F6F8] px-4 py-[9px] text-[14px] leading-5 text-[#0f1117] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-[#4ba6ea]/60 focus:bg-white focus:ring-[3px] focus:ring-[#4ba6ea]/15"
          />

          <Tooltip content="Enter to send · Shift+Enter for a new line">
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              aria-label="Send message"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition-[background,transform] active:scale-95 disabled:cursor-not-allowed max-md:h-11 max-md:w-11"
              style={{ background: canSend ? BRAND : '#D7DCE3' }}
            >
              {sending
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56" /></svg>
                : <SendIcon size={18} strokeWidth={2} className="rtl:-scale-x-100" />}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default ChatThread;
