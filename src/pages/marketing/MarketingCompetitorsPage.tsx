import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { socialFrom } from '../../lib/socialClient';
import type {
  SmCompetitor,
  SmCompetitorPricing,
  SmCompetitorPost,
  SmCompetitorReport,
} from '../../types/marketing';

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: dec });
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function threatColor(level: SmCompetitor['threat_level']) {
  const map: Record<string, string> = {
    low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444',
  };
  return map[level] ?? '#6b7280';
}

function platformIcon(platform: string | null): React.ReactNode {
  const p = (platform ?? '').toLowerCase();
  if (p.includes('instagram')) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  );
  if (p.includes('tiktok')) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.3 6.3 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.74a4.85 4.85 0 01-1.01-.05z"/>
    </svg>
  );
  if (p.includes('facebook')) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
    </svg>
  );
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  );
}

// ─── seed data ────────────────────────────────────────────────────────────────

function buildCompetitorSeeds(): Omit<SmCompetitor, 'id' | 'created_at' | 'updated_at'>[] {
  return [
    {
      name: 'Sixt Türkiye', name_ar: 'سيكست تركيا',
      website: 'https://www.sixt.com.tr', logo_url: null,
      threat_level: 'high', is_active: true,
      founded_year: 2008, fleet_size_estimate: 850,
      target_market: 'luxury', locations: ['Şişli', 'Kadıköy', 'Beşiktaş', 'Airport'],
      target_audience: ['Business travelers', 'Luxury tourists', 'Corporate clients'],
      notes: 'Strong brand recognition, premium pricing. Focus on airport locations.',
      social_profiles: { instagram: '@sixtturkiye', facebook: 'SixtTurkiye' },
      added_by: 'competitor_monitor',
    },
    {
      name: 'Otokoç Otomotiv', name_ar: 'أوتوكوج',
      website: 'https://www.otokoc.com.tr', logo_url: null,
      threat_level: 'critical', is_active: true,
      founded_year: 1928, fleet_size_estimate: 3200,
      target_market: 'all', locations: ['Istanbul', 'Ankara', 'Izmir', 'Antalya', 'Nationwide'],
      target_audience: ['All segments', 'Domestic travelers', 'Long-term renters'],
      notes: 'Largest rental company in Turkey. Massive fleet, aggressive pricing, strong brand.',
      social_profiles: { instagram: '@otokoc', facebook: 'OtokocOtomotiv' },
      added_by: 'competitor_monitor',
    },
    {
      name: 'Garenta', name_ar: 'غارنتا',
      website: 'https://www.garenta.com.tr', logo_url: null,
      threat_level: 'medium', is_active: true,
      founded_year: 2012, fleet_size_estimate: 420,
      target_market: 'budget', locations: ['Şişli', 'Bakırköy', 'Kadıköy'],
      target_audience: ['Budget travelers', 'Young drivers', 'Local residents'],
      notes: 'Strong digital marketing, competitive budget pricing. Growing Instagram presence.',
      social_profiles: { instagram: '@garenta', tiktok: '@garenta_tr' },
      added_by: 'competitor_monitor',
    },
    {
      name: 'Yes! Yes! Car Rental', name_ar: 'يس يس لتأجير السيارات',
      website: 'https://www.yesyes.com.tr', logo_url: null,
      threat_level: 'medium', is_active: true,
      founded_year: 2015, fleet_size_estimate: 280,
      target_market: 'mid-range', locations: ['Şişli', 'Fatih', 'Sultanahmet'],
      target_audience: ['Arab tourists', 'Gulf visitors', 'Mid-range travelers'],
      notes: 'Very popular with Arab tourists. Arabic-speaking staff. Aggressive social media in Arabic.',
      social_profiles: { instagram: '@yesyescarrental', facebook: 'YesYesCarRental' },
      added_by: 'competitor_monitor',
    },
    {
      name: 'Smarty Car Rental', name_ar: 'سمارتي لتأجير السيارات',
      website: 'https://www.smartycar.com.tr', logo_url: null,
      threat_level: 'low', is_active: true,
      founded_year: 2019, fleet_size_estimate: 95,
      target_market: 'budget', locations: ['Şişli', 'Beyoğlu'],
      target_audience: ['Arab tourists', 'Budget-conscious visitors', 'Short-term renters'],
      notes: 'Small but growing. Targets Arab tourists on a budget. Active on TikTok.',
      social_profiles: { instagram: '@smartycarrental', tiktok: '@smartycar_tr' },
      added_by: 'competitor_monitor',
    },
  ];
}

