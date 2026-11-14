import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import ChatThread from '../components/inbox/ChatThread';
import ContactPanel, { type AdminOption } from '../components/inbox/ContactPanel';
import { ChatIcon, ContactAvatar, PreviewKindIcon, SearchIcon } from '../components/inbox/InboxParts';
import {
  CHANNEL_COLUMNS,
  CONTACT_COLUMNS,
  CONVERSATION_COLUMNS,
  type ChatConversation,
  type ChatConversationRow,
  type ConversationFilter,
  type MessageTemplate,
  contactLabel,
  isConversationUnread,
  listTime,
  previewParts,
  sortConversations,
} from '../lib/inbox';

// ─── Conversation list row ────────────────────────────────────────────────────

/**
 * 72px: the contact's avatar with its channel dot, the name and the time, then the
 * last message on one line (a small icon for a voice note, a photo or a file). Unread
 * rows are tinted blue with a count; the open one has a 3px bar on its leading edge.
 */
const ConversationRow: React.FC<{
  conversation: ChatConversation;
  selected: boolean;
  onSelect: () => void;
}> = ({ conversation, selected, onSelect }) => {
  const name   = contactLabel(conversation);
  const unread = isConversationUnread(conversation);
  const preview = previewParts(conversation.last_message_preview);
  const outbound = conversation.last_message_direction === 'outbound';
  const tone = selected ? 'bg-[#F5F7FA]' : unread ? 'bg-[#F2F8FE] hover:bg-[#EAF3FD]' : 'bg-white hover:bg-[#FAFBFC]';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`relative flex h-[72px] w-full items-center gap-3 px-4 text-start transition-colors duration-150 focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[#4ba6ea]/35 ${tone}`}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 start-0 w-[3px] bg-[#4ba6ea]" />}
      <ContactAvatar conversation={conversation} size={40} ring={selected ? '#F5F7FA' : unread ? '#F2F8FE' : '#fff'} />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`min-w-0 flex-1 truncate text-[14px] leading-5 ${unread ? 'font-semibold text-[#0f1117]' : 'font-medium text-[#1F2937]'}`}>
            <bdi dir="auto">{name}</bdi>
          </span>
          <span className={`shrink-0 text-[12px] tabular-nums ${unread ? 'font-medium text-[#2F7FC4]' : 'text-[#9CA3AF]'}`}>
            {listTime(conversation.last_message_at)}
          </span>
        </span>

        <span className="mt-0.5 flex items-center gap-2">
          <span className={`flex min-w-0 flex-1 items-center gap-1 text-[13px] leading-[18px] ${unread ? 'text-[#4B5563]' : 'text-[#8A94A6]'}`}>
            {outbound && <span className="shrink-0 text-[#9CA3AF]">You:</span>}
            {preview.kind && <PreviewKindIcon kind={preview.kind} className="shrink-0 text-[#9CA3AF]" />}
            <span className="truncate" dir="auto">{preview.text}</span>
          </span>
          {unread && (
            <span className="grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-[#4ba6ea] px-1.5 text-[11px] font-semibold tabular-nums text-white">
              {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
            </span>
          )}
          {conversation.archived_at && (
            <span className="shrink-0 rounded-full bg-[#F3F4F6] px-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#9CA3AF]">Archived</span>
          )}
        </span>
      </span>
    </button>
  );
};

