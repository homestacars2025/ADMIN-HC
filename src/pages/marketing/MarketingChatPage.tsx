import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase, socialSupabase } from '../../lib/supabase';
import { socialFrom } from '../../lib/socialClient';
import { sendMessageToCMO, isCmoConfigured } from '../../lib/cmoApi';
import { useCurrentProfile } from '../../hooks/useCurrentProfile';
import type { SmChatMessage } from '../../types/marketing';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getDateKey(iso: string): string {
  return new Date(iso).toISOString().split('T')[0];
}

function truncate(s: string, max = 72): string {
  return s.length > max ? s.slice(0, max).trimEnd() + '…' : s;
}

function groupByDate(msgs: SmChatMessage[]): { dateKey: string; label: string; messages: SmChatMessage[] }[] {
  const map = new Map<string, SmChatMessage[]>();
  for (const m of msgs) {
    const k = getDateKey(m.created_at);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(m);
  }
  return Array.from(map.entries()).map(([k, ms]) => ({
    dateKey: k,
    label: formatDateLabel(ms[0].created_at),
    messages: ms,
  }));
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastData { id: number; message: string; type: 'success' | 'error' | 'info'; }
const Toast: React.FC<{ t: ToastData }> = ({ t }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: t.type === 'error' ? '#ef4444' : t.type === 'info' ? '#4ba6ea' : '#0f1117',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'ckSlide 200ms ease', maxWidth: 340,
    }}>
      {t.type === 'success' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>}
      {t.type === 'error'   && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>}
      {t.type === 'info'    && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>}
      {t.message}
    </div>,
    document.body
  );

// ─── Typing indicator ─────────────────────────────────────────────────────────

