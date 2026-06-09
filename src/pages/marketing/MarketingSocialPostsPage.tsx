import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { socialFrom } from '../../lib/socialClient';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContentPost {
  id: string;
  content_type: string | null;
  format: string | null;
  platform: string | null;
  season: string | null;
  target_audience: string | null;
  caption_language: string | null;
  headline: string | null;
  caption: string | null;
  hashtags: string[] | null;
  image_brief: string | null;
  reasoning: string | null;
  requires_design: boolean | null;
  design_id: string | null;
  media_urls: string[] | null;
  status: string;
  review_note: string | null;
  created_by: string | null;
  created_at: string;
  // Image generation fields
  generated_images: { url: string; order: number }[] | null;
  base_car_photo_url: string | null;
  used_car_id: number | null;
  used_model_group_id: number | null;
  image_status: string | null;
  image_review_note: string | null;
  image_time_mood: string | null;
  image_environment: string | null;
  image_generated_at: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:          { label: 'Draft',          color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' },
  pending_review: { label: 'Pending Review', color: '#d97706', bg: '#fef3c7', border: '#fde68a' },
  approved:       { label: 'Approved',       color: '#059669', bg: '#d1fae5', border: '#6ee7b7' },
  rejected:       { label: 'Rejected',       color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
};

const STATUS_TABS = ['all', 'pending_review', 'approved', 'rejected', 'draft'] as const;

const AUDIENCE_LABELS: Record<string, string> = {
  arab_tourists: 'Arab Tourists',
  local_tr:      'Local TR',
  expats:        'Expats',
};

const LANG_COLORS: Record<string, { color: string; bg: string }> = {
  ar: { color: '#7c3aed', bg: '#ede9fe' },
  tr: { color: '#dc2626', bg: '#fee2e2' },
  en: { color: '#1d4ed8', bg: '#dbeafe' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastData { id: number; message: string; type: 'success' | 'error' | 'info'; }

const Toast: React.FC<{ t: ToastData }> = ({ t }) =>
  ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 4000, display: 'flex', alignItems: 'center', gap: 10, background: t.type === 'error' ? '#ef4444' : '#0f1117', color: '#fff', borderRadius: 12, padding: '12px 20px', fontSize: 14, fontWeight: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', animation: 'spSlide 200ms ease' }}>
      {t.type === 'success' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>}
      {t.type === 'error'   && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>}
      {t.message}
    </div>,
    document.body
  );

// ─── Skeleton row ─────────────────────────────────────────────────────────────

const SkRow: React.FC = () => (
  <tr style={{ borderBottom: '1px solid #f9fafb' }}>
    {[300, 120, 110, 60, 90, 70, 20].map((w, i) => (
      <td key={i} style={{ padding: '14px 16px' }}>
        <div style={{ width: w, height: 13, borderRadius: 5, background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'spPulse 1.5s ease-in-out infinite' }} />
      </td>
    ))}
  </tr>
);

// ─── Status Badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 600, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
};

// ─── Lang Badge ───────────────────────────────────────────────────────────────

const LangBadge: React.FC<{ lang: string | null }> = ({ lang }) => {
  if (!lang) return null;
  const c = LANG_COLORS[lang] ?? { color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 6, background: c.bg, fontSize: 11, fontWeight: 700, color: c.color, letterSpacing: '0.04em' }}>
      {lang.toUpperCase()}
    </span>
  );
};

// ─── Image Section ────────────────────────────────────────────────────────────

