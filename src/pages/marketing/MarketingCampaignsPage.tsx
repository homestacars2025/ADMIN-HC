import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../lib/supabase';
import { socialFrom } from '../../lib/socialClient';
import type { SmAdCampaign, SmAdPerformance } from '../../types/marketing';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS: Record<string, { label: string; color: string }> = {
  google_ads:  { label: 'Google Ads',  color: '#4285f4' },
  meta_ads:    { label: 'Meta Ads',    color: '#0866ff' },
  tiktok_ads:  { label: 'TikTok Ads', color: '#010101' },
  youtube_ads: { label: 'YouTube Ads', color: '#ff0000' },
};

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  proposed:  { color: '#d97706', bg: '#fef3c7', border: '#fde68a', label: 'Proposed' },
  approved:  { color: '#4ba6ea', bg: '#eff8ff', border: '#bae6fd', label: 'Approved' },
  launched:  { color: '#059669', bg: '#d1fae5', border: '#6ee7b7', label: 'Launched' },
  paused:    { color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', label: 'Paused' },
  completed: { color: '#8b5cf6', bg: '#f5f3ff', border: '#c4b5fd', label: 'Completed' },
  rejected:  { color: '#ef4444', bg: '#fee2e2', border: '#fca5a5', label: 'Rejected' },
};

const STATUS_TABS = ['all', 'proposed', 'approved', 'launched', 'paused', 'completed', 'rejected'];

