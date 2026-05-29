import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { socialFrom } from '../../lib/socialClient';
import type { SmPerformanceAnalysis } from '../../types/marketing';

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: dec });
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMonth(s: string) {
  return new Date(s + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ─── inline chart components ─────────────────────────────────────────────────

function Sparkline({ data, color = '#4ba6ea', h = 36, w = 80 }: { data: number[]; color?: string; h?: number; w?: number }) {
  if (data.length < 2) return <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface LineChartData { label: string; revenue: number; posts: number; }

function LineChart({ data, h = 200 }: { data: LineChartData[]; h?: number }) {
  if (data.length === 0) return <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>No data</div>;
  const w = 500;
  const pad = { top: 12, right: 16, bottom: 32, left: 60 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;

  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  const maxPosts = Math.max(...data.map(d => d.posts), 1);

  const revPts = data.map((d, i) => {
    const x = pad.left + (i / (data.length - 1)) * innerW;
    const y = pad.top + (1 - d.revenue / maxRev) * innerH;
    return `${x},${y}`;
  }).join(' ');

  const postPts = data.map((d, i) => {
    const x = pad.left + (i / (data.length - 1)) * innerW;
    const y = pad.top + (1 - d.posts / maxPosts) * innerH;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxWidth: w, display: 'block' }}>
        {/* y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const y = pad.top + (1 - t) * innerH;
          return (
            <g key={t}>
              <line x1={pad.left} y1={y} x2={pad.left + innerW} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                {fmt(maxRev * t, 0)}
              </text>
            </g>
          );
        })}
        {/* x-axis labels */}
        {data.map((d, i) => {
          const x = pad.left + (i / (data.length - 1)) * innerW;
          return (
            <text key={i} x={x} y={h - 6} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {d.label}
            </text>
          );
        })}
        {/* lines */}
        <polyline points={revPts} fill="none" stroke="#4ba6ea" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={postPts} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2" />
      </svg>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
          <div style={{ width: 16, height: 3, background: '#4ba6ea', borderRadius: 2 }} /> Revenue (TRY)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
          <div style={{ width: 16, height: 2, background: '#10b981', borderRadius: 2, borderTop: '1px dashed #10b981' }} /> Posts
        </div>
      </div>
    </div>
  );
}

interface BarChartData { label: string; value: number; color?: string; }

function BarChart({ data, h = 160, unit = '' }: { data: BarChartData[]; h?: number; unit?: string }) {
  if (data.length === 0) return <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>No data</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: h, minWidth: data.length * 56, paddingBottom: 28 }}>
        {data.map((d, i) => {
          const barH = ((d.value / max) * (h - 36));
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%' }}>
              <div style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>{unit}{fmt(d.value, 0)}</div>
              <div style={{
                width: '100%', height: barH, borderRadius: '4px 4px 0 0',
                background: d.color ?? '#4ba6ea', transition: 'height 0.4s ease', minHeight: 2,
              }} />
              <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', lineHeight: 1.2, position: 'absolute', bottom: 2, width: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeatmapCell({ value, max }: { value: number; max: number }) {
  const intensity = max > 0 ? value / max : 0;
  const bg = intensity === 0 ? '#f8fafc' :
    intensity < 0.25 ? '#dbeafe' :
    intensity < 0.5 ? '#93c5fd' :
    intensity < 0.75 ? '#3b82f6' : '#1d4ed8';
  const fg = intensity > 0.5 ? '#fff' : '#334155';
  return (
    <div style={{ background: bg, color: fg, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 40, borderRadius: 4 }}>
      {value > 0 ? value : '—'}
    </div>
  );
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
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'pfSlide 0.3s ease',
        }}>{t.msg}</div>
      ))}
    </div>,
    document.body,
  );
}

function Skeleton({ h = 20, w = '100%', r = 6 }: { h?: number; w?: string | number; r?: number }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: '#f1f5f9', animation: 'pfPulse 1.5s ease-in-out infinite' }} />;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