function buildPricingSeeds(ids: number[]): Omit<SmCompetitorPricing, 'id'>[] {
  const rows: Omit<SmCompetitorPricing, 'id'>[] = [];
  const cats = [
    { make: 'Toyota', model: 'Corolla', year: 2023, category: 'Economy' },
    { make: 'Volkswagen', model: 'Golf', year: 2023, category: 'Compact' },
    { make: 'Toyota', model: 'RAV4', year: 2024, category: 'SUV' },
    { make: 'BMW', model: '5 Series', year: 2023, category: 'Luxury' },
    { make: 'Renault', model: 'Clio', year: 2024, category: 'Economy' },
    { make: 'Ford', model: 'Focus', year: 2023, category: 'Compact' },
    { make: 'Mercedes', model: 'C-Class', year: 2024, category: 'Luxury' },
    { make: 'Hyundai', model: 'Tucson', year: 2024, category: 'SUV' },
  ];
  const basePrice: Record<string, number> = { Economy: 900, Compact: 1200, SUV: 1800, Luxury: 3500 };
  const multipliers = [1.3, 1.0, 0.85, 0.9, 0.75]; // per competitor

  ids.forEach((cid, ci) => {
    const count = ci === 1 ? 8 : ci === 0 ? 7 : 5;
    cats.slice(0, count).forEach(car => {
      const base = basePrice[car.category] ?? 1000;
      const price = Math.round(base * multipliers[ci] * (0.9 + Math.random() * 0.2));
      rows.push({
        competitor_id: cid,
        car_make: car.make, car_model: car.model, car_year: car.year,
        category: car.category,
        daily_price: price, currency: 'TRY',
        source_url: null, is_current: true,
        notes: ci === 0 ? 'Premium insurance included' : ci === 1 ? 'Economy rate, basic insurance' : null,
        collected_at: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
      });
    });
  });
  return rows;
}

function buildPostSeeds(ids: number[]): Omit<SmCompetitorPost, 'id'>[] {
  const rows: Omit<SmCompetitorPost, 'id'>[] = [];
  const platforms = ['Instagram', 'TikTok', 'Facebook'];

  const templates = [
    { caption: '🚗 Premium drive through the Bosphorus! Book your dream car today.', strategy: 'Lifestyle appeal', analysis: 'Strong visual storytelling, high engagement from aspirational content.' },
    { caption: 'Special weekend offer — 20% OFF all bookings! Limited time only. 🔥', strategy: 'Discount promotion', analysis: 'Price-based CTA. High click rate but may attract low-value customers.' },
    { caption: 'Traveling to Istanbul? We have 1,200+ cars ready for you. No hidden fees!', strategy: 'Trust building', analysis: 'Transparency messaging targeting international tourists.' },
    { caption: 'تجربة قيادة لا تُنسى في إسطنبول 🇹🇷 احجز الآن بأفضل الأسعار', strategy: 'Arabic market targeting', analysis: 'Arabic language post targeting Gulf tourists directly.' },
    { caption: 'Airport pickup in 15 minutes. That\'s the Sixt promise. ✈️', strategy: 'Service differentiation', analysis: 'Operational USP messaging, targets business travelers.' },
  ];

  ids.forEach((cid, ci) => {
    const count = ci < 2 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const t = templates[(ci * 2 + i) % templates.length];
      const views = Math.round(5000 + Math.random() * 50000);
      const likes = Math.round(views * (0.04 + Math.random() * 0.06));
      const comments = Math.round(likes * (0.05 + Math.random() * 0.1));
      const shares = Math.round(likes * (0.02 + Math.random() * 0.05));
      rows.push({
        competitor_id: cid,
        platform: platforms[i % platforms.length],
        post_url: null,
        caption: t.caption,
        media_urls: null,
        views, likes, comments, shares,
        engagement_rate: parseFloat(((likes + comments + shares) / views * 100).toFixed(2)),
        is_winning: likes > 2000,
        posted_at: new Date(Date.now() - (i + 1) * 5 * 86400000).toISOString(),
        collected_at: new Date().toISOString(),
        bot_analysis: t.analysis,
        detected_strategy: t.strategy,
        learning_notes: i === 0 ? `This format outperforms our average by ${Math.round(20 + Math.random() * 40)}%. Consider adapting.` : null,
        related_content_id: null,
      });
    }
  });
  return rows;
}

