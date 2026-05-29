import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../lib/supabase';
import { socialFrom } from '../../lib/socialClient';
import type { SmPost, SmBlogPost } from '../../types/marketing';
import { useNavigate } from 'react-router-dom';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Approximate dates in MM-DD for Turkish & major Islamic/commercial holidays (2026 estimates)
const HOLIDAYS: Record<string, string> = {
  '01-01': "New Year's Day",
  '03-20': 'Eid al-Fitr (1st day)',
  '03-21': 'Eid al-Fitr (2nd day)',
  '03-22': 'Eid al-Fitr (3rd day)',
  '04-23': 'National Sovereignty Day',
  '05-01': 'Labour Day',
  '05-19': 'Youth & Sports Day',
  '05-27': 'Eid al-Adha (1st day)',
  '05-28': 'Eid al-Adha (2nd day)',
  '05-29': 'Eid al-Adha (3rd day)',
  '05-30': 'Eid al-Adha (4th day)',
  '07-15': 'Democracy Day',
  '08-30': 'Victory Day',
  '10-29': 'Republic Day',
  '11-27': 'Black Friday',
};

const STATUS_STYLE: Record<string, { color: string; bg: string; dot: string; label: string }> = {
  draft:            { color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af', label: 'Draft' },
  pending_approval: { color: '#d97706', bg: '#fef3c7', dot: '#f59e0b', label: 'Pending' },
  approved:         { color: '#4ba6ea', bg: '#eff8ff', dot: '#4ba6ea', label: 'Approved' },
  scheduled:        { color: '#2563eb', bg: '#dbeafe', dot: '#3b82f6', label: 'Scheduled' },
  published:        { color: '#059669', bg: '#d1fae5', dot: '#10b981', label: 'Published' },
  failed:           { color: '#ef4444', bg: '#fee2e2', dot: '#ef4444', label: 'Failed' },
  rejected:         { color: '#ef4444', bg: '#fee2e2', dot: '#ef4444', label: 'Rejected' },
};

type ContentType = 'all' | 'social' | 'blog';
type CalView = 'month' | 'week';

interface CalItem {
  id: string;
  type: 'social' | 'blog';
  title: string;
  status: string;
  platform?: string | null;
  scheduled_for: string;
  thumbnail?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function holidayKey(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const startDay = first.getDay(); // 0=Sun
  const days: Date[] = [];
  // pad start
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(d);
  }
  // month days
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // pad end to 42
  while (days.length < 42) {
    const last2 = days[days.length - 1];
    days.push(new Date(last2.getFullYear(), last2.getMonth(), last2.getDate() + 1));
  }
  return days;
}

function getWeekDays(refDate: Date): Date[] {
  const day = refDate.getDay();
  const sunday = new Date(refDate);
  sunday.setDate(refDate.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtMonthYear(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

// ─── Platform icon (inline, same as SocialPosts) ──────────────────────────────

function PlatformDot({ platform }: { platform?: string | null }) {
  const colors: Record<string, string> = {
    instagram: '#e1306c', tiktok: '#010101', facebook: '#1877f2', youtube_shorts: '#ff0000',
  };
  if (!platform) return null;
  return (
    <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors[platform] ?? '#9ca3af', flexShrink: 0 }} />
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastData { id: number; message: string; type: 'success' | 'error' | 'info'; }
const Toast: React.FC<{ t: ToastData }> = ({ t }) =>
  ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 3000, display: 'flex', alignItems: 'center', gap: 10, background: t.type === 'error' ? '#ef4444' : '#0f1117', color: '#fff', borderRadius: 12, padding: '12px 20px', fontSize: 14, fontWeight: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', animation: 'calSlide 200ms ease' }}>
      {t.message}
    </div>,
    document.body
  );

// ─── Day Detail Panel ─────────────────────────────────────────────────────────

interface DayPanelProps {
  date: Date;
  items: CalItem[];
  onClose: () => void;
  onNavigate: (item: CalItem) => void;
}

const DayPanel: React.FC<DayPanelProps> = ({ date, items, onClose, onNavigate }) => {
  const holiday = HOLIDAYS[holidayKey(date)];
  return ReactDOM.createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(15,17,23,0.25)', backdropFilter: 'blur(2px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 360, background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', animation: 'calSlideRight 220ms ease' }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#0f1117' }}>
                {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              {holiday && <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, marginTop: 3 }}>🎉 {holiday}</div>}
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>{items.length === 0 ? 'No content scheduled' : `${items.length} item${items.length > 1 ? 's' : ''} scheduled`}</div>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>No content for this day</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Navigate to Social Posts or Blog Posts to schedule content</div>
            </div>
          ) : (
            items.map(item => {
              const st = STATUS_STYLE[item.status] ?? STATUS_STYLE.draft;
              return (
                <div key={item.id} onClick={() => onNavigate(item)} style={{ padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${st.bg}`, background: '#fff', cursor: 'pointer', transition: 'all 140ms ease' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {/* Type dot */}
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: item.type === 'social' ? '#eff8ff' : '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {item.type === 'social'
                        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: '#4ba6ea' }}><circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.8"/><circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51L8.59 10.49" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: '#8b5cf6' }}><path d="M12 20h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>{fmtTime(item.scheduled_for)}</span>
                        {item.platform && <PlatformDot platform={item.platform} />}
                        <span style={{ padding: '1px 6px', borderRadius: 20, background: st.bg, fontSize: 10, fontWeight: 700, color: st.color }}>{st.label}</span>
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#d1d5db', flexShrink: 0, marginTop: 2 }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const Sk: React.FC<{ w?: number | string; h?: number | string; radius?: number }> = ({ w = '100%', h = 16, radius = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: radius, background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'calPulse 1.5s ease-in-out infinite' }} />
);

// ─── Page ─────────────────────────────────────────────────────────────────────

const MarketingCalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const now = new Date();

  const [view, setView] = useState<CalView>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [weekRef, setWeekRef] = useState(new Date(now));
  const [contentFilter, setContentFilter] = useState<ContentType>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');

  const [socialPosts, setSocialPosts] = useState<SmPost[]>([]);
  const [blogPosts, setBlogPosts] = useState<SmBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const showToast = useCallback((message: string, type: ToastData['type'] = 'info') => {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  // Load data for visible range
  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    const start = new Date(y, m - 1, 1).toISOString();
    const end   = new Date(y, m + 2, 0).toISOString();

    const [{ data: social }, { data: blog }] = await Promise.all([
      socialFrom('sm_content_social').select('*').gte('scheduled_for', start).lte('scheduled_for', end).order('scheduled_for'),
      socialFrom('sm_content_blog').select('*').or(`published_at.gte.${start},scheduled_for.gte.${start}`).lte('published_at', end).order('published_at'),
    ]);

    setSocialPosts((social as SmPost[]) ?? []);
    setBlogPosts((blog as SmBlogPost[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(year, month); }, [year, month, load]);

  // Real-time
  useEffect(() => {
    const ch = supabase.channel('cal-rt')
      .on('postgres_changes', { event: '*', schema: 'social', table: 'sm_content_social' }, () => load(year, month))
      .on('postgres_changes', { event: '*', schema: 'social', table: 'sm_content_blog' }, () => load(year, month))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, year, month]);

  // Convert posts to CalItems
  const allItems = useMemo((): CalItem[] => {
    const items: CalItem[] = [];
    if (contentFilter !== 'blog') {
      socialPosts.forEach(p => {
        if (!p.scheduled_for) return;
        if (statusFilter !== 'all' && p.status !== statusFilter) return;
        if (platformFilter !== 'all' && p.platform !== platformFilter) return;
        items.push({
          id: `s-${p.id}`,
          type: 'social',
          title: p.title ?? 'Untitled Post',
          status: p.status,
          platform: p.platform,
          scheduled_for: p.scheduled_for,
          thumbnail: (p.media_urls ?? [])[0] ?? null,
        });
      });
    }
    if (contentFilter !== 'social') {
      blogPosts.forEach(p => {
        const date = p.published_at ?? (p as unknown as Record<string, string>)['scheduled_for'];
        if (!date) return;
        if (statusFilter !== 'all' && p.status !== statusFilter) return;
        items.push({
          id: `b-${p.id}`,
          type: 'blog',
          title: p.title_en ?? p.title_ar ?? 'Untitled Article',
          status: p.status,
          scheduled_for: date,
          thumbnail: p.featured_image_url,
        });
      });
    }
    return items.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  }, [socialPosts, blogPosts, contentFilter, statusFilter, platformFilter]);

  // Group by day key
  const byDay = useMemo(() => {
    const map: Record<string, CalItem[]> = {};
    allItems.forEach(item => {
      const key = item.scheduled_for.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [allItems]);

  // Navigation
  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); setWeekRef(new Date(now)); };

  const prevWeek = () => setWeekRef(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setWeekRef(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });

  const handleNavigateItem = (item: CalItem) => {
    setSelectedDay(null);
    if (item.type === 'social') navigate('/dashboard/marketing/social-posts');
    else navigate('/dashboard/marketing/blog-posts');
  };

  // Month grid
  const monthGrid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const weekDays = useMemo(() => getWeekDays(weekRef), [weekRef]);
  const todayKey = isoDateKey(now);

  const selectedDayItems = useMemo(() => {
    if (!selectedDay) return [];
    return byDay[isoDateKey(selectedDay)] ?? [];
  }, [selectedDay, byDay]);

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        @keyframes calPulse { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes calSlide { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes calSlideRight { from{opacity:0;transform:translateX(32px)} to{opacity:1;transform:translateX(0)} }
      `}</style>

      {toasts.map(t => <Toast key={t.id} t={t} />)}
      {selectedDay && (
        <DayPanel date={selectedDay} items={selectedDayItems} onClose={() => setSelectedDay(null)} onNavigate={handleNavigateItem} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f1117', margin: 0 }}>Content Calendar</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0 0' }}>Scheduled posts and upcoming content pipeline</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Create dropdown placeholder */}
          <button onClick={() => navigate('/dashboard/marketing/social-posts')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
            + Schedule Post
          </button>
          <button onClick={() => navigate('/dashboard/marketing/blog-posts')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
            + Schedule Blog
          </button>
        </div>
      </div>

      {/* Controls bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        {/* Left: navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={view === 'month' ? prevMonth : prevWeek} style={{ width: 34, height: 34, borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={goToday} style={{ padding: '6px 16px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Today</button>
          <button onClick={view === 'month' ? nextMonth : nextWeek} style={{ width: 34, height: 34, borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', marginLeft: 6 }}>
            {view === 'month' ? fmtMonthYear(year, month) : (() => {
              const days = weekDays;
              return `${days[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
            })()}
          </div>
        </div>

        {/* Right: view toggle + filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1.5px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            {(['month', 'week'] as CalView[]).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '7px 16px', border: 'none', background: view === v ? '#4ba6ea' : '#fff', color: view === v ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 140ms ease', textTransform: 'capitalize' }}>
                {v}
              </button>
            ))}
          </div>

          {/* Content filter */}
          <select value={contentFilter} onChange={e => setContentFilter(e.target.value as ContentType)} style={{ padding: '7px 12px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 10, fontFamily: 'inherit', outline: 'none', color: '#374151', background: '#fff', cursor: 'pointer' }}>
            <option value="all">All Content</option>
            <option value="social">Social Posts</option>
            <option value="blog">Blog Posts</option>
          </select>

          {/* Status filter */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '7px 12px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 10, fontFamily: 'inherit', outline: 'none', color: '#374151', background: '#fff', cursor: 'pointer' }}>
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          {/* Platform filter (only relevant for social) */}
          {contentFilter !== 'blog' && (
            <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} style={{ padding: '7px 12px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 10, fontFamily: 'inherit', outline: 'none', color: '#374151', background: '#fff', cursor: 'pointer' }}>
              <option value="all">All Platforms</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="facebook">Facebook</option>
              <option value="youtube_shorts">YouTube Shorts</option>
            </select>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { dot: '#9ca3af', label: 'Draft' },
          { dot: '#f59e0b', label: 'Pending' },
          { dot: '#4ba6ea', label: 'Approved' },
          { dot: '#3b82f6', label: 'Scheduled' },
          { dot: '#10b981', label: 'Published' },
          { dot: '#8b5cf6', label: 'Blog' },
        ].map(({ dot, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6b7280' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
            {label}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {DAYS_OF_WEEK.map(d => <div key={d} style={{ textAlign: 'center', padding: '8px 0', fontSize: 12, fontWeight: 700, color: '#9ca3af' }}>{d}</div>)}
          {Array.from({ length: 35 }).map((_, i) => <Sk key={i} h={100} radius={8} />)}
        </div>
      ) : view === 'month' ? (
        <>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
            {DAYS_OF_WEEK.map(d => (
              <div key={d} style={{ textAlign: 'center', padding: '8px 0', fontSize: 12, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {monthGrid.map((date, idx) => {
              const key = isoDateKey(date);
              const isCurrentMonth = date.getMonth() === month;
              const isToday = key === todayKey;
              const dayItems = byDay[key] ?? [];
              const holiday = HOLIDAYS[holidayKey(date)];
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              const isHeavy = dayItems.length >= 5;
              const MAX_VISIBLE = 3;

              return (
                <div
                  key={idx}
                  onClick={() => { if (isCurrentMonth) setSelectedDay(date); }}
                  style={{
                    minHeight: 110, borderRadius: 10,
                    border: isToday ? '2px solid #4ba6ea' : '1.5px solid #f0f0f0',
                    background: isToday ? '#f0f8ff' : isWeekend ? '#fafafa' : '#fff',
                    padding: '8px 10px',
                    cursor: isCurrentMonth ? 'pointer' : 'default',
                    opacity: isCurrentMonth ? 1 : 0.3,
                    transition: 'all 140ms ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => { if (isCurrentMonth) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(75,166,234,0.1)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
                >
                  {/* Day number */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: isToday ? '#4ba6ea' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? '#fff' : '#374151' }}>{date.getDate()}</span>
                    </div>
                    {isHeavy && <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', background: '#fee2e2', padding: '1px 5px', borderRadius: 6 }}>HEAVY</span>}
                  </div>

                  {/* Holiday */}
                  {holiday && isCurrentMonth && (
                    <div style={{ fontSize: 9, color: '#d97706', fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🎉 {holiday}</div>
                  )}

                  {/* Items */}
                  {dayItems.slice(0, MAX_VISIBLE).map(item => {
                    const st = STATUS_STYLE[item.status] ?? STATUS_STYLE.draft;
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 5px', borderRadius: 5, background: item.type === 'blog' ? 'rgba(139,92,246,0.08)' : st.bg, marginBottom: 3, overflow: 'hidden' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.type === 'blog' ? '#8b5cf6' : st.dot, flexShrink: 0 }} />
                        {item.platform && <PlatformDot platform={item.platform} />}
                        <span style={{ fontSize: 10, color: item.type === 'blog' ? '#8b5cf6' : st.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.title}</span>
                      </div>
                    );
                  })}

                  {dayItems.length > MAX_VISIBLE && (
                    <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginTop: 2 }}>+{dayItems.length - MAX_VISIBLE} more</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* Week view */
        <div style={{ overflow: 'auto' }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
            <div />
            {weekDays.map((date, i) => {
              const key = isoDateKey(date);
              const isToday = key === todayKey;
              return (
                <div key={i} style={{ textAlign: 'center', padding: '8px 4px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{DAYS_OF_WEEK[date.getDay()]}</div>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: isToday ? '#4ba6ea' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px auto 0' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: isToday ? '#fff' : '#0f1117' }}>{date.getDate()}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hour rows */}
          {Array.from({ length: 24 }, (_, hour) => {
            const hourLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
            return (
              <div key={hour} style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', gap: 2, minHeight: 52, borderTop: '1px solid #f3f4f6' }}>
                <div style={{ padding: '4px 8px 0 0', textAlign: 'right', fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{hourLabel}</div>
                {weekDays.map((date, di) => {
                  const key = isoDateKey(date);
                  const hourItems = (byDay[key] ?? []).filter(item => new Date(item.scheduled_for).getHours() === hour);
                  return (
                    <div key={di} style={{ padding: '4px 2px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {hourItems.map(item => {
                        const st = STATUS_STYLE[item.status] ?? STATUS_STYLE.draft;
                        return (
                          <div key={item.id} onClick={() => navigate(item.type === 'social' ? '/dashboard/marketing/social-posts' : '/dashboard/marketing/blog-posts')} style={{ padding: '3px 6px', borderRadius: 5, background: item.type === 'blog' ? 'rgba(139,92,246,0.12)' : st.bg, cursor: 'pointer', overflow: 'hidden' }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: item.type === 'blog' ? '#8b5cf6' : st.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && allItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', marginTop: 16 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }}><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="1.5"/></svg>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#6b7280' }}>No scheduled content this month</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>
            Schedule posts from{' '}
            <button onClick={() => navigate('/dashboard/marketing/social-posts')} style={{ color: '#4ba6ea', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: 0 }}>Social Posts</button>
            {' '}or{' '}
            <button onClick={() => navigate('/dashboard/marketing/blog-posts')} style={{ color: '#4ba6ea', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: 0 }}>Blog Posts</button>
          </div>
        </div>
      )}

      {/* Month summary stats */}
      {!loading && allItems.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 28 }}>
          {[
            { label: 'Total Scheduled', value: allItems.length, color: '#4ba6ea' },
            { label: 'Social Posts', value: allItems.filter(i => i.type === 'social').length, color: '#3b82f6' },
            { label: 'Blog Posts', value: allItems.filter(i => i.type === 'blog').length, color: '#8b5cf6' },
            { label: 'Published', value: allItems.filter(i => i.status === 'published').length, color: '#059669' },
            { label: 'Pending Approval', value: allItems.filter(i => i.status === 'pending_approval').length, color: '#d97706' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1.5px solid #f0f0f0' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MarketingCalendarPage;
