import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type IssueType   = 'damage' | 'accident' | 'sound' | 'mechanical' | 'maintenance' | 'other';
type IssueStatus = 'open' | 'resolved';

type StatusFilter = 'all' | IssueStatus;
type TypeFilter   = 'all' | IssueType;

/** Row shape of the `car_issues_detailed` view. */
interface IssueRow {
  id: number;
  car_id: number;
  plate_number: string | null;
  model_name: string | null;
  type: IssueType;
  status: IssueStatus;
  description: string | null;
  damage_photos: unknown;
  repair_photos: unknown;
  damage_photo_count: number | null;
  repair_photo_count: number | null;
  booking_id: number | null;
  booking_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  discovered_at: string;
  discovered_by: string | null;
  discovered_by_name: string | null;
  resolved_at: string | null;
  days_to_resolve: number | null;
  created_at: string;
  updated_at: string;
}

/** Same row with the jsonb photo arrays normalised to string[]. */
interface Issue extends Omit<IssueRow, 'damage_photos' | 'repair_photos'> {
  damage_photos: string[];
  repair_photos: string[];
}

interface CarOption      { id: number; plate_number: string; model_group: { name: string } | null; }
interface CustomerOption { id: string; first_name: string; last_name: string; }
interface BookingOption  { id: number; booking_number: string | null; customer_id: string | null; start_date: string; end_date: string; }

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<IssueType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  damage: {
    label: 'Damage', color: '#ea580c', bg: 'rgba(234,88,12,0.12)',
    icon: <path d="M12 2l2.4 5.6L20 9l-4 4.2.9 6.8L12 16.8 7.1 20l.9-6.8L4 9l5.6-1.4L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  },
  accident: {
    label: 'Accident', color: '#dc2626', bg: 'rgba(220,38,38,0.12)',
    icon: <><path d="M10.3 3.9L2.5 17.4A2 2 0 004.2 20.4h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  },
  sound: {
    label: 'Sound', color: '#7c3aed', bg: 'rgba(124,58,237,0.12)',
    icon: <><path d="M11 5L6.5 9H3v6h3.5L11 19V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  },
  mechanical: {
    label: 'Mechanical', color: '#2563eb', bg: 'rgba(37,99,235,0.12)',
    icon: <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  maintenance: {
    label: 'Maintenance', color: '#0891b2', bg: 'rgba(8,145,178,0.12)',
    icon: <><circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 11-4 0v-.1a1.7 1.7 0 00-3-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-3l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 003-1.2V3a2 2 0 114 0v.1a1.7 1.7 0 003 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 3H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></>,
  },
  other: {
    label: 'Other', color: '#6b7280', bg: 'rgba(107,114,128,0.12)',
    icon: <><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M9.5 9.5a2.6 2.6 0 015 .9c0 1.7-2.5 2.1-2.5 3.6M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  },
};

const STATUS_CONFIG: Record<IssueStatus, { label: string; color: string; bg: string }> = {
  open:     { label: 'Open',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  resolved: { label: 'Resolved', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
};

const ALL_TYPES: IssueType[] = ['damage', 'accident', 'sound', 'mechanical', 'maintenance', 'other'];

const MAX_PHOTOS = 10;
const BUCKET = 'car-issues';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Storage-safe folder key for a plate: lowercased, whitespace removed. */
function plateFolderKey(plate: string): string {
  return plate.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9\-_]/g, '');
}

function newUuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

/** jsonb arrays arrive as unknown — keep only the string entries. */
function toUrlArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((u): u is string => typeof u === 'string' && !!u) : [];
}

function resolveIssue(row: IssueRow): Issue {
  return { ...row, damage_photos: toUrlArray(row.damage_photos), repair_photos: toUrlArray(row.repair_photos) };
}

/**
 * Repair photos are stored beside the damage photos of the same issue. The
 * folder is recovered from an existing damage URL; if that isn't possible
 * (e.g. a legacy row), a fresh uuid folder is used instead.
 */
function deriveIssueFolder(damagePhotos: string[], plate: string): string {
  const first = damagePhotos[0];
  if (first) {
    const afterBucket = first.split(`/public/${BUCKET}/`)[1];
    const folder = afterBucket?.split('/damage/')[0];
    if (folder && !folder.includes('..')) return decodeURIComponent(folder);
  }
  return `${plateFolderKey(plate) || 'unknown'}/${newUuid()}`;
}

/** Uploads files sequentially; throws on the first failure so nothing is half-saved. */
async function uploadPhotos(folder: string, kind: 'damage' | 'repair', files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const path = `${folder}/${kind}/${i + 1}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, files[i], { upsert: true, contentType: files[i].type });
    if (error) throw new Error(`Photo ${i + 1} failed to upload: ${error.message}`);
    urls.push(`${supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?t=${Date.now()}`);
  }
  return urls;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const CARD_STYLE: React.CSSProperties = {
  background: '#fff', borderRadius: 14,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
};

const FIELD_STYLE: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', fontSize: 13,
  border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
  fontFamily: 'inherit', color: '#0f1117', background: '#fff',
  boxSizing: 'border-box', transition: 'border-color 140ms ease',
};

const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6,
};

const TOOLBAR_CONTROL: React.CSSProperties = {
  height: 38, padding: '0 12px', fontSize: 13, color: '#374151',
  background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 9,
  outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
};

const onFieldFocus = (e: React.FocusEvent<HTMLElement>) => { e.target.style.borderColor = '#4ba6ea'; };
const onFieldBlur  = (e: React.FocusEvent<HTMLElement>) => { e.target.style.borderColor = '#e5e7eb'; };

// ─── Small components ─────────────────────────────────────────────────────────

const TypeBadge: React.FC<{ type: IssueType }> = ({ type }) => {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.other;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ color: cfg.color, flexShrink: 0 }}>{cfg.icon}</svg>
      {cfg.label}
    </span>
  );
};

const StatusBadge: React.FC<{ status: IssueStatus }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

const Spinner: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite' }}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56" />
  </svg>
);

const PhotoPlaceholder: React.FC = () => (
  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#f9fafb', color: '#d1d5db' }}>
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
      <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>No photo</span>
  </div>
);

const Toast: React.FC<{ message: string; kind: 'success' | 'error' }> = ({ message, kind }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: kind === 'success' ? '#0f1117' : '#fff1f2',
      color: kind === 'success' ? '#fff' : '#ef4444',
      border: kind === 'error' ? '1px solid #fecaca' : 'none',
      borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease',
      maxWidth: 'calc(100vw - 56px)',
    }}>
      {kind === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#16a34a" /><path d="M7 12l4 4 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v5M12 16h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" /></svg>}
      {message}
    </div>,
    document.body,
  );

// ─── Searchable car dropdown ──────────────────────────────────────────────────

const CarSelect: React.FC<{
  cars: CarOption[];
  value: string;
  onChange: (id: string) => void;
  loading: boolean;
  disabled?: boolean;
}> = ({ cars, value, onChange, loading, disabled }) => {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const selected = cars.find(c => String(c.id) === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cars;
    return cars.filter(c =>
      c.plate_number.toLowerCase().includes(q) || (c.model_group?.name ?? '').toLowerCase().includes(q));
  }, [cars, query]);

  const label = loading
    ? 'Loading cars…'
    : selected
      ? `${selected.plate_number}${selected.model_group?.name ? ` — ${selected.model_group.name}` : ''}`
      : 'Select a car';

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen(o => !o)}
        style={{
          ...FIELD_STYLE, textAlign: 'left', cursor: disabled || loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          color: selected ? '#0f1117' : '#9ca3af',
          borderColor: open ? '#4ba6ea' : '#e5e7eb',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#9ca3af', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 140ms ease' }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
          background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.14)', overflow: 'hidden',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search plate or model…"
              style={{ ...FIELD_STYLE, height: 34, fontSize: 12.5, background: '#f9fafb' }}
              onFocus={onFieldFocus}
              onBlur={onFieldBlur}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '14px 12px', fontSize: 12.5, color: '#9ca3af', textAlign: 'center' }}>No cars match</div>
            )}
            {filtered.map(c => {
              const isSel = String(c.id) === value;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onChange(String(c.id)); setOpen(false); setQuery(''); }}
                  style={{
                    width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    padding: '9px 12px', fontSize: 12.5, fontFamily: 'inherit',
                    background: isSel ? 'rgba(75,166,234,0.08)' : '#fff',
                    color: isSel ? '#2e8fd4' : '#374151', fontWeight: isSel ? 700 : 500,
                    display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#f9fafb'; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = '#fff'; }}
                >
                  <span style={{ fontWeight: 700 }}>{c.plate_number}</span>
                  {c.model_group?.name && <span style={{ color: '#9ca3af', fontWeight: 500 }}>— {c.model_group.name}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Photo picker (add / resolve modals) ──────────────────────────────────────

const PhotoPicker: React.FC<{
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}> = ({ files, onAdd, onRemove, disabled }) => {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const created = files.map(f => URL.createObjectURL(f));
    setUrls(created);
    return () => { created.forEach(u => URL.revokeObjectURL(u)); };
  }, [files]);

  const full = files.length >= MAX_PHOTOS;

  const pickerButton = (text: string, capture: boolean) => (
    <label style={{
      flex: '1 1 140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      minHeight: 44, padding: '0 14px', borderRadius: 10,
      border: '1.5px dashed #d1d5db', background: full || disabled ? '#f3f4f6' : '#fafafa',
      cursor: full || disabled ? 'not-allowed' : 'pointer',
      fontSize: 12.5, fontWeight: 600, color: full || disabled ? '#9ca3af' : '#6b7280',
      transition: 'border-color 140ms ease, background 140ms ease',
    }}
      onMouseEnter={e => { if (!full && !disabled) { e.currentTarget.style.borderColor = '#4ba6ea'; e.currentTarget.style.background = 'rgba(75,166,234,0.04)'; } }}
      onMouseLeave={e => { if (!full && !disabled) { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = '#fafafa'; } }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        {capture
          ? <><path d="M3 8.5A2.5 2.5 0 015.5 6h1.2a1.5 1.5 0 001.29-.73l.62-1.04A1.5 1.5 0 019.9 3.5h4.2a1.5 1.5 0 011.29.73l.62 1.04A1.5 1.5 0 0017.3 6h1.2A2.5 2.5 0 0121 8.5v8A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="12" cy="12.5" r="3.4" stroke="currentColor" strokeWidth="1.7" /></>
          : <><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.7" /><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" /><path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>}
      </svg>
      {text}
      <input
        type="file"
        accept="image/*"
        {...(capture ? { capture: 'environment' as const } : { multiple: true })}
        disabled={full || disabled}
        style={{ display: 'none' }}
        onChange={e => {
          const incoming = Array.from(e.target.files ?? []);
          if (incoming.length > 0) onAdd(incoming);
          e.target.value = '';
        }}
      />
    </label>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {pickerButton('Take photo', true)}
        {pickerButton('Choose photos', false)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>JPG, PNG, WEBP · up to {MAX_PHOTOS} photos</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: files.length > 0 ? '#4ba6ea' : '#9ca3af' }}>
          {files.length} / {MAX_PHOTOS}
        </span>
      </div>

      {urls.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, marginTop: 12 }}>
          {urls.map((url, i) => (
            <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 9, overflow: 'hidden', border: '1.5px solid #e5e7eb', background: '#0f1117' }}>
              <img src={url} alt={`Selected ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <button
                type="button"
                onClick={() => onRemove(i)}
                disabled={disabled}
                aria-label={`Remove photo ${i + 1}`}
                style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Photo gallery + lightbox ─────────────────────────────────────────────────

const PhotoGallery: React.FC<{ urls: string[]; onOpen: (url: string) => void; emptyText: string }> = ({ urls, onOpen, emptyText }) => {
  if (urls.length === 0) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: '#9ca3af' }}>{emptyText}</div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
      {urls.map((url, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onOpen(url)}
          style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 9, overflow: 'hidden', border: '1.5px solid #e5e7eb', cursor: 'zoom-in', padding: 0, background: '#f9fafb', display: 'block', width: '100%', transition: 'border-color 140ms ease, transform 140ms ease' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#4ba6ea'; e.currentTarget.style.transform = 'scale(1.02)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <img src={url} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </button>
      ))}
    </div>
  );
};