function buildReportSeeds(ids: number[]): Omit<SmCompetitorReport, 'id'>[] {
  const rows: Omit<SmCompetitorReport, 'id'>[] = [];
  ids.slice(0, 3).forEach((cid, ci) => {
    rows.push({
      competitor_id: cid,
      title: ['Sixt Q1 2026 Competitive Analysis', 'Otokoç Market Dominance Report', 'Garenta Digital Strategy Breakdown'][ci],
      report_type: 'quarterly',
      period_start: '2026-01-01', period_end: '2026-03-31',
      summary: [
        'Sixt continues to dominate the luxury segment with strong airport presence. Their social media ROI is 2.3× higher than industry average.',
        'Otokoç holds 38% market share in Istanbul. New budget tier launched in March threatens our mid-range positioning.',
        'Garenta\'s TikTok strategy achieved 1.2M views in Q1. Their discount-first approach is driving volume over margin.',
      ][ci],
      key_findings: [
        ['Airport dominance with 6 locations', 'Premium pricing 40% above market', '2.3× social ROI'],
        ['38% Istanbul market share', 'New ₺750/day budget tier', 'Corporate contracts with 12 Fortune 500'],
        ['1.2M TikTok views Q1', 'CAC 40% below industry', 'Flash sale strategy drives 60% of bookings'],
      ][ci],
      threats: [
        ['May undercut our luxury positioning', 'Strong brand recall among business travelers'],
        ['New budget tier overlaps our economy offering', 'Nationwide presence we can\'t match'],
        ['Price wars may force us to discount', 'Their CAC advantage is structural'],
      ][ci],
      opportunities: [
        ['Their weakness: no Arabic service', 'We can win Arab tourist segment they ignore'],
        ['Their weakness: impersonal service', 'We win on experience and personalization'],
        ['Their weakness: low-end fleet only', 'We win on fleet quality and premium segment'],
      ][ci],
      recommendations: [
        ['Invest in Arabic content', 'Target Sixt\'s gaps in Gulf tourist segment', 'Differentiate on personalized service'],
        ['Strengthen loyalty program', 'Focus on quality over volume', 'Target niche segments they ignore'],
        ['Don\'t match their pricing', 'Emphasize fleet quality', 'Compete on reliability and trust'],
      ][ci],
      metrics: { social_engagement_rate: [4.2, 2.8, 5.1][ci], fleet_utilization: [0.87, 0.91, 0.74][ci] },
      full_report: null,
      generated_at: new Date(Date.now() - ci * 7 * 86400000).toISOString(),
    });
  });
  return rows;
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
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'cpSlide 0.3s ease',
        }}>{t.msg}</div>
      ))}
    </div>,
    document.body,
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ h = 20, w = '100%', r = 6 }: { h?: number; w?: string | number; r?: number }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: '#f1f5f9', animation: 'cpPulse 1.5s ease-in-out infinite' }} />;
}

// ─── Company Detail Modal ─────────────────────────────────────────────────────

interface CompanyDetailProps {
  competitor: SmCompetitor;
  pricing: SmCompetitorPricing[];
  posts: SmCompetitorPost[];
  reports: SmCompetitorReport[];
  onClose: () => void;
}

