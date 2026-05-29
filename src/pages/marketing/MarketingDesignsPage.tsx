import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../lib/supabase';
import { socialFrom } from '../../lib/socialClient';
import type { SmDesign } from '../../types/marketing';

// ─── Constants ────────────────────────────────────────────────────────────────

const DESIGN_TYPE_LABELS: Record<string, string> = {
  post_image:    'Post Image',
  story_image:   'Story Image',
  reel_cover:    'Reel Cover',
  ad_creative:   'Ad Creative',
  blog_featured: 'Blog Featured',
  logo_variant:  'Logo Variant',
  template:      'Template',
};

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  draft:            { color: '#6b7280', bg: '#f3f4f6',  border: '#e5e7eb', label: 'Draft' },
  pending_approval: { color: '#d97706', bg: '#fef3c7',  border: '#fde68a', label: 'Pending' },
  approved:         { color: '#059669', bg: '#d1fae5',  border: '#6ee7b7', label: 'Approved' },
  rejected:         { color: '#ef4444', bg: '#fee2e2',  border: '#fca5a5', label: 'Rejected' },
  archived:         { color: '#9ca3af', bg: '#f9fafb',  border: '#e5e7eb', label: 'Archived' },
};

const STATUS_TABS = ['all', 'draft', 'pending_approval', 'approved', 'rejected', 'archived'];
const TYPE_OPTIONS = ['all', ...Object.keys(DESIGN_TYPE_LABELS)];

const BRAND_COLORS = [
  { hex: '#4ba6ea', name: 'Primary Blue' },
  { hex: '#0f1117', name: 'Near Black' },
  { hex: '#ffffff', name: 'White' },
  { hex: '#f59e0b', name: 'Amber' },
  { hex: '#10b981', name: 'Green' },
];

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

function fmtBytes(kb: number | null): string {
  if (!kb) return '—';
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function slug(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastData { id: number; message: string; type: 'success' | 'error' | 'info'; }

const Toast: React.FC<{ t: ToastData }> = ({ t }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 3000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: t.type === 'error' ? '#ef4444' : '#0f1117',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'dsSlide 200ms ease',
    }}>
      {t.type === 'success' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>}
      {t.type === 'error'   && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>}
      {t.message}
    </div>,
    document.body
  );

// ─── Seed data ────────────────────────────────────────────────────────────────

