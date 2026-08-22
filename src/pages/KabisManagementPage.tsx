import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type KabisStatus = 'pending' | 'checked_in' | 'checked_out';
type KabisAction = 'delivery' | 'pickup';

interface ProfileJoin { full_name: string | null; }

interface KabisRow {
  id:              number;
  created_at:      string;
  operation_id:    number | null;
  booking_id:      number | null;
  customer_id:     string | null;   // uuid
  car_id:          number | null;
  customer_name:   string | null;
  booking_number:  string | null;
  plate_number:    string | null;
  operation_date:  string | null;
  km:              number | string | null;   // numeric — coerced in resolveEntry
  customer_id_number: string | null;
  action_type:     KabisAction;
  status:          KabisStatus;
  entered_by:      string | null;   // uuid
  entered_at:      string | null;
  note:            string | null;
  profiles: ProfileJoin | ProfileJoin[] | null;
}

interface KabisEntry extends Omit<KabisRow, 'profiles' | 'km'> {
  km:              number | null;
  entered_by_name: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<KabisStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: '#ea580c', bg: 'rgba(249,115,22,0.12)' },
  checked_in:  { label: 'Checked in',  color: '#16a34a', bg: 'rgba(34,197,94,0.12)'  },
  checked_out: { label: 'Checked out', color: '#2563eb', bg: 'rgba(37,99,235,0.12)'  },
};

// A delivery can only ever end up checked in, a pickup only checked out — the
// column has no shared "done" value, so the reachable status is derived from
// the row's action type everywhere the admin can write it.
const DONE_STATUS: Record<KabisAction, KabisStatus> = {
  delivery: 'checked_in',
  pickup:   'checked_out',
};

