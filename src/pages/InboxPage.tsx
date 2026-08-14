import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import ChatThread from '../components/inbox/ChatThread';
import ContactPanel, { type AdminOption } from '../components/inbox/ContactPanel';
import {
  CHANNEL_COLUMNS,
  CONTACT_COLUMNS,
  CONVERSATION_COLUMNS,
  type ChatConversation,
  type ChatConversationRow,
  type ConversationFilter,
  type MessageTemplate,
  channelColor,
  channelLabel,
  contactLabel,
  initials,
  isConversationUnread,
  relativeShort,
  sortConversations,
} from '../lib/inbox';

// ─── Conversation list row ────────────────────────────────────────────────────

const ConversationRow: React.FC<{
  conversation: ChatConversation;
  selected: boolean;
  onSelect: () => void;
}> = ({ conversation, selected, onSelect }) => {
  const name   = contactLabel(conversation);
  const unread = isConversationUnread(conversation);

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%',
        padding: '11px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
        fontFamily: 'inherit', minHeight: 64,
        background: selected ? 'rgba(75,166,234,0.09)' : '#fff',
        borderLeft: `3px solid ${selected ? '#4ba6ea' : 'transparent'}`,
        borderBottom: '1px solid #f5f5f5',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#fafbfc'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = '#fff'; }}
    >
      {/* Avatar + channel dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#eef2f6', color: '#4b5563', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, overflow: 'hidden' }}>
          {conversation.contact?.avatar_url
            ? <img src={conversation.contact.avatar_url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials(name)}
        </div>
        <span
          title={channelLabel(conversation.channel)}
          style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: '50%', background: channelColor(conversation.channel), border: '2px solid #fff' }}
        />
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: unread ? 800 : 600, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
          <span style={{ fontSize: 10.5, color: unread ? '#4ba6ea' : '#9ca3af', fontWeight: unread ? 700 : 500, flexShrink: 0 }}>
            {relativeShort(conversation.last_message_at)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{
            flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.4,
            color: unread ? '#374151' : '#9ca3af', fontWeight: unread ? 600 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {conversation.last_message_direction === 'outbound' && (
              <span style={{ color: '#9ca3af', fontWeight: 400 }}>You: </span>
            )}
            {conversation.last_message_preview || 'No messages yet'}
          </span>

          {unread && (
            <span style={{ flexShrink: 0, minWidth: 19, height: 19, borderRadius: 10, background: '#4ba6ea', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>
              {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
            </span>
          )}
          {conversation.archived_at && (
            <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, color: '#9ca3af', background: '#f3f4f6', borderRadius: 20, padding: '2px 7px', textTransform: 'uppercase' }}>Archived</span>
          )}
        </div>
      </div>
    </button>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const FILTERS: Array<{ key: ConversationFilter; label: string }> = [
  { key: 'all',    label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'mine',   label: 'Assigned to me' },
];

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
  const [lightbox, setLightbox]     = useState<string | null>(null);

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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: 'clamp(14px, 2.5vw, 28px)', boxSizing: 'border-box' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .inbox-back-btn { display: none; }
        .inbox-list { display: flex; }
        .inbox-thread { display: flex; }
        @media (max-width: 860px) {
          .inbox-back-btn { display: flex !important; }
          .inbox-list { width: 100% !important; border-right: none !important; }
          .inbox-list[data-hidden="true"] { display: none !important; }
          .inbox-thread[data-hidden="true"] { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase' }}>Operations</span>
        </div>
        <h1 style={{ fontSize: 'clamp(21px, 3.5vw, 27px)', fontWeight: 800, color: '#0f1117', letterSpacing: '-0.7px', margin: 0 }}>
          Inbox
          {unreadTotal > 0 && (
            <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 800, color: '#fff', background: '#4ba6ea', borderRadius: 20, padding: '3px 10px', verticalAlign: 'middle' }}>
              {unreadTotal} unread
            </span>
          )}
        </h1>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '11px 15px', marginBottom: 12, fontSize: 13, color: '#ef4444', flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* 3-column shell */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

        {/* LEFT — conversation list */}
        <div
          className="inbox-list"
          data-hidden={selectedId ? 'true' : 'false'}
          style={{ width: 320, flexShrink: 0, borderRight: '1px solid #f0f0f0', flexDirection: 'column', minHeight: 0 }}
        >
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <div style={{ position: 'relative', marginBottom: 9 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or number…"
                style={{ width: '100%', height: 36, paddingLeft: 33, paddingRight: 11, fontSize: 12.5, color: '#0f1117', background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                onFocus={e => { e.target.style.borderColor = '#4ba6ea'; }}
                onBlur={e => { e.target.style.borderColor = '#e5e7eb'; }}
              />
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {FILTERS.map(f => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    style={{
                      flex: 1, height: 30, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', padding: '0 6px',
                      border: `1.5px solid ${active ? '#4ba6ea' : '#e5e7eb'}`,
                      background: active ? 'rgba(75,166,234,0.08)' : '#fff',
                      color: active ? '#2e8fd4' : '#6b7280',
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loading && Array.from({ length: 7 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '13px 14px', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 4 }}>
                  <div style={{ height: 11, width: '55%', borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ height: 10, width: '80%', borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
              </div>
            ))}

            {!loading && visible.length === 0 && (
              <div style={{ textAlign: 'center', padding: '44px 20px', color: '#9ca3af' }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 10px', display: 'block', color: '#d1d5db' }}>
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280' }}>
                  {conversations.length === 0 ? 'No conversations yet' : 'Nothing matches'}
                </div>
                <div style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
                  {conversations.length === 0
                    ? 'Incoming WhatsApp messages will appear here automatically.'
                    : 'Try a different search or filter.'}
                </div>
              </div>
            )}

            {!loading && visible.map(c => (
              <ConversationRow
                key={c.id}
                conversation={c}
                selected={c.id === selectedId}
                onSelect={() => { setSelectedId(c.id); setPanelOpen(false); }}
              />
            ))}
          </div>
        </div>

        {/* CENTER — thread */}
        <div
          className="inbox-thread"
          data-hidden={selectedId ? 'false' : 'true'}
          style={{ flex: 1, minWidth: 0, minHeight: 0 }}
        >
          {selected && profileId ? (
            <ChatThread
              key={selected.id}
              conversation={selected}
              profileId={profileId}
              templates={templates}
              onPatch={patchConversation}
              onBack={() => setSelectedId(null)}
              onOpenImage={setLightbox}
              onToggleContactPanel={() => setPanelOpen(o => !o)}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#9ca3af', background: '#f7f8fa', padding: 24, textAlign: 'center' }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style={{ color: '#d1d5db' }}>
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#6b7280' }}>Select a conversation</div>
              <div style={{ fontSize: 12.5 }}>Pick a chat on the left to read and reply.</div>
            </div>
          )}
        </div>

        {/* RIGHT — contact panel */}
        {selected && panelOpen && (
          <div style={{ width: 290, flexShrink: 0, borderLeft: '1px solid #f0f0f0', minHeight: 0 }}>
            <ContactPanel
              conversation={selected}
              admins={admins}
              onPatch={patchConversation}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Image lightbox */}
      {lightbox && ReactDOM.createPortal(
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 120ms ease', cursor: 'zoom-out' }}
        >
          <img src={lightbox} alt="Full size" onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10, cursor: 'default' }} />
          <button
            onClick={() => setLightbox(null)}
            aria-label="Close"
            style={{ position: 'fixed', top: 20, right: 20, width: 44, height: 44, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default InboxPage;