const DESIGN_SEEDS = [
  {
    title: 'Hyundai Bayon Summer Drive — Post Image',
    description: 'Vibrant summer-themed post for Instagram and Facebook',
    design_type: 'post_image',
    purpose: 'Promote Bayon summer rental package',
    image_url: 'https://picsum.photos/seed/bayon-summer/800/800',
    thumbnail_url: 'https://picsum.photos/seed/bayon-summer/400/400',
    width: 1080, height: 1080, file_size_kb: 245,
    brand_colors_used: ['#4ba6ea', '#ffffff', '#0f1117'],
    fonts_used: ['Inter', 'SF Pro Display'],
    tags: ['summer', 'bayon', 'instagram', 'promotional'],
    status: 'approved', created_by: 'designer',
  },
  {
    title: 'Istanbul Bosphorus Story',
    description: 'Vertical story format showcasing Istanbul from rental car perspective',
    design_type: 'story_image',
    purpose: 'Brand awareness and tourism appeal',
    image_url: 'https://picsum.photos/seed/istanbul-story/600/1067',
    thumbnail_url: 'https://picsum.photos/seed/istanbul-story/300/533',
    width: 1080, height: 1920, file_size_kb: 312,
    brand_colors_used: ['#4ba6ea', '#1e293b'],
    fonts_used: ['Inter'],
    tags: ['istanbul', 'tourism', 'story', 'bosphorus'],
    status: 'approved', created_by: 'designer',
  },
  {
    title: 'KGM Torres EV Reel Cover',
    description: 'Eye-catching reel cover for KGM Torres EV reveal video',
    design_type: 'reel_cover',
    purpose: 'Capture attention in TikTok/Reels explore page',
    image_url: 'https://picsum.photos/seed/kgm-ev/800/800',
    thumbnail_url: 'https://picsum.photos/seed/kgm-ev/400/400',
    width: 1080, height: 1080, file_size_kb: 189,
    brand_colors_used: ['#10b981', '#0f1117', '#ffffff'],
    fonts_used: ['Inter', 'Montserrat'],
    tags: ['kgm', 'ev', 'electric', 'tiktok', 'reels'],
    status: 'pending_approval', created_by: 'designer',
  },
  {
    title: 'Ramadan Offer Ad Creative',
    description: 'Full ad creative for Ramadan rental discount campaign',
    design_type: 'ad_creative',
    purpose: 'Drive bookings during Ramadan season',
    image_url: 'https://picsum.photos/seed/ramadan-ad/1200/628',
    thumbnail_url: 'https://picsum.photos/seed/ramadan-ad/600/314',
    width: 1200, height: 628, file_size_kb: 421,
    brand_colors_used: ['#f59e0b', '#4ba6ea', '#0f1117'],
    fonts_used: ['Inter', 'Tajawal'],
    tags: ['ramadan', 'seasonal', 'arabic', 'ad', 'discount'],
    status: 'approved', created_by: 'designer',
  },
  {
    title: 'Istanbul Car Rental Guide — Blog Featured',
    description: 'Blog article hero image for the Istanbul car rental guide',
    design_type: 'blog_featured',
    purpose: 'Increase click-through rate from search and social',
    image_url: 'https://picsum.photos/seed/blog-istanbul/1600/900',
    thumbnail_url: 'https://picsum.photos/seed/blog-istanbul/800/450',
    width: 1600, height: 900, file_size_kb: 534,
    brand_colors_used: ['#4ba6ea', '#ffffff'],
    fonts_used: ['Inter'],
    tags: ['blog', 'istanbul', 'guide', 'seo'],
    status: 'draft', created_by: 'designer',
  },
  {
    title: 'HomestaCars Logo — White Variant',
    description: 'White version of the logo for dark backgrounds and video watermarks',
    design_type: 'logo_variant',
    purpose: 'Brand asset for dark-background use cases',
    image_url: 'https://picsum.photos/seed/logo-white/600/200',
    thumbnail_url: 'https://picsum.photos/seed/logo-white/300/100',
    width: 1200, height: 400, file_size_kb: 42,
    brand_colors_used: ['#ffffff'],
    fonts_used: ['SF Pro Display'],
    tags: ['logo', 'brand', 'white', 'assets'],
    status: 'approved', created_by: 'designer',
  },
  {
    title: 'Social Post Template — Promotional',
    description: 'Reusable template for all promotional social posts',
    design_type: 'template',
    purpose: 'Maintain visual consistency across posts',
    image_url: 'https://picsum.photos/seed/template-promo/800/800',
    thumbnail_url: 'https://picsum.photos/seed/template-promo/400/400',
    width: 1080, height: 1080, file_size_kb: 165,
    brand_colors_used: ['#4ba6ea', '#ffffff', '#0f1117'],
    fonts_used: ['Inter'],
    tags: ['template', 'promotional', 'reusable'],
    status: 'approved', created_by: 'designer',
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

const Sk: React.FC<{ w?: number | string; h?: number | string; radius?: number; style?: React.CSSProperties }> = ({ w = '100%', h = 16, radius = 6, style }) => (
  <div style={{ width: w, height: h, borderRadius: radius, background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'dsPulse 1.5s ease-in-out infinite', ...style }} />
);

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 600, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, background: 'rgba(75,166,234,0.1)', border: '1px solid rgba(75,166,234,0.25)', fontSize: 11, fontWeight: 600, color: '#4ba6ea', whiteSpace: 'nowrap' }}>
      {DESIGN_TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

interface DetailModalProps {
  design: SmDesign;
  onClose: () => void;
  onStatusChange: (id: string, newStatus: SmDesign['status']) => void;
  onDelete: (id: string) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const DetailModal: React.FC<DetailModalProps> = ({ design, onClose, onStatusChange, onDelete, showToast }) => {
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newStatus, setNewStatus] = useState<SmDesign['status']>(design.status);

  const handleStatusSave = async () => {
    if (newStatus === design.status) return;
    setSaving(true);
    const { error } = await socialFrom('sm_designs').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', design.id);
    setSaving(false);
    if (error) { showToast('Failed to update status', 'error'); return; }
    onStatusChange(design.id, newStatus);
    showToast('Status updated', 'success');
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(design.image_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${design.title.replace(/\s+/g, '_')}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Download failed', 'error');
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    const { error } = await socialFrom('sm_designs').delete().eq('id', design.id);
    setSaving(false);
    if (error) { showToast('Delete failed', 'error'); return; }
    showToast('Design deleted', 'info');
    onDelete(design.id);
    onClose();
  };

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 900, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.2)', animation: 'dsSlideUp 200ms ease', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117' }}>{design.title}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <TypeBadge type={design.design_type} />
              <StatusBadge status={design.status} />
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', gap: 0, flex: 1, overflow: 'hidden' }}>
          {/* Image */}
          <div style={{ flex: '0 0 55%', padding: 24, borderRight: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ borderRadius: 12, overflow: 'hidden', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
              <img
                src={design.image_url}
                alt={design.title}
                style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain', display: 'block' }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            {design.width && design.height && (
              <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                {design.width} × {design.height}px · {fmtBytes(design.file_size_kb)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleDownload} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                Download
              </button>
              <a href={design.image_url} target="_blank" rel="noreferrer" style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Open Original
              </a>
            </div>
          </div>

          {/* Metadata */}
          <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {design.description && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Description</div>
                <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{design.description}</div>
              </div>
            )}
            {design.purpose && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Purpose</div>
                <div style={{ fontSize: 14, color: '#374151' }}>{design.purpose}</div>
              </div>
            )}
            {design.brand_colors_used && design.brand_colors_used.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Brand Colors</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {design.brand_colors_used.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, background: c, border: '1px solid rgba(0,0,0,0.1)' }} />
                      <span style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {design.fonts_used && design.fonts_used.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Fonts</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {design.fonts_used.map((f, i) => (
                    <span key={i} style={{ padding: '3px 10px', background: '#f3f4f6', borderRadius: 20, fontSize: 12, color: '#374151' }}>{f}</span>
                  ))}
                </div>
              </div>
            )}
            {design.tags && design.tags.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Tags</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {design.tags.map((t, i) => (
                    <span key={i} style={{ padding: '3px 10px', background: '#eff8ff', borderRadius: 20, fontSize: 12, color: '#4ba6ea' }}>#{t}</span>
                  ))}
                </div>
              </div>
            )}
            {design.designer_notes && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>Designer Notes</div>
                <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.5 }}>{design.designer_notes}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Created</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>{timeAgo(design.created_at)} · by {design.created_by}</div>
            </div>

            {/* Status change */}
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Change Status</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {(['draft', 'pending_approval', 'approved', 'rejected', 'archived'] as SmDesign['status'][]).map(s => {
                  const st = STATUS_STYLE[s];
                  return (
                    <button key={s} onClick={() => setNewStatus(s)} style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${newStatus === s ? st.border : '#e5e7eb'}`, background: newStatus === s ? st.bg : '#fff', fontSize: 12, fontWeight: 600, color: newStatus === s ? st.color : '#6b7280', cursor: 'pointer' }}>
                      {st.label}
                    </button>
                  );
                })}
              </div>
              <button onClick={handleStatusSave} disabled={saving || newStatus === design.status} style={{ width: '100%', padding: '9px 0', borderRadius: 10, border: 'none', background: (saving || newStatus === design.status) ? '#e5e7eb' : '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: (saving || newStatus === design.status) ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : 'Save Status'}
              </button>
            </div>

            {/* Delete */}
            <div>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)} style={{ width: '100%', padding: '8px 0', borderRadius: 10, border: '1px solid #fee2e2', background: '#fff', fontSize: 13, fontWeight: 500, color: '#ef4444', cursor: 'pointer' }}>
                  Delete Design
                </button>
              ) : (
                <div style={{ background: '#fee2e2', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 10 }}>Are you sure? This cannot be undone.</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Cancel</button>
                    <button onClick={handleDelete} disabled={saving} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Deleting…' : 'Delete'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Upload Modal ─────────────────────────────────────────────────────────────

interface UploadModalProps {
  onClose: () => void;
  onCreated: (design: SmDesign) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const UploadModal: React.FC<UploadModalProps> = ({ onClose, onCreated, showToast }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    design_type: 'post_image' as SmDesign['design_type'],
    purpose: '',
    designer_notes: '',
    tags: '',
  });

  const pickFile = (f: File) => {
    if (!f.type.startsWith('image/')) { showToast('Only image files are supported', 'error'); return; }
    if (f.size > 10 * 1024 * 1024) { showToast('File must be under 10 MB', 'error'); return; }
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    if (!form.title) setForm(p => ({ ...p, title: f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') }));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  };

  const handleUpload = async () => {
    if (!file || !form.title.trim() || !form.design_type) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const id = slug();
      const path = `${form.design_type}/${id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('designs').upload(path, file, { upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { data: { publicUrl } } = supabase.storage.from('designs').getPublicUrl(path);

      const row = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        design_type: form.design_type,
        purpose: form.purpose.trim() || null,
        image_url: publicUrl,
        thumbnail_url: publicUrl,
        width: dims?.w ?? null,
        height: dims?.h ?? null,
        file_size_kb: Math.round(file.size / 1024),
        designer_notes: form.designer_notes.trim() || null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
        brand_colors_used: null,
        fonts_used: null,
        status: 'draft' as const,
        created_by: 'admin',
      };

      const { data, error: insErr } = await socialFrom('sm_designs').insert(row).select().single();
      if (insErr) throw new Error(insErr.message);
      showToast('Design uploaded successfully', 'success');
      onCreated(data as SmDesign);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      if (msg.includes('Bucket not found') || msg.includes('bucket')) {
        showToast('Storage bucket "designs" not found. Create it in Supabase Dashboard → Storage.', 'error');
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setUploading(false);
    }
  };

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.18)', animation: 'dsSlideUp 200ms ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117' }}>Upload Design</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Drop zone */}
          <div
            ref={dropRef}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            style={{ borderRadius: 14, border: `2px dashed ${dragging ? '#4ba6ea' : file ? '#10b981' : '#d1d5db'}`, background: dragging ? 'rgba(75,166,234,0.04)' : '#f9fafb', padding: 24, textAlign: 'center', cursor: 'pointer', transition: 'all 200ms ease', position: 'relative', minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}
          >
            {preview ? (
              <img src={preview} alt="preview" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, objectFit: 'contain' }} />
            ) : (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: '#9ca3af' }}><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div style={{ fontSize: 14, color: '#6b7280' }}>Drop image here or <span style={{ color: '#4ba6ea', fontWeight: 600 }}>browse</span></div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>JPG, PNG, WebP, GIF up to 10 MB</div>
              </>
            )}
            {file && dims && <div style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 11, color: '#9ca3af' }}>{dims.w}×{dims.h} · {fmtBytes(Math.round(file.size / 1024))}</div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />

          {/* Form fields */}
          {[
            { key: 'title', label: 'Title *', placeholder: 'Design title' },
            { key: 'purpose', label: 'Purpose', placeholder: 'What is this design for?' },
            { key: 'description', label: 'Description', placeholder: 'Brief description' },
            { key: 'designer_notes', label: 'Designer Notes', placeholder: 'Any notes for the team' },
            { key: 'tags', label: 'Tags', placeholder: 'summer, instagram, promotional (comma separated)' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>{label}</label>
              <input
                value={form[key as keyof typeof form] as string}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                placeholder={placeholder}
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: 14, border: '1.5px solid #e5e7eb', borderRadius: 10, fontFamily: 'inherit', outline: 'none', color: '#0f1117', transition: 'border-color 140ms ease' }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>
          ))}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Design Type *</label>
            <select
              value={form.design_type ?? ''}
              onChange={e => setForm(p => ({ ...p, design_type: e.target.value as SmDesign['design_type'] }))}
              style={{ width: '100%', padding: '9px 12px', fontSize: 14, border: '1.5px solid #e5e7eb', borderRadius: 10, fontFamily: 'inherit', outline: 'none', color: '#0f1117', background: '#fff' }}
            >
              {Object.entries(DESIGN_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={uploading} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: uploading ? 'not-allowed' : 'pointer' }}>Cancel</button>
            <button onClick={handleUpload} disabled={!file || !form.title.trim() || uploading} style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: (!file || !form.title.trim() || uploading) ? '#e5e7eb' : '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: (!file || !form.title.trim() || uploading) ? 'not-allowed' : 'pointer' }}>
              {uploading ? 'Uploading…' : 'Upload Design'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const MarketingDesignsPage: React.FC = () => {
  const [designs, setDesigns] = useState<SmDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<SmDesign | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: ToastData['type'] = 'info') => {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await socialFrom('sm_designs').select('*').order('created_at', { ascending: false });
    setLoading(false);
    if (error) { showToast('Failed to load designs', 'error'); return; }
    setDesigns((data as SmDesign[]) ?? []);
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await socialFrom('sm_designs').select('*').order('created_at', { ascending: false });
      if (!cancelled) { setDesigns((data as SmDesign[]) ?? []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('designs-rt')
      .on('postgres_changes', { event: '*', schema: 'social', table: 'sm_designs' }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const handleSeedData = async () => {
    setSeeding(true);
    const { error } = await socialFrom('sm_designs').insert(DESIGN_SEEDS as Partial<SmDesign>[]);
    setSeeding(false);
    if (error) { showToast('Seed failed: ' + error.message, 'error'); return; }
    showToast('Test designs loaded!', 'success');
    load();
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: designs.length };
    designs.forEach(d => { c[d.status] = (c[d.status] ?? 0) + 1; });
    return c;
  }, [designs]);

  const filtered = useMemo(() => designs.filter(d => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (typeFilter !== 'all' && d.design_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (d.title.toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q) ||
        (d.tags ?? []).some(t => t.toLowerCase().includes(q)));
    }
    return true;
  }), [designs, statusFilter, typeFilter, search]);

  const handleStatusChange = (id: string, newStatus: SmDesign['status']) => {
    setDesigns(prev => prev.map(d => d.id === id ? { ...d, status: newStatus } : d));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status: newStatus } : null);
  };

  const handleDelete = (id: string) => {
    setDesigns(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        @keyframes dsPulse { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes dsSlide { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dsSlideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {toasts.map(t => <Toast key={t.id} t={t} />)}
      {selected && <DetailModal design={selected} onClose={() => setSelected(null)} onStatusChange={handleStatusChange} onDelete={handleDelete} showToast={showToast} />}
      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onCreated={d => { setDesigns(p => [d, ...p]); }} showToast={showToast} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f1117', margin: 0 }}>Designs</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0 0' }}>Visual assets and creative outputs from the team</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => showToast('Designer Bot request sent — coming in Phase 3B', 'info')} style={{ padding: '9px 16px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
            Request Design
          </button>
          <button onClick={() => setUploadOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
            Upload Design
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 2 }}>
        {STATUS_TABS.map(tab => {
          const active = statusFilter === tab;
          const st = STATUS_STYLE[tab];
          return (
            <button key={tab} onClick={() => setStatusFilter(tab)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: `1.5px solid ${active ? (st?.border ?? '#4ba6ea') : '#e5e7eb'}`, background: active ? (st?.bg ?? '#eff8ff') : '#fff', fontSize: 13, fontWeight: 600, color: active ? (st?.color ?? '#4ba6ea') : '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 140ms ease', flexShrink: 0 }}>
              {tab === 'all' ? 'All' : (STATUS_STYLE[tab]?.label ?? tab)}
              {counts[tab] !== undefined && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 20, background: active ? (st?.color ?? '#4ba6ea') : '#e5e7eb', color: active ? '#fff' : '#6b7280', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{counts[tab] ?? 0}</span>}
            </button>
          );
        })}
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search designs…" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 36px', fontSize: 14, border: '1.5px solid #e5e7eb', borderRadius: 10, fontFamily: 'inherit', outline: 'none', color: '#0f1117', transition: 'border-color 140ms ease' }} onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }} onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
        </div>

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '9px 12px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 10, fontFamily: 'inherit', outline: 'none', color: '#374151', background: '#fff', cursor: 'pointer' }}>
          {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t === 'all' ? 'All Types' : DESIGN_TYPE_LABELS[t] ?? t}</option>)}
        </select>

        {/* View toggle */}
        <div style={{ display: 'flex', border: '1.5px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          {(['grid', 'list'] as const).map(v => (
            <button key={v} onClick={() => setViewMode(v)} style={{ padding: '7px 14px', border: 'none', background: viewMode === v ? '#4ba6ea' : '#fff', color: viewMode === v ? '#fff' : '#6b7280', cursor: 'pointer', transition: 'all 140ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {v === 'grid'
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8"/></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #f0f0f0' }}>
              <Sk h={200} radius={0} />
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Sk h={14} />
                <Sk w="60%" h={12} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#9ca3af' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.4 }}><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
            {designs.length === 0 ? 'No designs yet' : 'No matching designs'}
          </div>
          {designs.length === 0 && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={handleSeedData} disabled={seeding} style={{ padding: '9px 18px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: seeding ? 'not-allowed' : 'pointer' }}>
                {seeding ? 'Loading…' : 'Load test data'}
              </button>
              <button onClick={() => setUploadOpen(true)} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Upload Design
              </button>
            </div>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
          {filtered.map(d => (
            <div
              key={d.id}
              onClick={() => setSelected(d)}
              onMouseEnter={() => setHoveredId(d.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${hoveredId === d.id ? '#d1e9ff' : '#f0f0f0'}`, cursor: 'pointer', transition: 'all 160ms ease', boxShadow: hoveredId === d.id ? '0 8px 24px rgba(75,166,234,0.12)' : '0 1px 4px rgba(0,0,0,0.04)' }}
            >
              {/* Image */}
              <div style={{ position: 'relative', background: '#f3f4f6', paddingBottom: '75%', overflow: 'hidden' }}>
                <img
                  src={d.thumbnail_url ?? d.image_url}
                  alt={d.title}
                  loading="lazy"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 250ms ease', transform: hoveredId === d.id ? 'scale(1.04)' : 'scale(1)' }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                {/* Status dot */}
                <div style={{ position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: '50%', background: STATUS_STYLE[d.status]?.color ?? '#9ca3af', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                {/* Type badge */}
                {d.design_type && (
                  <div style={{ position: 'absolute', top: 8, left: 8, padding: '2px 7px', borderRadius: 20, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '0.03em' }}>
                    {DESIGN_TYPE_LABELS[d.design_type] ?? d.design_type}
                  </div>
                )}
                {/* Hover overlay */}
                {hoveredId === d.id && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,17,23,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ padding: '6px 14px', borderRadius: 20, background: '#fff', fontSize: 12, fontWeight: 600, color: '#0f1117' }}>View Details</div>
                  </div>
                )}
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <StatusBadge status={d.status} />
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{timeAgo(d.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List view */
        <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['Design', 'Type', 'Dimensions', 'Status', 'Created', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={d.id} onClick={() => setSelected(d)} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f9fafb' : 'none', cursor: 'pointer', background: hoveredId === d.id ? '#f9fafb' : '#fff', transition: 'background 120ms ease' }} onMouseEnter={() => setHoveredId(d.id)} onMouseLeave={() => setHoveredId(null)}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', background: '#f3f4f6', flexShrink: 0 }}>
                        <img src={d.thumbnail_url ?? d.image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1117' }}>{d.title}</div>
                        {d.description && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}><TypeBadge type={d.design_type} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>{d.width && d.height ? `${d.width}×${d.height}` : '—'}</td>
                  <td style={{ padding: '12px 16px' }}><StatusBadge status={d.status} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>{timeAgo(d.created_at)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: '#9ca3af' }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Brand guidelines sidebar callout */}
      {!loading && filtered.length > 0 && (
        <div style={{ marginTop: 40, padding: '20px 24px', background: 'linear-gradient(135deg, rgba(75,166,234,0.06) 0%, rgba(139,92,246,0.04) 100%)', borderRadius: 16, border: '1.5px solid rgba(75,166,234,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1117', marginBottom: 4 }}>Brand Guidelines</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>Primary: <b style={{ fontFamily: 'monospace', color: '#4ba6ea' }}>#4ba6ea</b> · All designs should use Inter or SF Pro Display · Logo available in the approved designs above</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {BRAND_COLORS.map(c => (
                <div key={c.hex} title={`${c.name} — ${c.hex}`} style={{ width: 24, height: 24, borderRadius: '50%', background: c.hex, border: '2px solid rgba(0,0,0,0.08)', cursor: 'help' }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketingDesignsPage;