const Lightbox: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) =>
  ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 120ms ease', cursor: 'zoom-out' }}
    >
      <img src={url} alt="Full size" onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', cursor: 'default' }} />
      <button
        onClick={onClose}
        aria-label="Close"
        style={{ position: 'fixed', top: 20, right: 20, width: 44, height: 44, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
      </button>
    </div>,
    document.body,
  );

// ─── Modal shell ──────────────────────────────────────────────────────────────

const ModalShell: React.FC<{
  onClose: () => void;
  maxWidth?: number;
  children: React.ReactNode;
}> = ({ onClose, maxWidth = 620, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, animation: 'fadeIn 150ms ease' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.2)', animation: 'slideUp 180ms ease' }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

const ModalHeader: React.FC<{ title: string; subtitle?: React.ReactNode; onClose: () => void }> = ({ title, subtitle, onClose }) => (
  <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{subtitle}</div>}
    </div>
    <button
      onClick={onClose}
      aria-label="Close"
      style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
      onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6'; }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round" /></svg>
    </button>
  </div>
);

const ErrorBox: React.FC<{ message: string }> = ({ message }) => (
  <div style={{ marginTop: 16, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, fontSize: 13, color: '#ef4444' }}>
    {message}
  </div>
);

const PrimaryButton: React.FC<{
  onClick: () => void; disabled?: boolean; children: React.ReactNode; tone?: 'brand' | 'green' | 'red';
}> = ({ onClick, disabled, children, tone = 'brand' }) => {
  const base = tone === 'green' ? '#16a34a' : tone === 'red' ? '#ef4444' : '#4ba6ea';
  const hover = tone === 'green' ? '#15803d' : tone === 'red' ? '#dc2626' : '#2e8fd4';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 42, padding: '0 22px', borderRadius: 10, border: 'none',
        background: disabled ? '#cbd5e1' : base, fontSize: 13, fontWeight: 700, color: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        transition: 'background 140ms ease', display: 'flex', alignItems: 'center', gap: 8,
        justifyContent: 'center', whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = hover; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = base; }}
    >
      {children}
    </button>
  );
};

