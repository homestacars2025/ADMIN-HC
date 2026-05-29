import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../lib/supabase';
import { socialFrom } from '../../lib/socialClient';
import type { SmApproval } from '../../types/marketing';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const PRIORITY: Record<string, { color: string; bg: string; border: string; label: string }> = {
  urgent: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  label: 'Urgent' },
  high:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', label: 'High' },
  normal: { color: '#4ba6ea', bg: 'rgba(75,166,234,0.08)', border: 'rgba(75,166,234,0.25)', label: 'Normal' },
  low:    { color: '#9ca3af', bg: 'rgba(156,163,175,0.10)',border: 'rgba(156,163,175,0.3)', label: 'Low' },
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  social_post:       'Social Post',
  blog_post:         'Blog Post',
  design:            'Design',
  ad_campaign:       'Ad Campaign',
  reply:             'Reply',
  constitution_change:'Constitution Change',
};

function itemTypeIcon(type: string): React.ReactNode {
  const s = { color: '#6b7280' };
  switch (type) {
    case 'social_post': return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={s}>
        <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.8"/>
        <circle cx="6"  cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
        <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M8.59 13.51l6.83 3.98M15.41 6.51L8.59 10.49" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    );
    case 'blog_post': return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={s}>
        <path d="M12 20h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
    case 'design': return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={s}>
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
        <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
    case 'ad_campaign': return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={s}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
    case 'reply': return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={s}>
        <path d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2h-5l-3 3-2-3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
    default: return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={s}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    );
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastData { id: number; message: string; type: 'success' | 'error' | 'info'; }
const Toast: React.FC<{ t: ToastData }> = ({ t }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: t.type === 'error' ? '#ef4444' : '#0f1117',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'apSlide 200ms ease',
    }}>
      {t.type === 'success' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>}
      {t.type === 'error'   && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>}
      {t.message}
    </div>,
    document.body
  );

// ─── Feedback modal ───────────────────────────────────────────────────────────