const RowSkeleton: React.FC = () => (
  <div className="flex h-[72px] items-center gap-3 px-4" aria-hidden="true">
    <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[#EEF1F5]" />
    <span className="flex-1 space-y-2">
      <span className="block h-3 w-1/2 animate-pulse rounded-full bg-[#EEF1F5]" />
      <span className="block h-2.5 w-4/5 animate-pulse rounded-full bg-[#F2F4F7]" />
    </span>
  </div>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

const FILTERS: Array<{ key: ConversationFilter; label: string }> = [
  { key: 'all',    label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'mine',   label: 'Assigned to me' },
];

type Lightbox = { url: string; kind: 'image' | 'video' };

const InboxPage: React.FC = () => {
  const [profileId, setProfileId]           = useState<string | null>(null);
  const [conversations, setConversations]   = useState<ChatConversation[]>([]);
  const [templates, setTemplates]           = useState<MessageTemplate[]>([]);
  const [admins, setAdmins]                 = useState<AdminOption[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);

  const [filter, setFilter]         = useState<ConversationFilter>('all');
  const [search, setSearch]         = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen]   = useState(false);
  const [lightbox, setLightbox]     = useState<Lightbox | null>(null);

  // Mirrors for use inside the subscribe-once realtime handler.
  const convosRef   = useRef<ChatConversation[]>([]);
  const listChannelRef = useRef<RealtimeChannel | null>(null);
  useEffect(() => { convosRef.current = conversations; }, [conversations]);

  // ── Current admin's profile id (== auth user id) ───────────────────────────
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active) setProfileId(user?.id ?? null);
    });
    return () => { active = false; };
  }, []);

  // ── Initial load: conversations + contacts + channels, joined in JS ────────
  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: convErr } = await supabase
      .from('chat_conversations')
      .select(CONVERSATION_COLUMNS)
      .is('deleted_at', null)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (convErr) { setError(convErr.message); setLoading(false); return; }

    const rows = (data ?? []) as unknown as ChatConversationRow[];
    if (rows.length === 0) { setConversations([]); setLoading(false); return; }

    const contactIds = Array.from(new Set(rows.map(r => r.contact_id)));
    const channelIds = Array.from(new Set(rows.map(r => r.channel_id)));

    const [{ data: contacts }, { data: channels }] = await Promise.all([
      supabase.from('contacts').select(CONTACT_COLUMNS).in('id', contactIds),
      supabase.from('chat_channels').select(CHANNEL_COLUMNS).in('id', channelIds),
    ]);

    const contactById = new Map((contacts ?? []).map(c => [(c as { id: string }).id, c]));
    const channelById = new Map((channels ?? []).map(c => [(c as { id: string }).id, c]));

    setConversations(sortConversations(rows.map(r => ({
      ...r,
      contact: (contactById.get(r.contact_id) as ChatConversation['contact']) ?? null,
      channel: (channelById.get(r.channel_id) as ChatConversation['channel']) ?? null,
    }))));
    setLoading(false);
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // ── Canned replies + admin list ────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    supabase
      .from('message_templates')
      .select('id, title, body, category, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data }) => { if (active && data) setTemplates(data as unknown as MessageTemplate[]); });

    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'admin')
      .order('full_name')
      .then(({ data }) => { if (active && data) setAdmins(data as unknown as AdminOption[]); });

    return () => { active = false; };
  }, []);

  // ── Realtime: keep the conversation list live ──────────────────────────────
  // Subscribe once on a stable channel name to ALL chat_conversations changes.
  // New rows are hydrated with their contact/channel before being added.
  useEffect(() => {
    if (listChannelRef.current) {
      supabase.removeChannel(listChannelRef.current);
      listChannelRef.current = null;
    }

    const hydrateAndAdd = async (row: ChatConversationRow) => {
      const [{ data: contact }, { data: channel }] = await Promise.all([
        supabase.from('contacts').select(CONTACT_COLUMNS).eq('id', row.contact_id).maybeSingle(),
        supabase.from('chat_channels').select(CHANNEL_COLUMNS).eq('id', row.channel_id).maybeSingle(),
      ]);
      setConversations(prev => (
        prev.some(c => c.id === row.id)
          ? sortConversations(prev.map(c => (c.id === row.id ? { ...c, ...row } : c)))
          : sortConversations([...prev, {
              ...row,
              contact: (contact as ChatConversation['contact']) ?? null,
              channel: (channel as ChatConversation['channel']) ?? null,
            }])
      ));
    };

    const handleChange = (payload: RealtimePostgresChangesPayload<ChatConversationRow>) => {
      if (payload.eventType === 'DELETE') {
        const id = (payload.old as Partial<ChatConversationRow>)?.id;
        if (id) setConversations(prev => prev.filter(c => c.id !== id));
        return;
      }

      const row = payload.new as ChatConversationRow;

      // Soft-deleted rows must disappear from the admin's view.
      if (row.deleted_at !== null) {
        setConversations(prev => prev.filter(c => c.id !== row.id));
        return;
      }

      if (convosRef.current.some(c => c.id === row.id)) {
        // Merge scalar columns, preserve the joined contact/channel, re-sort.
        setConversations(prev => sortConversations(prev.map(c => (c.id === row.id ? { ...c, ...row } : c))));
      } else {
        void hydrateAndAdd(row);
      }
    };

    const channel = supabase
      .channel('chat-conversations-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, handleChange)
      .subscribe();

    listChannelRef.current = channel;

    return () => {
      if (listChannelRef.current) {
        supabase.removeChannel(listChannelRef.current);
        listChannelRef.current = null;
      }
    };
  }, []);

  // Optimistic local patch; realtime later confirms the same change.
  const patchConversation = useCallback((id: string, patch: Partial<ChatConversation>) => {
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  /** Flags a conversation unread and closes it, so it isn't read again straight away. */
  const markUnread = useCallback(async (id: string) => {
    patchConversation(id, { unread_count: 1 });
    setSelectedId(null);
    setPanelOpen(false);
    const { error: err } = await supabase
      .from('chat_conversations')
      .update({ unread_count: 1, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) setError(`Could not mark it unread: ${err.message}`);
  }, [patchConversation]);

  /** The same write as Assigned to in the contact panel. */
  const assign = useCallback(async (id: string, assignee: string | null) => {
    patchConversation(id, { assigned_to_profile_id: assignee });
    const { error: err } = await supabase
      .from('chat_conversations')
      .update({ assigned_to_profile_id: assignee, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) setError(`Could not assign it: ${err.message}`);
  }, [patchConversation]);

  // Escape closes the lightbox.
  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter(c => {
      if (filter === 'unread' && !isConversationUnread(c)) return false;
      if (filter === 'mine' && c.assigned_to_profile_id !== profileId) return false;
      if (!q) return true;
      return [c.contact?.display_name, c.contact?.identifier, c.last_message_preview]
        .some(f => (f ?? '').toLowerCase().includes(q));
    });
  }, [conversations, filter, search, profileId]);

  const unreadTotal = useMemo(
    () => conversations.reduce((n, c) => n + (c.unread_count > 0 ? 1 : 0), 0),
    [conversations],
  );

  const selected = useMemo(
    () => conversations.find(c => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  return (
    <div className="flex flex-col bg-[var(--surface)] p-[clamp(14px,2.5vw,28px)]" style={{ height: 'calc(100vh - var(--topbar-h))', boxSizing: 'border-box' }}>
      <style>{`
        .inbox-back-btn { display: none !important; }
        .inbox-list { display: flex; }
        .inbox-thread { display: flex; }
        @media (max-width: 860px) {
          .inbox-back-btn { display: grid !important; }
          .inbox-list { width: 100% !important; border-inline-end: none !important; }
          .inbox-list[data-hidden="true"] { display: none !important; }
          .inbox-thread[data-hidden="true"] { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="mb-3.5 shrink-0">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ba6ea]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#9CA3AF]">Operations</span>
        </div>
        <h1 className="m-0 flex items-center gap-2.5 text-[clamp(21px,3.5vw,27px)] font-medium tracking-[-0.025em] text-[#0f1117]">
          Inbox
          {unreadTotal > 0 && (
            <span className="rounded-full bg-[#4ba6ea] px-2.5 py-[3px] text-[12px] font-semibold tracking-normal text-white">{unreadTotal} unread</span>
          )}
        </h1>
      </div>

      {error && (
        <div role="alert" className="mb-3 flex shrink-0 items-start gap-3 rounded-xl border border-[#EF4444]/20 bg-[#EF4444]/[0.06] px-4 py-2.5 text-[13px] text-[#B91C1C]">
          <span className="flex-1">{error}</span>
          <button type="button" className="shrink-0 font-semibold hover:underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* 3-column shell */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.05)]">

        {/* LEFT — conversation list */}
        <div
          className="inbox-list w-[360px] shrink-0 flex-col border-e border-black/[0.06] bg-white"
          data-hidden={selectedId ? 'true' : 'false'}
          style={{ minHeight: 0 }}
        >
          <div className="shrink-0 space-y-2.5 px-3.5 pb-3 pt-3.5">
            <label className="relative block">
              <span className="sr-only">Search conversations</span>
              <SearchIcon size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, number or message"
                className="h-10 w-full rounded-[10px] border border-transparent bg-[#F5F6F8] pe-3 ps-9 text-[13.5px] text-[#0f1117] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-[#4ba6ea]/60 focus:bg-white focus:ring-[3px] focus:ring-[#4ba6ea]/15"
              />
            </label>

            <div role="radiogroup" aria-label="Show" className="flex rounded-[10px] bg-[#F2F2F2] p-[3px]">
              {FILTERS.map(f => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setFilter(f.key)}
                    className={`flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[12.5px] font-medium transition-[background,color,box-shadow] duration-150 max-md:h-10 ${active ? 'bg-white text-[#0f1117] shadow-[0_1px_3px_rgba(15,17,23,0.12),0_0_0_0.5px_rgba(15,17,23,0.04)]' : 'text-[#6B7280] hover:text-[#0f1117]'}`}
                  >
                    {f.label}
                    {f.key === 'unread' && unreadTotal > 0 && (
                      <span className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums ${active ? 'bg-[#4ba6ea] text-white' : 'bg-[#4ba6ea]/15 text-[#2F7FC4]'}`}>
                        {unreadTotal > 99 ? '99+' : unreadTotal}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-black/[0.05]" aria-busy={loading}>
            {loading && Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)}

            {!loading && visible.length === 0 && (
              <div className="px-6 py-14 text-center">
                <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#F2F5F9] text-[#9CA3AF]"><ChatIcon size={22} /></span>
                <div className="text-[13.5px] font-semibold text-[#374151]">
                  {conversations.length === 0 ? 'No conversations yet' : filter === 'unread' && !search.trim() ? "You're all caught up" : 'Nothing matches'}
                </div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-[#9CA3AF]">
                  {conversations.length === 0
                    ? 'Incoming WhatsApp messages will appear here automatically.'
                    : filter === 'unread' && !search.trim() ? 'Every conversation has been read.' : 'Try a different search or filter.'}
                </div>
              </div>
            )}

            {!loading && (
              <ul className="divide-y divide-black/[0.04]">
                {visible.map(c => (
                  <li key={c.id}>
                    <ConversationRow
                      conversation={c}
                      selected={c.id === selectedId}
                      onSelect={() => { setSelectedId(c.id); setPanelOpen(false); }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* CENTER — thread */}
        <div
          className="inbox-thread min-w-0 flex-1"
          data-hidden={selectedId ? 'false' : 'true'}
          style={{ minHeight: 0 }}
        >
          {selected && profileId ? (
            <ChatThread
              key={selected.id}
              conversation={selected}
              profileId={profileId}
              templates={templates}
              admins={admins}
              onPatch={patchConversation}
              onBack={() => setSelectedId(null)}
              onOpenMedia={setLightbox}
              onToggleContactPanel={() => setPanelOpen(o => !o)}
              onAssign={(assignee) => void assign(selected.id, assignee)}
              onMarkUnread={() => void markUnread(selected.id)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center bg-[#F7F8FA] p-8 text-center">
              <div className="relative mb-5">
                <span className="absolute -inset-5 rounded-full bg-[#4ba6ea]/[0.07]" aria-hidden="true" />
                <span className="relative grid h-16 w-16 place-items-center rounded-[20px] bg-white text-[#4ba6ea] shadow-[0_8px_24px_-8px_rgba(47,127,196,0.35)]">
                  <ChatIcon size={28} strokeWidth={1.7} />
                </span>
              </div>
              <div className="text-[16px] font-semibold tracking-[-0.01em] text-[#0f1117]">Pick a conversation</div>
              <div className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-[#8A94A6]">
                WhatsApp messages land here as they arrive. Choose one on the left to read and reply.
              </div>
              {unreadTotal > 0 && filter !== 'unread' && (
                <button
                  type="button"
                  onClick={() => setFilter('unread')}
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-[#2F7FC4] shadow-[0_1px_3px_rgba(15,17,23,0.1)] ring-1 ring-black/[0.04] transition-colors hover:bg-[#F2F8FE]"
                >
                  <span className="h-2 w-2 rounded-full bg-[#4ba6ea]" aria-hidden="true" />
                  Show {unreadTotal} unread
                </button>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — contact panel */}
        {selected && panelOpen && (
          <div className="w-[290px] shrink-0 border-s border-black/[0.06]" style={{ minHeight: 0 }}>
            <ContactPanel
              conversation={selected}
              admins={admins}
              onPatch={patchConversation}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Photo and video lightbox */}
      {lightbox && ReactDOM.createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.kind === 'video' ? 'Video' : 'Photo'}
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[1400] flex cursor-zoom-out items-center justify-center bg-black/85 p-5 backdrop-blur-sm"
        >
          {lightbox.kind === 'video'
            ? <video src={lightbox.url} controls autoPlay playsInline onClick={e => e.stopPropagation()} className="max-h-[88vh] max-w-full cursor-default rounded-xl bg-black" />
            : <img src={lightbox.url} alt="" onClick={e => e.stopPropagation()} className="max-h-[88vh] max-w-full cursor-default rounded-xl object-contain" />}
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close"
            className="fixed end-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default InboxPage;