// The enum values stay delivery/pickup; the labels follow the government
// system's wording, where a handover is a Check-in and a return a Check-out.
// Colours mirror the Operations page's Delivery/Pickup palette.
const ACTION_CONFIG: Record<KabisAction, { label: string; color: string; bg: string }> = {
  delivery: { label: 'Check-in',  color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  pickup:   { label: 'Check-out', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

const KABIS_SELECT = `
  id, created_at, operation_id, booking_id, customer_id, car_id,
  customer_name, booking_number, plate_number, operation_date,
  km, customer_id_number,
  action_type, status, entered_by, entered_at, note,
  profiles!kabis_entries_entered_by_fkey(full_name)
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00' : d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatKm(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-US');
}

function dash(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const s = String(v).trim();
  return s ? s : '—';
}

function resolveEntry(row: KabisRow): KabisEntry {
  const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const { profiles, km, ...rest } = row;
  return {
    ...rest,
    km: km === null || km === undefined ? null : Number(km),
    entered_by_name: prof?.full_name ?? null,
  };
}

// ─── Small components ─────────────────────────────────────────────────────────

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

const StatCard: React.FC<{ label: string; value: string | number; bg: string; loading: boolean }> = ({
  label, value, bg, loading,
}) => (
  <div style={{ background: bg, borderRadius: 12, padding: '14px 18px', color: '#fff', display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', opacity: 0.82 }}>{label}</div>
    <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-1.4px', lineHeight: 1 }}>{loading ? '—' : value}</div>
  </div>
);

const Badge: React.FC<{ label: string; color: string; bg: string }> = ({ label, color, bg }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
    borderRadius: 20, fontSize: 12, fontWeight: 600, color, background: bg, whiteSpace: 'nowrap',
  }}>
    {label}
  </span>
);

const Th: React.FC<{ children: React.ReactNode; align?: 'left' | 'right' | 'center' }> = ({ children, align = 'left' }) => (
  <th style={{
    padding: '11px 14px', textAlign: align,
    fontSize: 11, fontWeight: 700, color: '#9ca3af',
    letterSpacing: '0.5px', textTransform: 'uppercase',
    whiteSpace: 'nowrap', background: '#fafafa',
  }}>
    {children}
  </th>
);

const inputStyle: React.CSSProperties = {
  height: 44, padding: '0 12px', fontSize: 13,
  border: '1px solid #e5e7eb', borderRadius: 9, outline: 'none',
  fontFamily: 'inherit', color: '#0f1117', background: '#fff', boxSizing: 'border-box',
};

// ─── Correction modal ─────────────────────────────────────────────────────────

/**
 * Admin correction. Only `status` and `note` are writable — every other column
 * is a snapshot written by the operations trigger. `entered_by` / `entered_at`
 * are deliberately NOT sent: a BEFORE UPDATE trigger stamps them from auth.uid()
 * and clears them when a row goes back to pending.
 */
const EditModal: React.FC<{
  entry:   KabisEntry;
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ entry, onClose, onSaved }) => {
  const [status, setStatus] = useState<KabisStatus>(entry.status);
  const [note, setNote]     = useState(entry.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // 'check-in' for a delivery, 'check-out' for a pickup — drives every label
  // in this modal so the admin always sees which half of the booking they are
  // acting on.
  const actionWord = ACTION_CONFIG[entry.action_type].label.toLowerCase();
  const doneStatus = DONE_STATUS[entry.action_type];
  const doneWord   = STATUS_CONFIG[doneStatus].label.toLowerCase();
  const confirmLabel =
    status === entry.status ? 'Save'
      : status === doneStatus ? `Mark ${actionWord} ${doneWord}`
        : 'Revert to pending';

  const save = async () => {
    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('kabis_entries')
      .update({ status, note: note.trim() || null })
      .eq('id', entry.id);

    setSaving(false);
    if (updateError) { setError(updateError.message); return; }

    onSaved(
      status === entry.status
        ? 'Entry updated.'
        : status === doneStatus
          ? `Marked ${actionWord} as ${doneWord}.`
          : `Reverted ${actionWord} to pending.`,
    );
  };

  const field = (label: string, value: string) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ fontSize: 13, color: '#0f1117', marginTop: 3 }}>{value}</div>
    </div>
  );

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(15,17,23,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'fadeIn 150ms ease', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 460, boxShadow: '0 24px 80px rgba(0,0,0,0.2)', animation: 'slideUp 180ms ease' }}
      >
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#0f1117' }}>Correct KABIS Entry</span>
              <Badge {...ACTION_CONFIG[entry.action_type]} />
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Status and note only — the rest is generated</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={{ padding: '18px 24px' }}>
          {/* Read-only snapshot */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14,
            padding: '14px', borderRadius: 10, background: '#fafafa', border: '1px solid #f0f0f0', marginBottom: 18,
          }}>
            {field('Plate', dash(entry.plate_number))}
            {field('Customer', dash(entry.customer_name))}
            {field('ID Number', dash(entry.customer_id_number))}
            {field('Booking #', dash(entry.booking_number))}
            {field('Operation Date', formatDate(entry.operation_date))}
            {field('KM', formatKm(entry.km))}
          </div>

          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Status</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {(['pending', doneStatus] as const).map(s => {
              const active = status === s;
              const cfg = STATUS_CONFIG[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  style={{
                    minHeight: 44, padding: '0 18px', borderRadius: 9,
                    fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                    border: active ? `1.5px solid ${cfg.color}` : '1.5px solid #e5e7eb',
                    color: active ? cfg.color : '#6b7280',
                    background: active ? cfg.bg : '#fff',
                    transition: 'all 140ms ease',
                  }}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>

          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Note</label>
          <textarea
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional correction note…"
            style={{ ...inputStyle, width: '100%', height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
          />

          {status === doneStatus && entry.status === 'pending' && (
            <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, background: 'rgba(75,166,234,0.07)', border: '1px solid rgba(75,166,234,0.2)', fontSize: 12, color: '#2e8fd4' }}>
              Saving will stamp you as the entering user and set the booking's KABIS flag.
            </div>
          )}
          {status === 'pending' && entry.status !== 'pending' && (
            <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.25)', fontSize: 12, color: '#b45309' }}>
              Reverting clears the entry stamp and may unset the booking's KABIS flag.
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#ef4444' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '0 24px 20px' }}>
          <button
            type="button" onClick={onClose}
            style={{ minHeight: 44, padding: '0 18px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            type="button" onClick={save} disabled={saving}
            style={{ minHeight: 44, padding: '0 22px', borderRadius: 9, border: 'none', background: saving ? '#a8d4f5' : '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
          >
            {saving ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const KabisManagementPage: React.FC = () => {
  const [rows, setRows]       = useState<KabisEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<KabisStatus | ''>('');
  const [actionFilter, setActionFilter] = useState<KabisAction | ''>('');
  const [fromDate, setFromDate]         = useState('');
  const [toDate, setToDate]             = useState('');
  const [search, setSearch]             = useState('');

  const [groupByBooking, setGroupByBooking] = useState(false);

  const [editing, setEditing] = useState<KabisEntry | null>(null);
  const [toast, setToast]     = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Deliberately unscoped — this page is the full register, so no month filter.
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('kabis_entries')
      .select(KABIS_SELECT)
      .order('operation_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (fetchError) { setError(fetchError.message); setRows([]); setLoading(false); return; }
    setError(null);
    setRows(((data ?? []) as unknown as KabisRow[]).map(resolveEntry));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Indicator cards always reflect the whole register, not the filtered view.
  const stats = useMemo(() => {
    const total       = rows.length;
    const pending     = rows.filter(r => r.status === 'pending').length;
    const checkedIn   = rows.filter(r => r.status === 'checked_in').length;
    const checkedOut  = rows.filter(r => r.status === 'checked_out').length;
    return { total, pending, checkedIn, checkedOut };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (actionFilter && r.action_type !== actionFilter) return false;
      // Date range is inclusive and compares ISO strings, which sort correctly.
      const d = r.operation_date ?? '';
      if (fromDate && (!d || d < fromDate)) return false;
      if (toDate   && (!d || d > toDate))   return false;
      if (q) {
        const haystack = [r.customer_name, r.booking_number, r.plate_number, r.customer_id_number]
          .map(v => (v ?? '').toLowerCase());
        if (!haystack.some(h => h.includes(q))) return false;
      }
      return true;
    });
  }, [rows, statusFilter, actionFilter, fromDate, toDate, search]);

  // A view option, not a filter — deliberately excluded from hasFilters/Clear.
  const visible = useMemo(() => {
    if (!groupByBooking) return filtered;
    // Keep each booking's check-in and check-out adjacent, check-in first, so
    // "went out at X, came back at Y" reads off two consecutive rows.
    const rank = (a: KabisAction) => (a === 'delivery' ? 0 : 1);
    return [...filtered].sort((a, b) => {
      const ab = a.booking_number ?? '';
      const bb = b.booking_number ?? '';
      if (ab !== bb) {
        if (!ab) return 1;          // entries with no booking sink to the bottom
        if (!bb) return -1;
        return ab.localeCompare(bb);
      }
      const byAction = rank(a.action_type) - rank(b.action_type);
      if (byAction !== 0) return byAction;
      return (a.operation_date ?? '').localeCompare(b.operation_date ?? '');
    });
  }, [filtered, groupByBooking]);

  const hasFilters = !!(statusFilter || actionFilter || fromDate || toDate || search.trim());

  const clearFilters = () => {
    setStatusFilter(''); setActionFilter(''); setFromDate(''); setToDate(''); setSearch('');
  };

  const handleExport = () => {
    const headers = ['Plate', 'Customer', 'ID Number', 'Booking #', 'Type', 'Operation Date', 'KM', 'Status', 'Registered By', 'Registered At', 'Note'];
    const body = visible.map(r => [
      r.plate_number ?? '', r.customer_name ?? '', r.customer_id_number ?? '', r.booking_number ?? '',
      ACTION_CONFIG[r.action_type].label,
      r.operation_date ?? '',
      r.km ?? '',
      STATUS_CONFIG[r.status].label,
      r.entered_by_name ?? '',
      r.entered_at ?? '',
      (r.note ?? '').replace(/"/g, '""'),
    ]);
    const csv = [headers, ...body].map(row => row.map(v => `"${v}"`).join(',')).join('\n');
    // BOM so Excel reads UTF-8 plates and names correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `kabis-register-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '28px 20px 48px', maxWidth: 1280, margin: '0 auto' }}>
      <style>{`
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(10px);opacity:0} to{transform:translateY(0);opacity:1} }
        .kb-tr:hover td { background: #f9fafb !important; }
        .kb-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 22px; }
        @media (min-width: 768px) { .kb-stats { grid-template-columns: repeat(4, 1fr); gap: 16px; } }
        .kb-filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
        .kb-search { position: relative; flex: 1 1 220px; min-width: 0; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.5px' }}>
              KABIS Management
            </h1>
            {!loading && (
              <span style={{
                background: 'linear-gradient(135deg, rgba(75,166,234,0.12) 0%, rgba(75,166,234,0.07) 100%)',
                color: '#4ba6ea', fontSize: 12, fontWeight: 700,
                padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(75,166,234,0.2)',
              }}>
                {stats.total} {stats.total === 1 ? 'entry' : 'entries'}
              </span>
            )}
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: '#9ca3af' }}>
            Full KABIS register — every delivery and pickup awaiting or completed in the government system
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => void load()}
            title="Refresh"
            style={{ minHeight: 44, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', background: '#f9fafb', border: '1.5px solid #f0f0f0', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease' }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#f0f0f0'; b.style.color = '#374151'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Refresh
          </button>
          <button
            onClick={handleExport}
            style={{ minHeight: 44, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', background: '#f9fafb', border: '1.5px solid #f0f0f0', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease' }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#f0f0f0'; b.style.color = '#374151'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* Indicators */}
      <div className="kb-stats">
        <StatCard label="Total"       value={stats.total}      bg="#4ba6ea" loading={loading} />
        <StatCard label="Pending"     value={stats.pending}    bg="#ea580c" loading={loading} />
        <StatCard label="Checked in"  value={stats.checkedIn}  bg="#16a34a" loading={loading} />
        <StatCard label="Checked out" value={stats.checkedOut} bg="#2563eb" loading={loading} />
      </div>

      {/* Filters */}
      <div className="kb-filters">
        <div className="kb-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8" />
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, ID number, booking or plate…"
            style={{ ...inputStyle, width: '100%', paddingLeft: 32 }}
          />
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as KabisStatus | '')} style={{ ...inputStyle, cursor: 'pointer', minWidth: 140 }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="checked_in">Checked in</option>
          <option value="checked_out">Checked out</option>
        </select>

        <select value={actionFilter} onChange={e => setActionFilter(e.target.value as KabisAction | '')} style={{ ...inputStyle, cursor: 'pointer', minWidth: 140 }}>
          <option value="">All types</option>
          <option value="delivery">Check-in</option>
          <option value="pickup">Check-out</option>
        </select>

        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="From (operation date)" style={{ ...inputStyle, minWidth: 150 }} />
        <input type="date" value={toDate}   onChange={e => setToDate(e.target.value)}   title="To (operation date)"   style={{ ...inputStyle, minWidth: 150 }} />

        <button
          onClick={() => setGroupByBooking(g => !g)}
          title="Sort so each booking's check-in and check-out sit together"
          style={{
            minHeight: 44, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 7,
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            borderRadius: 9, transition: 'all 140ms ease',
            border: groupByBooking ? '1.5px solid rgba(75,166,234,0.35)' : '1px solid #e5e7eb',
            color: groupByBooking ? '#4ba6ea' : '#6b7280',
            background: groupByBooking
              ? 'linear-gradient(135deg, rgba(75,166,234,0.1) 0%, rgba(75,166,234,0.06) 100%)'
              : '#fff',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M6 12h12M10 18h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
          </svg>
          Group by booking
        </button>

        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{ minHeight: 44, padding: '0 14px', fontSize: 13, fontWeight: 600, color: '#6b7280', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ebebeb', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1220 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                <Th>Plate</Th>
                <Th>Customer</Th>
                <Th>ID Number</Th>
                <Th>Booking #</Th>
                <Th>Type</Th>
                <Th>Operation Date</Th>
                <Th align="right">KM</Th>
                <Th>Status</Th>
                <Th>Registered By</Th>
                <Th>Registered At</Th>
                <Th>Note</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 12 }).map((__, j) => (
                      <td key={j} style={{ padding: '12px 14px' }}>
                        <div style={{ height: 13, borderRadius: 6, background: '#f0f0f0', width: j === 1 ? 130 : 80, animation: 'pulse 1.4s ease-in-out infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: '52px 0', textAlign: 'center' }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: 'linear-gradient(135deg, rgba(75,166,234,0.1) 0%, rgba(75,166,234,0.06) 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
                    }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: '#4ba6ea' }}>
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                        <path d="M14 2v6h6M9 15l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                      {hasFilters ? 'No entries match your filters' : 'No KABIS entries yet'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      {hasFilters
                        ? 'Try widening the date range or clearing filters'
                        : 'Entries are created automatically by each delivery and pickup operation'}
                    </div>
                  </td>
                </tr>
              ) : (
                visible.map(r => (
                  <tr key={r.id} className="kb-tr" style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: '#f3f4f6', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 700, color: '#374151', letterSpacing: '0.4px' }}>
                        {dash(r.plate_number)}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500, color: '#0f1117' }}>
                      {dash(r.customer_name)}
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, color: r.customer_id_number ? '#374151' : '#d1d5db' }}>
                        {dash(r.customer_id_number)}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600, color: '#4ba6ea' }}>
                        {dash(r.booking_number)}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <Badge {...ACTION_CONFIG[r.action_type]} />
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', fontSize: 12.5, color: '#6b7280' }}>
                      {formatDate(r.operation_date)}
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: r.km === null ? '#d1d5db' : '#374151' }}>
                      {formatKm(r.km)}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <Badge {...STATUS_CONFIG[r.status]} />
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', fontSize: 13, color: '#374151' }}>
                      {dash(r.entered_by_name)}
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', fontSize: 12.5, color: '#6b7280' }}>
                      {formatDateTime(r.entered_at)}
                    </td>
                    <td style={{ padding: '11px 14px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, color: r.note ? '#374151' : '#d1d5db' }} title={r.note ?? ''}>
                      {dash(r.note)}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                      <button
                        onClick={() => setEditing(r)}
                        title="Correct status or note"
                        style={{ minHeight: 36, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', color: '#6b7280', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 140ms ease', whiteSpace: 'nowrap' }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; b.style.background = 'rgba(75,166,234,0.07)'; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#6b7280'; b.style.background = '#f9fafb'; }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Correct
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && visible.length > 0 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', fontSize: 13, color: '#9ca3af' }}>
            Showing <strong style={{ color: '#374151' }}>{visible.length}</strong> of{' '}
            <strong style={{ color: '#374151' }}>{rows.length}</strong> {rows.length === 1 ? 'entry' : 'entries'}
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={message => { setEditing(null); showToast(message); void load(); }}
        />
      )}

      {toast && <Toast message={toast.message} kind={toast.kind} />}
    </div>
  );
};

export default KabisManagementPage;
