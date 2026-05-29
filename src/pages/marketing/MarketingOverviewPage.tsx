import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  useOverviewStats,
  useLatestCmoMessages,
  useLatestApprovals,
  useBotTaskCounts,
  useCmoStatus,
} from '../../hooks/useMarketing';
import { MARKETING_BOTS } from '../../types/marketing';
import type { SmApproval, SmChatMessage } from '../../types/marketing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function truncate(s: string, max = 90): string {
  return s.length > max ? s.slice(0, max).trimEnd() + '…' : s;
}

const PRIORITY_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  urgent: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)',  label: 'Urgent' },
  high:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', label: 'High' },
  normal: { color: '#4ba6ea', bg: 'rgba(75,166,234,0.10)', label: 'Normal' },
  low:    { color: '#9ca3af', bg: 'rgba(156,163,175,0.12)',label: 'Low' },
};

const STATUS_DOT: Record<string, string> = {
  active:  '#10b981',
  working: '#f59e0b',
  idle:    '#9ca3af',
};

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastData { id: number; message: string; type: 'success' | 'info' | 'error'; }

const Toast: React.FC<{ toast: ToastData }> = ({ toast }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: toast.type === 'error' ? '#ef4444' : '#0f1117',
      color: '#fff', borderRadius: 12,
      padding: '12px 20px', fontSize: 14, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'mkSlideUp 200ms ease',
    }}>
      {toast.type === 'success' && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>
      )}
      {toast.type === 'info' && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#4ba6ea" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round"/></svg>
      )}
      {toast.type === 'error' && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
      )}
      {toast.message}
    </div>,
    document.body
  );

// ---------------------------------------------------------------------------
// Skeleton helpers
// ---------------------------------------------------------------------------

const Sk: React.FC<{ w?: number | string; h?: number; r?: number; mb?: number }> = ({ w = '100%', h = 14, r = 6, mb = 0 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: '#f3f4f6', marginBottom: mb, animation: 'mkPulse 1.5s ease-in-out infinite' }} />
);

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  color: string;
  sub: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color, sub }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #f0f0f0',
        borderTop: `3px solid ${color}`,
        padding: '20px 22px',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'box-shadow 160ms ease, transform 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'none',
        flex: '1 1 0',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', letterSpacing: '0.2px' }}>{label}</span>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          {icon}
        </div>
      </div>
      {value === null ? (
        <Sk w={60} h={32} r={8} mb={6} />
      ) : (
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-1px', color: '#0f1117', lineHeight: 1, marginBottom: 6 }}>
          {value}
        </div>
      )}
      <div style={{ fontSize: 12, color: '#9ca3af' }}>{sub}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

const SectionCard: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <div style={{
    background: '#fff', borderRadius: 16,
    border: '1px solid #f0f0f0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    overflow: 'hidden',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 22px 14px',
      borderBottom: '1px solid #f5f5f5',
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.2px' }}>{title}</span>
      {action}
    </div>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// CMO Message row
// ---------------------------------------------------------------------------

const CmoMessageRow: React.FC<{ msg: SmChatMessage; onClick: () => void; last: boolean }> = ({ msg, onClick, last }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '14px 22px',
        borderBottom: last ? 'none' : '1px solid #f5f5f5',
        cursor: 'pointer',
        background: hovered ? '#fafbfc' : '#fff',
        transition: 'background 120ms ease',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0f1117' }}>CMO</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{timeAgo(msg.created_at)}</span>
        </div>
        <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, margin: 0 }}>
          {truncate(msg.message)}
        </p>
        {!msg.is_read && (
          <div style={{ marginTop: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#4ba6ea', background: 'rgba(75,166,234,0.10)', borderRadius: 20, padding: '1px 7px' }}>
              Unread
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Approval row
// ---------------------------------------------------------------------------

const ApprovalRow: React.FC<{ item: SmApproval; onClick: () => void; last: boolean }> = ({ item, onClick, last }) => {
  const [hovered, setHovered] = useState(false);
  const ps = PRIORITY_STYLE[item.priority] ?? PRIORITY_STYLE.normal;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '13px 22px',
        borderBottom: last ? 'none' : '1px solid #f5f5f5',
        cursor: 'pointer',
        background: hovered ? '#fafbfc' : '#fff',
        transition: 'background 120ms ease',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Item type icon */}
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        background: '#f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#6b7280',
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.title}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: ps.color,
            background: ps.bg, borderRadius: 20, padding: '1px 7px',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {ps.label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>by {item.bot_who_created}</span>
          <span style={{ fontSize: 11, color: '#d1d5db' }}>·</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{timeAgo(item.created_at)}</span>
        </div>
      </div>

      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#d1d5db', flexShrink: 0 }}>
        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Bot card
// ---------------------------------------------------------------------------

interface BotCardProps {
  name: string;
  role: string;
  status: 'active' | 'idle' | 'working';
  color: string;
  pendingTasks: number;
}

const BotCardComp: React.FC<BotCardProps> = ({ name, role, status, color, pendingTasks }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #f0f0f0',
        borderTop: `3px solid ${color}`,
        padding: '16px 18px',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.07)' : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'box-shadow 160ms ease, transform 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* Bot avatar + status dot */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          {/* Robot/bot icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color }}>
            <rect x="3" y="8" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M12 2v6M8 2h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="9" cy="13" r="1.5" fill="currentColor"/>
            <circle cx="15" cy="13" r="1.5" fill="currentColor"/>
            <path d="M9 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          {/* Status dot */}
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 10, height: 10, borderRadius: '50%',
            background: STATUS_DOT[status],
            border: '2px solid #fff',
          }} />
        </div>

        {pendingTasks > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#f59e0b',
            background: 'rgba(245,158,11,0.10)',
            borderRadius: 20, padding: '2px 8px',
          }}>
            {pendingTasks} task{pendingTasks !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f1117', marginBottom: 2, letterSpacing: '-0.2px' }}>
        {name}
      </div>
      <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 10 }}>{role}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[status] }} />
        <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500, textTransform: 'capitalize' }}>{status}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Quick action button