function buildAnalysisSeeds(): Omit<SmPerformanceAnalysis, 'id'>[] {
  return [
    {
      title: 'Q1 2026 Marketing Performance Report',
      analysis_type: 'quarterly',
      period_start: '2026-01-01', period_end: '2026-03-31',
      total_reach: 284000, total_engagements: 18400,
      avg_engagement_rate: 6.5, new_followers: 1240,
      posts_published: 48, revenue: 124500, bookings_count: 83,
      strengths: ['Strong Arabic content engagement', 'Instagram Reels performing 2× above industry avg', 'High conversion from Gulf tourist segment'],
      weaknesses: ['TikTok presence underperforming', 'Blog SEO not driving traffic yet', 'Ad campaigns not yet launched'],
      market_position: 'Mid-premium niche player, strong in Arabic-speaking tourist segment. Growing but well below Otokoç and Sixt in overall volume.',
      recommendations: ['Launch TikTok content strategy', 'Invest in 3 Arabic blog posts/month', 'Test Google Ads for Gulf tourists'],
      detailed_report: null,
      generated_at: '2026-04-05T10:00:00Z',
    },
    {
      title: 'April 2026 Monthly Snapshot',
      analysis_type: 'monthly',
      period_start: '2026-04-01', period_end: '2026-04-30',
      total_reach: 98000, total_engagements: 6200,
      avg_engagement_rate: 6.3, new_followers: 310,
      posts_published: 18, revenue: 48200, bookings_count: 31,
      strengths: ['Eid al-Fitr campaign exceeded engagement targets', 'Instagram Stories 40% higher reach than March'],
      weaknesses: ['Revenue dipped mid-month during holiday', 'Post frequency dropped Week 3'],
      market_position: null,
      recommendations: ['Plan Eid campaigns 4 weeks ahead', 'Maintain 5 posts/week minimum during holidays'],
      detailed_report: null,
      generated_at: '2026-05-02T09:00:00Z',
    },
  ];
}

// ─── raw "live" metrics built from seed social posts ─────────────────────────

interface MonthlyMetric { month: string; revenue: number; posts: number; reach: number; bookings: number; }

function generateMonthlyMetrics(): MonthlyMetric[] {
  const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04'];
  const base = [32000, 38000, 44000, 29000, 41000, 55000, 68000, 48200];
  const bkgs = [22, 25, 28, 19, 26, 36, 44, 31];
  const posts = [10, 12, 14, 8, 14, 16, 18, 18];
  const reach = [38000, 52000, 61000, 34000, 72000, 95000, 112000, 98000];
  return months.map((m, i) => ({ month: m, revenue: base[i], posts: posts[i], reach: reach[i], bookings: bkgs[i] }));
}

interface PlatformPostCount { platform: string; contentType: string; count: number; }

function generateHeatmapData(): PlatformPostCount[] {
  const platforms = ['Instagram', 'TikTok', 'Facebook', 'YouTube'];
  const contentTypes = ['Reels/Video', 'Static Image', 'Story', 'Carousel'];
  const counts = [
    [14, 4, 6, 8],
    [8, 0, 0, 0],
    [0, 6, 3, 4],
    [2, 0, 0, 0],
  ];
  const rows: PlatformPostCount[] = [];
  platforms.forEach((p, pi) => {
    contentTypes.forEach((ct, ci) => {
      rows.push({ platform: p, contentType: ct, count: counts[pi][ci] });
    });
  });
  return rows;
}

interface TopPost { title: string; platform: string; likes: number; comments: number; views: number; }

function generateTopPosts(): TopPost[] {
  return [
    { title: 'Bosphorus Weekend Drive — BMW 5 Series', platform: 'Instagram', likes: 1840, comments: 124, views: 32000 },
    { title: 'تجربة قيادة في إسطنبول 🇹🇷', platform: 'Instagram', likes: 1560, comments: 98, views: 28400 },
    { title: 'Eid al-Fitr Fleet Special', platform: 'Facebook', likes: 920, comments: 67, views: 14200 },
    { title: 'How We Detail Every Car Before Pickup', platform: 'TikTok', likes: 3400, comments: 212, views: 84000 },
    { title: 'Top 5 Day Trips from Istanbul by Car', platform: 'Instagram', likes: 1120, comments: 89, views: 22000 },
  ];
}

// ─── Report detail modal ──────────────────────────────────────────────────────