const ImageSection: React.FC<{
  post: ContentPost;
  onUpdated: (updated: ContentPost) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}> = ({ post, onUpdated, showToast }) => {
  const imageStatus = post.image_status ?? 'not_started';
  const generatedUrl = post.generated_images?.[0]?.url ?? null;

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);
  const [modelGroupName, setModelGroupName] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset local state when post changes
  useEffect(() => {
    setGenError(null);
    setRejectMode(false);
    setRejectNote('');
  }, [post.id]);

  // Fetch model group name for display
  useEffect(() => {
    if (!post.used_model_group_id) { setModelGroupName(null); return; }
    supabase
      .from('model_group')
      .select('brand, model')
      .eq('id', post.used_model_group_id)
      .single()
      .then(({ data }) => {
        setModelGroupName(data ? `${data.brand} ${data.model}` : null);
      });
  }, [post.used_model_group_id]);

  // Poll DB every 3s while status is 'generating'
  useEffect(() => {
    if (imageStatus !== 'generating') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 50) { clearInterval(pollRef.current!); pollRef.current = null; return; }
      const { data } = await socialFrom('sm_content_social').select('*').eq('id', post.id).single();
      if (data && data.image_status !== 'generating') {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        onUpdated(data as ContentPost);
      }
    }, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [imageStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerGenerate = async (mode: 'create' | 'regenerate') => {
    setGenerating(true);
    setGenError(null);
    // Optimistically set status to 'generating' so polling starts if user navigates away
    onUpdated({ ...post, image_status: 'generating' });
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_id: post.id, mode }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? `Image generator failed (HTTP ${res.status})`);
      }
      // Fetch the fresh row
      const { data: fresh } = await socialFrom('sm_content_social').select('*').eq('id', post.id).single();
      if (fresh) onUpdated(fresh as ContentPost);
      showToast('Image generated successfully', 'success');
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      setGenError(msg);
      showToast('Image generation failed', 'error');
      // Revert optimistic status
      const { data: fresh } = await socialFrom('sm_content_social').select('*').eq('id', post.id).single();
      if (fresh) onUpdated(fresh as ContentPost);
    } finally {
      setGenerating(false);
    }
  };

  const handleApproveImage = async () => {
    const { data, error } = await socialFrom('sm_content_social')
      .update({ image_status: 'image_approved' })
      .eq('id', post.id)
      .select()
      .single();
    if (error) { showToast('Failed to approve: ' + error.message, 'error'); return; }
    showToast('Image approved', 'success');
    onUpdated(data as ContentPost);
  };

  const handleRejectSubmit = async () => {
    if (!rejectNote.trim()) { showToast('Please describe what to fix', 'error'); return; }
    setRejectBusy(true);
    await socialFrom('sm_content_social')
      .update({ image_review_note: rejectNote.trim() })
      .eq('id', post.id);
    setRejectMode(false);
    await triggerGenerate('regenerate');
    setRejectBusy(false);
  };

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px',
    fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 9,
    fontFamily: 'inherit', outline: 'none', color: '#0f1117',
    transition: 'border-color 140ms ease', background: '#fff',
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6,
  };

  // ── Lightbox portal ─────────────────────────────────────────────────────────
  const lightbox = lightboxOpen && generatedUrl ? ReactDOM.createPortal(
    <div
      onClick={() => setLightboxOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
    >
      <img src={generatedUrl} alt="Generated poster" style={{ maxHeight: '92vh', maxWidth: '92vw', borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} />
    </div>,
    document.body
  ) : null;

  // ── not_started ─────────────────────────────────────────────────────────────
  if (imageStatus === 'not_started') {
    return (
      <div>
        <div style={sectionLabel}>Image Generation</div>
        <div style={{ background: '#f9fafb', border: '1.5px dashed #e5e7eb', borderRadius: 12, padding: '28px 20px', textAlign: 'center' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 10px', display: 'block', color: '#9ca3af' }}>
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>No image generated yet for this post.</p>
          {genError && (
            <div style={{ marginBottom: 14, padding: '10px 13px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, fontSize: 12, color: '#b91c1c', textAlign: 'left', wordBreak: 'break-word' }}>
              <strong>Error:</strong> {genError}
            </div>
          )}
          <button
            onClick={() => triggerGenerate('create')}
            disabled={generating}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 24px', borderRadius: 10, border: 'none',
              background: generating ? '#e5e7eb' : '#4ba6ea',
              color: generating ? '#9ca3af' : '#fff',
              fontSize: 14, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer',
              transition: 'background 140ms ease',
            }}
          >
            {generating ? (
              <>
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spSpin 0.8s linear infinite' }} />
                Generating…
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>
                Generate Image
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── generating ──────────────────────────────────────────────────────────────
  if (imageStatus === 'generating') {
    return (
      <div>
        <div style={sectionLabel}>Image Generation</div>
        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: '28px 20px', textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #fbbf24', borderTopColor: 'transparent', animation: 'spSpin 0.9s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>Generating image…</div>
          <div style={{ fontSize: 12, color: '#b45309' }}>Gemini is compositing the scene. This takes 15–30 seconds.</div>
        </div>
      </div>
    );
  }

  // ── pending_image_review ─────────────────────────────────────────────────────
  if (imageStatus === 'pending_image_review' || imageStatus === 'image_rejected') {
    return (
      <div>
        {lightbox}
        <div style={sectionLabel}>Image Review</div>

        {imageStatus === 'image_rejected' && (
          <div style={{ marginBottom: 12, padding: '10px 13px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 9, fontSize: 12, color: '#b91c1c' }}>
            Previously rejected — regenerate to get a new version.
          </div>
        )}

        {/* Generated image */}
        {generatedUrl ? (
          <div style={{ marginBottom: 14 }}>
            <img
              src={generatedUrl}
              alt="Generated poster"
              onClick={() => setLightboxOpen(true)}
              style={{ width: '100%', borderRadius: 12, border: '1.5px solid #f0f0f0', cursor: 'zoom-in', display: 'block' }}
            />
          </div>
        ) : (
          <div style={{ background: '#f3f4f6', borderRadius: 10, padding: 20, marginBottom: 14, fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>No image URL found</div>
        )}

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {modelGroupName && (
            <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(75,166,234,0.08)', color: '#4ba6ea', border: '1px solid rgba(75,166,234,0.2)', borderRadius: 6, padding: '3px 9px' }}>
              {modelGroupName}
            </span>
          )}
          {post.image_environment && (
            <span style={{ fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#6b7280', borderRadius: 6, padding: '3px 9px', textTransform: 'capitalize' }}>
              {post.image_environment.replace(/_/g, ' ')}
            </span>
          )}
          {post.image_time_mood && (
            <span style={{ fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#6b7280', borderRadius: 6, padding: '3px 9px', textTransform: 'capitalize' }}>
              {post.image_time_mood.replace(/_/g, ' ')}
            </span>
          )}
          {post.base_car_photo_url && (
            <a
              href={post.base_car_photo_url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#6b7280', borderRadius: 6, padding: '3px 9px', textDecoration: 'none' }}
            >
              View source photo ↗
            </a>
          )}
        </div>

        {/* Reject note textarea */}
        {rejectMode ? (
          <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: 14, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10, animation: 'spFadeIn 150ms ease' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>What should be fixed?</div>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. The sky is too dark. Make it golden hour. Move the car lower in frame."
              style={{ ...inp, borderColor: '#fca5a5', resize: 'vertical', lineHeight: 1.6 }}
              onFocus={e => (e.target.style.borderColor = '#ef4444')}
              onBlur={e => (e.target.style.borderColor = '#fca5a5')}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setRejectMode(false)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={handleRejectSubmit}
                disabled={rejectBusy || generating || !rejectNote.trim()}
                style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: (!rejectNote.trim() || rejectBusy || generating) ? '#f3f4f6' : '#dc2626', color: (!rejectNote.trim() || rejectBusy || generating) ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 600, cursor: (!rejectNote.trim() || rejectBusy || generating) ? 'not-allowed' : 'pointer' }}
              >
                {(rejectBusy || generating) ? 'Regenerating…' : 'Regenerate with this note'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleApproveImage}
              style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: '#059669', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="1.8"/></svg>
              Approve Image
            </button>
            <button
              onClick={() => setRejectMode(true)}
              style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1.5px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Reject &amp; Redo
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── image_approved ───────────────────────────────────────────────────────────
  if (imageStatus === 'image_approved') {
    return (
      <div>
        {lightbox}
        <div style={sectionLabel}>Image</div>

        {generatedUrl && (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <img
              src={generatedUrl}
              alt="Approved poster"
              onClick={() => setLightboxOpen(true)}
              style={{ width: '100%', borderRadius: 12, border: '2px solid #6ee7b7', cursor: 'zoom-in', display: 'block' }}
            />
            <span style={{ position: 'absolute', top: 10, right: 10, background: '#059669', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
              ✓ Approved
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {modelGroupName && (
            <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(75,166,234,0.08)', color: '#4ba6ea', border: '1px solid rgba(75,166,234,0.2)', borderRadius: 6, padding: '3px 9px' }}>
              {modelGroupName}
            </span>
          )}
          {post.image_environment && (
            <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', borderRadius: 6, padding: '3px 9px', textTransform: 'capitalize' }}>
              {post.image_environment.replace(/_/g, ' ')}
            </span>
          )}
          {post.image_time_mood && (
            <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', borderRadius: 6, padding: '3px 9px', textTransform: 'capitalize' }}>
              {post.image_time_mood.replace(/_/g, ' ')}
            </span>
          )}
          {post.base_car_photo_url && (
            <a href={post.base_car_photo_url} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', borderRadius: 6, padding: '3px 9px', textDecoration: 'none' }}>
              Source photo ↗
            </a>
          )}
        </div>

        <button
          onClick={() => triggerGenerate('create')}
          disabled={generating}
          style={{ width: '100%', padding: '9px 0', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: generating ? 'not-allowed' : 'pointer' }}
        >
          {generating ? 'Regenerating…' : 'Regenerate anyway'}
        </button>
      </div>
    );
  }

  return null;
};

// ─── Detail Drawer ────────────────────────────────────────────────────────────

interface DrawerProps {
  post: ContentPost;
  onClose: () => void;
  onUpdated: (updated: ContentPost) => void;
  onDeleted: (id: string) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const DetailDrawer: React.FC<DrawerProps> = ({ post, onClose, onUpdated, onDeleted, showToast }) => {
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [rejectNote, setRejectNote] = useState('');
  const [editHeadline, setEditHeadline] = useState(post.headline ?? '');
  const [editCaption, setEditCaption] = useState(post.caption ?? '');
  const [editHashtags, setEditHashtags] = useState((post.hashtags ?? []).join(', '));
  const [editImageBrief, setEditImageBrief] = useState(post.image_brief ?? '');
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset edit state when post changes
  useEffect(() => {
    setEditHeadline(post.headline ?? '');
    setEditCaption(post.caption ?? '');
    setEditHashtags((post.hashtags ?? []).join(', '));
    setEditImageBrief(post.image_brief ?? '');
    setMode('view');
    setDeleteConfirm(false);
    setRejectNote('');
    setPolling(false);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
  }, [post.id]);

  // Poll until the bot rewrites the post back to pending_review
  useEffect(() => {
    if (!polling) return;
    let attempts = 0;
    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 20) { // 20 × 4 s = 80 s max
        clearInterval(pollIntervalRef.current!);
        setPolling(false);
        return;
      }
      const { data } = await socialFrom('sm_content_social')
        .select('*')
        .eq('id', post.id)
        .single();
      if (data && data.status === 'pending_review') {
        clearInterval(pollIntervalRef.current!);
        setPolling(false);
        showToast('✍️ أعاد الكاتب صياغة البوست — جاهز للمراجعة', 'success');
        onUpdated(data as ContentPost);
      }
    }, 4000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [polling]); // eslint-disable-line react-hooks/exhaustive-deps

  const isRtl = post.caption_language === 'ar';

  const handleApprove = async () => {
    setBusy(true);
    const { data, error } = await socialFrom('sm_content_social')
      .update({ status: 'approved' })
      .eq('id', post.id)
      .select()
      .single();
    setBusy(false);
    if (error) { showToast('Approve failed: ' + error.message, 'error'); return; }
    showToast('Post approved', 'success');
    onUpdated(data as ContentPost);
  };

  const handleRejectConfirm = async () => {
    if (!rejectNote.trim()) { showToast('سبب الرفض مطلوب', 'error'); return; }
    setBusy(true);
    const note = rejectNote.trim();
    const { data, error } = await socialFrom('sm_content_social')
      .update({ status: 'rejected', review_note: note })
      .eq('id', post.id)
      .select()
      .single();
    setBusy(false);
    if (error) { showToast('Reject failed: ' + error.message, 'error'); return; }

    // Fire-and-forget: send to Content Writer bot for auto-revision
    fetch('https://n8n-n8n.gdsddq.easypanel.host/webhook/content-writer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'revise', post_id: post.id, review_note: note }),
    }).catch(() => {});

    showToast('تم الرفض — كاتب المحتوى يعيد كتابة البوست الآن…', 'info');
    onUpdated(data as ContentPost);
    setMode('view');
    setRejectNote('');
    setPolling(true);
  };

  const handleSaveEdit = async () => {
    setBusy(true);
    const { data, error } = await socialFrom('sm_content_social')
      .update({
        headline:    editHeadline.trim() || null,
        caption:     editCaption.trim() || null,
        hashtags:    editHashtags ? editHashtags.split(',').map(t => t.trim()).filter(Boolean) : null,
        image_brief: editImageBrief.trim() || null,
      })
      .eq('id', post.id)
      .select()
      .single();
    setBusy(false);
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    showToast('Changes saved', 'success');
    onUpdated(data as ContentPost);
    setMode('view');
  };

  const handleDelete = async () => {
    setBusy(true);
    const { error } = await socialFrom('sm_content_social').delete().eq('id', post.id);
    setBusy(false);
    if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }
    showToast('Post deleted', 'info');
    onDeleted(post.id);
  };

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px',
    fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 9,
    fontFamily: 'inherit', outline: 'none', color: '#0f1117',
    transition: 'border-color 140ms ease', background: '#fff',
  };
  const onFocusBlue = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    (e.target.style.borderColor = '#4ba6ea');
  const onBlurGray = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    (e.target.style.borderColor = '#e5e7eb');

  const sectionLabel: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 700, color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6,
  };

  return ReactDOM.createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(15,17,23,0.32)', backdropFilter: 'blur(2px)', animation: 'spFadeIn 160ms ease' }}
      />
      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 2100,
        width: '100%', maxWidth: 580,
        background: '#fff', boxShadow: '-8px 0 48px rgba(0,0,0,0.13)',
        display: 'flex', flexDirection: 'column',
        animation: 'spSlideIn 220ms ease',
      }}>

        {/* Drawer header */}
        <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
                <StatusBadge status={post.status} />
                <LangBadge lang={post.caption_language} />
                {post.content_type && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 6, textTransform: 'capitalize' }}>
                    {post.content_type.replace(/_/g, ' ')}
                  </span>
                )}
                {post.format && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 6, textTransform: 'capitalize' }}>
                    {post.format}
                  </span>
                )}
              </div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f1117', lineHeight: 1.35 }}>
                {mode === 'edit' ? 'Editing post' : (post.headline || <span style={{ color: '#9ca3af', fontStyle: 'italic', fontWeight: 400 }}>No headline</span>)}
              </h2>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 5 }}>
                By <span style={{ color: '#6b7280', fontWeight: 600 }}>{post.created_by || 'bot'}</span> · {timeAgo(post.created_at)}
              </div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {/* Drawer body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Headline */}
          <div>
            <div style={sectionLabel}>Headline</div>
            {mode === 'edit'
              ? <input value={editHeadline} onChange={e => setEditHeadline(e.target.value)} placeholder="Headline text…" style={inp} onFocus={onFocusBlue} onBlur={onBlurGray} />
              : <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117', lineHeight: 1.5 }}>{post.headline || <span style={{ color: '#d1d5db', fontStyle: 'italic' }}>None</span>}</div>
            }
          </div>

          {/* Caption */}
          <div>
            <div style={sectionLabel}>Caption {post.caption_language ? `(${post.caption_language.toUpperCase()})` : ''}</div>
            {mode === 'edit'
              ? (
                <textarea
                  value={editCaption}
                  onChange={e => setEditCaption(e.target.value)}
                  rows={6}
                  dir={isRtl ? 'rtl' : 'ltr'}
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }}
                  onFocus={onFocusBlue}
                  onBlur={onBlurGray}
                />
              ) : (
                <p
                  dir={isRtl ? 'rtl' : 'ltr'}
                  style={{ margin: 0, fontSize: 14, color: '#1f2937', lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '13px 15px', background: '#f9fafb', borderRadius: 10, border: '1px solid #f0f0f0' }}
                >
                  {post.caption || <span style={{ color: '#d1d5db', fontStyle: 'italic' }}>No caption</span>}
                </p>
              )
            }
          </div>

          {/* Hashtags */}
          <div>
            <div style={sectionLabel}>Hashtags</div>
            {mode === 'edit'
              ? <input value={editHashtags} onChange={e => setEditHashtags(e.target.value)} placeholder="Tag1, Tag2, Tag3 (no #)" style={inp} onFocus={onFocusBlue} onBlur={onBlurGray} />
              : (post.hashtags?.length
                  ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {post.hashtags.map(tag => (
                        <span key={tag} style={{ fontSize: 12, fontWeight: 500, color: '#4ba6ea', background: 'rgba(75,166,234,0.08)', border: '1px solid rgba(75,166,234,0.2)', borderRadius: 6, padding: '3px 9px' }}>#{tag}</span>
                      ))}
                    </div>
                  : <span style={{ fontSize: 13, color: '#9ca3af' }}>None</span>
              )
            }
          </div>

          {/* Image Brief */}
          <div>
            <div style={sectionLabel}>Image Brief <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(for the designer)</span></div>
            {mode === 'edit'
              ? (
                <textarea
                  value={editImageBrief}
                  onChange={e => setEditImageBrief(e.target.value)}
                  rows={4}
                  placeholder="Visual instructions for the designer…"
                  style={{ ...inp, resize: 'vertical', fontFamily: 'ui-monospace, "Cascadia Code", monospace', fontSize: 12 }}
                  onFocus={onFocusBlue}
                  onBlur={onBlurGray}
                />
              ) : post.image_brief
                ? <pre style={{ margin: 0, padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 12, lineHeight: 1.65, color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, "Cascadia Code", monospace' }}>{post.image_brief}</pre>
                : <span style={{ fontSize: 13, color: '#9ca3af' }}>No brief provided</span>
            }
          </div>

          {/* Reasoning */}
          {post.reasoning && (
            <div>
              <div style={sectionLabel}>Reasoning</div>
              <p style={{ margin: 0, fontSize: 13, color: '#4b5563', lineHeight: 1.65, fontStyle: 'italic', borderLeft: '3px solid #e5e7eb', paddingLeft: 12 }}>{post.reasoning}</p>
            </div>
          )}

          {/* Meta grid */}
          <div>
            <div style={sectionLabel}>Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Platform',        value: post.platform?.replace(/_/g, ' + ') ?? '—' },
                { label: 'Format',          value: post.format ?? '—' },
                { label: 'Season',          value: post.season ?? '—' },
                { label: 'Audience',        value: AUDIENCE_LABELS[post.target_audience ?? ''] ?? post.target_audience ?? '—' },
                { label: 'Requires Design', value: post.requires_design === true ? 'Yes' : post.requires_design === false ? 'No' : '—' },
                { label: 'Created',         value: fmtDate(post.created_at) },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#f9fafb', borderRadius: 9, padding: '10px 13px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', textTransform: 'capitalize' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Image generation section — only for approved content */}
          {post.status === 'approved' && mode === 'view' && (
            <ImageSection post={post} onUpdated={onUpdated} showToast={showToast} />
          )}

          {/* Existing rejection note (view mode) */}
          {post.status === 'rejected' && post.review_note && mode === 'view' && (
            <div style={{ padding: '12px 14px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Rejection Note</div>
              <p style={{ margin: 0, fontSize: 13, color: '#7f1d1d', lineHeight: 1.55 }}>{post.review_note}</p>
            </div>
          )}

          {/* Reject: note textarea */}
          {mode === 'reject' && (
            <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, animation: 'spFadeIn 150ms ease' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', direction: 'rtl', textAlign: 'right' }}>لماذا رفضت هذا البوست؟</div>
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                rows={4}
                autoFocus
                dir="rtl"
                lang="ar"
                placeholder="اكتب سبب الرفض هنا… مثال: الكابشن طويل، اختصره وخلي النبرة أبسط"
                style={{ ...inp, borderColor: '#fca5a5', resize: 'vertical', lineHeight: 1.65, direction: 'rtl', textAlign: 'right', fontFamily: '"Segoe UI", -apple-system, sans-serif' }}
                onFocus={e => (e.target.style.borderColor = '#ef4444')}
                onBlur={e => (e.target.style.borderColor = '#fca5a5')}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setMode('view')} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>إلغاء</button>
                <button
                  onClick={handleRejectConfirm}
                  disabled={busy || !rejectNote.trim()}
                  style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: (!rejectNote.trim() || busy) ? '#f3f4f6' : '#dc2626', color: (!rejectNote.trim() || busy) ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 600, cursor: (!rejectNote.trim() || busy) ? 'not-allowed' : 'pointer', transition: 'all 140ms ease' }}
                >
                  {busy ? '…' : 'تأكيد الرفض'}
                </button>
              </div>
            </div>
          )}

          {/* Polling indicator — shown while waiting for bot revision */}
          {polling && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, animation: 'spFadeIn 200ms ease' }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #f59e0b', borderTopColor: 'transparent', animation: 'spSpin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#92400e', fontWeight: 500 }}>كاتب المحتوى يعيد كتابة البوست…</span>
            </div>
          )}

          {/* Delete confirm */}
          {deleteConfirm && (
            <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, animation: 'spFadeIn 150ms ease' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>Permanently delete this post?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setDeleteConfirm(false)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleDelete} disabled={busy} style={{ flex: 2, padding: '8px 0', borderRadius: 8, border: 'none', background: busy ? '#f3f4f6' : '#dc2626', color: busy ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                  {busy ? 'Deleting…' : 'Yes, delete'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {mode === 'view' && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {post.status !== 'approved' && (
              <button
                onClick={handleApprove}
                disabled={busy}
                style={{ flex: 2, minWidth: 100, padding: '10px 0', borderRadius: 10, border: 'none', background: busy ? '#e5e7eb' : '#059669', color: busy ? '#9ca3af' : '#fff', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', transition: 'background 140ms ease' }}
              >
                {busy ? '…' : '✓ Approve'}
              </button>
            )}
            {post.status !== 'rejected' && (
              <button
                onClick={() => { setMode('reject'); setDeleteConfirm(false); }}
                disabled={busy}
                style={{ flex: 1, minWidth: 80, padding: '10px 0', borderRadius: 10, border: '1.5px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}
              >
                Reject
              </button>
            )}
            <button
              onClick={() => { setMode('edit'); setDeleteConfirm(false); }}
              disabled={busy}
              style={{ flex: 1, minWidth: 70, padding: '10px 0', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}
            >
              Edit
            </button>
            <button
              onClick={() => { setDeleteConfirm(true); setMode('view'); }}
              disabled={busy}
              title="Delete post"
              style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid #fee2e2', background: '#fff', color: '#ef4444', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        )}

        {mode === 'edit' && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setMode('view')} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSaveEdit} disabled={busy} style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: busy ? '#e5e7eb' : '#4ba6ea', color: busy ? '#9ca3af' : '#fff', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', transition: 'background 140ms ease' }}>
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const MarketingSocialPostsPage: React.FC = () => {
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending_review');
  const [audienceFilter, setAudienceFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ContentPost | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: ToastData['type'] = 'info') => {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await socialFrom('sm_content_social')
        .select('*')
        .order('created_at', { ascending: false });
      if (!cancelled) {
        if (error) showToast('Failed to load posts: ' + error.message, 'error');
        else setPosts((data as ContentPost[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: posts.length };
    posts.forEach(p => { c[p.status] = (c[p.status] ?? 0) + 1; });
    return c;
  }, [posts]);

  const filtered = useMemo(() => posts.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (audienceFilter !== 'all' && p.target_audience !== audienceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (p.headline ?? '').toLowerCase().includes(q) || (p.caption ?? '').toLowerCase().includes(q);
    }
    return true;
  }), [posts, statusFilter, audienceFilter, search]);

  const handleUpdated = (updated: ContentPost) => {
    setPosts(prev => prev.map(p => p.id === updated.id ? updated : p));
    setSelected(updated);
  };

  const handleDeleted = (id: string) => {
    setPosts(prev => prev.filter(p => p.id !== id));
    setSelected(null);
  };

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        @keyframes spPulse  { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes spSlide  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes spSlideIn{ from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes spSpin   { to{transform:rotate(360deg)} }
      `}</style>

      {toasts.map(t => <Toast key={t.id} t={t} />)}
      {selected && (
        <DetailDrawer
          post={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          showToast={showToast}
        />
      )}

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f1117', margin: 0 }}>Social Posts</h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0 0' }}>
          Review and approve content from the Content Writer bot
        </p>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 2 }}>
        {STATUS_TABS.map(tab => {
          const active = statusFilter === tab;
          const s = STATUS_CONFIG[tab];
          return (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 10,
                border: `1.5px solid ${active ? (s?.border ?? '#4ba6ea') : '#e5e7eb'}`,
                background: active ? (s?.bg ?? '#eff8ff') : '#fff',
                fontSize: 13, fontWeight: 600,
                color: active ? (s?.color ?? '#4ba6ea') : '#6b7280',
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 140ms ease', flexShrink: 0,
              }}
            >
              {tab === 'all' ? 'All' : (STATUS_CONFIG[tab]?.label ?? tab)}
              <span style={{
                minWidth: 18, height: 18, padding: '0 5px', borderRadius: 20,
                background: active ? (s?.color ?? '#4ba6ea') : '#e5e7eb',
                color: active ? '#fff' : '#6b7280',
                fontSize: 10, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {counts[tab] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search headline or caption…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 36px', fontSize: 14, border: '1.5px solid #e5e7eb', borderRadius: 10, fontFamily: 'inherit', outline: 'none', color: '#0f1117', transition: 'border-color 140ms ease', background: '#fff' }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
          />
        </div>
        {/* Audience filter */}
        <select
          value={audienceFilter}
          onChange={e => setAudienceFilter(e.target.value)}
          style={{ padding: '9px 12px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 10, fontFamily: 'inherit', outline: 'none', color: '#374151', background: '#fff', cursor: 'pointer' }}
        >
          <option value="all">All Audiences</option>
          {Object.entries(AUDIENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #f0f0f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
              {['Headline', 'Type', 'Audience', 'Lang', 'Status', 'Created', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkRow key={i} />)
              : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '72px 20px', textAlign: 'center' }}>
                      {posts.length === 0 ? (
                        <>
                          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 14px', display: 'block', opacity: 0.3 }}>
                            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>No posts yet</div>
                          <div style={{ fontSize: 13, color: '#9ca3af' }}>Posts written by the Content Writer bot will appear here.</div>
                        </>
                      ) : (
                        <>
                          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }}>
                            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280' }}>No matching posts</div>
                        </>
                      )}
                    </td>
                  </tr>
                )
                : filtered.map((p, i) => {
                    const isHov = hoveredId === p.id;
                    const isSel = selected?.id === p.id;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelected(p)}
                        onMouseEnter={() => setHoveredId(p.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{
                          borderBottom: i < filtered.length - 1 ? '1px solid #f9fafb' : 'none',
                          cursor: 'pointer',
                          background: isSel
                            ? 'rgba(75,166,234,0.05)'
                            : isHov ? '#f9fafb' : '#fff',
                          transition: 'background 100ms ease',
                        }}
                      >
                        {/* Headline */}
                        <td style={{ padding: '13px 16px', maxWidth: 300 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.headline || <span style={{ color: '#d1d5db', fontStyle: 'italic', fontWeight: 400 }}>No headline</span>}
                          </div>
                        </td>
                        {/* Type */}
                        <td style={{ padding: '13px 16px' }}>
                          <span style={{ fontSize: 12, color: '#6b7280', textTransform: 'capitalize' }}>{p.content_type?.replace(/_/g, ' ') ?? '—'}</span>
                        </td>
                        {/* Audience */}
                        <td style={{ padding: '13px 16px' }}>
                          <span style={{ fontSize: 12, color: '#6b7280' }}>{AUDIENCE_LABELS[p.target_audience ?? ''] ?? p.target_audience ?? '—'}</span>
                        </td>
                        {/* Lang */}
                        <td style={{ padding: '13px 16px' }}>
                          <LangBadge lang={p.caption_language} />
                        </td>
                        {/* Status */}
                        <td style={{ padding: '13px 16px' }}>
                          <StatusBadge status={p.status} />
                        </td>
                        {/* Created */}
                        <td style={{ padding: '13px 16px', fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                          {timeAgo(p.created_at)}
                        </td>
                        {/* Chevron */}
                        <td style={{ padding: '13px 16px' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: isHov || isSel ? '#4ba6ea' : '#d1d5db', transition: 'color 120ms ease' }}>
                            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </td>
                      </tr>
                    );
                  })
            }
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MarketingSocialPostsPage;
