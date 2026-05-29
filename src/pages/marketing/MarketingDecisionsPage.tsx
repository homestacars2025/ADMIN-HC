import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { socialFrom } from '../../lib/socialClient';
import type { SmDecision } from '../../types/marketing';

// ─── helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul',
  }) + ' (Istanbul)';
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const twoWeeksAgo = new Date(today.getTime() - 14 * 86400000);
  const item = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (item >= today) return 'Today';
  if (item >= yesterday) return 'Yesterday';
  if (item >= weekAgo) return 'This Week';
  if (item >= twoWeeksAgo) return 'Last Week';
  return 'Older';
}

function groupByDay(decisions: SmDecision[]): { label: string; items: SmDecision[] }[] {
  const order = ['Today', 'Yesterday', 'This Week', 'Last Week', 'Older'];
  const groups: Record<string, SmDecision[]> = {};
  decisions.forEach(d => {
    const lbl = dayLabel(d.created_at);
    if (!groups[lbl]) groups[lbl] = [];
    groups[lbl].push(d);
  });
  return order.filter(l => groups[l]).map(l => ({ label: l, items: groups[l] }));
}

// ─── Decision type config ─────────────────────────────────────────────────────

interface TypeConfig { label: string; color: string; bg: string; icon: React.ReactNode; }

function getTypeConfig(type: string | null): TypeConfig {
  const t = type ?? 'other';
  const map: Record<string, TypeConfig> = {
    constitution_change: {
      label: 'Constitution', color: '#8b5cf6', bg: '#ede9fe',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/></svg>,
    },
    bot_enable: {
      label: 'Bot Enable', color: '#10b981', bg: '#d1fae5',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>,
    },
    bot_disable: {
      label: 'Bot Disable', color: '#ef4444', bg: '#fee2e2',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
    },
    content_change: {
      label: 'Content', color: '#4ba6ea', bg: '#dbeafe',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
    },
    strategy_change: {
      label: 'Strategy', color: '#f59e0b', bg: '#fef3c7',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    },
    approval_action: {
      label: 'Approval', color: '#06b6d4', bg: '#cffafe',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
    },
    campaign_action: {
      label: 'Campaign', color: '#f97316', bg: '#ffedd5',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
    },
  };
  return map[t] ?? {
    label: t.replace(/_/g, ' '), color: '#6b7280', bg: '#f3f4f6',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>,
  };
}