function ReportModal({ report: r, onClose }: { report: SmPerformanceAnalysis; onClose: () => void }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'pfSlideUp 0.3s ease' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{r.title}</h2>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              {r.analysis_type} · {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Reach', value: fmt(r.total_reach) },
              { label: 'Engagements', value: fmt(r.total_engagements) },
              { label: 'Eng. Rate', value: r.avg_engagement_rate != null ? `${r.avg_engagement_rate}%` : '—' },
              { label: 'New Followers', value: fmt(r.new_followers) },
              { label: 'Posts', value: fmt(r.posts_published) },
              { label: 'Revenue', value: r.revenue != null ? `₺${fmt(r.revenue)}` : '—' },
            ].map(k => (
              <div key={k.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {r.strengths && r.strengths.length > 0 && (
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: 8 }}>Strengths</div>
                {r.strengths.map((s, i) => <div key={i} style={{ fontSize: 13, color: '#065f46', marginBottom: 6 }}>• {s}</div>)}
              </div>
            )}
            {r.weaknesses && r.weaknesses.length > 0 && (
              <div style={{ background: '#fff1f2', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', marginBottom: 8 }}>Weaknesses</div>
                {r.weaknesses.map((w, i) => <div key={i} style={{ fontSize: 13, color: '#991b1b', marginBottom: 6 }}>• {w}</div>)}
              </div>
            )}
            {r.recommendations && r.recommendations.length > 0 && (
              <div style={{ background: '#fffbeb', borderRadius: 10, padding: 14, gridColumn: '1/-1' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 8 }}>Recommendations</div>
                {r.recommendations.map((rec, i) => <div key={i} style={{ fontSize: 13, color: '#78350f', marginBottom: 6 }}>• {rec}</div>)}
              </div>
            )}
            {r.market_position && (
              <div style={{ background: '#f0f9ff', borderRadius: 10, padding: 14, gridColumn: '1/-1' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0ea5e9', textTransform: 'uppercase', marginBottom: 8 }}>Market Position</div>
                <div style={{ fontSize: 13, color: '#0c4a6e', lineHeight: 1.6 }}>{r.market_position}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Period = '3m' | '6m' | '12m' | 'all';

export default function MarketingPerformancePage() {
  const [analyses, setAnalyses] = useState<SmPerformanceAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [period, setPeriod] = useState<Period>('6m');
  const [selectedReport, setSelectedReport] = useState<SmPerformanceAnalysis | null>(null);

  const toast = useCallback((msg: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await socialFrom('sm_performance_analysis').select('*').order('generated_at', { ascending: false });
      if (cancelled) return;
      if (!error) setAnalyses((data ?? []) as SmPerformanceAnalysis[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSeed() {
    if (analyses.length > 0) { toast('Seed data already loaded.', 'info'); return; }
    setSeeding(true);
    try {
      const { error } = await socialFrom('sm_performance_analysis').insert(buildAnalysisSeeds());
      if (error) throw error;
      const { data } = await socialFrom('sm_performance_analysis').select('*').order('generated_at', { ascending: false });
      setAnalyses((data ?? []) as SmPerformanceAnalysis[]);
      toast('Performance reports loaded!', 'success');
    } catch {
      toast('Failed to load seed data.', 'error');
    } finally {
      setSeeding(false);
    }
  }

  // ── derived data ───────────────────────────────────────────────────────────

  const monthlyMetrics = useMemo(() => {
    const all = generateMonthlyMetrics();
    const cutoff: Record<Period, number> = { '3m': 3, '6m': 6, '12m': 12, all: 99 };
    return all.slice(-cutoff[period]);
  }, [period]);

  const heatmapData = useMemo(() => generateHeatmapData(), []);
  const topPosts = useMemo(() => generateTopPosts(), []);

  const platforms = ['Instagram', 'TikTok', 'Facebook', 'YouTube'];
  const contentTypes = ['Reels/Video', 'Static Image', 'Story', 'Carousel'];

  const heatmapMax = Math.max(...heatmapData.map(d => d.count));

  const lineData = monthlyMetrics.map(m => ({ label: fmtMonth(m.month), revenue: m.revenue, posts: m.posts }));

  const topPostBars: BarChartData[] = topPosts.map((p, i) => ({
    label: p.title.slice(0, 12) + '…',
    value: p.likes,
    color: ['#4ba6ea', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'][i],
  }));

  // KPI summary from most recent monthly data
  const latest = monthlyMetrics[monthlyMetrics.length - 1];
  const prev = monthlyMetrics[monthlyMetrics.length - 2];
  const change = (curr: number, previous: number) => {
    if (!previous) return null;
    return ((curr - previous) / previous * 100).toFixed(0);
  };

  const totalRevenue = monthlyMetrics.reduce((s, m) => s + m.revenue, 0);
  const totalPosts = monthlyMetrics.reduce((s, m) => s + m.posts, 0);
  const totalReach = monthlyMetrics.reduce((s, m) => s + m.reach, 0);
  const totalBookings = monthlyMetrics.reduce((s, m) => s + m.bookings, 0);

  const latestReport = analyses[0];

  const reachSparkData = monthlyMetrics.map(m => m.reach);
  const revSparkData = monthlyMetrics.map(m => m.revenue);
  const postSparkData = monthlyMetrics.map(m => m.posts);
  const bookingSparkData = monthlyMetrics.map(m => m.bookings);

  const revenueChange = latest && prev ? change(latest.revenue, prev.revenue) : null;
  const reachChange = latest && prev ? change(latest.reach, prev.reach) : null;

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @keyframes pfPulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes pfSlide { from{transform:translateX(20px);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes pfSlideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
      <ToastContainer toasts={toasts} />

      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Performance</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>Marketing KPIs, analytics, and reports</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* period selector */}
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3, gap: 2 }}>
            {(['3m', '6m', '12m', 'all'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: period === p ? '#fff' : 'transparent',
                color: period === p ? '#0f172a' : '#64748b',
                boxShadow: period === p ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}>{p === 'all' ? 'All' : p.toUpperCase()}</button>
            ))}
          </div>
          <button onClick={handleSeed} disabled={seeding || loading} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#475569',
            opacity: seeding ? 0.6 : 1,
          }}>{seeding ? 'Loading...' : 'Load test data'}</button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Revenue', value: `₺${fmt(totalRevenue)}`, spark: revSparkData, color: '#4ba6ea', change: revenueChange, icon: '💰' },
          { label: 'Total Reach', value: fmt(totalReach), spark: reachSparkData, color: '#8b5cf6', change: reachChange, icon: '👁' },
          { label: 'Posts Published', value: fmt(totalPosts), spark: postSparkData, color: '#10b981', change: null, icon: '📱' },
          { label: 'Bookings (attributed)', value: fmt(totalBookings), spark: bookingSparkData, color: '#f59e0b', change: null, icon: '🚗' },
          { label: 'Avg Engagement Rate', value: latestReport ? `${latestReport.avg_engagement_rate ?? '—'}%` : '6.5%', spark: [], color: '#ef4444', change: null, icon: '📈' },
          { label: 'New Followers', value: latestReport ? fmt(latestReport.new_followers) : '—', spark: [], color: '#06b6d4', change: null, icon: '👥' },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontSize: 20 }}>{k.icon}</div>
              {k.change !== null && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                  background: Number(k.change) >= 0 ? '#dcfce7' : '#fee2e2',
                  color: Number(k.change) >= 0 ? '#166534' : '#991b1b',
                }}>
                  {Number(k.change) >= 0 ? '+' : ''}{k.change}%
                </span>
              )}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color, marginBottom: 4 }}>
              {loading ? <Skeleton h={24} w={80} /> : k.value}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{k.label}</div>
            {k.spark.length > 1 && <Sparkline data={k.spark} color={k.color} />}
          </div>
        ))}
      </div>

      {/* charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* revenue vs posts line chart */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>Revenue vs Content Output</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Monthly trend</div>
          <LineChart data={lineData} h={180} />
        </div>

        {/* bookings bar chart */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>Monthly Bookings</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Attributed to marketing</div>
          <BarChart
            data={monthlyMetrics.map((m, i) => ({ label: fmtMonth(m.month), value: m.bookings, color: i === monthlyMetrics.length - 1 ? '#f59e0b' : '#fde68a' }))}
            h={180}
          />
        </div>
      </div>

      {/* heatmap + top posts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* content heatmap */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>Content Mix Heatmap</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Platform × content type (post count)</div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 340 }}>
              {/* header row */}
              <div style={{ display: 'grid', gridTemplateColumns: `100px repeat(${contentTypes.length}, 1fr)`, gap: 4, marginBottom: 4 }}>
                <div />
                {contentTypes.map(ct => (
                  <div key={ct} style={{ fontSize: 10, color: '#64748b', textAlign: 'center', lineHeight: 1.3 }}>{ct}</div>
                ))}
              </div>
              {/* data rows */}
              {platforms.map(platform => (
                <div key={platform} style={{ display: 'grid', gridTemplateColumns: `100px repeat(${contentTypes.length}, 1fr)`, gap: 4, marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', fontWeight: 600 }}>{platform}</div>
                  {contentTypes.map(ct => {
                    const cell = heatmapData.find(d => d.platform === platform && d.contentType === ct);
                    return <HeatmapCell key={ct} value={cell?.count ?? 0} max={heatmapMax} />;
                  })}
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>Low</div>
            {['#f8fafc', '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8'].map(c => (
              <div key={c} style={{ width: 20, height: 12, background: c, borderRadius: 2 }} />
            ))}
            <div style={{ fontSize: 10, color: '#94a3b8' }}>High</div>
          </div>
        </div>

        {/* top posts */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>Top Performing Posts</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Ranked by likes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topPosts.map((p, i) => {
              const barColors = ['#4ba6ea', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'];
              const maxLikes = Math.max(...topPosts.map(x => x.likes));
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: '#334155', flex: 1, marginRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.title}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>❤️ {fmt(p.likes)}</span>
                  </div>
                  <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(p.likes / maxLikes) * 100}%`, height: '100%', background: barColors[i], borderRadius: 4, transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
                    <span>{p.platform}</span>
                    <span>👁 {fmt(p.views)}</span>
                    <span>💬 {fmt(p.comments)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* insights section */}
      {latestReport && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0369a1' }}>Latest Insights</div>
              <div style={{ fontSize: 12, color: '#0284c7', marginTop: 2 }}>From {latestReport.title}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {latestReport.strengths && latestReport.strengths.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: 8 }}>✅ Strengths</div>
                {latestReport.strengths.map((s, i) => <div key={i} style={{ fontSize: 13, color: '#065f46', marginBottom: 6 }}>• {s}</div>)}
              </div>
            )}
            {latestReport.weaknesses && latestReport.weaknesses.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', marginBottom: 8 }}>⚠️ Weaknesses</div>
                {latestReport.weaknesses.map((w, i) => <div key={i} style={{ fontSize: 13, color: '#991b1b', marginBottom: 6 }}>• {w}</div>)}
              </div>
            )}
            {latestReport.recommendations && latestReport.recommendations.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 8 }}>🎯 Action Items</div>
                {latestReport.recommendations.map((r, i) => <div key={i} style={{ fontSize: 13, color: '#78350f', marginBottom: 6 }}>• {r}</div>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* reports list */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Analysis Reports</div>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{analyses.length} reports</span>
        </div>
        <div style={{ padding: 20 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2].map(i => <Skeleton key={i} h={80} />)}
            </div>
          ) : analyses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No reports yet</div>
              <div style={{ fontSize: 13 }}>Load test data to see performance reports</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {analyses.map(r => (
                <div key={r.id} onClick={() => setSelectedReport(r)} style={{
                  border: '1px solid #e2e8f0', borderRadius: 10, padding: 16,
                  cursor: 'pointer', transition: 'all 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      {r.analysis_type} · {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#4ba6ea' }}>₺{fmt(r.revenue)}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Revenue</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#8b5cf6' }}>{r.avg_engagement_rate ?? '—'}%</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Engagement</div>
                    </div>
                    <span style={{ fontSize: 12, color: '#4ba6ea', fontWeight: 600, whiteSpace: 'nowrap' }}>View →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedReport && <ReportModal report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </div>
  );
}