interface FeedbackModalProps {
  action: 'request_changes' | 'reject';
  onConfirm: (feedback: string) => void;
  onCancel: () => void;
  loading: boolean;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ action, onConfirm, onCancel, loading }) => {
  const [text, setText] = useState('');
  return ReactDOM.createPortal(
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 18, width: 460,
        boxShadow: '0 24px 80px rgba(0,0,0,0.18)', padding: '24px',
        animation: 'apSlideUp 180ms ease',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', marginBottom: 6 }}>
          {action === 'reject' ? 'Reject Item' : 'Request Changes'}
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
          {action === 'reject'
            ? 'Provide a reason for rejection. This will be logged and the bot will be notified.'
            : 'Describe what needs to change. The bot will receive this feedback and resubmit.'}
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={action === 'reject' ? 'Reason for rejection…' : 'What needs to change?'}
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px',
            fontSize: 14, border: '1.5px solid #e5e7eb', borderRadius: 10,
            fontFamily: 'inherit', resize: 'none', outline: 'none', color: '#0f1117',
            lineHeight: 1.5, transition: 'border-color 140ms ease',
          }}
          onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#4ba6ea'; }}
          onBlur={e  => { (e.target as HTMLTextAreaElement).style.borderColor = '#e5e7eb'; }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={onCancel} disabled={loading} style={{
            padding: '9px 18px', borderRadius: 9, border: '1px solid #e5e7eb',
            background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280',
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm(text)}
            disabled={!text.trim() || loading}
            style={{
              padding: '9px 22px', borderRadius: 9, border: 'none',
              background: action === 'reject' ? (text.trim() && !loading ? '#ef4444' : '#fca5a5') : (text.trim() && !loading ? '#4ba6ea' : '#a8d4f5'),
              color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: text.trim() && !loading ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            }}
          >
            {loading ? 'Saving…' : action === 'reject' ? 'Reject' : 'Request Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_ITEMS: Omit<SmApproval, 'id' | 'updated_at' | 'reviewed_at' | 'reviewed_by' | 'user_feedback' | 'edits_made'>[] = [
  {
    title: 'TikTok Reel — Hyundai Bayon Summer Drive',
    item_type: 'social_post', status: 'pending', priority: 'high',
    bot_who_created: 'content_writer',
    content: 'Platform: TikTok\nCaption (EN): Feel the road. Rent the Hyundai Bayon for your summer adventures in Istanbul — starting from just $49/day.\nCaption (AR): اشعر بالطريق. استأجر هيونداي بايون لمغامراتك الصيفية في إسطنبول — ابتداءً من 49$ فقط/يوم.\nCaption (TR): Yolu hisset. İstanbul yazını Hyundai Bayon ile keşfet — günlük sadece 49$\'dan başlayan fiyatlarla.\nScheduled: Tomorrow 12:00 PM\nHashtags: #HomestaCars #Istanbul #Bayon #RentACar',
    reasoning: 'High engagement window for TikTok on weekday noons. Bayon is a top-searched model this season. Arabic captions target our core tourist demographic.',
    notes: 'Needs final approval before scheduling.',
    linked_item_id: null, linked_table: 'sm_content_social', deadline_at: null,
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    title: 'Instagram Story — Weekend Flash Offer',
    item_type: 'social_post', status: 'pending', priority: 'urgent',
    bot_who_created: 'content_writer',
    content: 'Platform: Instagram Stories\nVisual: Gradient background with price tag animation\nText (EN): This weekend only — 20% off all Economy cars. Book now!\nText (AR): هذا الأسبوع فقط — خصم 20% على جميع سيارات الاقتصاد. احجز الآن!\nText (TR): Yalnızca bu hafta sonu — tüm Ekonomi araçlarda %20 indirim. Hemen rezervasyon yap!\nLink: Direct to booking page\nScheduled: Friday 6:00 PM',
    reasoning: 'Flash offers on Stories get 3x engagement vs regular posts. Weekend travel decisions peak on Thursday-Friday. Urgent because offer starts in 36h.',
    notes: 'Coordinate with pricing team to confirm the discount is active.',
    linked_item_id: null, linked_table: 'sm_content_social', deadline_at: new Date(Date.now() + 36 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    title: 'Blog Post: Complete Guide to Renting a Car in Istanbul as an Arab Tourist',
    item_type: 'blog_post', status: 'pending', priority: 'normal',
    bot_who_created: 'content_writer',
    content: 'Title (EN): Complete Guide to Renting a Car in Istanbul as an Arab Tourist\nTitle (AR): الدليل الشامل لاستئجار سيارة في إسطنبول للسائح العربي\nMeta Description: Everything Arab tourists need to know about renting a car in Istanbul — requirements, best areas, tips, and where to find Arabic-speaking support.\nEstimated Reading Time: 8 minutes\nSEO Target Keywords: car rental Istanbul Arabic, rent car Istanbul tourist, HomestaCars Istanbul\nContent Preview: Istanbul is a dream destination for Arab tourists, with millions visiting each year. Getting around by car gives you freedom to explore beyond the tourist trail. This guide covers everything you need...',
    reasoning: 'Arabic-speaking tourists are our #1 customer segment. This blog post will rank for high-intent keywords and drive organic traffic from Gulf countries.',
    notes: null,
    linked_item_id: null, linked_table: 'sm_content_blog', deadline_at: null,
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    title: 'Summer Campaign — Google Ads targeting Saudi tourists',
    item_type: 'ad_campaign', status: 'pending', priority: 'high',
    bot_who_created: 'ads_manager',
    content: 'Platform: Google Ads\nBudget: $500/month\nAudience: Saudi Arabian users searching for Istanbul travel, car rental\nGeo targeting: Saudi Arabia, UAE, Kuwait\nAd copies:\n[EN] Rent a Car in Istanbul · HomestaCars — From $49/day · Free delivery · Arabic support\n[AR] استئجر سيارة في إسطنبول · هومستاكارز — من 49$ يومياً · توصيل مجاني · دعم عربي\nKeywords: car rental istanbul, rent car istanbul, سيارات ايجار اسطنبول, استئجار سيارة اسطنبول',
    reasoning: 'Saudi tourist season peaks June-August. CPCs for these keywords are competitive but our Arabic support differentiates us. Expected ROI: 4x based on last year\'s data.',
    notes: 'Need billing method confirmed before launch.',
    linked_item_id: null, linked_table: 'sm_ad_campaigns', deadline_at: null,
    created_at: new Date(Date.now() - 12 * 3600000).toISOString(),
  },
  {
    title: 'Design Concept — Summer Campaign Visual Identity',
    item_type: 'design', status: 'pending', priority: 'normal',
    bot_who_created: 'designer',
    content: 'Purpose: Summer 2025 campaign visuals\nDescription: Sun-drenched color palette (sandy yellow, sky blue, white) with aerial Istanbul photography. All text in Arabic, Turkish, and English.\nFormats: Social square (1080×1080), Story (1080×1920), Banner (1200×628)\nStyle notes: Clean, premium, aspirational. Avoid clichés. HomestaCars logo prominent.\nDesigner notes: Created 3 variations — Option A (minimalist), Option B (photo-heavy), Option C (typographic). Recommend Option A for sophistication.',
    reasoning: 'Consistent visual identity across all summer content will increase brand recognition by an estimated 40%. Campaign runs for 8 weeks.',
    notes: 'Attaching 3 concept mockups for review.',
    linked_item_id: null, linked_table: null, deadline_at: null,
    created_at: new Date(Date.now() - 18 * 3600000).toISOString(),
  },
  {
    title: 'Suggested Reply — Negative TripAdvisor Review',
    item_type: 'reply', status: 'pending', priority: 'urgent',
    bot_who_created: 'brand_guardian',
    content: 'Original Review (by "Khaled_M_KSA"):\n"Car had a scratch that wasn\'t mentioned. Staff weren\'t helpful when I called. Wouldn\'t recommend."\nStars: 2/5 · Posted: 2 hours ago\n\nSuggested Reply (EN):\n"Dear Khaled, thank you for your feedback. We sincerely apologize for this experience — this falls short of our standards. Please contact us directly at homestacars@gmail.com so we can resolve this for you personally. Your satisfaction is our priority."\n\nSuggested Reply (AR):\n"عزيزي خالد، شكراً لك على ملاحظتك. نعتذر بصدق عن هذه التجربة — هذا دون مستوانا المعتاد. يرجى التواصل معنا مباشرة على homestacars@gmail.com لنتمكن من حل هذا الأمر شخصياً. رضاك هو أولويتنا."',
    reasoning: 'Negative reviews must be addressed within 4 hours for maximum damage control. This reply is empathetic and moves the conversation private.',
    notes: 'URGENT — review is gaining views. Approve to post immediately.',
    linked_item_id: null, linked_table: null, deadline_at: new Date(Date.now() + 2 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 1800000).toISOString(),
  },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

const MarketingApprovalsPage: React.FC = () => {
  const [approvals, setApprovals]   = useState<SmApproval[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [typeFilter, setTypeFilter]         = useState('all');
  const [actionLoading, setActionLoading]   = useState(false);
  const [feedbackModal, setFeedbackModal]   = useState<'request_changes' | 'reject' | null>(null);
  const [seeding, setSeeding]               = useState(false);
  const [toasts, setToasts]                 = useState<ToastData[]>([]);
  const toastCounter                         = useRef(0);

  const addToast = useCallback((message: string, type: ToastData['type'] = 'success') => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = socialFrom('sm_approvals_queue')
        .select('id, title, item_type, status, priority, bot_who_created, content, reasoning, notes, linked_item_id, linked_table, deadline_at, reviewed_at, reviewed_by, user_feedback, edits_made, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      setApprovals((data as SmApproval[]) ?? []);
    } catch {
      addToast('Failed to load approvals', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, addToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // ── Real-time ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel('approvals_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'social', table: 'sm_approvals_queue' }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'social', table: 'sm_approvals_queue' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT','TEXTAREA','SELECT'].includes(target.tagName)) return;

      if (e.key === 'a' || e.key === 'A') {
        if (selectedItem?.status === 'pending') handleApprove();
      }
      if (e.key === 'r' || e.key === 'R') {
        if (selectedItem?.status === 'pending') setFeedbackModal('reject');
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = filtered.findIndex(a => a.id === selectedId);
        if (idx < filtered.length - 1) setSelectedId(filtered[idx + 1].id);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filtered.findIndex(a => a.id === selectedId);
        if (idx > 0) setSelectedId(filtered[idx - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, approvals, actionLoading]);

  // ── Filter ───────────────────────────────────────────────────────────────────

  const filtered = approvals.filter(a => {
    if (priorityFilter !== 'all' && a.priority !== priorityFilter) return false;
    if (typeFilter     !== 'all' && a.item_type !== typeFilter)    return false;
    return true;
  });

  const selectedItem = filtered.find(a => a.id === selectedId) ?? null;

  // Auto-select first item
  useEffect(() => {
    if (!loading && filtered.length > 0 && !filtered.find(a => a.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [loading, filtered, selectedId]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleApprove = useCallback(async () => {
    if (!selectedItem || actionLoading) return;
    setActionLoading(true);
    try {
      const { error } = await socialFrom('sm_approvals_queue')
        .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: 'admin' })
        .eq('id', selectedItem.id);
      if (error) throw error;
      addToast('Item approved', 'success');
      await load();
      // Move to next
      const idx = filtered.findIndex(a => a.id === selectedItem.id);
      const next = filtered[idx + 1] ?? filtered[idx - 1];
      setSelectedId(next?.id ?? null);
    } catch {
      addToast('Approval failed', 'error');
    } finally {
      setActionLoading(false);
    }
  }, [selectedItem, actionLoading, filtered, load, addToast]);

  const handleFeedbackConfirm = useCallback(async (feedback: string) => {
    if (!selectedItem || !feedbackModal || actionLoading) return;
    setActionLoading(true);
    try {
      const newStatus = feedbackModal === 'reject' ? 'rejected' : 'pending';
      const { error } = await socialFrom('sm_approvals_queue')
        .update({
          status: newStatus,
          reviewed_at: new Date().toISOString(),
          reviewed_by: 'admin',
          user_feedback: feedback,
        })
        .eq('id', selectedItem.id);
      if (error) throw error;

      // Log to decisions
      await socialFrom('sm_decisions_log').insert({
        decision_type: feedbackModal === 'reject' ? 'rejection' : 'change_request',
        title: `${feedbackModal === 'reject' ? 'Rejected' : 'Changes requested for'}: ${selectedItem.title}`,
        description: feedback,
        made_by: 'admin',
      }).throwOnError();

      addToast(feedbackModal === 'reject' ? 'Item rejected' : 'Changes requested', 'success');
      setFeedbackModal(null);
      const idx = filtered.findIndex(a => a.id === selectedItem.id);
      const next = filtered[idx + 1] ?? filtered[idx - 1];
      setSelectedId(next?.id ?? null);
      await load();
    } catch {
      addToast('Action failed', 'error');
    } finally {
      setActionLoading(false);
    }
  }, [selectedItem, feedbackModal, actionLoading, filtered, load, addToast]);

  // ── Seed data ─────────────────────────────────────────────────────────────

  const handleSeed = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      const { error } = await socialFrom('sm_approvals_queue').insert(SEED_ITEMS as never[]);
      if (error) throw error;
      addToast(`Seeded ${SEED_ITEMS.length} test items`, 'success');
      await load();
    } catch (err) {
      addToast('Seed failed — check schema', 'error');
    } finally {
      setSeeding(false);
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────

  const pendingCount = approvals.filter(a => a.status === 'pending').length;
  const urgentCount  = approvals.filter(a => a.status === 'pending' && a.priority === 'urgent').length;

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: 'pending',  label: `Pending (${pendingCount})` },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all',      label: 'All' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>

      {/* Filter bar */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #ebebeb', padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: 16, height: 52, flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {STATUS_TABS.map(tab => (
            <button key={tab.key} onClick={() => setStatusFilter(tab.key)} style={{
              padding: '5px 14px', borderRadius: 8, border: 'none', fontFamily: 'inherit',
              fontSize: 13, fontWeight: statusFilter === tab.key ? 600 : 450,
              background: statusFilter === tab.key ? 'rgba(75,166,234,0.10)' : 'transparent',
              color: statusFilter === tab.key ? '#4ba6ea' : '#6b7280',
              cursor: 'pointer', transition: 'all 120ms ease',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: '#ebebeb' }} />

        {/* Priority filter */}
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={{
          height: 32, padding: '0 10px', fontSize: 13, borderRadius: 8,
          border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
          cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
        }}>
          <option value="all">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{
          height: 32, padding: '0 10px', fontSize: 13, borderRadius: 8,
          border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
          cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
        }}>
          <option value="all">All types</option>
          <option value="social_post">Social Post</option>
          <option value="blog_post">Blog Post</option>
          <option value="design">Design</option>
          <option value="ad_campaign">Ad Campaign</option>
          <option value="reply">Reply</option>
          <option value="constitution_change">Constitution Change</option>
        </select>

        <div style={{ flex: 1 }} />

        {/* Stats */}
        {urgentCount > 0 && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: '#ef4444',
            background: 'rgba(239,68,68,0.08)', borderRadius: 20, padding: '3px 10px',
          }}>
            {urgentCount} urgent
          </span>
        )}

        {/* Shortcuts hint */}
        <span style={{ fontSize: 11.5, color: '#9ca3af' }}>
          A approve · R reject · ↑↓ navigate
        </span>

        {/* Seed button (testing) */}
        {approvals.length === 0 && (
          <button onClick={handleSeed} disabled={seeding} style={{
            height: 32, padding: '0 14px', borderRadius: 8, border: '1px dashed #d1d5db',
            background: '#fff', fontSize: 12.5, color: '#9ca3af', cursor: seeding ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            {seeding ? 'Seeding…' : 'Load test data'}
          </button>
        )}
      </div>

      {/* Split view */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Left — item list (40%) */}
        <div style={{
          width: '40%', minWidth: 280, borderRight: '1px solid #ebebeb',
          display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden',
        }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1,2,3,4].map(i => (
                  <div key={i} style={{ height: 80, borderRadius: 10, background: '#f3f4f6', animation: 'apPulse 1.5s ease-in-out infinite' }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117', marginBottom: 6 }}>
                  {statusFilter === 'pending' ? 'All caught up!' : 'Nothing here yet'}
                </div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>
                  {statusFilter === 'pending' ? 'No items awaiting approval.' : `No ${statusFilter} items.`}
                </div>
                {approvals.length === 0 && (
                  <button onClick={handleSeed} disabled={seeding} style={{
                    marginTop: 16, padding: '8px 18px', borderRadius: 9,
                    border: '1.5px dashed #d1d5db', background: '#fff',
                    fontSize: 13, color: '#6b7280', cursor: seeding ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}>
                    {seeding ? 'Loading…' : 'Load test data'}
                  </button>
                )}
              </div>
            ) : (
              filtered.map(item => {
                const ps = PRIORITY[item.priority] ?? PRIORITY.normal;
                const isSelected = item.id === selectedId;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      padding: '14px 18px',
                      borderBottom: '1px solid #f5f5f5',
                      background: isSelected ? 'rgba(75,166,234,0.06)' : '#fff',
                      borderLeft: isSelected ? '3px solid #4ba6ea' : '3px solid transparent',
                      cursor: 'pointer',
                      transition: 'background 120ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 7 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 8, background: '#f3f4f6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {itemTypeIcon(item.item_type)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', lineHeight: 1.4, marginBottom: 3 }}>
                          {item.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: ps.color, background: ps.bg, borderRadius: 20, padding: '1px 7px' }}>
                            {ps.label}
                          </span>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>
                            {ITEM_TYPE_LABEL[item.item_type] ?? item.item_type}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 40 }}>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>by {item.bot_who_created.replace(/_/g,' ')}</span>
                      <span style={{ color: '#e5e7eb' }}>·</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{timeAgo(item.created_at)}</span>
                      {item.deadline_at && (
                        <>
                          <span style={{ color: '#e5e7eb' }}>·</span>
                          <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
                            deadline {timeAgo(item.deadline_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right — detail panel (60%) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>
          {!selectedItem ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ color: '#d1d5db' }}>
                <polyline points="9 11 12 14 22 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ fontSize: 14, color: '#9ca3af' }}>Select an item to preview</div>
            </div>
          ) : (
            <>
              {/* Detail content (scrollable) */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

                {/* Item header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: '#fff',
                    border: '1px solid #e5e7eb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {itemTypeIcon(selectedItem.item_type)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px', marginBottom: 5 }}>
                      {selectedItem.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {(() => { const ps = PRIORITY[selectedItem.priority] ?? PRIORITY.normal; return (
                        <span style={{ fontSize: 11, fontWeight: 700, color: ps.color, background: ps.bg, borderRadius: 20, padding: '2px 9px' }}>{ps.label}</span>
                      );})()}
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{ITEM_TYPE_LABEL[selectedItem.item_type] ?? selectedItem.item_type}</span>
                      <span style={{ color: '#e5e7eb' }}>·</span>
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>by {selectedItem.bot_who_created.replace(/_/g,' ')}</span>
                      <span style={{ color: '#e5e7eb' }}>·</span>
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>{timeAgo(selectedItem.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Content preview */}
                {selectedItem.content && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                      Content Preview
                    </div>
                    <div style={{
                      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
                      padding: '16px 18px', fontSize: 13.5, color: '#374151',
                      lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {selectedItem.content}
                    </div>
                  </div>
                )}

                {/* Bot reasoning */}
                {selectedItem.reasoning && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                      Bot Reasoning
                    </div>
                    <div style={{
                      background: 'rgba(75,166,234,0.05)', border: '1px solid rgba(75,166,234,0.20)',
                      borderRadius: 12, padding: '14px 18px',
                      fontSize: 13, color: '#374151', lineHeight: 1.6,
                    }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#4ba6ea', flexShrink: 0, marginTop: 2 }}>
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                          <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                        <span>{selectedItem.reasoning}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedItem.notes && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                      Notes
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                      {selectedItem.notes}
                    </div>
                  </div>
                )}

                {/* Reviewer feedback (if reviewed) */}
                {selectedItem.user_feedback && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                      Review Feedback
                    </div>
                    <div style={{ background: '#fef9ec', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
                      {selectedItem.user_feedback}
                    </div>
                  </div>
                )}
              </div>

              {/* Action bar */}
              {selectedItem.status === 'pending' && (
                <div style={{
                  padding: '16px 28px', borderTop: '1px solid #e5e7eb', background: '#fff',
                  display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
                }}>
                  {/* Approve */}
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    style={{
                      height: 40, padding: '0 22px', borderRadius: 10, border: 'none',
                      background: actionLoading ? '#86efac' : '#10b981', color: '#fff',
                      fontSize: 14, fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7,
                      transition: 'background 140ms ease',
                    }}
                    onMouseEnter={e => { if (!actionLoading) (e.currentTarget as HTMLButtonElement).style.background = '#059669'; }}
                    onMouseLeave={e => { if (!actionLoading) (e.currentTarget as HTMLButtonElement).style.background = '#10b981'; }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Approve <span style={{ fontSize: 11, opacity: 0.8, fontWeight: 400 }}>A</span>
                  </button>

                  {/* Request changes */}
                  <button
                    onClick={() => setFeedbackModal('request_changes')}
                    disabled={actionLoading}
                    style={{
                      height: 40, padding: '0 18px', borderRadius: 10,
                      border: '1.5px solid #e5e7eb', background: '#fff',
                      fontSize: 14, fontWeight: 500, color: '#374151',
                      cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      transition: 'border-color 140ms ease',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
                  >
                    Request Changes
                  </button>

                  <div style={{ flex: 1 }} />

                  {/* Reject */}
                  <button
                    onClick={() => setFeedbackModal('reject')}
                    disabled={actionLoading}
                    style={{
                      height: 40, padding: '0 18px', borderRadius: 10,
                      border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)',
                      fontSize: 14, fontWeight: 500, color: '#ef4444',
                      cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 7,
                      transition: 'all 140ms ease',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.10)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.05)'; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    Reject <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>R</span>
                  </button>
                </div>
              )}

              {/* Reviewed status banner */}
              {selectedItem.status !== 'pending' && (
                <div style={{
                  padding: '14px 28px', borderTop: '1px solid #e5e7eb', background: '#fff',
                  display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
                }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                    color: selectedItem.status === 'approved' ? '#10b981' : '#ef4444',
                    background: selectedItem.status === 'approved' ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
                  }}>
                    {selectedItem.status.charAt(0).toUpperCase() + selectedItem.status.slice(1)}
                  </span>
                  {selectedItem.reviewed_at && (
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>
                      by {selectedItem.reviewed_by ?? 'admin'} · {timeAgo(selectedItem.reviewed_at)}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Feedback modal */}
      {feedbackModal && (
        <FeedbackModal
          action={feedbackModal}
          onConfirm={handleFeedbackConfirm}
          onCancel={() => setFeedbackModal(null)}
          loading={actionLoading}
        />
      )}

      {toasts.map(t => <Toast key={t.id} t={t} />)}

      <style>{`
        @keyframes apPulse  { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes apSlide  { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes apSlideUp{ from{transform:translateY(14px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>
  );
};

export default MarketingApprovalsPage;