// ─── Seed data ────────────────────────────────────────────────────────────────

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function buildDecisionSeeds(): Omit<SmDecision, 'id'>[] {
  return [
    // Today
    {
      decision_type: 'content_change',
      title: 'Approved Hyundai Bayon promotional post',
      description: 'Approved the Bayon city-drive campaign post for Instagram. Strong visual and Arabic caption — aligns with current strategy.',
      made_by: 'admin',
      before_value: '{"status":"pending_approval"}',
      after_value: '{"status":"approved"}',
      created_at: daysAgo(0),
    },
    {
      decision_type: 'strategy_change',
      title: 'Shifted content mix to 40% short-form video for summer',
      description: 'Based on Q1 performance data, rebalancing content calendar to prioritize Reels and TikTok through August. Static posts reduced to 30%.',
      made_by: 'cmo',
      before_value: '{"reels_pct":20,"static_pct":50,"stories_pct":30}',
      after_value: '{"reels_pct":40,"static_pct":30,"stories_pct":30}',
      created_at: daysAgo(0),
    },
    // Yesterday
    {
      decision_type: 'approval_action',
      title: 'Approved Google Ads campaign for Saudi tourists',
      description: 'CMO-proposed Google Search campaign targeting "car rental istanbul" in Arabic and English. Budget approved: ₺8,000/month.',
      made_by: 'admin',
      before_value: '{"status":"proposed","budget":null}',
      after_value: '{"status":"approved","budget":8000}',
      created_at: daysAgo(1),
    },
    {
      decision_type: 'content_change',
      title: 'Rejected weekend offer post — off-brand tone',
      description: 'Post used aggressive sales language ("GRAB NOW", "LAST CHANCE") inconsistent with our premium brand voice. Sent back to content writer with guidance.',
      made_by: 'admin',
      before_value: '{"status":"pending_approval","title":"Weekend Flash Sale - Last Chance!"}',
      after_value: '{"status":"rejected","rejection_reason":"Off-brand aggressive tone"}',
      created_at: daysAgo(1),
    },
    // This week
    {
      decision_type: 'constitution_change',
      title: 'Updated CMO constitution to v2',
      description: 'Added new rules around Arabic content quality: minimum 3 native-speaker review checkpoints, no machine-translated captions for Gulf audience posts.',
      made_by: 'admin',
      before_value: '# CMO Constitution v1\n\n## Core Directives\n- Focus on brand voice\n- Arabic content: translate from English\n\n## Budget Authority\n- Propose campaigns under ₺5,000',
      after_value: '# CMO Constitution v2\n\n## Core Directives\n- Focus on brand voice\n- Arabic content: native-speaker written, never machine translated\n- Gulf audience posts require 3 QA checkpoints\n\n## Budget Authority\n- Propose campaigns under ₺10,000',
      created_at: daysAgo(3),
    },
    {
      decision_type: 'campaign_action',
      title: 'Paused underperforming Meta Stories campaign',
      description: 'Meta Stories campaign running 2 weeks with ROAS 0.4 — well below 2.0 target. Paused to rework creative and audience targeting.',
      made_by: 'ads_manager',
      before_value: '{"status":"launched","roas":0.4,"spend":3200}',
      after_value: '{"status":"paused","pause_reason":"ROAS 0.4 below 2.0 target"}',
      created_at: daysAgo(3),
    },
    {
      decision_type: 'content_change',
      title: 'Bulk approved 5 social posts for next week',
      description: 'Reviewed and approved 5 posts for the Week 21 calendar: 2 Instagram Reels, 2 Stories, 1 Facebook carousel. All align with summer content strategy.',
      made_by: 'admin',
      before_value: '{"approved_count":0,"posts":["reel_bosphorus","reel_fleet","story_promo1","story_promo2","fb_carousel"]}',
      after_value: '{"approved_count":5,"posts_status":"approved"}',
      created_at: daysAgo(4),
    },
    {
      decision_type: 'constitution_change',
      title: 'Added pricing transparency rule to Brand Guardian constitution',
      description: 'Brand Guardian now required to flag any posts that mention pricing without including full terms. Prevents misleading impression of rates.',
      made_by: 'admin',
      before_value: null,
      after_value: '{"new_rule":"All pricing mentions must include \'from\' qualifier and link to full rate card"}',
      created_at: daysAgo(5),
    },
    // Last week
    {
      decision_type: 'bot_enable',
      title: 'Enabled Competitor Monitor bot',
      description: 'Initial activation of the Competitor Monitor bot. Configured to track Sixt, Otokoç, Garenta, Yes! Yes!, and Smarty Car Rental.',
      made_by: 'admin',
      before_value: '{"status":"disabled"}',
      after_value: '{"status":"active","tracking":["sixt","otokoc","garenta","yesyes","smarty"]}',
      created_at: daysAgo(9),
    },
    {
      decision_type: 'approval_action',
      title: 'Approved Brand Guardian constitution v1',
      description: 'Initial approval of Brand Guardian constitution covering brand voice, color palette usage, and prohibited language list.',
      made_by: 'admin',
      before_value: '{"status":"draft"}',
      after_value: '{"status":"active","version":1}',
      created_at: daysAgo(10),
    },
    // Older
    {
      decision_type: 'bot_disable',
      title: 'Temporarily disabled Video Editor bot',
      description: 'Video Editor bot disabled pending storage configuration. Will re-enable once Supabase Storage bucket for video assets is set up.',
      made_by: 'admin',
      before_value: '{"status":"idle"}',
      after_value: '{"status":"disabled","reason":"Awaiting video storage bucket setup"}',
      created_at: daysAgo(16),
    },
    {
      decision_type: 'strategy_change',
      title: 'Adopted AEO-first approach for blog content',
      description: 'All new blog posts must target AI search engines (ChatGPT, Perplexity, Gemini) in addition to traditional SEO. Minimum AEO score of 70 required before publishing.',
      made_by: 'cmo',
      before_value: '{"blog_strategy":"seo_first","aeo_requirement":false}',
      after_value: '{"blog_strategy":"aeo_first","aeo_requirement":true,"min_aeo_score":70}',
      created_at: daysAgo(18),
    },
    {
      decision_type: 'bot_enable',
      title: 'Activated full 8-bot marketing team',
      description: 'Initial system activation. All 8 marketing bots enabled: CMO, Coordinator, Brand Guardian, Content Writer, Designer, Competitor Monitor, Performance Analyst, Ads Manager.',
      made_by: 'admin',
      before_value: '{"bots_active":0}',
      after_value: '{"bots_active":8,"team":["cmo","coordinator","brand_guardian","content_writer","designer","competitor_monitor","performance_analyst","ads_manager"]}',
      created_at: daysAgo(20),
    },
  ];
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportCSV(decisions: SmDecision[]) {
  const headers = ['ID', 'Date', 'Type', 'Title', 'Made By', 'Description'];
  const rows = decisions.map(d => [
    d.id,
    fmtFull(d.created_at),
    d.decision_type ?? '',
    `"${(d.title ?? '').replace(/"/g, '""')}"`,
    d.made_by ?? '',
    `"${(d.description ?? '').replace(/"/g, '""')}"`,
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `decisions_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast { id: number; msg: string; type: 'success' | 'error' | 'info'; }

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500, color: '#fff',
          background: t.type === 'success' ? '#10b981' : t.type === 'error' ? '#ef4444' : '#4ba6ea',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'dlSlide 0.3s ease',
        }}>{t.msg}</div>
      ))}
    </div>,
    document.body,
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ h = 20, w = '100%', r = 6 }: { h?: number; w?: string | number; r?: number }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: '#f1f5f9', animation: 'dlPulse 1.5s ease-in-out infinite' }} />;
}

// ─── Before/After diff panel ──────────────────────────────────────────────────

function DiffPanel({ before, after }: { before: string | null; after: string | null }) {
  function tryFmt(s: string | null): string {
    if (!s) return '—';
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  }

  const isMarkdown = (s: string | null) => s != null && (s.includes('#') || s.includes('\n'));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {[{ label: 'Before', value: before, color: '#ef4444', bg: '#fff1f2' }, { label: 'After', value: after, color: '#10b981', bg: '#f0fdf4' }].map(side => (
        <div key={side.label} style={{ border: `1px solid ${side.color}40`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: side.bg, padding: '8px 14px', fontSize: 11, fontWeight: 700, color: side.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {side.label}
          </div>
          <pre style={{
            margin: 0, padding: 14, fontSize: 12, fontFamily: 'monospace', color: '#334155',
            background: '#fff', overflowX: 'auto', whiteSpace: isMarkdown(side.value) ? 'pre-wrap' : 'pre',
            maxHeight: 240, overflowY: 'auto',
          }}>
            {tryFmt(side.value)}
          </pre>
        </div>
      ))}
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ decision: d, onClose }: { decision: SmDecision; onClose: () => void }) {
  const cfg = getTypeConfig(d.decision_type);
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'dlSlideUp 0.25s ease' }} onClick={e => e.stopPropagation()}>

        {/* header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', background: cfg.bg, color: cfg.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: cfg.color }}>{cfg.icon}</span>
                {cfg.label}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{fmtFull(d.created_at)}</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{d.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8', lineHeight: 1, padding: '0 0 0 16px', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {/* Made by + timestamp */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Made By</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: d.made_by === 'admin' ? '#4ba6ea' : '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase' }}>
                  {(d.made_by ?? 'U').slice(0, 1)}
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', textTransform: 'capitalize' }}>
                  {d.made_by ?? 'Unknown'}
                </span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Timestamp</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{fmtFull(d.created_at)}</div>
            </div>
          </div>

          {/* Description */}
          {d.description && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Description</div>
              <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7 }}>{d.description}</div>
            </div>
          )}

          {/* Before/After */}
          {(d.before_value || d.after_value) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Change Details</div>
              <DiffPanel before={d.before_value} after={d.after_value} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Timeline card ────────────────────────────────────────────────────────────

function TimelineCard({ decision: d, onClick }: { decision: SmDecision; onClick: () => void }) {
  const cfg = getTypeConfig(d.decision_type);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const needsExpand = (d.description ?? '').length > 120;

  return (
    <div style={{ display: 'flex', gap: 16, position: 'relative' }}>
      {/* timeline dot + line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: cfg.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: cfg.color, zIndex: 1, border: `2px solid ${cfg.color}30`,
        }}>
          {cfg.icon}
        </div>
        <div style={{ width: 2, flex: 1, background: '#f1f5f9', marginTop: 4, minHeight: 20 }} />
      </div>

      {/* card */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16,
          marginBottom: 12, cursor: 'pointer', transition: 'box-shadow 0.15s',
          boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.07)' : 'none',
        }}
        onClick={onClick}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', background: cfg.bg, color: cfg.color }}>
              {cfg.label}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: d.made_by === 'admin' ? '#4ba6ea' : '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', textTransform: 'uppercase', flexShrink: 0 }}>
                {(d.made_by ?? 'U').slice(0, 1)}
              </div>
              <span style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>{d.made_by ?? 'unknown'}</span>
            </div>
          </div>
          <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }} title={fmtFull(d.created_at)}>
            {timeAgo(d.created_at)}
          </span>
        </div>

        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 6 }}>{d.title}</div>

        {d.description && (
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
            {!expanded && needsExpand ? d.description.slice(0, 120) + '…' : d.description}
            {needsExpand && (
              <button
                onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
                style={{ marginLeft: 6, fontSize: 12, color: '#4ba6ea', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontWeight: 600 }}
              >
                {expanded ? 'less' : 'more'}
              </button>
            )}
          </div>
        )}

        {(d.before_value || d.after_value) && (
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Has before/after details</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ViewMode = 'timeline' | 'table';

const ALL_TYPES = [
  'constitution_change', 'bot_enable', 'bot_disable',
  'content_change', 'strategy_change', 'approval_action', 'campaign_action',
];

export default function MarketingDecisionsPage() {
  const [decisions, setDecisions] = useState<SmDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [view, setView] = useState<ViewMode>('timeline');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [selected, setSelected] = useState<SmDecision | null>(null);

  const [searchQ, setSearchQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [madeByFilter, setMadeByFilter] = useState('all');

  const toast = useCallback((msg: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await socialFrom('sm_decisions_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error) setDecisions((data ?? []) as SmDecision[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await socialFrom('sm_decisions_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (!error) setDecisions((data ?? []) as SmDecision[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // real-time: new decisions appear at top
  const channelRef = useRef<ReturnType<typeof import('../../lib/supabase').supabase.channel> | null>(null);
  useEffect(() => {
    import('../../lib/supabase').then(({ supabase }) => {
      const ch = supabase
        .channel('decisions_realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'social', table: 'sm_decisions_log' }, payload => {
          setDecisions(prev => [payload.new as SmDecision, ...prev]);
        })
        .subscribe();
      channelRef.current = ch;
      return () => { supabase.removeChannel(ch); };
    });
  }, []);

  async function handleSeed() {
    if (decisions.length > 0) { toast('Seed data already loaded.', 'info'); return; }
    setSeeding(true);
    try {
      const { error } = await socialFrom('sm_decisions_log').insert(buildDecisionSeeds());
      if (error) throw error;
      await load();
      toast('13 sample decisions loaded!', 'success');
    } catch {
      toast('Failed to load seed data.', 'error');
    } finally {
      setSeeding(false);
    }
  }

  // ── filtering ──────────────────────────────────────────────────────────────

  const filtered = decisions.filter(d => {
    if (typeFilter.length > 0 && !typeFilter.includes(d.decision_type ?? '')) return false;
    if (madeByFilter !== 'all' && d.made_by !== madeByFilter) return false;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      if (!d.title.toLowerCase().includes(q) && !(d.description ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const grouped = groupByDay(filtered);

  // ── unique made_by values for filter ──────────────────────────────────────

  const allMadeBy = [...new Set(decisions.map(d => d.made_by).filter((x): x is string => !!x))];

  // ── stats ─────────────────────────────────────────────────────────────────

  const now = Date.now();
  const thisWeek = decisions.filter(d => now - new Date(d.created_at).getTime() < 7 * 86400000).length;
  const byAdmin = decisions.filter(d => d.made_by === 'admin').length;
  const byBots = decisions.filter(d => d.made_by && d.made_by !== 'admin').length;

  function toggleType(t: string) {
    setTypeFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @keyframes dlPulse  { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes dlSlide  { from{transform:translateX(20px);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes dlSlideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
      <ToastContainer toasts={toasts} />

      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Decisions Log</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>Complete history of all marketing decisions and changes</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => exportCSV(filtered)} disabled={filtered.length === 0} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
          <button onClick={handleSeed} disabled={seeding || loading} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#475569' }}>
            {seeding ? 'Loading…' : 'Load test data'}
          </button>
          {/* view toggle */}
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3, gap: 2 }}>
            {(['timeline', 'table'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: view === v ? '#fff' : 'transparent', color: view === v ? '#0f172a' : '#64748b',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s',
                textTransform: 'capitalize',
              }}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      {/* stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Decisions', value: decisions.length, color: '#4ba6ea' },
          { label: 'This Week', value: thisWeek, color: '#8b5cf6' },
          { label: 'By You (Admin)', value: byAdmin, color: '#10b981' },
          { label: 'By Bots', value: byBots, color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>
              {loading ? <Skeleton h={22} w={40} /> : s.value}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* filters */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            placeholder="Search decisions…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}
          />
          <select value={madeByFilter} onChange={e => setMadeByFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none' }}>
            <option value="all">All Authors</option>
            {allMadeBy.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {/* type chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ALL_TYPES.map(t => {
            const cfg = getTypeConfig(t);
            const active = typeFilter.includes(t);
            return (
              <button key={t} onClick={() => toggleType(t)} style={{
                padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: active ? cfg.bg : '#f1f5f9', color: active ? cfg.color : '#64748b',
                transition: 'all 0.15s', textTransform: 'capitalize',
              }}>
                {cfg.label}
              </button>
            );
          })}
          {typeFilter.length > 0 && (
            <button onClick={() => setTypeFilter([])} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: 'none', background: '#f1f5f9', color: '#64748b' }}>
              Clear ✕
            </button>
          )}
        </div>
        {(searchQ || typeFilter.length > 0 || madeByFilter !== 'all') && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
            Showing {filtered.length} of {decisions.length} decisions
          </div>
        )}
      </div>

      {/* main content */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', gap: 16 }}>
              <Skeleton h={36} w={36} r={999} />
              <div style={{ flex: 1 }}>
                <Skeleton h={80} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, color: '#475569' }}>No decisions found</div>
          <div style={{ fontSize: 13 }}>
            {decisions.length === 0 ? 'Load test data to see the decisions timeline.' : 'Try adjusting your filters or search query.'}
          </div>
        </div>
      ) : view === 'timeline' ? (
        /* ── Timeline view ── */
        <div>
          {grouped.map(group => (
            <div key={group.label} style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                {group.label}
                <span style={{ flex: 1, height: 1, background: '#f1f5f9' }} />
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>{group.items.length} decision{group.items.length !== 1 ? 's' : ''}</span>
              </div>
              {group.items.map(d => (
                <TimelineCard key={d.id} decision={d} onClick={() => setSelected(d)} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        /* ── Table view ── */
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Date / Time', 'Type', 'Title', 'Made By', 'Has Diff', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => {
                  const cfg = getTypeConfig(d.decision_type);
                  return (
                    <tr key={d.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
                      onClick={() => setSelected(d)}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                    >
                      <td style={{ padding: '10px 16px', color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>
                        <div>{new Date(d.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
                        <div>{new Date(d.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#0f172a', maxWidth: 300 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                        {d.description && <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description}</div>}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: d.made_by === 'admin' ? '#4ba6ea' : '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', textTransform: 'uppercase', flexShrink: 0 }}>
                            {(d.made_by ?? 'U').slice(0, 1)}
                          </div>
                          <span style={{ fontSize: 13, color: '#475569', textTransform: 'capitalize' }}>{d.made_by ?? '—'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px', color: '#94a3b8', fontSize: 12 }}>
                        {(d.before_value || d.after_value) ? '✓' : '—'}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 12, color: '#4ba6ea', fontWeight: 600 }}>View →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && <DetailModal decision={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