const OBJECTIVES: Record<string, string> = {
  awareness:     'Brand Awareness',
  consideration: 'Consideration',
  conversion:    'Conversion',
  retargeting:   'Retargeting',
  app_installs:  'App Installs',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | null, currency = 'USD'): string {
  if (v === null || v === undefined) return '—';
  return `${currency === 'USD' ? '$' : ''}${v.toLocaleString()}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

function calcRoas(perf: SmAdPerformance[]): number | null {
  if (!perf.length) return null;
  const totalSpend = perf.reduce((s, p) => s + p.spend, 0);
  const totalRev = perf.reduce((s, p) => s + (p.revenue ?? 0), 0);
  return totalSpend > 0 ? Math.round((totalRev / totalSpend) * 100) / 100 : null;
}

// ─── Inline SVG Charts ────────────────────────────────────────────────────────

const Sparkline: React.FC<{ data: number[]; color: string; w?: number; h?: number }> = ({ data, color, w = 80, h = 28 }) => {
  if (data.length < 2) return null;
  const max = Math.max(...data); const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastData { id: number; message: string; type: 'success' | 'error' | 'info'; }
const Toast: React.FC<{ t: ToastData }> = ({ t }) =>
  ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 3000, display: 'flex', alignItems: 'center', gap: 10, background: t.type === 'error' ? '#ef4444' : '#0f1117', color: '#fff', borderRadius: 12, padding: '12px 20px', fontSize: 14, fontWeight: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', animation: 'cpSlide 200ms ease' }}>
      {t.type === 'success' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>}
      {t.type === 'error' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>}
      {t.message}
    </div>,
    document.body
  );

const Sk: React.FC<{ w?: number | string; h?: number | string; radius?: number }> = ({ w = '100%', h = 16, radius = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: radius, background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'cpPulse 1.5s ease-in-out infinite' }} />
);

// ─── Seed data ────────────────────────────────────────────────────────────────

function buildCampaignSeeds() {
  const now = new Date();
  const d = (offset: number) => new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10);
  return [
    {
      name: 'Saudi Tourists Summer — Google Search',
      platform: 'google_ads', status: 'proposed', objective: 'conversion',
      proposed_by: 'ads_manager', currency: 'USD',
      proposed_budget: 800, proposed_start_date: d(7), proposed_end_date: d(37),
      why_this_campaign: 'Saudi tourists are the largest Arabic-speaking segment in Istanbul. Google Search captures high-intent "car rental Istanbul" queries from Saudi IP addresses. This campaign will target keywords in Arabic and English with location targeting to KSA + Istanbul tourists.',
      target_audience: { locations: ['Saudi Arabia', 'UAE', 'Kuwait'], languages: ['ar', 'en'], age_range: '25-55', interests: ['travel', 'car rental', 'istanbul tourism'] },
      ad_copies: {
        ar: 'استأجر سيارتك في إسطنبول بأفضل الأسعار! هيونداي بايون من 49$ فقط. حجز فوري.',
        tr: "İstanbul'da Araç Kiralama — En İyi Fiyatlar! Hyundai Bayon $49'dan başlayan fiyatlarla.",
        en: 'Rent a Car in Istanbul — Best Prices! Hyundai Bayon from just $49/day. Book now.',
      },
      landing_page_url: 'https://homestacars.com/en/car-rental-istanbul',
      call_to_action: 'Book Now',
      expected_reach: 45000, expected_clicks: 1800, expected_roas: 3.2,
      recommendations: ['Use Arabic ad copies for Saudi/UAE audiences', 'Bid higher on "car rental istanbul" + "استئجار سيارة اسطنبول"', 'Exclude competitor brand keywords'],
    },
    {
      name: 'Hyundai Bayon Feature — Meta Carousel',
      platform: 'meta_ads', status: 'approved', objective: 'awareness',
      proposed_by: 'ads_manager', currency: 'USD',
      proposed_budget: 350, proposed_start_date: d(3), proposed_end_date: d(17),
      why_this_campaign: 'Bayon is our most popular model. Meta carousel ads showcase multiple car angles and features, ideal for top-of-funnel awareness among Arabic-speaking travelers aged 25-45 who follow Istanbul travel pages.',
      target_audience: { locations: ['Saudi Arabia', 'Egypt', 'Jordan', 'UAE'], languages: ['ar'], age_range: '25-45', interests: ['istanbul', 'travel arab', 'luxury cars'] },
      ad_copies: {
        ar: 'هيونداي بايون 2025 في إسطنبول — تصميم رياضي، أداء ممتاز. استأجر الآن!',
        en: 'Hyundai Bayon 2025 in Istanbul — Sporty design, excellent performance. Rent now!',
      },
      landing_page_url: 'https://homestacars.com/ar/bayon',
      call_to_action: 'Learn More',
      expected_reach: 120000, expected_clicks: 2400, expected_roas: 2.1,
      recommendations: ['A/B test carousel vs single video format', 'Retarget website visitors who viewed Bayon page'],
    },
    {
      name: 'Ramadan Deals — TikTok Spark Ads',
      platform: 'tiktok_ads', status: 'launched', objective: 'conversion',
      proposed_by: 'ads_manager', currency: 'USD',
      proposed_budget: 500, actual_budget: 480,
      proposed_start_date: d(-20), proposed_end_date: d(10),
      actual_start_date: d(-18),
      why_this_campaign: 'Ramadan is peak tourist season for Arab travelers. TikTok Spark Ads boost our existing organic content to a wider paid audience. The creative uses our existing "Ramadan Special" video post which is already performing well organically.',
      target_audience: { locations: ['Turkey', 'Saudi Arabia', 'UAE', 'Qatar'], languages: ['ar'], age_range: '18-40', interests: ['travel', 'halal tourism', 'istanbul'] },
      ad_copies: {
        ar: 'عروض رمضان الخاصة من هومستاكارز — خصم 20% على جميع السيارات طوال الشهر الكريم!',
        en: 'HomestaCars Ramadan Deals — 20% off all cars throughout the holy month!',
      },
      landing_page_url: 'https://homestacars.com/ar/ramadan-offer',
      call_to_action: 'Shop Now',
      expected_reach: 200000, expected_clicks: 3000, expected_roas: 2.8,
    },
    {
      name: 'Istanbul Airport Arrivals — Google Display',
      platform: 'google_ads', status: 'launched', objective: 'consideration',
      proposed_by: 'ads_manager', currency: 'USD',
      proposed_budget: 300, actual_budget: 285,
      proposed_start_date: d(-45), proposed_end_date: d(-5),
      actual_start_date: d(-43), actual_end_date: d(-6),
      why_this_campaign: 'Travelers who just landed in Istanbul are prime targets. Display ads on Google Maps, hotel booking apps, and weather apps target users in IST airport and surroundings immediately post-arrival.',
      target_audience: { locations: ['Istanbul Sabiha', 'Istanbul Ataturk'], languages: ['ar', 'en', 'tr'], age_range: '22-60' },
      ad_copies: { ar: 'وصلت إسطنبول؟ استأجر سيارتك الآن!', en: 'Just landed in Istanbul? Rent your car now — delivery available!' },
      landing_page_url: 'https://homestacars.com/en/airport-delivery',
      call_to_action: 'Rent Now',
      expected_reach: 80000, expected_clicks: 960, expected_roas: 3.5,
    },
    {
      name: 'Q1 Brand Awareness — YouTube Pre-roll',
      platform: 'youtube_ads', status: 'completed', objective: 'awareness',
      proposed_by: 'ads_manager', currency: 'USD',
      proposed_budget: 600, actual_budget: 590,
      proposed_start_date: d(-90), proposed_end_date: d(-60),
      actual_start_date: d(-88), actual_end_date: d(-61),
      why_this_campaign: 'YouTube pre-roll before Istanbul travel content reaches users in the research phase. 15-second unskippable ads with our brand message position HomestaCars as the top choice for Arab tourists.',
      target_audience: { locations: ['Saudi Arabia', 'UAE', 'Kuwait', 'Qatar'], languages: ['ar'], age_range: '25-55', interests: ['istanbul travel', 'car rental', 'turkey tourism'] },
      ad_copies: { ar: 'هومستاكارز — رفيقك في إسطنبول. سيارات حديثة، أسعار شفافة، دعم عربي.' },
      landing_page_url: 'https://homestacars.com',
      call_to_action: 'Visit Site',
      expected_reach: 500000, expected_clicks: 5000, expected_roas: 1.8,
    },
    {
      name: 'Budget Segment Push — Meta Stories',
      platform: 'meta_ads', status: 'rejected', objective: 'conversion',
      proposed_by: 'ads_manager', currency: 'USD',
      proposed_budget: 250,
      why_this_campaign: 'Target budget-conscious tourists with entry-level car promotions on Facebook and Instagram Stories.',
      target_audience: { locations: ['Turkey', 'Egypt'], languages: ['ar', 'tr'], age_range: '18-35' },
      ad_copies: { ar: 'استأجر سيارة في إسطنبول بأقل من 35 دولار يومياً!', en: 'Rent a car in Istanbul for under $35/day!' },
      landing_page_url: 'https://homestacars.com/budget',
      call_to_action: 'Book Now',
      expected_reach: 60000, expected_clicks: 900, expected_roas: 2.0,
      rejection_reason: 'Brand positioning risk — we do not want to compete on price at the budget level. Reject and refocus on mid-range positioning. CMO decision: 2026-05-10.',
    },
  ];
}

function buildPerfSeeds(campaignIds: number[]) {
  const rows: Partial<SmAdPerformance>[] = [];
  const ramadanId = campaignIds[2];
  const airportId = campaignIds[3];
  const youtubeId = campaignIds[4];

  // Ramadan campaign — good ROAS
  for (let i = 18; i >= 1; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const impressions = 8000 + Math.floor(Math.random() * 4000);
    const clicks = Math.floor(impressions * 0.025);
    const spend = Math.round(clicks * 0.38 * 100) / 100;
    const conversions = Math.floor(clicks * 0.04);
    rows.push({ campaign_id: ramadanId, date: d.toISOString().slice(0, 10), impressions, clicks, ctr: Math.round(clicks / impressions * 10000) / 100, cpc: Math.round(spend / clicks * 100) / 100, spend, conversions, revenue: conversions * 48.5, roas: conversions > 0 ? Math.round((conversions * 48.5 / spend) * 100) / 100 : null, reach: Math.floor(impressions * 0.7) });
  }

  // Airport campaign — moderate ROAS (ended)
  for (let i = 43; i >= 6; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const impressions = 2000 + Math.floor(Math.random() * 1500);
    const clicks = Math.floor(impressions * 0.012);
    const spend = Math.round(clicks * 0.55 * 100) / 100;
    const conversions = Math.floor(clicks * 0.035);
    rows.push({ campaign_id: airportId, date: d.toISOString().slice(0, 10), impressions, clicks, ctr: Math.round(clicks / impressions * 10000) / 100, cpc: Math.round(spend / Math.max(1, clicks) * 100) / 100, spend, conversions, revenue: conversions * 65, roas: conversions > 0 ? Math.round((conversions * 65 / Math.max(0.01, spend)) * 100) / 100 : null, reach: Math.floor(impressions * 0.65) });
  }

  // YouTube — low ROAS (awareness)
  for (let i = 88; i >= 61; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const impressions = 15000 + Math.floor(Math.random() * 8000);
    const clicks = Math.floor(impressions * 0.01);
    const spend = Math.round(clicks * 0.7 * 100) / 100;
    const conversions = Math.floor(clicks * 0.01);
    rows.push({ campaign_id: youtubeId, date: d.toISOString().slice(0, 10), impressions, clicks, ctr: Math.round(clicks / impressions * 10000) / 100, cpc: Math.round(spend / Math.max(1, clicks) * 100) / 100, spend, conversions, revenue: conversions * 55, roas: conversions > 0 ? Math.round((conversions * 55 / Math.max(0.01, spend)) * 100) / 100 : null, reach: Math.floor(impressions * 0.9) });
  }

  return rows;
}

// ─── Performance Chart (bar, daily spend/ROAS) ───────────────────────────────

interface PerfChartProps { data: SmAdPerformance[]; metric: 'roas' | 'clicks' | 'spend' | 'impressions'; }
const PerfChart: React.FC<PerfChartProps> = ({ data, metric }) => {
  if (!data.length) return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>No data yet</div>;
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map(d => {
    if (metric === 'roas') return d.roas ?? 0;
    if (metric === 'spend') return d.spend;
    if (metric === 'clicks') return d.clicks;
    return d.impressions;
  });
  const max = Math.max(...values) || 1;
  const w = 400; const h = 80; const barW = Math.max(4, w / sorted.length - 2);
  const color = metric === 'roas' ? '#10b981' : metric === 'spend' ? '#f59e0b' : '#4ba6ea';
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: 80 }}>
      {sorted.map((d, i) => {
        const barH = (values[i] / max) * (h - 10);
        return <rect key={d.id} x={(i / sorted.length) * w} y={h - barH} width={barW} height={barH} rx="2" fill={color} opacity="0.8" />;
      })}
    </svg>
  );
};

// ─── Campaign Detail Modal ────────────────────────────────────────────────────

interface DetailModalProps {
  campaign: SmAdCampaign;
  perf: SmAdPerformance[];
  onClose: () => void;
  onStatusChange: (id: number, status: SmAdCampaign['status']) => void;
  onPerfAdded: (row: SmAdPerformance) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const DetailModal: React.FC<DetailModalProps> = ({ campaign, perf, onClose, onStatusChange, onPerfAdded, showToast }) => {
  const [tab, setTab] = useState<'strategy' | 'audience' | 'creatives' | 'budget' | 'performance'>('strategy');
  const [langTab, setLangTab] = useState<'ar' | 'tr' | 'en'>('ar');
  const [saving, setSaving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [perfForm, setPerfForm] = useState({ date: new Date().toISOString().slice(0, 10), impressions: '', clicks: '', spend: '', conversions: '', revenue: '', notes: '' });
  const [addingPerf, setAddingPerf] = useState(false);

  const st = STATUS_STYLE[campaign.status];
  const roas = calcRoas(perf);
  const totalSpend = perf.reduce((s, p) => s + p.spend, 0);
  const totalConversions = perf.reduce((s, p) => s + p.conversions, 0);
  const totalImpressions = perf.reduce((s, p) => s + p.impressions, 0);
  const totalClicks = perf.reduce((s, p) => s + p.clicks, 0);
  const audience = campaign.target_audience as Record<string, unknown> | null;

  const changeStatus = async (newStatus: SmAdCampaign['status'], extra: Record<string, unknown> = {}) => {
    setSaving(true);
    const update: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString(), ...extra };
    if (newStatus === 'launched' && !campaign.actual_start_date) update.actual_start_date = new Date().toISOString().slice(0, 10);
    if (['completed', 'paused'].includes(newStatus) && !campaign.actual_end_date) update.actual_end_date = new Date().toISOString().slice(0, 10);
    const { error } = await socialFrom('sm_ad_campaigns').update(update).eq('id', campaign.id);
    setSaving(false);
    if (error) { showToast('Status update failed', 'error'); return; }
    if (newStatus === 'approved') {
      await socialFrom('sm_approvals_queue').insert({ title: `Campaign: ${campaign.name}`, item_type: 'ad_campaign', status: 'pending', priority: 'normal', bot_who_created: campaign.proposed_by, content: `Platform: ${campaign.platform}\nBudget: ${fmtCurrency(campaign.proposed_budget)}\nObjective: ${campaign.objective}`, reasoning: campaign.why_this_campaign, linked_item_id: campaign.id, linked_table: 'sm_ad_campaigns' });
    }
    onStatusChange(campaign.id, newStatus);
    showToast(`Campaign ${newStatus}`, 'success');
    onClose();
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    await changeStatus('rejected', { rejection_reason: rejectReason.trim() });
  };

  const handleAddPerf = async () => {
    if (!perfForm.date || !perfForm.spend) { showToast('Date and spend are required', 'error'); return; }
    setAddingPerf(true);
    const clicks = parseInt(perfForm.clicks) || 0;
    const impressions = parseInt(perfForm.impressions) || 0;
    const spend = parseFloat(perfForm.spend) || 0;
    const conversions = parseInt(perfForm.conversions) || 0;
    const revenue = parseFloat(perfForm.revenue) || null;
    const row = {
      campaign_id: campaign.id, date: perfForm.date, impressions, clicks,
      ctr: impressions ? Math.round(clicks / impressions * 10000) / 100 : null,
      cpc: clicks ? Math.round(spend / clicks * 100) / 100 : null,
      spend, conversions, revenue,
      roas: revenue && spend ? Math.round(revenue / spend * 100) / 100 : null,
      notes: perfForm.notes || null,
    };
    const { data, error } = await socialFrom('sm_ad_performance').insert(row).select().single();
    setAddingPerf(false);
    if (error) { showToast('Failed to save metrics', 'error'); return; }
    showToast('Metrics saved', 'success');
    onPerfAdded(data as SmAdPerformance);
    setPerfForm({ date: new Date().toISOString().slice(0, 10), impressions: '', clicks: '', spend: '', conversions: '', revenue: '', notes: '' });
  };

  const inputS: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 8, fontFamily: 'inherit', outline: 'none', color: '#0f1117', transition: 'border-color 140ms', background: '#fff' };

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.55)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 860, height: '92vh', boxShadow: '0 32px 80px rgba(0,0,0,0.2)', animation: 'cpSlideUp 200ms ease', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117' }}>{campaign.name}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: PLATFORMS[campaign.platform ?? '']?.color ?? '#6b7280', fontWeight: 600 }}>{PLATFORMS[campaign.platform ?? '']?.label ?? campaign.platform ?? 'Unknown Platform'}</span>
                <span style={{ padding: '2px 8px', borderRadius: 20, background: st.bg, border: `1px solid ${st.border}`, fontSize: 11, fontWeight: 600, color: st.color }}>{st.label}</span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Proposed by {campaign.proposed_by} · {timeAgo(campaign.created_at)}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>

          {/* Action buttons by status */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {campaign.status === 'proposed' && <>
              <button onClick={() => changeStatus('approved')} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: saving ? '#e5e7eb' : '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>Approve & Queue</button>
              <button onClick={() => setRejectOpen(true)} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fca5a5', background: '#fff', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Reject</button>
            </>}
            {campaign.status === 'approved' && <>
              <button onClick={() => changeStatus('launched')} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: saving ? '#e5e7eb' : '#059669', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>Mark as Launched</button>
              <button onClick={() => changeStatus('rejected')} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fca5a5', background: '#fff', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </>}
            {campaign.status === 'launched' && <>
              <button onClick={() => changeStatus('paused')} disabled={saving} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}>Pause</button>
              <button onClick={() => changeStatus('completed')} disabled={saving} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #c4b5fd', background: '#f5f3ff', color: '#8b5cf6', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>Mark Complete</button>
              <button onClick={() => setTab('performance')} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #6ee7b7', background: '#d1fae5', color: '#059669', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add Daily Metrics</button>
            </>}
            {campaign.status === 'paused' && (
              <button onClick={() => changeStatus('launched')} disabled={saving} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>Resume</button>
            )}
          </div>

          {/* Reject modal */}
          {rejectOpen && (
            <div style={{ marginTop: 12, background: '#fef2f2', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#7f1d1d', marginBottom: 8 }}>Rejection reason</div>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2} placeholder="Why is this campaign being rejected?" style={{ ...inputS, resize: 'none' }} onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#ef4444'; }} onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#e5e7eb'; }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => setRejectOpen(false)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Cancel</button>
                <button onClick={handleReject} disabled={!rejectReason.trim() || saving} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: rejectReason.trim() && !saving ? '#ef4444' : '#fca5a5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: rejectReason.trim() && !saving ? 'pointer' : 'not-allowed' }}>Confirm Reject</button>
              </div>
            </div>
          )}

          {campaign.status === 'rejected' && campaign.rejection_reason && (
            <div style={{ marginTop: 10, background: '#fee2e2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#7f1d1d' }}>
              <b>Rejection reason:</b> {campaign.rejection_reason}
            </div>
          )}
        </div>

        {/* Tab nav */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', flexShrink: 0, overflowX: 'auto' }}>
          {(['strategy', 'audience', 'creatives', 'budget', 'performance'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '12px 20px', border: 'none', background: 'none', fontSize: 13, fontWeight: 600, color: tab === t ? '#4ba6ea' : '#6b7280', cursor: 'pointer', borderBottom: tab === t ? '2px solid #4ba6ea' : '2px solid transparent', transition: 'all 140ms ease', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {tab === 'strategy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Objective</div>
                <span style={{ padding: '4px 12px', borderRadius: 20, background: '#eff8ff', border: '1px solid #bae6fd', fontSize: 13, fontWeight: 600, color: '#4ba6ea' }}>{OBJECTIVES[campaign.objective ?? ''] ?? campaign.objective ?? '—'}</span>
              </div>
              {campaign.why_this_campaign && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Why This Campaign</div>
                  <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.65, background: '#f9fafb', borderRadius: 12, padding: '14px 16px' }}>{campaign.why_this_campaign}</div>
                </div>
              )}
              {campaign.recommendations && campaign.recommendations.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Bot Recommendations</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {campaign.recommendations.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 13, color: '#374151', alignItems: 'flex-start' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea', marginTop: 5, flexShrink: 0 }} />
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  { label: 'Expected Reach', val: campaign.expected_reach?.toLocaleString() ?? '—' },
                  { label: 'Expected Clicks', val: campaign.expected_clicks?.toLocaleString() ?? '—' },
                  { label: 'Expected ROAS', val: campaign.expected_roas != null ? `${campaign.expected_roas}×` : '—' },
                ].map(({ label, val }) => (
                  <div key={label} style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#0f1117' }}>{val}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'audience' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {audience ? (
                <>
                  {audience['locations'] && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Target Locations</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(audience['locations'] as string[]).map((loc: string) => (
                          <span key={loc} style={{ padding: '5px 12px', borderRadius: 20, background: '#eff8ff', border: '1px solid #bae6fd', fontSize: 13, color: '#4ba6ea', fontWeight: 500 }}>{loc}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {audience['age_range'] && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Age Range</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#0f1117' }}>{String(audience['age_range'])} years</div>
                    </div>
                  )}
                  {audience['languages'] && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Languages</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(audience['languages'] as string[]).map((l: string) => <span key={l} style={{ padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', fontSize: 12, fontWeight: 600, color: '#374151' }}>{l.toUpperCase()}</span>)}
                      </div>
                    </div>
                  )}
                  {audience['interests'] && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Interests</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(audience['interests'] as string[]).map((int: string) => <span key={int} style={{ padding: '3px 10px', borderRadius: 20, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 12, color: '#059669' }}>{int}</span>)}
                      </div>
                    </div>
                  )}
                </>
              ) : <div style={{ color: '#9ca3af', fontSize: 14 }}>No audience details available</div>}
            </div>
          )}

          {tab === 'creatives' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Lang tabs */}
              <div style={{ display: 'flex', border: '1.5px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', width: 'fit-content' }}>
                {(['ar', 'tr', 'en'] as const).map(lang => (
                  <button key={lang} onClick={() => setLangTab(lang)} style={{ padding: '7px 20px', border: 'none', background: langTab === lang ? '#4ba6ea' : '#fff', color: langTab === lang ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{lang.toUpperCase()}</button>
                ))}
              </div>
              <div style={{ background: '#f9fafb', borderRadius: 14, padding: '16px 18px', border: '1.5px solid #f0f0f0' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Ad Copy</div>
                <div style={{ fontSize: 15, color: '#0f1117', lineHeight: 1.6, direction: langTab === 'ar' ? 'rtl' : 'ltr', minHeight: 60 }}>
                  {campaign.ad_copies?.[langTab] || <span style={{ color: '#d1d5db' }}>No copy in {langTab.toUpperCase()}</span>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Landing Page</div>
                  {campaign.landing_page_url ? (
                    <a href={campaign.landing_page_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#4ba6ea', wordBreak: 'break-all', textDecoration: 'none' }}>{campaign.landing_page_url}</a>
                  ) : <span style={{ fontSize: 13, color: '#9ca3af' }}>Not set</span>}
                </div>
                <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Call to Action</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117' }}>{campaign.call_to_action ?? '—'}</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'budget' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Proposed Budget', val: fmtCurrency(campaign.proposed_budget, campaign.currency), color: '#4ba6ea' },
                  { label: 'Actual Budget', val: fmtCurrency(campaign.actual_budget, campaign.currency), color: campaign.actual_budget ? '#059669' : '#9ca3af' },
                  { label: 'Proposed Start', val: fmtDate(campaign.proposed_start_date), color: '#6b7280' },
                  { label: 'Proposed End', val: fmtDate(campaign.proposed_end_date), color: '#6b7280' },
                  { label: 'Actual Start', val: fmtDate(campaign.actual_start_date), color: '#059669' },
                  { label: 'Actual End', val: fmtDate(campaign.actual_end_date), color: '#059669' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
                  </div>
                ))}
              </div>
              {campaign.proposed_budget && campaign.actual_budget && (
                <div style={{ padding: '14px 16px', background: campaign.actual_budget <= campaign.proposed_budget ? '#d1fae5' : '#fee2e2', borderRadius: 12, fontSize: 14, color: campaign.actual_budget <= campaign.proposed_budget ? '#065f46' : '#7f1d1d', fontWeight: 500 }}>
                  {campaign.actual_budget <= campaign.proposed_budget
                    ? `✓ On budget — ${Math.round((1 - campaign.actual_budget / campaign.proposed_budget) * 100)}% under proposed budget`
                    : `⚠ Over budget — ${Math.round((campaign.actual_budget / campaign.proposed_budget - 1) * 100)}% above proposed`}
                </div>
              )}
            </div>
          )}

          {tab === 'performance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: 'Total Spent', val: fmtCurrency(totalSpend, campaign.currency), color: '#f59e0b' },
                  { label: 'Impressions', val: totalImpressions.toLocaleString(), color: '#4ba6ea' },
                  { label: 'Clicks', val: totalClicks.toLocaleString(), color: '#8b5cf6' },
                  { label: 'ROAS', val: roas != null ? `${roas}×` : '—', color: roas && roas >= 2 ? '#059669' : '#ef4444' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color }}>{val}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Chart */}
              {perf.length > 0 && (
                <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Daily Spend</div>
                  <PerfChart data={perf} metric="spend" />
                </div>
              )}

              {/* Manual entry form */}
              {['launched', 'paused'].includes(campaign.status) && (
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117', marginBottom: 14 }}>Add Daily Metrics</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                    {[
                      { key: 'date', label: 'Date', type: 'date' },
                      { key: 'impressions', label: 'Impressions', type: 'number' },
                      { key: 'clicks', label: 'Clicks', type: 'number' },
                      { key: 'spend', label: 'Spend ($)', type: 'number' },
                      { key: 'conversions', label: 'Conversions', type: 'number' },
                      { key: 'revenue', label: 'Revenue ($)', type: 'number' },
                    ].map(({ key, label, type }) => (
                      <div key={key}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
                        <input type={type} value={perfForm[key as keyof typeof perfForm]} onChange={e => setPerfForm(p => ({ ...p, [key]: e.target.value }))} style={inputS} onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }} onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Notes</label>
                    <input value={perfForm.notes} onChange={e => setPerfForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes…" style={inputS} onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }} onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
                  </div>
                  <button onClick={handleAddPerf} disabled={addingPerf || !perfForm.spend} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: (addingPerf || !perfForm.spend) ? '#e5e7eb' : '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: (addingPerf || !perfForm.spend) ? 'not-allowed' : 'pointer' }}>
                    {addingPerf ? 'Saving…' : 'Save Metrics'}
                  </button>
                </div>
              )}

              {perf.length === 0 && !['launched', 'paused'].includes(campaign.status) && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 14 }}>No performance data yet. Launch the campaign to start tracking metrics.</div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const MarketingCampaignsPage: React.FC = () => {
  const [campaigns, setCampaigns] = useState<SmAdCampaign[]>([]);
  const [perfMap, setPerfMap] = useState<Record<number, SmAdPerformance[]>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [selected, setSelected] = useState<SmAdCampaign | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const showToast = useCallback((msg: string, type: ToastData['type'] = 'info') => {
    const id = Date.now();
    setToasts(p => [...p, { id, message: msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    const { data: c } = await socialFrom('sm_ad_campaigns').select('*').order('created_at', { ascending: false });
    const campaigns = (c as SmAdCampaign[]) ?? [];
    setCampaigns(campaigns);
    if (campaigns.length) {
      const { data: p } = await socialFrom('sm_ad_performance').select('*').in('campaign_id', campaigns.map(c => c.id));
      const map: Record<number, SmAdPerformance[]> = {};
      (p as SmAdPerformance[] ?? []).forEach(row => { if (!map[row.campaign_id]) map[row.campaign_id] = []; map[row.campaign_id].push(row); });
      setPerfMap(map);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    const ch = supabase.channel('campaigns-rt')
      .on('postgres_changes', { event: '*', schema: 'social', table: 'sm_ad_campaigns' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const handleSeedData = async () => {
    setSeeding(true);
    const seeds = buildCampaignSeeds();
    const { data, error } = await socialFrom('sm_ad_campaigns').insert(seeds as Partial<SmAdCampaign>[]).select('id');
    if (error || !data) { showToast('Seed failed: ' + (error?.message ?? 'unknown'), 'error'); setSeeding(false); return; }
    const ids = (data as { id: number }[]).map(r => r.id);
    const perfRows = buildPerfSeeds(ids);
    if (perfRows.length) await socialFrom('sm_ad_performance').insert(perfRows as Partial<SmAdPerformance>[]);
    setSeeding(false);
    showToast('Test campaigns loaded!', 'success');
    load();
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: campaigns.length };
    campaigns.forEach(c2 => { c[c2.status] = (c[c2.status] ?? 0) + 1; });
    return c;
  }, [campaigns]);

  const filtered = useMemo(() => campaigns.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (platformFilter !== 'all' && c.platform !== platformFilter) return false;
    return true;
  }), [campaigns, statusFilter, platformFilter]);

  const stats = useMemo(() => {
    const active = campaigns.filter(c => c.status === 'launched').length;
    const proposed = campaigns.filter(c => c.status === 'proposed').length;
    const allPerf = Object.values(perfMap).flat();
    const totalSpent = campaigns.filter(c => ['launched', 'completed'].includes(c.status)).reduce((s, c) => s + (c.actual_budget ?? 0), 0);
    const totalRev = allPerf.reduce((s, p) => s + (p.revenue ?? 0), 0);
    const totalSpend = allPerf.reduce((s, p) => s + p.spend, 0);
    const avgRoas = totalSpend > 0 ? Math.round(totalRev / totalSpend * 100) / 100 : null;
    return { active, proposed, totalSpent, avgRoas };
  }, [campaigns, perfMap]);

  const handleStatusChange = (id: number, status: SmAdCampaign['status']) => {
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  };

  const handlePerfAdded = (row: SmAdPerformance) => {
    setPerfMap(prev => ({ ...prev, [row.campaign_id]: [...(prev[row.campaign_id] ?? []), row] }));
  };

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        @keyframes cpPulse { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes cpSlide { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes cpSlideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {toasts.map(t => <Toast key={t.id} t={t} />)}
      {selected && (
        <DetailModal campaign={selected} perf={perfMap[selected.id] ?? []} onClose={() => setSelected(null)} onStatusChange={handleStatusChange} onPerfAdded={handlePerfAdded} showToast={showToast} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f1117', margin: 0 }}>Ad Campaigns</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0 0' }}>Bot-proposed campaigns — review, approve, and track performance</p>
        </div>
        <button onClick={() => showToast('New campaign proposals come from the Ads Manager bot. Use the Approvals page to review incoming proposals.', 'info')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
          + New Proposal
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Active Campaigns', value: stats.active, color: '#059669', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> },
          { label: 'Pending Approval', value: stats.proposed, color: '#d97706', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> },
          { label: 'Total Spent', value: `$${stats.totalSpent.toLocaleString()}`, color: '#4ba6ea', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><line x1="12" y1="1" x2="12" y2="23" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> },
          { label: 'Avg ROAS', value: stats.avgRoas != null ? `${stats.avgRoas}×` : '—', color: stats.avgRoas && stats.avgRoas >= 2 ? '#059669' : '#9ca3af', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="17 6 23 6 23 12" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1.5px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
              {icon}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 2 }}>
        {STATUS_TABS.map(tab => {
          const active = statusFilter === tab;
          const st = STATUS_STYLE[tab];
          return (
            <button key={tab} onClick={() => setStatusFilter(tab)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: `1.5px solid ${active ? (st?.border ?? '#4ba6ea') : '#e5e7eb'}`, background: active ? (st?.bg ?? '#eff8ff') : '#fff', fontSize: 13, fontWeight: 600, color: active ? (st?.color ?? '#4ba6ea') : '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 140ms ease', flexShrink: 0 }}>
              {tab === 'all' ? 'All' : (STATUS_STYLE[tab]?.label ?? tab)}
              <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 20, background: active ? (st?.color ?? '#4ba6ea') : '#e5e7eb', color: active ? '#fff' : '#6b7280', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{counts[tab] ?? 0}</span>
            </button>
          );
        })}
        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} style={{ marginLeft: 'auto', padding: '7px 12px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 10, fontFamily: 'inherit', outline: 'none', color: '#374151', background: '#fff', cursor: 'pointer' }}>
          <option value="all">All Platforms</option>
          {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Campaign list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => <Sk key={i} h={90} radius={14} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#9ca3af' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.4 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>{campaigns.length === 0 ? 'No campaigns yet' : 'No matching campaigns'}</div>
          {campaigns.length === 0 && (
            <button onClick={handleSeedData} disabled={seeding} style={{ marginTop: 12, padding: '9px 20px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: seeding ? 'not-allowed' : 'pointer' }}>
              {seeding ? 'Loading…' : 'Load test data'}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(c => {
            const st = STATUS_STYLE[c.status];
            const perf = perfMap[c.id] ?? [];
            const roas = calcRoas(perf);
            const isHov = hoveredId === c.id;
            const sparkData = [...perf].sort((a, b) => a.date.localeCompare(b.date)).map(p => p.spend);
            const platColor = PLATFORMS[c.platform ?? '']?.color ?? '#9ca3af';
            return (
              <div key={c.id} onClick={() => setSelected(c)} onMouseEnter={() => setHoveredId(c.id)} onMouseLeave={() => setHoveredId(null)}
                style={{ background: '#fff', borderRadius: 14, padding: '18px 22px', border: `1.5px solid ${isHov ? '#d1e9ff' : '#f0f0f0'}`, cursor: 'pointer', transition: 'all 150ms ease', boxShadow: isHov ? '0 6px 20px rgba(75,166,234,0.1)' : '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                {/* Platform dot */}
                <div style={{ width: 40, height: 40, borderRadius: 10, background: platColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: platColor }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1117', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: platColor, fontWeight: 600 }}>{PLATFORMS[c.platform ?? '']?.label ?? c.platform ?? '—'}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 20, background: st.bg, border: `1px solid ${st.border}`, fontSize: 11, fontWeight: 600, color: st.color }}>{st.label}</span>
                    {c.objective && <span style={{ fontSize: 12, color: '#9ca3af' }}>{OBJECTIVES[c.objective] ?? c.objective}</span>}
                  </div>
                </div>

                {/* Budget */}
                <div style={{ textAlign: 'center', minWidth: 80 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1117' }}>{fmtCurrency(c.actual_budget ?? c.proposed_budget)}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{c.actual_budget ? 'actual' : 'proposed'}</div>
                </div>

                {/* ROAS */}
                <div style={{ textAlign: 'center', minWidth: 60 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: roas && roas >= 2 ? '#059669' : roas ? '#d97706' : '#9ca3af' }}>{roas != null ? `${roas}×` : '—'}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>ROAS</div>
                </div>

                {/* Sparkline */}
                {sparkData.length > 1 && (
                  <div style={{ opacity: 0.7 }}>
                    <Sparkline data={sparkData} color="#4ba6ea" />
                  </div>
                )}

                {/* Dates */}
                <div style={{ textAlign: 'right', minWidth: 100 }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{fmtDate(c.actual_start_date ?? c.proposed_start_date)}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{fmtDate(c.actual_end_date ?? c.proposed_end_date)}</div>
                </div>

                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: '#d1d5db', flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MarketingCampaignsPage;
