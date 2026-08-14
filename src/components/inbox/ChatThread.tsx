import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import MessageBubble from './MessageBubble';
import {
  ACCEPT_ATTR,
  CHAT_MEDIA_BUCKET,
  MAX_FILE_BYTES,
  MESSAGE_COLUMNS,
  type ChatConversation,
  type ChatMessage,
  type MessageTemplate,
  channelLabel,
  contactLabel,
  contentTypeForFile,
  dateSeparatorLabel,
  dayKey,
  extForFile,
  initials,
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
  onOpenImage: (url: string) => void;
  onToggleContactPanel: () => void;
}

const ChatThread: React.FC<Props> = ({
  conversation, profileId, templates, onPatch, onBack, onOpenImage, onToggleContactPanel,
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
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useLayoutEffect(() => {
    nearBottomRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversationId]);

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

  // ── Day-grouped thread ─────────────────────────────────────────────────────
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, flex: 1, background: '#f7f8fa' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: '#fff', flexShrink: 0 }}>
        <button
          type="button"
          onClick={onBack}
          className="inbox-back-btn"
          aria-label="Back to conversations"
          style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: '#f3f4f6', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>

        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eef2f6', color: '#4b5563', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
          {conversation.contact?.avatar_url
            ? <img src={conversation.contact.avatar_url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials(name)}
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontSize: 11.5, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conversation.contact?.identifier ?? '—'} · {channelLabel(conversation.channel)}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleContactPanel}
          title="Contact details"
          aria-label="Contact details"
          style={{ width: 34, height: 34, borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#6b7280' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', minHeight: 0 }}>
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[68, 46, 80, 52].map((w, i) => (
              <div key={i} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', width: `${w}%`, height: 38, borderRadius: 14, background: '#eceff3', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        )}

        {!loading && loadError && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, fontSize: 12.5, color: '#ef4444' }}>{loadError}</div>
        )}

        {!loading && !loadError && messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: '#9ca3af' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>No messages yet</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>Send the first message below.</div>
          </div>
        )}

        {groups.map(group => (
          <div key={group.key}>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 8px' }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6b7280', background: '#e9edf2', borderRadius: 20, padding: '3px 11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {group.label}
              </span>
            </div>
            {group.items.map(m => (
              <MessageBubble key={m.id} message={m} uploading={uploadingIds[m.id]} onOpenImage={onOpenImage} />
            ))}
          </div>
        ))}
      </div>

      {/* Composer */}
      <div style={{ borderTop: '1px solid #f0f0f0', background: '#fff', padding: '10px 14px 12px', flexShrink: 0 }}>
        {sendError && (
          <div style={{ marginBottom: 8, padding: '8px 11px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#ef4444' }}>
            {sendError}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          {/* Canned replies */}
          <div ref={templatesWrapRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setTemplatesOpen(o => !o)}
              disabled={templates.length === 0}
              title={templates.length === 0 ? 'No canned replies' : 'Canned replies'}
              aria-label="Canned replies"
              style={{ width: 40, height: 40, borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', cursor: templates.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: templates.length === 0 ? '#d1d5db' : '#6b7280' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>

            {templatesOpen && templates.length > 0 && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, width: 290, maxHeight: 280, overflowY: 'auto', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 11, boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 40 }}>
                <div style={{ padding: '9px 12px', borderBottom: '1px solid #f0f0f0', fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                  Canned replies
                </div>
                {templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setDraft(d => (d ? `${d} ${t.body}` : t.body)); setTemplatesOpen(false); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: '#fff', cursor: 'pointer', padding: '9px 12px', fontFamily: 'inherit', borderBottom: '1px solid #f7f7f7' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                  >
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0f1117' }}>{t.title}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#6b7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Attach */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach a file"
            aria-label="Attach a file"
            style={{ width: 40, height: 40, borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21.4 11.05l-8.5 8.5a5.5 5.5 0 01-7.78-7.78l8.5-8.5a3.67 3.67 0 015.19 5.19l-8.5 8.49a1.83 1.83 0 01-2.6-2.6l7.85-7.84" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void sendFile(f);
            }}
          />

          <textarea
            rows={1}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendText(); }
            }}
            placeholder="Type a message…  (Enter to send, Shift+Enter for a new line)"
            style={{
              flex: 1, minWidth: 0, minHeight: 40, maxHeight: 132, resize: 'none',
              padding: '10px 12px', fontSize: 13.5, lineHeight: 1.45, fontFamily: 'inherit',
              color: '#0f1117', background: '#f9fafb', border: '1.5px solid #e5e7eb',
              borderRadius: 10, outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={e => { e.target.style.borderColor = '#4ba6ea'; }}
            onBlur={e => { e.target.style.borderColor = '#e5e7eb'; }}
          />

          <button
            type="button"
            onClick={() => void sendText()}
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            style={{
              width: 40, height: 40, borderRadius: 10, border: 'none', flexShrink: 0,
              background: !draft.trim() || sending ? '#cbd5e1' : '#4ba6ea', color: '#fff',
              cursor: !draft.trim() || sending ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {sending
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite' }}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatThread;