const GhostButton: React.FC<{ onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      height: 42, padding: '0 18px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff',
      fontSize: 13, fontWeight: 600, color: '#374151', cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit', transition: 'all 140ms ease', whiteSpace: 'nowrap',
    }}
    onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = '#f9fafb'; } }}
    onMouseLeave={e => { if (!disabled) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; } }}
  >
    {children}
  </button>
);

// ─── Add Issue Modal ──────────────────────────────────────────────────────────

const AddIssueModal: React.FC<{ onClose: () => void; onSaved: () => void }> = ({ onClose, onSaved }) => {
  const [cars, setCars]                 = useState<CarOption[]>([]);
  const [carsLoading, setCarsLoading]   = useState(true);
  const [customers, setCustomers]       = useState<CustomerOption[]>([]);
  const [bookings, setBookings]         = useState<BookingOption[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  const [carId, setCarId]               = useState('');
  const [type, setType]                 = useState<IssueType>('damage');
  const [customerId, setCustomerId]     = useState('');
  const [bookingId, setBookingId]       = useState('');
  const [description, setDescription]   = useState('');
  const [discoveredAt, setDiscoveredAt] = useState(todayStr());
  const [photos, setPhotos]             = useState<File[]>([]);

  const [saving, setSaving]     = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  // Cars for the picker
  useEffect(() => {
    let active = true;
    supabase
      .from('cars')
      .select('id, plate_number, model_group:model_group_id(name)')
      .eq('is_active', true)
      .then(({ data, error: err }) => {
        if (!active) return;
        if (!err && data) {
          const sorted = (data as unknown as CarOption[]).sort((a, b) => {
            const nameA = a.model_group?.name ?? '';
            const nameB = b.model_group?.name ?? '';
            return nameA.localeCompare(nameB) || a.plate_number.localeCompare(b.plate_number);
          });
          setCars(sorted);
        }
        setCarsLoading(false);
      });
    return () => { active = false; };
  }, []);

  // Bookings + customers for the selected car; auto-suggest the one active today.
  useEffect(() => {
    setCustomerId('');
    setBookingId('');
    setBookings([]);
    setCustomers([]);
    if (!carId) return;

    let active = true;
    setLinksLoading(true);
    supabase
      .from('bookings')
      .select('id, booking_number, customer_id, start_date, end_date, customers(id, first_name, last_name)')
      .eq('car_id', Number(carId))
      .order('start_date', { ascending: false })
      .then(({ data, error: err }) => {
        if (!active) return;
        setLinksLoading(false);
        if (err || !data) return;

        const rows = data as unknown as Array<BookingOption & { customers: CustomerOption | CustomerOption[] | null }>;
        setBookings(rows.map(r => ({ id: r.id, booking_number: r.booking_number, customer_id: r.customer_id, start_date: r.start_date, end_date: r.end_date })));

        const seen = new Set<string>();
        const uniqueCustomers: CustomerOption[] = [];
        for (const r of rows) {
          const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
          if (c && !seen.has(c.id)) { seen.add(c.id); uniqueCustomers.push(c); }
        }
        uniqueCustomers.sort((a, b) => a.first_name.localeCompare(b.first_name));
        setCustomers(uniqueCustomers);

        // Suggest the booking covering today — editable, never forced.
        const today = todayStr();
        const current = rows.find(r => r.start_date <= today && r.end_date >= today);
        if (current) {
          setBookingId(String(current.id));
          if (current.customer_id) setCustomerId(current.customer_id);
        }
      });
    return () => { active = false; };
  }, [carId]);

  const addPhotos = (incoming: File[]) =>
    setPhotos(prev => [...prev, ...incoming].slice(0, MAX_PHOTOS));
  const removePhoto = (index: number) =>
    setPhotos(prev => prev.filter((_, i) => i !== index));

  const canSave = !!carId && photos.length > 0 && !saving;

  const handleSave = async () => {
    if (!carId)             { setError('Please select a car.'); return; }
    if (photos.length === 0) { setError('At least one damage photo is required.'); return; }

    const car = cars.find(c => String(c.id) === carId);
    setSaving(true);
    setError(null);

    try {
      const folder = `${plateFolderKey(car?.plate_number ?? '') || 'unknown'}/${newUuid()}`;
      setProgress(`Uploading ${photos.length} photo${photos.length > 1 ? 's' : ''}…`);
      const urls = await uploadPhotos(folder, 'damage', photos);

      setProgress('Saving issue…');
      const { data: { user } } = await supabase.auth.getUser();

      const { error: insertError } = await supabase.from('car_issues').insert({
        car_id: Number(carId),
        booking_id: bookingId ? Number(bookingId) : null,
        customer_id: customerId || null,
        type,
        description: description.trim() || null,
        damage_photos: urls,
        discovered_at: discoveredAt,
        discovered_by: user?.id ?? null,
      });
      if (insertError) throw new Error(insertError.message);

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong while saving the issue.');
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  return (
    <ModalShell onClose={saving ? () => undefined : onClose}>
      <ModalHeader title="New Issue" subtitle="Log a damage, accident or mechanical problem" onClose={saving ? () => undefined : onClose} />

      <div style={{ overflowY: 'auto', flex: 1, padding: '22px 26px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px 20px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={LABEL_STYLE}>Car <span style={{ color: '#ef4444' }}>*</span></label>
            <CarSelect cars={cars} value={carId} onChange={setCarId} loading={carsLoading} disabled={saving} />
          </div>

          <div>
            <label style={LABEL_STYLE}>Type <span style={{ color: '#ef4444' }}>*</span></label>
            <select value={type} onChange={e => setType(e.target.value as IssueType)} disabled={saving}
              style={{ ...FIELD_STYLE, cursor: 'pointer' }} onFocus={onFieldFocus} onBlur={onFieldBlur}>
              {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
            </select>
          </div>

          <div>
            <label style={LABEL_STYLE}>Discovered date</label>
            <input type="date" value={discoveredAt} onChange={e => setDiscoveredAt(e.target.value)} disabled={saving}
              style={FIELD_STYLE} onFocus={onFieldFocus} onBlur={onFieldBlur} />
          </div>

          <div>
            <label style={LABEL_STYLE}>
              Customer <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
            </label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} disabled={!carId || linksLoading || saving}
              style={{ ...FIELD_STYLE, cursor: 'pointer', color: customerId ? '#0f1117' : '#9ca3af' }} onFocus={onFieldFocus} onBlur={onFieldBlur}>
              <option value="">
                {!carId ? 'Select a car first' : linksLoading ? 'Loading…' : customers.length === 0 ? 'No customers for this car' : 'No customer'}
              </option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>

          <div>
            <label style={LABEL_STYLE}>
              Booking <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
            </label>
            <select value={bookingId} onChange={e => setBookingId(e.target.value)} disabled={!carId || linksLoading || saving}
              style={{ ...FIELD_STYLE, cursor: 'pointer', color: bookingId ? '#0f1117' : '#9ca3af' }} onFocus={onFieldFocus} onBlur={onFieldBlur}>
              <option value="">
                {!carId ? 'Select a car first' : linksLoading ? 'Loading…' : bookings.length === 0 ? 'No bookings for this car' : 'No booking'}
              </option>
              {bookings.map(b => (
                <option key={b.id} value={String(b.id)}>
                  {b.booking_number ?? `#${b.id}`} · {formatDate(b.start_date)} → {formatDate(b.end_date)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={LABEL_STYLE}>
              Description <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={saving}
              placeholder="Describe the issue. If no customer is linked, note the reason (e.g. staff caused it, parking, unknown)."
              style={{ ...FIELD_STYLE, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
              onFocus={onFieldFocus}
              onBlur={onFieldBlur}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={LABEL_STYLE}>Damage photos <span style={{ color: '#ef4444' }}>*</span></label>
            <PhotoPicker files={photos} onAdd={addPhotos} onRemove={removePhoto} disabled={saving} />
          </div>
        </div>

        {error && <ErrorBox message={error} />}
      </div>

      <div style={{ padding: '16px 26px 22px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        {!saving && photos.length === 0 && (
          <div style={{ flex: '1 1 180px', fontSize: 11.5, color: '#9ca3af' }}>
            <span style={{ fontWeight: 700, color: '#ef4444' }}>At least 1 damage photo</span> is required to save.
          </div>
        )}
        <GhostButton onClick={onClose} disabled={saving}>Cancel</GhostButton>
        <PrimaryButton onClick={handleSave} disabled={!canSave}>
          {saving ? <><Spinner />{progress ?? 'Saving…'}</> : 'Save Issue'}
        </PrimaryButton>
      </div>
    </ModalShell>
  );
};

// ─── Issue Detail Modal ───────────────────────────────────────────────────────

type DetailMode = 'view' | 'resolve' | 'edit' | 'delete';

const IssueDetailModal: React.FC<{
  issue: Issue;
  onClose: () => void;
  onChanged: (message: string) => void;
}> = ({ issue, onClose, onChanged }) => {
  const [mode, setMode]         = useState<DetailMode>('view');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const [repairPhotos, setRepairPhotos] = useState<File[]>([]);
  const [editType, setEditType]         = useState<IssueType>(issue.type);
  const [editDescription, setEditDesc]  = useState(issue.description ?? '');

  const cfg = TYPE_CONFIG[issue.type] ?? TYPE_CONFIG.other;

  const close = () => { if (!busy) onClose(); };

  const handleResolve = async () => {
    setBusy(true);
    setError(null);
    try {
      let urls: string[] = [];
      if (repairPhotos.length > 0) {
        const folder = deriveIssueFolder(issue.damage_photos, issue.plate_number ?? '');
        setProgress(`Uploading ${repairPhotos.length} photo${repairPhotos.length > 1 ? 's' : ''}…`);
        urls = await uploadPhotos(folder, 'repair', repairPhotos);
      }
      setProgress('Marking as resolved…');
      // resolved_at is filled by the database trigger — never set here.
      const { error: updateError } = await supabase
        .from('car_issues')
        .update({ status: 'resolved', repair_photos: urls })
        .eq('id', issue.id);
      if (updateError) throw new Error(updateError.message);
      onChanged('Issue marked as resolved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resolve this issue.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleSaveEdit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('car_issues')
        .update({ type: editType, description: editDescription.trim() || null })
        .eq('id', issue.id);
      if (updateError) throw new Error(updateError.message);
      onChanged('Issue updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update this issue.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('car_issues')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', issue.id);
      if (deleteError) throw new Error(deleteError.message);
      onChanged('Issue deleted.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete this issue.');
    } finally {
      setBusy(false);
    }
  };

  const metaRow = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#374151', fontWeight: 500, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );

  const sectionTitle = (text: string, count?: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{text}</span>
      {count !== undefined && (
        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', borderRadius: 20, padding: '2px 8px' }}>{count}</span>
      )}
    </div>
  );

  return (
    <>
      <ModalShell onClose={close} maxWidth={680}>
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>
              {issue.plate_number ?? '—'}
            </div>
            <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 3 }}>{issue.model_name ?? 'Unknown model'}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <TypeBadge type={issue.type} />
              <StatusBadge status={issue.status} />
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: busy ? 'not-allowed' : 'pointer', flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 26px' }}>
          {/* ── Resolve step ── */}
          {mode === 'resolve' && (
            <div>
              <div style={{ padding: '12px 14px', background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 10, fontSize: 12.5, color: '#15803d', marginBottom: 16, lineHeight: 1.5 }}>
                Add repair photos so the before → after comparison is complete. Optional, but at least one is strongly recommended.
              </div>
              <PhotoPicker
                files={repairPhotos}
                onAdd={files => setRepairPhotos(prev => [...prev, ...files].slice(0, MAX_PHOTOS))}
                onRemove={i => setRepairPhotos(prev => prev.filter((_, idx) => idx !== i))}
                disabled={busy}
              />
              {error && <ErrorBox message={error} />}
            </div>
          )}

          {/* ── Edit step ── */}
          {mode === 'edit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={LABEL_STYLE}>Type</label>
                <select value={editType} onChange={e => setEditType(e.target.value as IssueType)} disabled={busy}
                  style={{ ...FIELD_STYLE, cursor: 'pointer' }} onFocus={onFieldFocus} onBlur={onFieldBlur}>
                  {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL_STYLE}>Description</label>
                <textarea
                  rows={4}
                  value={editDescription}
                  onChange={e => setEditDesc(e.target.value)}
                  disabled={busy}
                  placeholder="Describe the issue. If no customer is linked, note the reason (e.g. staff caused it, parking, unknown)."
                  style={{ ...FIELD_STYLE, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
                  onFocus={onFieldFocus}
                  onBlur={onFieldBlur}
                />
              </div>
              {error && <ErrorBox message={error} />}
            </div>
          )}

          {/* ── Delete confirm ── */}
          {mode === 'delete' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 11v5M14 11v5" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1117', marginBottom: 8 }}>Delete this issue?</div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                It will be removed from the list. The photos stay in storage.
              </div>
              {error && <ErrorBox message={error} />}
            </div>
          )}

          {/* ── View ── */}
          {mode === 'view' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
                {metaRow('Discovered', formatDate(issue.discovered_at))}
                {metaRow('Reported by', issue.discovered_by_name ?? '—')}
                {issue.customer_name && metaRow('Customer', issue.customer_name)}
                {issue.booking_number && metaRow('Booking', issue.booking_number)}
                {issue.status === 'resolved' && metaRow('Resolved', formatDate(issue.resolved_at))}
                {issue.status === 'resolved' && issue.days_to_resolve !== null &&
                  metaRow('Time to resolve', `${issue.days_to_resolve} day${issue.days_to_resolve === 1 ? '' : 's'}`)}
              </div>

              <div>
                {sectionTitle('Description')}
                <div style={{ fontSize: 13.5, color: issue.description ? '#374151' : '#9ca3af', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {issue.description || 'No description was added.'}
                </div>
              </div>

              <div>
                {sectionTitle('Damage Photos', issue.damage_photos.length)}
                <PhotoGallery urls={issue.damage_photos} onOpen={setLightbox} emptyText="No damage photos." />
              </div>

              {issue.status === 'resolved' && (
                <div style={{ paddingTop: 4, borderTop: '1px solid #f0f0f0' }}>
                  <div style={{ marginTop: 18 }}>
                    {sectionTitle('Repair Photos', issue.repair_photos.length)}
                    <PhotoGallery urls={issue.repair_photos} onOpen={setLightbox} emptyText="No repair photos were uploaded." />
                  </div>
                </div>
              )}

              {error && <ErrorBox message={error} />}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '16px 26px 22px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', flexShrink: 0 }}>
          {mode === 'view' && (
            <>
              <GhostButton onClick={() => { setError(null); setMode('delete'); }}>Delete</GhostButton>
              <GhostButton onClick={() => { setError(null); setMode('edit'); }}>Edit</GhostButton>
              {issue.status === 'open' && (
                <PrimaryButton tone="green" onClick={() => { setError(null); setMode('resolve'); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Mark as Resolved
                </PrimaryButton>
              )}
            </>
          )}

          {mode === 'resolve' && (
            <>
              <GhostButton onClick={() => { setRepairPhotos([]); setError(null); setMode('view'); }} disabled={busy}>Back</GhostButton>
              <PrimaryButton tone="green" onClick={handleResolve} disabled={busy}>
                {busy ? <><Spinner />{progress ?? 'Working…'}</> : 'Confirm Resolved'}
              </PrimaryButton>
            </>
          )}

          {mode === 'edit' && (
            <>
              <GhostButton onClick={() => { setEditType(issue.type); setEditDesc(issue.description ?? ''); setError(null); setMode('view'); }} disabled={busy}>Cancel</GhostButton>
              <PrimaryButton onClick={handleSaveEdit} disabled={busy}>
                {busy ? <><Spinner />Saving…</> : 'Save Changes'}
              </PrimaryButton>
            </>
          )}

          {mode === 'delete' && (
            <>
              <GhostButton onClick={() => { setError(null); setMode('view'); }} disabled={busy}>Cancel</GhostButton>
              <PrimaryButton tone="red" onClick={handleDelete} disabled={busy}>
                {busy ? <><Spinner />Deleting…</> : 'Delete Issue'}
              </PrimaryButton>
            </>
          )}
        </div>
      </ModalShell>

      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
};

// ─── Issue card ───────────────────────────────────────────────────────────────

const IssueCard: React.FC<{ issue: Issue; onClick: () => void }> = ({ issue, onClick }) => {
  const thumb = issue.damage_photos[0];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...CARD_STYLE, padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', width: '100%', fontFamily: 'inherit',
        transition: 'transform 180ms ease, box-shadow 180ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(75,166,234,0.14)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/10', background: '#f9fafb', flexShrink: 0 }}>
        {thumb
          ? <img src={thumb} alt={`${issue.plate_number ?? 'Car'} damage`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <PhotoPlaceholder />}
        <span style={{ position: 'absolute', top: 8, left: 8 }}><TypeBadge type={issue.type} /></span>
        <span style={{ position: 'absolute', top: 8, right: 8 }}><StatusBadge status={issue.status} /></span>
        {issue.damage_photos.length > 1 && (
          <span style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(15,17,23,0.7)', borderRadius: 20, padding: '3px 9px' }}>
            +{issue.damage_photos.length - 1}
          </span>
        )}
      </div>

      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>{issue.plate_number ?? '—'}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{issue.model_name ?? 'Unknown model'}</div>
        </div>

        <div style={{
          fontSize: 12.5, color: issue.description ? '#4b5563' : '#c0c4cc', lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {issue.description || 'No description'}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: '#9ca3af', fontWeight: 600 }}>{formatDate(issue.discovered_at)}</span>
          {issue.customer_name && (
            <span style={{ fontSize: 11.5, color: '#6b7280', fontWeight: 600, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {issue.customer_name}
            </span>
          )}
        </div>

        {issue.status === 'resolved' && issue.days_to_resolve !== null && (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.1)', borderRadius: 20, padding: '3px 9px', alignSelf: 'flex-start' }}>
            Resolved in {issue.days_to_resolve} day{issue.days_to_resolve === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </button>
  );
};

// ─── Stat card ────────────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: number | string; color: string; loading: boolean; icon: React.ReactNode }> = ({
  label, value, color, loading, icon,
}) => (
  <div style={{ ...CARD_STYLE, padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: color, borderRadius: '14px 14px 0 0' }} />
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: '#0f1117', letterSpacing: '-1.4px', lineHeight: 1 }}>{loading ? '—' : value}</div>
      </div>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">{icon}</svg>
      </div>
    </div>
  </div>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

const CarIssuesPage: React.FC = () => {
  const [issues, setIssues]   = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter]     = useState<TypeFilter>('all');
  const [search, setSearch]             = useState('');

  const [addOpen, setAddOpen]     = useState(false);
  const [detailId, setDetailId]   = useState<number | null>(null);
  const [toast, setToast]         = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('car_issues_detailed')
      .select('*')
      .order('discovered_at', { ascending: false })
      .order('id', { ascending: false });

    setLoading(false);
    if (fetchError) { setError(fetchError.message); return; }
    setIssues(((data ?? []) as unknown as IssueRow[]).map(resolveIssue));
  }, []);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  const stats = useMemo(() => ({
    total:    issues.length,
    open:     issues.filter(i => i.status === 'open').length,
    resolved: issues.filter(i => i.status === 'resolved').length,
  }), [issues]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (typeFilter !== 'all' && i.type !== typeFilter) return false;
      if (!q) return true;
      return [i.plate_number, i.model_name, i.customer_name, i.description]
        .some(field => (field ?? '').toLowerCase().includes(q));
    });
  }, [issues, statusFilter, typeFilter, search]);

  const detailIssue = detailId === null ? null : issues.find(i => i.id === detailId) ?? null;

  const handleChanged = (message: string) => {
    setDetailId(null);
    showToast(message);
    fetchIssues();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: 'clamp(22px, 4vw, 44px) clamp(16px, 3vw, 40px)' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase' }}>Operations</span>
        </div>
        <h1 style={{ fontSize: 'clamp(23px, 4vw, 30px)', fontWeight: 800, color: '#0f1117', letterSpacing: '-0.8px', margin: 0 }}>Car Issues</h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
          Damages, accidents, sounds and mechanical problems — from report to repair
        </p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#ef4444' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 22 }}>
        <StatCard label="Total Issues" value={stats.total} color="#4ba6ea" loading={loading}
          icon={<><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M8 9h8M8 13h8M8 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>} />
        <StatCard label="Open" value={stats.open} color="#ef4444" loading={loading}
          icon={<><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v6M12 16.5h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></>} />
        <StatCard label="Resolved" value={stats.resolved} color="#16a34a" loading={loading}
          icon={<><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M8 12.5l2.8 2.8L16 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>} />
      </div>

      {/* Toolbar */}
      <div style={{ ...CARD_STYLE, padding: '16px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 160 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search plate, model, customer, description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 38, paddingLeft: 34, paddingRight: 12, fontSize: 13, color: '#0f1117', background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 150ms ease' }}
            onFocus={onFieldFocus}
            onBlur={onFieldBlur}
          />
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} style={TOOLBAR_CONTROL}>
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </select>

        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as TypeFilter)} style={TOOLBAR_CONTROL}>
          <option value="all">All Types</option>
          {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
        </select>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setAddOpen(true)}
          style={{ height: 38, padding: '0 18px', borderRadius: 9, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'inherit', transition: 'background 150ms ease', whiteSpace: 'nowrap' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#2e8fd4'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#4ba6ea'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" /></svg>
          New Issue
        </button>
      </div>

      {/* Grid */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ ...CARD_STYLE, overflow: 'hidden' }}>
              <div style={{ width: '100%', aspectRatio: '16/10', background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ height: 14, width: '55%', borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ height: 11, width: '75%', borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ height: 11, width: '40%', borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ ...CARD_STYLE, padding: '56px 24px', textAlign: 'center' }}>
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 14px', display: 'block', color: '#d1d5db' }}>
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>
            {issues.length === 0 ? 'No issues logged yet' : 'No issues match your filters'}
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 5 }}>
            {issues.length === 0 ? 'Use “New Issue” to log the first damage or problem.' : 'Try clearing the search or changing the filters.'}
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {filtered.map(issue => (
            <IssueCard key={issue.id} issue={issue} onClick={() => setDetailId(issue.id)} />
          ))}
        </div>
      )}

      {addOpen && (
        <AddIssueModal
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); showToast('Issue logged.'); fetchIssues(); }}
        />
      )}

      {detailIssue && (
        <IssueDetailModal
          issue={detailIssue}
          onClose={() => setDetailId(null)}
          onChanged={handleChanged}
        />
      )}

      {toast && <Toast message={toast.message} kind={toast.kind} />}
    </div>
  );
};

export default CarIssuesPage;