const TypingIndicator: React.FC<{ slow: boolean }> = ({ slow }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, padding: '4px 0' }}>
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
    <div style={{
      background: '#f3f4f6', borderRadius: '18px 18px 18px 4px',
      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%', background: '#9ca3af',
            animation: `ckBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      {slow && (
        <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 4, whiteSpace: 'nowrap' }}>
          Taking longer than usual…
        </span>
      )}
    </div>
  </div>
);

// ─── Retry banner ─────────────────────────────────────────────────────────────

interface RetryState { text: string; messageId: string; }

const RetryBanner: React.FC<{ state: RetryState; onRetry: () => void; onDismiss: () => void }> = ({ onRetry, onDismiss }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 16px', background: '#fef2f2', borderRadius: 10,
    border: '1px solid #fecaca', margin: '8px 0',
  }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>
    </svg>
    <span style={{ flex: 1, fontSize: 13, color: '#dc2626' }}>
      CMO didn't respond. Your message was saved.
    </span>
    <button
      onClick={onRetry}
      style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
    >
      Retry
    </button>
    <button
      onClick={onDismiss}
      style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}
    >
      Dismiss
    </button>
  </div>
);

// ─── Message bubble ───────────────────────────────────────────────────────────

const MessageBubble: React.FC<{
  msg: SmChatMessage;
  onCopy: (text: string) => void;
}> = ({ msg, onCopy }) => {
  const [hovered, setHovered] = useState(false);
  const isUser = msg.sender === 'admin';
  const isCmo = msg.sender === 'cmo';
  const senderName = isCmo ? 'CMO' : (msg.profile?.full_name ?? 'Admin');

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 10,
        padding: '2px 0',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        overflow: 'hidden',
        background: isCmo ? 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)' : '#e8ecf0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isCmo ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : msg.profile?.avatar_url ? (
          <img src={msg.profile.avatar_url} alt={senderName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#4b5563' }}>
            {senderName[0]?.toUpperCase() ?? '?'}
          </span>
        )}
      </div>

      <div style={{ maxWidth: '68%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{senderName}</span>

        <div style={{
          background: isUser ? '#4ba6ea' : '#f3f4f6',
          color: isUser ? '#fff' : '#0f1117',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          padding: '11px 15px', fontSize: 14, lineHeight: 1.6,
          wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          boxShadow: isUser ? '0 1px 4px rgba(75,166,234,0.25)' : 'none',
          position: 'relative',
        }}>
          {msg.message}

          {hovered && (
            <button
              onClick={() => onCopy(msg.message)}
              title="Copy"
              style={{
                position: 'absolute', top: -28,
                right: isUser ? 0 : 'auto', left: isUser ? 'auto' : 0,
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7,
                padding: '3px 8px', fontSize: 11, color: '#6b7280', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
                whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Copy
            </button>
          )}
        </div>

        <span style={{ fontSize: 10.5, color: '#9ca3af', letterSpacing: '0.1px' }}>
          {formatTime(msg.created_at)}
          {msg.is_pinned && <span style={{ marginLeft: 5, color: '#f59e0b' }}>· pinned</span>}
        </span>
      </div>
    </div>
  );
};

// ─── Date separator ───────────────────────────────────────────────────────────

const DateSeparator: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 10px' }}>
    <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#9ca3af', whiteSpace: 'nowrap', padding: '3px 12px', background: '#fff', borderRadius: 20, border: '1px solid #f0f0f0' }}>
      {label}
    </span>
    <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
  </div>
);

// ─── Session cache ────────────────────────────────────────────────────────────

const CACHE_KEY = 'cmo_chat_cache_v1';

function loadCachedMessages(): SmChatMessage[] {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveCachedMessages(msgs: SmChatMessage[]): void {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(msgs.slice(-100))); } catch { /* storage full */ }
}

// ─── Shared select fragment ───────────────────────────────────────────────────

const MSG_SELECT = `
  id, session_id, sender, message, is_read, is_pinned, user_id, profile_id, metadata, created_at
` as const;

// ─── Deduplicate by id ────────────────────────────────────────────────────────

function dedupeById<T extends { id: number | string }>(items: T[]): T[] {
  const seen = new Set<number | string>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) { seen.add(item.id); out.push(item); }
  }
  return out;
}

// ─── Profile enrichment ───────────────────────────────────────────────────────

type ProfileLite = { id: string; full_name: string | null; avatar_url: string | null };

async function enrichWithProfiles<T extends { profile_id: string | null }>(
  rows: T[]
): Promise<(T & { profile: ProfileLite | null })[]> {
  const ids = Array.from(
    new Set(rows.map(r => r.profile_id).filter((v): v is string => !!v))
  );

  if (ids.length === 0) return rows.map(r => ({ ...r, profile: null }));

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', ids);

  if (error) {
    console.error('Failed to fetch profiles:', error);
    return rows.map(r => ({ ...r, profile: null }));
  }

  const byId = new Map<string, ProfileLite>((data ?? []).map(p => [p.id, p]));
  return rows.map(r => ({ ...r, profile: r.profile_id ? (byId.get(r.profile_id) ?? null) : null }));
}

// ─── Team Chat ───────────────────────────────────────────────────────────────

type TeamMessage = {
  id: string;
  sender_bot: string;
  recipient_bot: string | null;
  message: string;
  message_type: string | null;
  thread_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: unknown;
  created_at: string;
};

const TEAM_CACHE_KEY = 'team_chat_cache_v1';

function loadTeamCache(): TeamMessage[] {
  try {
    const raw = sessionStorage.getItem(TEAM_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveTeamCache(msgs: TeamMessage[]): void {
  try { sessionStorage.setItem(TEAM_CACHE_KEY, JSON.stringify(msgs.slice(-200))); } catch { /* storage full */ }
}

function dedupeTeamMsgs(msgs: TeamMessage[]): TeamMessage[] {
  const seen = new Set<string>();
  const out: TeamMessage[] = [];
  for (const m of msgs) { if (!seen.has(m.id)) { seen.add(m.id); out.push(m); } }
  return out;
}

const BOT_COLORS: Record<string, { label: string; bg: string; text: string }> = {
  cmo:            { label: 'CMO',          bg: '#ede9fe', text: '#6d28d9' },
  coordinator:    { label: 'Coordinator',  bg: '#dbeafe', text: '#1d4ed8' },
  brand_guardian: { label: 'Brand',        bg: '#fce7f3', text: '#be185d' },
  content_writer: { label: 'Content',      bg: '#d1fae5', text: '#065f46' },
  designer:       { label: 'Designer',     bg: '#ffedd5', text: '#9a3412' },
  monitor:        { label: 'Monitor',      bg: '#cffafe', text: '#0e7490' },
  analyst:        { label: 'Analyst',      bg: '#e0e7ff', text: '#3730a3' },
  ads_manager:    { label: 'Ads',          bg: '#fef9c3', text: '#854d0e' },
};

function getBotConfig(name: string) {
  return BOT_COLORS[name] ?? { label: name, bg: '#f3f4f6', text: '#374151' };
}

const TeamChatView: React.FC = () => {
  const [teamMsgs, setTeamMsgs]   = useState<TeamMessage[]>(() => loadTeamCache());
  const [filterBot, setFilterBot] = useState<string>('all');
  const [teamLoading, setTeamLoading] = useState(false);

  const teamEndRef     = useRef<HTMLDivElement>(null);
  const teamChanRef    = useRef<ReturnType<typeof socialSupabase.channel> | null>(null);
  const teamScrolled   = useRef(false);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    setTeamLoading(true);
    socialFrom('sm_team_chat')
      .select('id, sender_bot, recipient_bot, message, message_type, thread_id, related_entity_type, related_entity_id, metadata, created_at')
      .order('created_at', { ascending: true })
      .limit(300)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          const deduped = dedupeTeamMsgs(data as TeamMessage[]);
          setTeamMsgs(deduped);
          saveTeamCache(deduped);
        }
        setTeamLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Cache save
  useEffect(() => { if (teamMsgs.length > 0) saveTeamCache(teamMsgs); }, [teamMsgs]);

  // Real-time
  useEffect(() => {
    if (teamChanRef.current) { socialSupabase.removeChannel(teamChanRef.current); teamChanRef.current = null; }

    const ch = socialSupabase
      .channel('team-chat-shared')
      .on('postgres_changes', { event: 'INSERT', schema: 'social', table: 'sm_team_chat' }, (payload) => {
        console.log('[TeamChat realtime] INSERT:', payload.new);
        setTeamMsgs(prev => dedupeTeamMsgs([...prev, payload.new as TeamMessage]));
      })
      .subscribe(status => console.log('[TeamChat realtime] status:', status));

    teamChanRef.current = ch;
    return () => { if (teamChanRef.current) { socialSupabase.removeChannel(teamChanRef.current); teamChanRef.current = null; } };
  }, []);

  // Scroll — instant on first paint, smooth after
  useLayoutEffect(() => {
    if (!teamScrolled.current && teamMsgs.length > 0) {
      teamEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      teamScrolled.current = true;
    }
  }, [teamMsgs.length]);

  useEffect(() => {
    if (teamScrolled.current) teamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [teamMsgs.length]);

  const knownBots = Array.from(new Set(teamMsgs.map(m => m.sender_bot))).sort();
  const visible   = filterBot === 'all'
    ? teamMsgs
    : teamMsgs.filter(m => m.sender_bot === filterBot || m.recipient_bot === filterBot);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header + filter */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #ebebeb', background: '#fafafa', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1117' }}>Team Chat</div>
          <div style={{ fontSize: 11.5, color: '#9ca3af' }}>Read-only — bots communicate here</div>
        </div>
        <select
          value={filterBot}
          onChange={e => setFilterBot(e.target.value)}
          style={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 7, padding: '4px 8px', background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer' }}
        >
          <option value="all">All bots</option>
          {knownBots.map(bot => (
            <option key={bot} value={bot}>{getBotConfig(bot).label}</option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, background: '#fff' }}>
        {teamLoading && teamMsgs.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e5e7eb', flexShrink: 0, animation: 'ckPulse 1.5s ease-in-out infinite' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ width: 110, height: 11, borderRadius: 5, background: '#ebebeb', marginBottom: 8, animation: 'ckPulse 1.5s ease-in-out infinite' }} />
                  <div style={{ width: '65%', height: 44, borderRadius: 10, background: '#f3f4f6', animation: 'ckPulse 1.5s ease-in-out infinite' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!teamLoading && visible.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#9ca3af', padding: '40px 0' }}>
            <div style={{ fontSize: 36 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>No team messages yet</div>
            <div style={{ fontSize: 12 }}>When bots communicate, you'll see it here</div>
          </div>
        )}

        {visible.map(msg => {
          const sender    = getBotConfig(msg.sender_bot);
          const recipient = msg.recipient_bot ? getBotConfig(msg.recipient_bot) : null;
          return (
            <div key={msg.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: sender.bg, color: sender.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
              }}>
                {sender.label[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: sender.text }}>{sender.label}</span>
                  {recipient && (
                    <>
                      <span style={{ fontSize: 11, color: '#d1d5db' }}>→</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: recipient.text }}>{recipient.label}</span>
                    </>
                  )}
                  {msg.message_type && (
                    <span style={{ fontSize: 10.5, background: '#f3f4f6', color: '#6b7280', borderRadius: 4, padding: '1px 6px' }}>
                      {msg.message_type}
                    </span>
                  )}
                  <span style={{ fontSize: 10.5, color: '#9ca3af', marginLeft: 'auto' }}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
                <div style={{
                  fontSize: 13.5, color: '#1f2937', lineHeight: 1.6,
                  background: '#f9fafb', borderRadius: 10, padding: '9px 13px',
                  wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                }}>
                  {msg.message}
                </div>
                {msg.related_entity_type && (
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    📎 {msg.related_entity_type}{msg.related_entity_id ? ` #${msg.related_entity_id}` : ''}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={teamEndRef} />
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const MarketingChatPage: React.FC = () => {
  type ChatTab = 'cmo' | 'team';
  const [activeTab, setActiveTab] = useState<ChatTab>('cmo');

  const [messages, setMessages]   = useState<SmChatMessage[]>(() => loadCachedMessages());
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(false);
  const [slowResponse, setSlowResponse] = useState(false);
  const [inputText, setInputText] = useState('');
  const [search, setSearch]       = useState('');
  const [toasts, setToasts]       = useState<ToastData[]>([]);
  const [retryState, setRetryState] = useState<RetryState | null>(null);

  const { profile, loading: profileLoading } = useCurrentProfile();

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const toastCounter    = useRef(0);
  const slowTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef      = useRef<ReturnType<typeof socialSupabase.channel> | null>(null);
  const hasScrolledOnce = useRef(false);

  const configured = isCmoConfigured();

  const addToast = useCallback((message: string, type: ToastData['type'] = 'success') => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  // ── Load messages ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data, error } = await socialFrom('sm_chat_with_cmo')
          .select(MSG_SELECT)
          .order('created_at', { ascending: true })
          .limit(200);

        if (cancelled) return;
        if (error) { setLoading(false); return; }

        const enriched = await enrichWithProfiles(data ?? []) as SmChatMessage[];
        if (cancelled) return;

        const deduped = dedupeById(enriched);
        setMessages(deduped);
        saveCachedMessages(deduped);

        const unreadIds = deduped.filter(m => m.sender === 'cmo' && !m.is_read).map(m => m.id);
        if (unreadIds.length > 0) {
          socialFrom('sm_chat_with_cmo').update({ is_read: true }).in('id', unreadIds);
        }
      } catch {
        // cached messages still visible — no toast needed
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Persist to cache on every state change so next mount is instant
  useEffect(() => {
    if (messages.length > 0) saveCachedMessages(messages);
  }, [messages]);

  // ── Scroll to bottom ───────────────────────────────────────────────────────

  // First time messages appear → instant jump (no visible animation)
  useLayoutEffect(() => {
    if (!hasScrolledOnce.current && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      hasScrolledOnce.current = true;
    }
  }, [messages.length]);

  // Subsequent new messages → smooth scroll
  useEffect(() => {
    if (hasScrolledOnce.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, sending]);

  // ── Real-time subscription ─────────────────────────────────────────────────

  useEffect(() => {
    // Tear down any zombie channel from Strict Mode's double-invoke
    if (channelRef.current) {
      socialSupabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = socialSupabase
      .channel('cmo-chat-shared', { config: { broadcast: { self: false } } })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'social', table: 'sm_chat_with_cmo' },
        async (payload) => {
          console.log('[CMO realtime] INSERT received:', payload.new);
          // REPLICA IDENTITY FULL → payload.new has all columns
          const newRow = payload.new as { profile_id: string | null; [k: string]: unknown };

          try {
            const [msg] = (await enrichWithProfiles([newRow])) as unknown as SmChatMessage[];
            setMessages(prev =>
              dedupeById([...prev, msg]).sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              )
            );
            if (msg.sender === 'cmo') {
              setSending(false);
              setSlowResponse(false);
              if (slowTimer.current) { clearTimeout(slowTimer.current); slowTimer.current = null; }
              if (!msg.is_read) {
                socialFrom('sm_chat_with_cmo').update({ is_read: true }).eq('id', msg.id);
              }
            }
          } catch (err) {
            console.error('[CMO realtime] Enrich failed:', err);
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[CMO realtime] status:', status, err ?? '');
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        socialSupabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  // ── Send message ───────────────────────────────────────────────────────────

  const dispatchWebhook = useCallback(async (text: string, messageId: string, profileId: string) => {
    setSlowResponse(false);
    setRetryState(null);

    slowTimer.current = setTimeout(() => setSlowResponse(true), 15_000);

    const result = await sendMessageToCMO(text, messageId, profileId);

    if (slowTimer.current) { clearTimeout(slowTimer.current); slowTimer.current = null; }

    if (!result.success) {
      setSending(false);
      setSlowResponse(false);
      if (result.errorKind === 'timeout') {
        addToast('Response is taking longer than expected…', 'info');
        setRetryState({ text, messageId });
      } else if (result.errorKind === 'not_configured') {
        addToast('CMO webhook is not configured. Set REACT_APP_N8N_CMO_WEBHOOK_URL.', 'error');
      } else {
        addToast('CMO is currently unavailable. Please try again.', 'error');
        setRetryState({ text, messageId });
      }
    } else {
      // Real-time will call setSending(false) when CMO message arrives.
      // 2s fallback clears the indicator if real-time is slow.
      setTimeout(() => {
        setSending(prev => (prev ? false : prev));
        setSlowResponse(false);
      }, 2_000);
    }
  }, [addToast]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    if (!profile) {
      addToast('You must be logged in to send messages', 'error');
      return;
    }

    // Lock immediately — prevents double-submit on rapid Enter/click
    setSending(true);
    setInputText('');
    setRetryState(null);
    textareaRef.current?.focus();

    // Optimistic user message (temp id < 0)
    const tempId = -Date.now();
    const tempMsg: SmChatMessage = {
      id: tempId, session_id: null, sender: 'admin', message: text,
      is_read: true, is_pinned: null, metadata: null,
      user_id: profile.id,
      profile_id: profile.id,
      profile: { id: profile.id, full_name: profile.full_name, avatar_url: profile.avatar_url },
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const { data: inserted, error } = await socialFrom('sm_chat_with_cmo')
        .insert({
          sender: 'admin',
          message: text,
          is_read: true,
          user_id: profile.id,
          profile_id: profile.id,
        })
        .select('id, session_id, sender, message, is_read, is_pinned, user_id, profile_id, metadata, created_at')
        .single();

      if (error) throw error;

      const real = inserted as SmChatMessage;
      // Restore profile data on the real message (insert doesn't join)
      const realWithProfile: SmChatMessage = {
        ...real,
        profile: { id: profile.id, full_name: profile.full_name, avatar_url: profile.avatar_url },
      };
      setMessages(prev => dedupeById(prev.map(m => m.id === tempId ? realWithProfile : m)));

      await dispatchWebhook(text, String(real.id), profile.id);
    } catch {
      setSending(false);
      setSlowResponse(false);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      addToast('Failed to send message', 'error');
      setInputText(text);
    }
  }, [inputText, sending, profile, addToast, dispatchWebhook]);

  const handleRetry = useCallback(async () => {
    if (!retryState || sending || !profile) return;
    setSending(true);
    setRetryState(null);
    await dispatchWebhook(retryState.text, retryState.messageId, profile.id);
  }, [retryState, sending, profile, dispatchWebhook]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => addToast('Copied to clipboard'));
  };

  // ── Filtered / searched messages ───────────────────────────────────────────

  const displayedMessages = search.trim()
    ? messages.filter(m => m.message.toLowerCase().includes(search.toLowerCase()))
    : messages;

  const grouped = groupByDate(displayedMessages);

  const sidebarItems = grouped.map(g => ({
    dateKey: g.dateKey,
    label: g.label,
    preview: truncate(g.messages[g.messages.length - 1].message),
    timestamp: g.messages[g.messages.length - 1].created_at,
    unread: g.messages.filter(m => m.sender === 'cmo' && !m.is_read).length,
  })).reverse();

  // ── Status line in header ──────────────────────────────────────────────────

  const statusText = sending
    ? 'typing…'
    : configured
    ? 'Active · Marketing Manager'
    : 'Not configured — set REACT_APP_N8N_CMO_WEBHOOK_URL';

  const statusColor = sending ? '#f59e0b' : configured ? '#10b981' : '#ef4444';

  // ── Loading state ──────────────────────────────────────────────────────────

  if (profileLoading) {
    return (
      <div style={{ height: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #e5e7eb', borderTopColor: '#4ba6ea', animation: 'ckSpin 0.7s linear infinite' }} />
        <style>{`@keyframes ckSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', background: '#fff', overflow: 'hidden' }}>

      {/* ── Left Sidebar ──────────────────────────────────────────────── */}
      <div style={{
        width: 260, minWidth: 260, height: '100%',
        borderRight: '1px solid #ebebeb', background: '#fafafa',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid #ebebeb', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1117', marginBottom: 10, letterSpacing: '-0.2px' }}>
            CMO Chat
          </div>
          <div style={{ position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              type="text" placeholder="Search messages…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', height: 34, paddingLeft: 32, paddingRight: 10, fontSize: 13, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none', fontFamily: 'inherit', color: '#0f1117', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading && messages.length === 0 ? (
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ width: '50%', height: 11, borderRadius: 5, background: '#ebebeb', animation: 'ckPulse 1.5s ease-in-out infinite' }} />
                  <div style={{ width: '90%', height: 10, borderRadius: 5, background: '#ebebeb', animation: 'ckPulse 1.5s ease-in-out infinite' }} />
                </div>
              ))}
            </div>
          ) : sidebarItems.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12.5 }}>
              No conversations yet
            </div>
          ) : (
            sidebarItems.map(item => (
              <button
                key={item.dateKey}
                onClick={() => {
                  document.getElementById(`date-${item.dateKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderBottom: '1px solid #f5f5f5', transition: 'background 120ms ease' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f0f4f8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#4b5563' }}>{item.label}</span>
                  <span style={{ fontSize: 10.5, color: '#9ca3af' }}>{timeAgo(item.timestamp)}</span>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{item.preview}</div>
                {item.unread > 0 && (
                  <span style={{ display: 'inline-block', marginTop: 4, background: '#4ba6ea', color: '#fff', borderRadius: 20, fontSize: 10, fontWeight: 700, padding: '1px 7px' }}>
                    {item.unread} unread
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Main Chat Area ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* ── Tab switcher ──────────────────────────────────────────── */}
        <div style={{ borderBottom: '1px solid #ebebeb', padding: '0 20px', display: 'flex', gap: 0, flexShrink: 0, background: '#fff' }}>
          {(['cmo', 'team'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 16px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none',
                cursor: 'pointer', fontFamily: 'inherit', borderBottom: '2px solid',
                borderColor: activeTab === tab ? '#4ba6ea' : 'transparent',
                color: activeTab === tab ? '#4ba6ea' : '#6b7280',
                transition: 'all 140ms ease',
              }}
            >
              {tab === 'cmo' ? 'CMO Chat' : (
                <>Team Chat <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>(read-only)</span></>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'team' ? (
          <TeamChatView />
        ) : (<>

        {/* Chat header */}
        <div style={{ height: 60, borderBottom: '1px solid #ebebeb', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: '#fff' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.2px' }}>CMO</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#6b7280' }}>{statusText}</span>
            </div>
          </div>
          {!configured && (
            <div style={{ padding: '4px 10px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
              Webhook not configured
            </div>
          )}
        </div>

        {/* Messages list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
          {loading && messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ display: 'flex', gap: 10, flexDirection: i % 2 === 0 ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e5e7eb', flexShrink: 0, animation: 'ckPulse 1.5s ease-in-out infinite' }} />
                  <div style={{ width: '40%', height: 52, borderRadius: 14, background: '#f3f4f6', animation: 'ckPulse 1.5s ease-in-out infinite' }} />
                </div>
              ))}
            </div>
          ) : displayedMessages.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '40px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(75,166,234,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ color: '#4ba6ea' }}>
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1117', marginBottom: 6 }}>
                  {search ? 'No results found' : 'Start the conversation'}
                </div>
                <div style={{ fontSize: 13, color: '#9ca3af', maxWidth: 320 }}>
                  {search
                    ? `No messages matching "${search}"`
                    : 'Ask the CMO about strategy, content, campaigns, or anything marketing-related.'}
                </div>
              </div>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.dateKey} id={`date-${group.dateKey}`}>
                <DateSeparator label={group.label} />
                {group.messages.map(msg => (
                  <MessageBubble key={msg.id} msg={msg} onCopy={handleCopy} />
                ))}
              </div>
            ))
          )}

          {/* Retry banner */}
          {retryState && !sending && (
            <RetryBanner
              state={retryState}
              onRetry={handleRetry}
              onDismiss={() => setRetryState(null)}
            />
          )}

          {/* Typing indicator */}
          {sending && <TypingIndicator slow={slowResponse} />}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{ borderTop: '1px solid #ebebeb', padding: '14px 20px', background: '#fff', flexShrink: 0 }}>
          <div
            style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 14, padding: '10px 14px', transition: 'border-color 140ms ease' }}
            onFocusCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#4ba6ea'; }}
            onBlurCapture={e  => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e5e7eb'; }}
          >
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={configured ? 'Message the CMO… (Enter to send, Shift+Enter for new line)' : 'Configure REACT_APP_N8N_CMO_WEBHOOK_URL to enable CMO chat'}
              disabled={sending || !configured}
              rows={1}
              style={{ flex: 1, border: 'none', background: 'transparent', resize: 'none', outline: 'none', fontSize: 14, color: '#0f1117', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 24, maxHeight: 120 }}
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || sending || !configured}
              style={{
                width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
                background: inputText.trim() && !sending && configured ? '#4ba6ea' : '#e5e7eb',
                color: inputText.trim() && !sending && configured ? '#fff' : '#9ca3af',
                cursor: inputText.trim() && !sending && configured ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 140ms ease',
              }}
              onMouseEnter={e => { if (inputText.trim() && !sending) (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
              onMouseLeave={e => { if (inputText.trim() && !sending) (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
            >
              {sending ? (
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'ckSpin 0.7s linear infinite' }} />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#c0c4cc', marginTop: 6, paddingLeft: 2 }}>
            Enter to send · Shift+Enter for new line
          </div>
        </div>

        </>)}
      </div>

      {toasts.map(t => <Toast key={t.id} t={t} />)}

      <style>{`
        @keyframes ckPulse  { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes ckSlide  { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes ckBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
        @keyframes ckSpin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
};

export default MarketingChatPage;
