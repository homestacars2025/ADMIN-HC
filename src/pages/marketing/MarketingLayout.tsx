import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { socialFrom } from '../../lib/socialClient';
import { useApprovalsCount, useUnreadCmoCount } from '../../hooks/useMarketing';
import { MARKETING_PAGES } from '../../types/marketing';
import type { SmNotification } from '../../types/marketing';

// ─── helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function severityIcon(s: SmNotification['severity']) {
  const map: Record<string, { icon: string; color: string }> = {
    info: { icon: 'ℹ️', color: '#4ba6ea' },
    success: { icon: '✅', color: '#10b981' },
    warning: { icon: '⚠️', color: '#f59e0b' },
    error: { icon: '🚨', color: '#ef4444' },
  };
  return map[s] ?? map.info;
}

// ─── Keyboard shortcuts modal ─────────────────────────────────────────────────

const SHORTCUTS = [
  { section: 'Global', items: [
    { keys: ['⌘', 'K'], label: 'Open global search' },
    { keys: ['?'], label: 'Show keyboard shortcuts' },
    { keys: ['Esc'], label: 'Close any modal or panel' },
  ]},
  { section: 'Navigation', items: [
    { keys: ['G', 'O'], label: 'Go to Overview' },
    { keys: ['G', 'C'], label: 'Go to CMO Chat' },
    { keys: ['G', 'A'], label: 'Go to Approvals' },
    { keys: ['G', 'S'], label: 'Go to Social Posts' },
    { keys: ['G', 'B'], label: 'Go to Blog Posts' },
    { keys: ['G', 'P'], label: 'Go to Performance' },
  ]},
  { section: 'In Approvals', items: [
    { keys: ['A'], label: 'Approve selected item' },
    { keys: ['R'], label: 'Reject selected item' },
    { keys: ['↑', '↓'], label: 'Navigate items' },
  ]},
];

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return ReactDOM.createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'mlSlideUp 0.2s ease' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>Keyboard Shortcuts</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Press <kbd style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>Esc</kbd> to close</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 24px' }}>
          {SHORTCUTS.map(s => (
            <div key={s.section} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                {s.section}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {s.items.map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0' }}>
                    <span style={{ fontSize: 13, color: '#475569' }}>{item.label}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {item.keys.map(k => (
                        <kbd key={k} style={{ padding: '2px 8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, fontFamily: 'monospace', color: '#334155', boxShadow: '0 1px 0 #e2e8f0' }}>
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Global search modal ──────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  category: string;
  title: string;
  sub: string;
  path: string;
  color: string;
}

function GlobalSearchModal({ onClose, onNavigate }: { onClose: () => void; onNavigate: (path: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const q = query.toLowerCase();
      const all: SearchResult[] = [];

      try {
        // Search approvals
        const { data: app } = await socialFrom('sm_approvals_queue')
          .select('id, title, item_type, status')
          .ilike('title', `%${q}%`)
          .limit(4);
        (app ?? []).forEach((r: { id: number; title: string; item_type: string; status: string }) => {
          all.push({ id: `app-${r.id}`, category: 'Approvals', title: r.title, sub: `${r.item_type} · ${r.status}`, path: '/dashboard/marketing/approvals', color: '#f59e0b' });
        });

        // Search social posts
        const { data: posts } = await socialFrom('sm_content_social')
          .select('id, title, status, platform')
          .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
          .limit(4);
        (posts ?? []).forEach((r: { id: number; title: string | null; status: string; platform: string | null }) => {
          if (r.title) all.push({ id: `sp-${r.id}`, category: 'Social Posts', title: r.title, sub: `${r.platform ?? 'Post'} · ${r.status}`, path: '/dashboard/marketing/social-posts', color: '#4ba6ea' });
        });

        // Search blog posts
        const { data: blogs } = await socialFrom('sm_content_blog')
          .select('id, title_en, title_ar, status')
          .or(`title_en.ilike.%${q}%,title_ar.ilike.%${q}%`)
          .limit(4);
        (blogs ?? []).forEach((r: { id: number; title_en: string | null; title_ar: string | null; status: string }) => {
          const title = r.title_en ?? r.title_ar ?? 'Blog post';
          all.push({ id: `bl-${r.id}`, category: 'Blog Posts', title, sub: `Blog · ${r.status}`, path: '/dashboard/marketing/blog-posts', color: '#8b5cf6' });
        });

        // Search competitors
        const { data: comps } = await socialFrom('sm_competitors')
          .select('id, name, threat_level')
          .ilike('name', `%${q}%`)
          .limit(4);
        (comps ?? []).forEach((r: { id: number; name: string; threat_level: string }) => {
          all.push({ id: `comp-${r.id}`, category: 'Competitors', title: r.name, sub: `${r.threat_level} threat`, path: '/dashboard/marketing/competitors', color: '#ef4444' });
        });

        // Search campaigns
        const { data: camps } = await socialFrom('sm_ad_campaigns')
          .select('id, name, status, platform')
          .ilike('name', `%${q}%`)
          .limit(4);
        (camps ?? []).forEach((r: { id: number; name: string; status: string; platform: string | null }) => {
          all.push({ id: `camp-${r.id}`, category: 'Campaigns', title: r.name, sub: `${r.platform ?? 'Campaign'} · ${r.status}`, path: '/dashboard/marketing/campaigns', color: '#f97316' });
        });

        // Search decisions
        const { data: decs } = await socialFrom('sm_decisions_log')
          .select('id, title, decision_type, made_by')
          .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
          .limit(4);
        (decs ?? []).forEach((r: { id: number; title: string; decision_type: string | null; made_by: string | null }) => {
          all.push({ id: `dec-${r.id}`, category: 'Decisions', title: r.title, sub: `${r.decision_type ?? 'decision'} · by ${r.made_by ?? '?'}`, path: '/dashboard/marketing/decisions', color: '#06b6d4' });
        });
      } catch { /* graceful */ }

      setResults(all);
      setActiveIdx(0);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[activeIdx]) { onNavigate(results[activeIdx].path); onClose(); }
  }

  // group results by category
  const grouped: Record<string, SearchResult[]> = {};
  results.forEach(r => { if (!grouped[r.category]) grouped[r.category] = []; grouped[r.category].push(r); });
  let flatIdx = -1;

  return ReactDOM.createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px 16px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', animation: 'mlSlideDown 0.18s ease' }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* search input */}
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f1f5f9' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search across all marketing content…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: '#0f172a', background: 'transparent' }}
          />
          {searching && <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #e2e8f0', borderTopColor: '#4ba6ea', animation: 'mlSpin 0.6s linear infinite' }} />}
          <kbd style={{ padding: '2px 7px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 11, color: '#94a3b8' }}>Esc</kbd>
        </div>

        {/* results */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {query.length < 2 ? (
            <div style={{ padding: '40px 18px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
              Type at least 2 characters to search…
            </div>
          ) : results.length === 0 && !searching ? (
            <div style={{ padding: '40px 18px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
              No results for "{query}"
            </div>
          ) : (
            Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <div style={{ padding: '10px 18px 6px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cat}</div>
                {items.map(item => {
                  flatIdx++;
                  const fi = flatIdx;
                  const isActive = fi === activeIdx;
                  return (
                    <div
                      key={item.id}
                      onClick={() => { onNavigate(item.path); onClose(); }}
                      style={{
                        padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                        background: isActive ? '#f0f9ff' : '#fff', transition: 'background 0.1s',
                      }}
                      onMouseEnter={() => setActiveIdx(fi)}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{item.sub}</div>
                      </div>
                      {isActive && <span style={{ fontSize: 11, color: '#4ba6ea' }}>↵ Open</span>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div style={{ padding: '8px 18px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 16, fontSize: 11, color: '#94a3b8' }}>
          <span><kbd style={{ fontSize: 10 }}>↑↓</kbd> Navigate</span>
          <span><kbd style={{ fontSize: 10 }}>↵</kbd> Open</span>
          <span><kbd style={{ fontSize: 10 }}>Esc</kbd> Close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Notification bell + dropdown ─────────────────────────────────────────────

function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<SmNotification[]>([]);
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await socialFrom('sm_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error) setNotifications((data ?? []) as SmNotification[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time subscription
  useEffect(() => {
    const ch = supabase
      .channel('notifications_bell')
      .on('postgres_changes', { event: 'INSERT', schema: 'social', table: 'sm_notifications' }, payload => {
        setNotifications(prev => [payload.new as SmNotification, ...prev.slice(0, 19)]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unread = notifications.filter(n => !n.is_read).length;

  async function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    await socialFrom('sm_notifications').update({ is_read: true }).eq('is_read', false);
  }

  async function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await socialFrom('sm_notifications').update({ is_read: true }).eq('id', id);
  }

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: '50%',
          border: '1px solid #e5e7eb', background: open ? '#f0f9ff' : '#fff',
          cursor: 'pointer', position: 'relative', transition: 'all 140ms ease',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            minWidth: 16, height: 16, padding: '0 4px',
            background: '#ef4444', color: '#fff',
            fontSize: 9, fontWeight: 700, borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #fff',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, width: 340,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 100,
          animation: 'mlSlideDown 0.15s ease', overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
              Notifications {unread > 0 && <span style={{ fontSize: 12, color: '#4ba6ea', fontWeight: 600 }}>({unread} new)</span>}
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 12, color: '#4ba6ea', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Mark all read
              </button>
            )}
          </div>

          {/* list */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
                No notifications yet
              </div>
            ) : notifications.map((n, i) => {
              const sv = severityIcon(n.severity);
              return (
                <div
                  key={n.id}
                  onClick={() => { markRead(n.id); if (n.link) navigate(n.link); setOpen(false); }}
                  style={{
                    padding: '12px 16px', display: 'flex', gap: 10, cursor: n.link ? 'pointer' : 'default',
                    background: n.is_read ? '#fff' : '#f0f9ff',
                    borderBottom: i < notifications.length - 1 ? '1px solid #f8fafc' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = n.is_read ? '#fff' : '#f0f9ff'; }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{sv.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: '#0f172a', marginBottom: 2 }}>{n.title}</div>
                    {n.message && <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</div>}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                  </div>
                  {!n.is_read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ba6ea', flexShrink: 0, marginTop: 3 }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────

const MarketingLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const segment = location.pathname.replace('/dashboard/marketing', '').replace(/^\//, '');
  const pageInfo = MARKETING_PAGES[segment] ?? { title: 'Marketing', description: '' };

  const pendingApprovals = useApprovalsCount();
  const unreadCmo = useUnreadCmoCount();

  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement).contentEditable === 'true';

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
        return;
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
        setShowShortcuts(false);
        return;
      }
      if (!isInput && e.key === '?') {
        setShowShortcuts(s => !s);
        return;
      }
      // G + letter navigation shortcuts
      if (!isInput && e.key === 'g') {
        const handler2 = (e2: KeyboardEvent) => {
          const routes: Record<string, string> = {
            o: '/dashboard/marketing',
            c: '/dashboard/marketing/chat',
            a: '/dashboard/marketing/approvals',
            s: '/dashboard/marketing/social-posts',
            b: '/dashboard/marketing/blog-posts',
            p: '/dashboard/marketing/performance',
          };
          if (routes[e2.key]) { navigate(routes[e2.key]); }
          document.removeEventListener('keydown', handler2);
        };
        document.addEventListener('keydown', handler2);
        setTimeout(() => document.removeEventListener('keydown', handler2), 1500);
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigate]);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes mlSlideUp   { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes mlSlideDown { from{transform:translateY(-8px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes mlSpin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* Sub-header */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #ebebeb',
        padding: '0 40px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 20,
      }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate('/dashboard/marketing')}
            style={{ fontSize: 13, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 140ms ease' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#4ba6ea'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; }}
          >
            Marketing
          </button>
          {segment && (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#d1d5db', flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f1117' }}>{pageInfo.title}</span>
            </>
          )}
        </div>

        {/* Right side actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

          {/* Cmd+K search button */}
          <button
            onClick={() => setShowSearch(true)}
            title="Search (⌘K)"
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '5px 12px', borderRadius: 8,
              border: '1px solid #e5e7eb', background: '#fff',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 140ms ease', color: '#6b7280',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Search</span>
            <kbd style={{ fontSize: 10, padding: '1px 5px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, color: '#94a3b8' }}>⌘K</kbd>
          </button>

          {/* CMO badge */}
          <button
            onClick={() => navigate('/dashboard/marketing/chat')}
            title="Unread CMO messages"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 20, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 140ms ease' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#6b7280' }}>
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>CMO</span>
            {unreadCmo !== null && unreadCmo > 0 && (
              <span style={{ minWidth: 18, height: 18, padding: '0 5px', background: '#4ba6ea', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {unreadCmo > 99 ? '99+' : unreadCmo}
              </span>
            )}
          </button>

          {/* Approvals badge */}
          <button
            onClick={() => navigate('/dashboard/marketing/approvals')}
            title="Pending approvals"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 20, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 140ms ease' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#f59e0b'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#6b7280' }}>
              <polyline points="9 11 12 14 22 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Approvals</span>
            {pendingApprovals !== null && pendingApprovals > 0 && (
              <span style={{ minWidth: 18, height: 18, padding: '0 5px', background: '#f59e0b', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {pendingApprovals > 99 ? '99+' : pendingApprovals}
              </span>
            )}
          </button>

          {/* Notification bell */}
          <NotificationBell />

          {/* Shortcuts hint */}
          <button
            onClick={() => setShowShortcuts(true)}
            title="Keyboard shortcuts (?)"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#6b7280', fontSize: 14, fontWeight: 700, transition: 'all 140ms ease' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
          >
            ?
          </button>
        </div>
      </div>

      {/* Page content */}
      <div style={{ flex: 1 }}>
        <Outlet />
      </div>

      {/* Modals */}
      {showSearch && <GlobalSearchModal onClose={() => setShowSearch(false)} onNavigate={navigate} />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
};

export default MarketingLayout;