function CompanyDetailModal({ competitor: c, pricing, posts, reports, onClose }: CompanyDetailProps) {
  const [tab, setTab] = useState<'overview' | 'pricing' | 'posts' | 'reports'>('overview');

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'pricing', label: `Pricing (${pricing.length})` },
    { key: 'posts', label: `Posts (${posts.length})` },
    { key: 'reports', label: `Reports (${reports.length})` },
  ] as const;

  const myAvgByCategory: Record<string, number> = { Economy: 900, Compact: 1200, SUV: 1800, Luxury: 3500 };

  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 780, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'cpSlideUp 0.3s ease' }} onClick={e => e.stopPropagation()}>

        {/* header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{c.name}</h2>
                <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', background: threatColor(c.threat_level) + '20', color: threatColor(c.threat_level) }}>
                  {c.threat_level} threat
                </span>
                {!c.is_active && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: '#f1f5f9', color: '#64748b' }}>Inactive</span>}
              </div>
              {c.name_ar && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{c.name_ar}</div>}
              {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#4ba6ea', textDecoration: 'none' }}>{c.website}</a>}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8', lineHeight: 1 }}>✕</button>
          </div>

          {/* meta row */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Founded', value: c.founded_year ?? '—' },
              { label: 'Fleet', value: c.fleet_size_estimate ? `~${c.fleet_size_estimate} cars` : '—' },
              { label: 'Market', value: c.target_market ?? '—' },
              { label: 'Locations', value: (c.locations ?? []).length > 0 ? `${(c.locations ?? []).length} cities` : '—' },
            ].map(m => (
              <div key={m.label}>
                <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{String(m.value)}</div>
              </div>
            ))}
          </div>

          {/* tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 16px', fontSize: 13, fontWeight: 600,
                color: tab === t.key ? '#4ba6ea' : '#64748b',
                borderBottom: tab === t.key ? '2px solid #4ba6ea' : '2px solid transparent',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {c.notes && (
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Notes</div>
                  <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.6 }}>{c.notes}</div>
                </div>
              )}
              {(c.locations ?? []).length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Locations</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(c.locations ?? []).map(l => (
                      <span key={l} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: '#e0f2fe', color: '#0369a1' }}>{l}</span>
                    ))}
                  </div>
                </div>
              )}
              {(c.target_audience ?? []).length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Target Audience</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(c.target_audience ?? []).map(a => (
                      <span key={a} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: '#fef3c7', color: '#92400e' }}>{a}</span>
                    ))}
                  </div>
                </div>
              )}
              {c.social_profiles && Object.keys(c.social_profiles).length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Social Profiles</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(c.social_profiles).map(([k, v]) => (
                      <span key={k} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: '#f1f5f9', color: '#475569' }}>
                        <strong style={{ textTransform: 'capitalize' }}>{k}:</strong> {v}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'pricing' && (
            <div>
              {pricing.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No pricing data collected yet.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['Car', 'Category', 'Year', 'Daily (TRY)', 'vs Our Rate', 'Collected'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pricing.map(p => {
                        const myRate = p.category ? myAvgByCategory[p.category] : null;
                        const diff = myRate && p.daily_price ? ((p.daily_price - myRate) / myRate * 100) : null;
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{p.car_make} {p.car_model}</td>
                            <td style={{ padding: '10px 12px', color: '#64748b' }}>{p.category}</td>
                            <td style={{ padding: '10px 12px', color: '#64748b' }}>{p.car_year}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>₺{fmt(p.daily_price)}</td>
                            <td style={{ padding: '10px 12px' }}>
                              {diff !== null ? (
                                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: diff > 0 ? '#dcfce7' : '#fee2e2', color: diff > 0 ? '#166534' : '#991b1b' }}>
                                  {diff > 0 ? '+' : ''}{diff.toFixed(0)}%
                                </span>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 12 }}>{fmtDate(p.collected_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {pricing[0]?.notes && (
                    <div style={{ marginTop: 12, padding: 10, background: '#fef9c3', borderRadius: 8, fontSize: 12, color: '#713f12' }}>
                      Note: {pricing[0].notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'posts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {posts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No posts collected yet.</div>
              ) : posts.map(p => (
                <div key={p.id} style={{ background: '#f8fafc', borderRadius: 10, padding: 16, border: p.is_winning ? '1px solid #4ba6ea' : '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#4ba6ea' }}>{platformIcon(p.platform)}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{p.platform}</span>
                      {p.is_winning && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8' }}>⭐ Winning</span>}
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDate(p.posted_at)}</span>
                  </div>
                  <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, marginBottom: 10 }}>{p.caption}</div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b', marginBottom: p.bot_analysis ? 10 : 0 }}>
                    <span>👁 {fmt(p.views)}</span>
                    <span>❤️ {fmt(p.likes)}</span>
                    <span>💬 {fmt(p.comments)}</span>
                    <span>🔁 {fmt(p.shares)}</span>
                    {p.engagement_rate != null && <span>📈 {p.engagement_rate}%</span>}
                  </div>
                  {p.detected_strategy && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: '#ede9fe', color: '#5b21b6' }}>Strategy: {p.detected_strategy}</span>
                    </div>
                  )}
                  {p.bot_analysis && (
                    <div style={{ background: '#fff', borderRadius: 8, padding: 10, fontSize: 12, color: '#475569', borderLeft: '3px solid #4ba6ea' }}>
                      <strong>Bot Analysis:</strong> {p.bot_analysis}
                    </div>
                  )}
                  {p.learning_notes && (
                    <div style={{ marginTop: 8, background: '#fefce8', borderRadius: 8, padding: 10, fontSize: 12, color: '#713f12', borderLeft: '3px solid #facc15' }}>
                      <strong>Learning:</strong> {p.learning_notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'reports' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {reports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No reports generated yet.</div>
              ) : reports.map(r => (
                <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: '#f8fafc', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>
                        {r.report_type} · {fmtDate(r.period_start)} – {fmtDate(r.period_end)} · Generated {fmtDate(r.generated_at)}
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: 16 }}>
                    {r.summary && <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, marginBottom: 12 }}>{r.summary}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {r.key_findings && r.key_findings.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', marginBottom: 6 }}>Key Findings</div>
                          {r.key_findings.map((f, i) => <div key={i} style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>• {f}</div>)}
                        </div>
                      )}
                      {r.opportunities && r.opportunities.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: 6 }}>Our Opportunities</div>
                          {r.opportunities.map((o, i) => <div key={i} style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>• {o}</div>)}
                        </div>
                      )}
                      {r.threats && r.threats.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', marginBottom: 6 }}>Threats</div>
                          {r.threats.map((t, i) => <div key={i} style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>• {t}</div>)}
                        </div>
                      )}
                      {r.recommendations && r.recommendations.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 6 }}>Recommendations</div>
                          {r.recommendations.map((rec, i) => <div key={i} style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>• {rec}</div>)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type MainTab = 'companies' | 'pricing' | 'posts' | 'reports';

export default function MarketingCompetitorsPage() {
  const [tab, setTab] = useState<MainTab>('companies');
  const [competitors, setCompetitors] = useState<SmCompetitor[]>([]);
  const [allPricing, setAllPricing] = useState<SmCompetitorPricing[]>([]);
  const [allPosts, setAllPosts] = useState<SmCompetitorPost[]>([]);
  const [allReports, setAllReports] = useState<SmCompetitorReport[]>([]);

  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [selectedCompetitor, setSelectedCompetitor] = useState<SmCompetitor | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [threatFilter, setThreatFilter] = useState<string>('all');
  const [marketFilter, setMarketFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchQ, setSearchQ] = useState('');

  const toast = useCallback((msg: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [compRes, pricRes, postRes, repRes] = await Promise.all([
      socialFrom('sm_competitors').select('*').order('threat_level', { ascending: false }).order('name'),
      socialFrom('sm_competitor_pricing').select('*').order('collected_at', { ascending: false }),
      socialFrom('sm_competitor_posts').select('*').order('posted_at', { ascending: false }),
      socialFrom('sm_competitor_reports').select('*').order('generated_at', { ascending: false }),
    ]);
    if (!compRes.error) setCompetitors((compRes.data ?? []) as SmCompetitor[]);
    if (!pricRes.error) setAllPricing((pricRes.data ?? []) as SmCompetitorPricing[]);
    if (!postRes.error) setAllPosts((postRes.data ?? []) as SmCompetitorPost[]);
    if (!repRes.error) setAllReports((repRes.data ?? []) as SmCompetitorReport[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [compRes, pricRes, postRes, repRes] = await Promise.all([
        socialFrom('sm_competitors').select('*').order('name'),
        socialFrom('sm_competitor_pricing').select('*').order('collected_at', { ascending: false }),
        socialFrom('sm_competitor_posts').select('*').order('posted_at', { ascending: false }),
        socialFrom('sm_competitor_reports').select('*').order('generated_at', { ascending: false }),
      ]);
      if (cancelled) return;
      if (!compRes.error) setCompetitors((compRes.data ?? []) as SmCompetitor[]);
      if (!pricRes.error) setAllPricing((pricRes.data ?? []) as SmCompetitorPricing[]);
      if (!postRes.error) setAllPosts((postRes.data ?? []) as SmCompetitorPost[]);
      if (!repRes.error) setAllReports((repRes.data ?? []) as SmCompetitorReport[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSeed() {
    if (competitors.length > 0) { toast('Seed data already loaded.', 'info'); return; }
    setSeeding(true);
    try {
      const compSeeds = buildCompetitorSeeds();
      const { data: inserted, error: ce } = await socialFrom('sm_competitors').insert(compSeeds).select('id');
      if (ce || !inserted) throw ce ?? new Error('Insert failed');
      const ids = (inserted as { id: number }[]).map(r => r.id);

      const [pe, poe, re] = await Promise.all([
        socialFrom('sm_competitor_pricing').insert(buildPricingSeeds(ids)),
        socialFrom('sm_competitor_posts').insert(buildPostSeeds(ids)),
        socialFrom('sm_competitor_reports').insert(buildReportSeeds(ids)),
      ]);
      if (pe.error || poe.error || re.error) throw pe.error ?? poe.error ?? re.error;
      toast('Seed data loaded successfully!', 'success');
      load();
    } catch (err) {
      toast('Failed to load seed data.', 'error');
    } finally {
      setSeeding(false);
    }
  }

  // ── filtered data ──────────────────────────────────────────────────────────

  const filteredCompetitors = competitors.filter(c => {
    if (threatFilter !== 'all' && c.threat_level !== threatFilter) return false;
    if (marketFilter !== 'all' && c.target_market !== marketFilter) return false;
    if (searchQ && !c.name.toLowerCase().includes(searchQ.toLowerCase()) && !(c.name_ar ?? '').includes(searchQ)) return false;
    return true;
  });

  const competitorMap = Object.fromEntries(competitors.map(c => [c.id, c]));

  const filteredPricing = allPricing.filter(p => {
    if (threatFilter !== 'all') {
      const comp = competitorMap[p.competitor_id];
      if (!comp || comp.threat_level !== threatFilter) return false;
    }
    return true;
  });

  const filteredPosts = allPosts.filter(p => {
    if (platformFilter !== 'all' && (p.platform ?? '').toLowerCase() !== platformFilter) return false;
    return true;
  });

  // ── derived stats ──────────────────────────────────────────────────────────

  const criticalCount = competitors.filter(c => c.threat_level === 'critical').length;
  const highCount = competitors.filter(c => c.threat_level === 'high').length;
  const winningPosts = allPosts.filter(p => p.is_winning).length;
  const avgEngagement = allPosts.length > 0
    ? (allPosts.reduce((s, p) => s + (p.engagement_rate ?? 0), 0) / allPosts.length).toFixed(1)
    : '—';

  // group pricing by category for comparison
  const pricingByCategory: Record<string, { competitor: string; price: number; cid: number }[]> = {};
  allPricing.filter(p => p.is_current).forEach(p => {
    const cat = p.category ?? 'Other';
    if (!pricingByCategory[cat]) pricingByCategory[cat] = [];
    const comp = competitorMap[p.competitor_id];
    if (comp) pricingByCategory[cat].push({ competitor: comp.name, price: p.daily_price ?? 0, cid: p.competitor_id });
  });

  const myRates: Record<string, number> = { Economy: 900, Compact: 1200, SUV: 1800, Luxury: 3500 };

  const platforms = [...new Set(allPosts.map(p => (p.platform ?? '').toLowerCase()).filter(Boolean))];

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @keyframes cpPulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes cpSlide { from{transform:translateX(20px);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes cpSlideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
      <ToastContainer toasts={toasts} />

      {/* page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Competitors</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>Market intelligence & competitive analysis</p>
        </div>
        <button onClick={handleSeed} disabled={seeding || loading} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
          background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#475569',
          opacity: seeding ? 0.6 : 1, transition: 'all 0.15s',
        }}>
          {seeding ? 'Loading...' : 'Load test data'}
        </button>
      </div>

      {/* stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Competitors', value: competitors.length, color: '#4ba6ea', icon: '🏢' },
          { label: 'Critical Threats', value: criticalCount, color: '#ef4444', icon: '🚨' },
          { label: 'High Threats', value: highCount, color: '#f97316', icon: '⚠️' },
          { label: 'Posts Tracked', value: allPosts.length, color: '#8b5cf6', icon: '📱' },
          { label: 'Winning Posts', value: winningPosts, color: '#10b981', icon: '⭐' },
          { label: 'Avg Engagement', value: `${avgEngagement}%`, color: '#f59e0b', icon: '📈' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>
              {loading ? <Skeleton h={24} w={60} /> : s.value}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* main tabs */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 16px', overflowX: 'auto' }}>
          {([
            { key: 'companies', label: 'Companies', count: competitors.length },
            { key: 'pricing', label: 'Pricing Intelligence', count: allPricing.length },
            { key: 'posts', label: 'Content & Posts', count: allPosts.length },
            { key: 'reports', label: 'Reports', count: allReports.length },
          ] as { key: MainTab; label: string; count: number }[]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '14px 16px', fontSize: 13, fontWeight: 600,
              color: tab === t.key ? '#4ba6ea' : '#64748b',
              borderBottom: tab === t.key ? '2px solid #4ba6ea' : '2px solid transparent',
              transition: 'all 0.15s', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t.label}
              {t.count > 0 && (
                <span style={{ padding: '1px 7px', borderRadius: 20, fontSize: 11, background: tab === t.key ? '#dbeafe' : '#f1f5f9', color: tab === t.key ? '#1d4ed8' : '#64748b' }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ padding: 20 }}>

          {/* ── Tab 1: Companies ──────────────────────────────────────────── */}
          {tab === 'companies' && (
            <div>
              {/* filters */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <input
                  placeholder="Search competitors…"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  style={{ flex: 1, minWidth: 160, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}
                />
                <select value={threatFilter} onChange={e => setThreatFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none' }}>
                  <option value="all">All Threats</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <select value={marketFilter} onChange={e => setMarketFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none' }}>
                  <option value="all">All Markets</option>
                  <option value="luxury">Luxury</option>
                  <option value="mid-range">Mid-Range</option>
                  <option value="budget">Budget</option>
                  <option value="all">All Segments</option>
                </select>
              </div>

              {loading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {[1, 2, 3].map(i => <div key={i} style={{ background: '#f8fafc', borderRadius: 12, padding: 20, height: 200, animation: 'cpPulse 1.5s ease-in-out infinite' }} />)}
                </div>
              ) : filteredCompetitors.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No competitors found</div>
                  <div style={{ fontSize: 13 }}>Load test data or adjust filters</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {filteredCompetitors.map(c => {
                    const compPosts = allPosts.filter(p => p.competitor_id === c.id);
                    const compPricing = allPricing.filter(p => p.competitor_id === c.id);
                    const avgEngage = compPosts.length > 0
                      ? (compPosts.reduce((s, p) => s + (p.engagement_rate ?? 0), 0) / compPosts.length).toFixed(1)
                      : null;
                    return (
                      <div key={c.id} onClick={() => setSelectedCompetitor(c)} style={{
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20,
                        cursor: 'pointer', transition: 'all 0.15s',
                        borderTop: `3px solid ${threatColor(c.threat_level)}`,
                      }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{c.name}</div>
                            {c.name_ar && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{c.name_ar}</div>}
                          </div>
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', background: threatColor(c.threat_level) + '20', color: threatColor(c.threat_level), whiteSpace: 'nowrap' }}>
                            {c.threat_level}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                          {[
                            { label: 'Fleet', value: c.fleet_size_estimate ? `~${c.fleet_size_estimate}` : '—' },
                            { label: 'Market', value: c.target_market ?? '—' },
                            { label: 'Posts', value: compPosts.length },
                            { label: 'Avg Engage', value: avgEngage ? `${avgEngage}%` : '—' },
                          ].map(m => (
                            <div key={m.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
                              <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{m.value}</div>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>
                            {compPricing.length} prices · {allReports.filter(r => r.competitor_id === c.id).length} reports
                          </span>
                          <span style={{ fontSize: 12, color: '#4ba6ea', fontWeight: 600 }}>View details →</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tab 2: Pricing Intelligence ──────────────────────────────── */}
          {tab === 'pricing' && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <select value={threatFilter} onChange={e => setThreatFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none' }}>
                  <option value="all">All Competitors</option>
                  <option value="critical">Critical Threats</option>
                  <option value="high">High Threats</option>
                  <option value="medium">Medium Threats</option>
                  <option value="low">Low Threats</option>
                </select>
              </div>

              {/* pricing comparison by category */}
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[1, 2, 3].map(i => <Skeleton key={i} h={80} />)}
                </div>
              ) : Object.entries(pricingByCategory).length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>💰</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No pricing data</div>
                  <div style={{ fontSize: 13 }}>Load test data to see pricing comparisons</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {Object.entries(pricingByCategory).sort().map(([cat, rows]) => {
                    const myRate = myRates[cat];
                    const allRates = [...rows.map(r => r.price), ...(myRate ? [myRate] : [])];
                    const maxRate = Math.max(...allRates);
                    const sorted = [...rows].sort((a, b) => a.price - b.price);
                    return (
                      <div key={cat} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ background: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{cat}</span>
                          <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{rows.length} competitors</span>
                        </div>
                        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {/* our rate */}
                          {myRate && (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#4ba6ea' }}>HomestaCars (us)</span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#4ba6ea' }}>₺{fmt(myRate)}</span>
                              </div>
                              <div style={{ height: 10, background: '#dbeafe', borderRadius: 5, overflow: 'hidden' }}>
                                <div style={{ width: `${(myRate / maxRate) * 100}%`, height: '100%', background: '#4ba6ea', borderRadius: 5 }} />
                              </div>
                            </div>
                          )}
                          {/* competitor rates */}
                          {sorted.map(row => {
                            const comp = competitorMap[row.cid];
                            const tColor = comp ? threatColor(comp.threat_level) : '#6b7280';
                            const diff = myRate ? ((row.price - myRate) / myRate * 100) : null;
                            return (
                              <div key={row.cid}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                  <span style={{ fontSize: 13, color: '#334155' }}>{row.competitor}</span>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    {diff !== null && (
                                      <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: diff > 0 ? '#dcfce7' : '#fee2e2', color: diff > 0 ? '#166534' : '#991b1b' }}>
                                        {diff > 0 ? '+' : ''}{diff.toFixed(0)}% vs us
                                      </span>
                                    )}
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>₺{fmt(row.price)}</span>
                                  </div>
                                </div>
                                <div style={{ height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                                  <div style={{ width: `${(row.price / maxRate) * 100}%`, height: '100%', background: tColor + '60', borderRadius: 5, transition: 'width 0.4s ease' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tab 3: Content & Posts ────────────────────────────────────── */}
          {tab === 'posts' && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none' }}>
                  <option value="all">All Platforms</option>
                  {platforms.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                  <input type="checkbox" onChange={e => setPlatformFilter(e.target.checked ? 'winning' : 'all')} />
                  Winning posts only
                </label>
              </div>

              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[1, 2, 3].map(i => <Skeleton key={i} h={100} />)}
                </div>
              ) : filteredPosts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No posts tracked</div>
                  <div style={{ fontSize: 13 }}>Load test data to see competitor posts</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                  {filteredPosts.map(p => {
                    const comp = competitorMap[p.competitor_id];
                    return (
                      <div key={p.id} style={{
                        background: '#fff', border: p.is_winning ? '1px solid #4ba6ea' : '1px solid #e2e8f0',
                        borderRadius: 12, padding: 16, position: 'relative',
                      }}>
                        {p.is_winning && (
                          <div style={{ position: 'absolute', top: 12, right: 12, background: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>⭐ Winning</div>
                        )}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                          <span style={{ color: '#4ba6ea', display: 'flex' }}>{platformIcon(p.platform)}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{p.platform}</span>
                          {comp && (
                            <>
                              <span style={{ fontSize: 12, color: '#e2e8f0' }}>·</span>
                              <span style={{ fontSize: 12, color: '#94a3b8' }}>{comp.name}</span>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: threatColor(comp.threat_level), flexShrink: 0 }} />
                            </>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                          {p.caption}
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                          <span>👁 {fmt(p.views)}</span>
                          <span>❤️ {fmt(p.likes)}</span>
                          <span>💬 {fmt(p.comments)}</span>
                          {p.engagement_rate != null && <span style={{ fontWeight: 600, color: '#10b981' }}>📈 {p.engagement_rate}%</span>}
                        </div>
                        {p.detected_strategy && (
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, background: '#ede9fe', color: '#5b21b6', marginBottom: 8 }}>
                            {p.detected_strategy}
                          </span>
                        )}
                        {p.bot_analysis && (
                          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, fontSize: 12, color: '#475569', borderLeft: '3px solid #4ba6ea' }}>
                            {p.bot_analysis}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tab 4: Reports ────────────────────────────────────────────── */}
          {tab === 'reports' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {loading ? (
                [1, 2].map(i => <Skeleton key={i} h={200} />)
              ) : allReports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No reports yet</div>
                  <div style={{ fontSize: 13 }}>Load test data to see competitive analysis reports</div>
                </div>
              ) : allReports.map(r => {
                const comp = r.competitor_id ? competitorMap[r.competitor_id] : null;
                return (
                  <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ background: '#f8fafc', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #e2e8f0' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{r.title}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                          {comp && <span style={{ color: threatColor(comp.threat_level), fontWeight: 600, marginRight: 8 }}>{comp.name}</span>}
                          {r.report_type} · {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Generated {fmtDate(r.generated_at)}</div>
                    </div>
                    <div style={{ padding: 20 }}>
                      {r.summary && <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, marginBottom: 16 }}>{r.summary}</div>}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                        {r.key_findings && r.key_findings.length > 0 && (
                          <div style={{ background: '#eff6ff', borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', marginBottom: 8 }}>Key Findings</div>
                            {r.key_findings.map((f, i) => <div key={i} style={{ fontSize: 12, color: '#1e40af', marginBottom: 4 }}>• {f}</div>)}
                          </div>
                        )}
                        {r.opportunities && r.opportunities.length > 0 && (
                          <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: 8 }}>Opportunities</div>
                            {r.opportunities.map((o, i) => <div key={i} style={{ fontSize: 12, color: '#065f46', marginBottom: 4 }}>• {o}</div>)}
                          </div>
                        )}
                        {r.threats && r.threats.length > 0 && (
                          <div style={{ background: '#fff1f2', borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', marginBottom: 8 }}>Threats</div>
                            {r.threats.map((t, i) => <div key={i} style={{ fontSize: 12, color: '#991b1b', marginBottom: 4 }}>• {t}</div>)}
                          </div>
                        )}
                        {r.recommendations && r.recommendations.length > 0 && (
                          <div style={{ background: '#fffbeb', borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 8 }}>Recommendations</div>
                            {r.recommendations.map((rec, i) => <div key={i} style={{ fontSize: 12, color: '#78350f', marginBottom: 4 }}>• {rec}</div>)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {/* company detail modal */}
      {selectedCompetitor && (
        <CompanyDetailModal
          competitor={selectedCompetitor}
          pricing={allPricing.filter(p => p.competitor_id === selectedCompetitor.id)}
          posts={allPosts.filter(p => p.competitor_id === selectedCompetitor.id)}
          reports={allReports.filter(r => r.competitor_id === selectedCompetitor.id)}
          onClose={() => setSelectedCompetitor(null)}
        />
      )}
    </div>
  );
}