// ---------------------------------------------------------------------------

const QuickAction: React.FC<{ label: string; sub: string; icon: React.ReactNode; color: string; onClick: () => void }> = ({ label, sub, icon, color, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: '1 1 0', minWidth: 0, textAlign: 'left',
        padding: '18px 20px', borderRadius: 14,
        border: `1.5px solid ${hovered ? color : '#e5e7eb'}`,
        background: hovered ? `${color}08` : '#fff',
        cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: hovered ? `0 4px 16px ${color}22` : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'all 160ms ease',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f1117', marginBottom: 3, letterSpacing: '-0.2px' }}>{label}</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>{sub}</div>
      </div>
    </button>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const MarketingOverviewPage: React.FC = () => {
  const navigate = useNavigate();

  const { stats, loading: statsLoading } = useOverviewStats();
  const { messages, loading: msgsLoading }   = useLatestCmoMessages(5);
  const { approvals, loading: approvLoading } = useLatestApprovals(5);
  const { counts: botCounts } = useBotTaskCounts();
  const cmoStatus = useCmoStatus();

  // Toast queue
  const [toasts, setToasts]     = useState<ToastData[]>([]);
  const toastCounter             = useRef(0);
  const [approvalCount, setApprovalCount] = useState<number | null>(null);
  const [cmoCount, setCmoCount]           = useState<number | null>(null);

  const addToast = (message: string, type: ToastData['type'] = 'info') => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Sync live counts for the real-time subscription to compare against
  useEffect(() => {
    if (stats) {
      setApprovalCount(stats.pendingApprovals);
      setCmoCount(stats.unreadCmo);
    }
  }, [stats]);

  // Real-time subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('marketing_overview')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'social', table: 'sm_approvals_queue' },
        (payload) => {
          const row = payload.new as SmApproval;
          if (row.status === 'pending') {
            setApprovalCount(prev => (prev ?? 0) + 1);
            addToast(`New approval needed: "${row.title}"`, 'info');
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'social', table: 'sm_chat_with_cmo' },
        (payload) => {
          const row = payload.new as SmChatMessage;
          if (row.sender === 'cmo') {
            setCmoCount(prev => (prev ?? 0) + 1);
            addToast('New message from CMO', 'info');
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge live count overrides into stats display
  const displayStats = stats
    ? {
        ...stats,
        pendingApprovals: approvalCount ?? stats.pendingApprovals,
        unreadCmo:        cmoCount        ?? stats.unreadCmo,
      }
    : null;

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', padding: '40px 40px 60px', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            Marketing
          </span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.7px', color: '#0f1117', marginBottom: 5 }}>
          Overview
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280' }}>
          AI marketing team — real-time status
        </p>
      </div>

      {/* A. Stat cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatCard
          label="Pending Approvals"
          value={displayStats?.pendingApprovals ?? null}
          color="#f59e0b"
          sub="waiting for review"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <polyline points="9 11 12 14 22 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
        <StatCard
          label="Unread CMO Messages"
          value={displayStats?.unreadCmo ?? null}
          color="#4ba6ea"
          sub="from marketing manager"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
        <StatCard
          label="Scheduled Today"
          value={displayStats?.scheduledToday ?? null}
          color="#10b981"
          sub="posts going out today"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="2" fill="currentColor"/>
            </svg>
          }
        />
        <StatCard
          label="Urgent Items"
          value={displayStats?.urgentItems ?? null}
          color="#ef4444"
          sub="need immediate attention"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          }
        />
      </div>

      {/* B. Two-column section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>

        {/* Latest from CMO */}
        <SectionCard
          title="Latest from CMO"
          action={
            <button
              onClick={() => navigate('/dashboard/marketing/chat')}
              style={{ fontSize: 12, color: '#4ba6ea', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, padding: 0 }}
            >
              View all →
            </button>
          }
        >
          {msgsLoading ? (
            <div style={{ padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <Sk w={32} h={32} r={999} />
                  <div style={{ flex: 1 }}>
                    <Sk w="60%" h={12} r={5} mb={6} />
                    <Sk w="100%" h={11} r={5} mb={4} />
                    <Sk w="80%" h={11} r={5} />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div style={{ padding: '36px 22px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              No messages from CMO yet
            </div>
          ) : (
            messages.map((msg, i) => (
              <CmoMessageRow
                key={msg.id}
                msg={msg}
                last={i === messages.length - 1}
                onClick={() => navigate('/dashboard/marketing/chat')}
              />
            ))
          )}
        </SectionCard>

        {/* Pending Approvals */}
        <SectionCard
          title="Pending Approvals"
          action={
            <button
              onClick={() => navigate('/dashboard/marketing/approvals')}
              style={{ fontSize: 12, color: '#4ba6ea', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, padding: 0 }}
            >
              View all →
            </button>
          }
        >
          {approvLoading ? (
            <div style={{ padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <Sk w={34} h={34} r={9} />
                  <div style={{ flex: 1 }}>
                    <Sk w="70%" h={12} r={5} mb={6} />
                    <Sk w="50%" h={11} r={5} />
                  </div>
                </div>
              ))}
            </div>
          ) : approvals.length === 0 ? (
            <div style={{ padding: '36px 22px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              No pending approvals
            </div>
          ) : (
            approvals.map((item, i) => (
              <ApprovalRow
                key={item.id}
                item={item}
                last={i === approvals.length - 1}
                onClick={() => navigate('/dashboard/marketing/approvals')}
              />
            ))
          )}
        </SectionCard>
      </div>

      {/* C. Team Status */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f1117' }}>Team Status</span>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>8 bots</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {MARKETING_BOTS.map(bot => (
            <BotCardComp
              key={bot.key}
              name={bot.name}
              role={bot.role}
              status={bot.key === 'cmo' ? cmoStatus : bot.status}
              color={bot.color}
              pendingTasks={botCounts[bot.key] ?? 0}
            />
          ))}
        </div>
      </div>

      {/* D. Quick Actions */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1117', marginBottom: 14 }}>Quick Actions</div>
        <div style={{ display: 'flex', gap: 14 }}>
          <QuickAction
            label="Chat with CMO"
            sub="Start a new conversation"
            color="#4ba6ea"
            onClick={() => navigate('/dashboard/marketing/chat')}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <QuickAction
            label="Review Approvals"
            sub="Items waiting for your sign-off"
            color="#f59e0b"
            onClick={() => navigate('/dashboard/marketing/approvals')}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <polyline points="9 11 12 14 22 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <QuickAction
            label="This Week's Schedule"
            sub="Upcoming content pipeline"
            color="#10b981"
            onClick={() => navigate('/dashboard/marketing/calendar')}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            }
          />
          <QuickAction
            label="Check Competitors"
            sub="Latest market intelligence"
            color="#8b5cf6"
            onClick={() => navigate('/dashboard/marketing/competitors')}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/>
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8"/>
                <line x1="12" y1="2" x2="12" y2="8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="12" y1="16" x2="12" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="2" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="16" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            }
          />
        </div>
      </div>

      {/* Toast queue */}
      {toasts.map(t => <Toast key={t.id} toast={t} />)}

      <style>{`
        @keyframes mkPulse   { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes mkSlideUp { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>
  );
};

export default MarketingOverviewPage;
