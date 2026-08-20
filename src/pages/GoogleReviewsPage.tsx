import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  WEBHOOK — set this to the n8n endpoint that sends the review request.
//     While it is an empty string every send is a no-op: the user gets a
//     "Webhook not configured yet" toast and no row's status is changed.
// ─────────────────────────────────────────────────────────────────────────────
const REVIEW_WEBHOOK_URL = '';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewStatus = 'pending_review' | 'awaiting_send' | 'sent' | 'rejected';
type TabKey = 'rate' | 'awaiting' | 'sent';

interface ReviewCandidate {
  customer_id:           string;   // uuid
  first_name:            string | null;
  last_name:             string | null;
  full_name:             string | null;
  nationality:           string | null;
  phone:                 string | null;
  email:                 string | null;
  language:              string | null;
  birth_date:            string | null;
  age:                   number | null;
  latest_booking_id:     number | null;
  latest_booking_number: string | null;
  booking_start_date:    string | null;
  booking_end_date:      string | null;
  plate_number:          string | null;
  model_name:            string | null;
  review_id:             number | null;
  our_rating:            number | null;
  review_status:         ReviewStatus;
  review_sent_at:        string | null;
}

// ─── Nationality → flag ───────────────────────────────────────────────────────

/**
 * Nationality strings as they appear in `customers.nationality`, mapped to ISO
 * 3166-1 alpha-2. Keys are lowercased at lookup time, so casing here is free.
 * Anything unmapped falls back to a neutral globe rather than a wrong flag.
 */
const NATIONALITY_TO_ISO: Record<string, string> = {
  // Present in the data today
  libya: 'LY', syria: 'SY', turkey: 'TR', 'türkiye': 'TR', turkiye: 'TR',
  jordan: 'JO', yemen: 'YE', egypt: 'EG', algeria: 'DZ', morocco: 'MA',
  tunisia: 'TN', palestine: 'PS', iraq: 'IQ', australia: 'AU', lebanon: 'LB',
  nigeria: 'NG', canada: 'CA', austria: 'AT', kazakhstan: 'KZ', spain: 'ES',
  'saudi arabia': 'SA', kenya: 'KE', sudan: 'SD', cuba: 'CU',
  afghanistan: 'AF', 'south africa': 'ZA',
  'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB', britain: 'GB',
  'united states': 'US', usa: 'US', us: 'US', america: 'US',
  // Common neighbours / likely future values
  germany: 'DE', kuwait: 'KW', qatar: 'QA', bahrain: 'BH', oman: 'OM',
  'united arab emirates': 'AE', uae: 'AE', 'saudi': 'SA',
  france: 'FR', italy: 'IT', netherlands: 'NL', belgium: 'BE', switzerland: 'CH',
  sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI', ireland: 'IE',
  portugal: 'PT', greece: 'GR', cyprus: 'CY', poland: 'PL', romania: 'RO',
  bulgaria: 'BG', serbia: 'RS', croatia: 'HR', albania: 'AL', 'bosnia and herzegovina': 'BA',
  russia: 'RU', ukraine: 'UA', belarus: 'BY', moldova: 'MD', georgia: 'GE',
  armenia: 'AM', azerbaijan: 'AZ', uzbekistan: 'UZ', turkmenistan: 'TM',
  kyrgyzstan: 'KG', tajikistan: 'TJ', iran: 'IR', israel: 'IL',
  india: 'IN', pakistan: 'PK', bangladesh: 'BD', china: 'CN', japan: 'JP',
  'south korea': 'KR', indonesia: 'ID', malaysia: 'MY', philippines: 'PH',
  somalia: 'SO', ethiopia: 'ET', ghana: 'GH', senegal: 'SN', mauritania: 'MR',
  chad: 'TD', niger: 'NE', mali: 'ML', 'ivory coast': 'CI', cameroon: 'CM',
  brazil: 'BR', argentina: 'AR', mexico: 'MX', 'new zealand': 'NZ',
};

/** ISO alpha-2 → regional-indicator flag emoji. */
function isoToFlag(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

/** Nationality string → { flag, label }. Unknown values get a neutral globe. */
export function nationalityToFlag(nationality: string | null | undefined): { flag: string; label: string } {
  const raw = (nationality ?? '').trim();
  if (!raw) return { flag: '🌐', label: '—' };
  const iso = NATIONALITY_TO_ISO[raw.toLowerCase()];
  return { flag: iso ? isoToFlag(iso) : '🌐', label: raw };
}

// ─── Phone → WhatsApp ─────────────────────────────────────────────────────────

/**
 * Reduces a stored phone to the bare digits wa.me expects: drop a leading '+',
 * strip every separator, then drop a leading international '00' prefix.
 * Returns null when nothing dialable is left.
 */
export function toWhatsAppDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.trim().replace(/^\+/, '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits.length >= 6 ? digits : null;
}

function whatsAppUrl(phone: string | null | undefined): string | null {
  const digits = toWhatsAppDigits(phone);
  return digits ? `https://wa.me/${digits}` : null;
}

// ─── De-duplication ───────────────────────────────────────────────────────────

/**
 * The view is one row per customer_id, but the same human is often stored twice
 * under different ids. Collapse on normalised name + digits-only phone, keeping
 * the first occurrence so the view's own ordering decides the winner.
 */
function personKey(r: ReviewCandidate): string {
  const name  = (r.full_name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const phone = (r.phone ?? '').replace(/\D/g, '');
  return `${name}::${phone}`;
}

function dedupeByPerson(rows: ReviewCandidate[]): ReviewCandidate[] {
  const seen = new Set<string>();
  const out: ReviewCandidate[] = [];
  for (const r of rows) {
    const key = personKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

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

function dash(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const s = String(v).trim();
  return s ? s : '—';
}

function initials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Posts one review request. Never toasts — callers decide how to report. */
async function postWebhook(row: ReviewCandidate): Promise<{ ok: boolean; error?: string }> {
  if (!REVIEW_WEBHOOK_URL) return { ok: false, error: 'Webhook not configured yet' };
  try {
    const res = await fetch(REVIEW_WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id:    row.customer_id,
        full_name:      row.full_name,
        phone:          row.phone,
        language:       row.language,
        booking_number: row.latest_booking_number,
      }),
    });
    if (!res.ok) return { ok: false, error: `Webhook returned HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
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

const StarIcon: React.FC<{ filled: boolean }> = ({ filled }) => (
  <svg width="19" height="19" viewBox="0 0 24 24"
    fill={filled ? '#f59e0b' : 'none'}
    stroke={filled ? '#f59e0b' : '#d1d5db'}
    strokeWidth="1.6" strokeLinejoin="round">
    <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95L12 2.6z" />
  </svg>
);

/** Interactive 1–5 stars. Each star is a 44px-tall target; hover previews. */
const StarRating: React.FC<{
  value:  number | null;
  busy?:  boolean;
  onRate: (rating: number) => void;
}> = ({ value, busy, onRate }) => {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', opacity: busy ? 0.45 : 1 }}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={busy}
          title={`${n} star${n > 1 ? 's' : ''}`}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
          onMouseEnter={() => { if (!busy) setHover(n); }}
          onClick={() => { if (!busy) onRate(n); }}
          style={{
            width: 32, height: 44, padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent',
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          <StarIcon filled={n <= shown} />
        </button>
      ))}
    </div>
  );
};

const WhatsAppIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

/** Phone rendered as a wa.me deep link, or a muted dash when unusable. */
const PhoneCell: React.FC<{ phone: string | null }> = ({ phone }) => {
  const url = whatsAppUrl(phone);
  if (!url) return <span style={{ color: '#d1d5db', fontSize: 13 }}>{dash(phone)}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: '#16a34a', textDecoration: 'none',
        fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap',
        padding: '4px 9px', borderRadius: 7,
        background: 'rgba(22,163,74,0.07)', transition: 'background 140ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(22,163,74,0.14)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(22,163,74,0.07)'; }}
    >
      <WhatsAppIcon />
      {phone}
    </a>
  );
};

const NationalityCell: React.FC<{ nationality: string | null }> = ({ nationality }) => {
  const { flag, label } = nationalityToFlag(nationality);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 15, lineHeight: 1 }}>{flag}</span>
      <span style={{ fontSize: 13, color: label === '—' ? '#d1d5db' : '#374151' }}>{label}</span>
    </span>
  );
};

const CustomerCell: React.FC<{ name: string | null; email: string | null }> = ({ name, email }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, rgba(75,166,234,0.16) 0%, rgba(75,166,234,0.08) 100%)',
      color: '#2e8fd4', fontSize: 11.5, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {initials(name)}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f1117', whiteSpace: 'nowrap' }}>{dash(name)}</div>
      {email && (
        <div style={{ fontSize: 11.5, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
          {email}
        </div>
      )}
    </div>
  </div>
);

const PlateCell: React.FC<{ plate: string | null; model: string | null }> = ({ plate, model }) => {
  if (!plate) return <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>;
  return (
    <div style={{ whiteSpace: 'nowrap' }}>
      <span style={{
        display: 'inline-block', background: '#f3f4f6', borderRadius: 6,
        padding: '3px 8px', fontSize: 12, fontWeight: 700, color: '#0f1117', letterSpacing: '0.4px',
      }}>
        {plate}
      </span>
      {model && <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 3 }}>{model}</div>}
    </div>
  );
};

const BookingCell: React.FC<{ start: string | null; end: string | null; number: string | null }> = ({ start, end, number }) => {
  const hasRange = !!(start || end);
  return (
    <div style={{ whiteSpace: 'nowrap' }}>
      <div style={{ fontSize: 12.5, color: hasRange ? '#374151' : '#d1d5db' }}>
        {hasRange
          ? <>{formatDate(start)} <span style={{ color: '#4ba6ea', margin: '0 3px' }}>→</span> {formatDate(end)}</>
          : '—'}
      </div>
      {number && (
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
          {number}
        </div>
      )}
    </div>
  );
};

const Th: React.FC<{ children: React.ReactNode; align?: 'left' | 'right' | 'center' }> = ({ children, align = 'left' }) => (
  <th style={{
    padding: '12px 16px', textAlign: align,
    fontSize: 10.5, fontWeight: 700, color: '#9ca3af',
    letterSpacing: '0.7px', textTransform: 'uppercase',
    whiteSpace: 'nowrap', background: '#fafbfc',
    borderBottom: '1px solid #eef0f2',
  }}>
    {children}
  </th>
);

const td: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' };

/** Primary action button, 44px tall for touch. */
const SendButton: React.FC<{
  label: string;
  busy?: boolean;
  variant?: 'primary' | 'ghost';
  onClick: () => void;
}> = ({ label, busy, variant = 'primary', onClick }) => (
  <button
    type="button"
    disabled={busy}
    onClick={onClick}
    style={{
      minHeight: 40, padding: '0 14px',
      display: 'inline-flex', alignItems: 'center', gap: 7,
      borderRadius: 9, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
      cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap',
      transition: 'all 140ms ease',
      ...(variant === 'primary'
        ? { border: 'none', background: busy ? '#a8d4f5' : '#4ba6ea', color: '#fff' }
        : { border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280' }),
    }}
    onMouseEnter={e => {
      if (busy) return;
      const b = e.currentTarget;
      if (variant === 'primary') b.style.background = '#2e8fd4';
      else { b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; }
    }}
    onMouseLeave={e => {
      if (busy) return;
      const b = e.currentTarget;
      if (variant === 'primary') b.style.background = '#4ba6ea';
      else { b.style.borderColor = '#e5e7eb'; b.style.color = '#6b7280'; }
    }}
  >
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    {busy ? 'Sending…' : label}
  </button>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: 'rate',     label: 'Rate Customers' },
  { key: 'awaiting', label: 'Awaiting Send'  },
  { key: 'sent',     label: 'Sent'           },
];

const GoogleReviewsPage: React.FC = () => {
  const [rows,    setRows]    = useState<ReviewCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tab,     setTab]     = useState<TabKey>('rate');
  const [search,  setSearch]  = useState('');

  const [ratingId,    setRatingId]    = useState<string | null>(null);
  const [sendingId,   setSendingId]   = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState(false);

  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // One fetch of the whole view; the three tabs are partitions of it.
  const load = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('review_candidates')
      .select('*')
      .order('booking_end_date', { ascending: false, nullsFirst: false });

    if (fetchError) { setError(fetchError.message); setRows([]); setLoading(false); return; }
    setError(null);
    setRows((data ?? []) as ReviewCandidate[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => { await load(); if (cancelled) return; })();
    return () => { cancelled = true; };
  }, [load]);

  // De-duplicated per tab, so a person stored twice is only actioned once.
  const byStatus = useMemo(() => ({
    rate:     dedupeByPerson(rows.filter(r => r.review_status === 'pending_review')),
    awaiting: dedupeByPerson(rows.filter(r => r.review_status === 'awaiting_send')),
    sent:     dedupeByPerson(rows.filter(r => r.review_status === 'sent')),
  }), [rows]);

  const visible = useMemo(() => {
    const list = byStatus[tab];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(r =>
      (r.full_name ?? '').toLowerCase().includes(q) ||
      (r.phone ?? '').toLowerCase().includes(q) ||
      (r.plate_number ?? '').toLowerCase().includes(q) ||
      (r.latest_booking_number ?? '').toLowerCase().includes(q) ||
      (r.nationality ?? '').toLowerCase().includes(q)
    );
  }, [byStatus, tab, search]);

  // ── Rating ────────────────────────────────────────────────────────────────
  // 5 stars → worth asking for a Google review; anything less is rejected.
  const handleRate = useCallback(async (row: ReviewCandidate, rating: number) => {
    if (ratingId) return;
    setRatingId(row.customer_id);

    const { data: { user } } = await supabase.auth.getUser();
    const status: ReviewStatus = rating === 5 ? 'awaiting_send' : 'rejected';

    const { error: upsertError } = await supabase
      .from('customer_reviews')
      .upsert({
        customer_id:          row.customer_id,        // uuid — never cast
        reference_booking_id: row.latest_booking_id,
        our_rating:           rating,
        status,
        rated_by:             user?.id ?? null,
        rated_at:             new Date().toISOString(),
      }, { onConflict: 'customer_id' });

    setRatingId(null);
    if (upsertError) { showToast(upsertError.message, 'error'); return; }

    const name = row.full_name ?? 'Customer';
    showToast(
      rating === 5
        ? `${name} rated 5★ — moved to Awaiting Send`
        : `${name} rated ${rating}★ — not eligible for a review request`,
    );
    await load();
  }, [ratingId, showToast, load]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (row: ReviewCandidate) => {
    if (sendingId || bulkSending) return;
    setSendingId(row.customer_id);

    const result = await postWebhook(row);
    if (!result.ok) {
      setSendingId(null);
      showToast(result.error ?? 'Send failed', 'error');
      return;   // status deliberately unchanged
    }

    const { error: updateError } = await supabase
      .from('customer_reviews')
      .update({ status: 'sent', review_sent_at: new Date().toISOString() })
      .eq('customer_id', row.customer_id);

    setSendingId(null);
    if (updateError) {
      showToast(`Request sent, but the status update failed: ${updateError.message}`, 'error');
      return;
    }
    showToast(`Review request sent to ${row.full_name ?? 'customer'}`);
    await load();
  }, [sendingId, bulkSending, showToast, load]);

  // Sequential on purpose — one webhook call at a time rather than a burst.
  const handleSendAll = useCallback(async () => {
    const queue = byStatus.awaiting;
    if (queue.length === 0 || bulkSending) return;
    if (!REVIEW_WEBHOOK_URL) { showToast('Webhook not configured yet', 'error'); return; }

    setBulkSending(true);
    let sent = 0;
    let failed = 0;

    for (const row of queue) {
      const result = await postWebhook(row);
      if (!result.ok) { failed++; continue; }
      const { error: updateError } = await supabase
        .from('customer_reviews')
        .update({ status: 'sent', review_sent_at: new Date().toISOString() })
        .eq('customer_id', row.customer_id);
      if (updateError) failed++; else sent++;
    }

    setBulkSending(false);
    showToast(
      failed === 0
        ? `Sent ${sent} review request${sent === 1 ? '' : 's'}`
        : `Sent ${sent}, ${failed} failed`,
      failed === 0 ? 'success' : 'error',
    );
    await load();
  }, [byStatus, bulkSending, showToast, load]);

  // Resend never mutates anything — it just fires the webhook again.
  const handleResend = useCallback(async (row: ReviewCandidate) => {
    if (sendingId) return;
    setSendingId(row.customer_id);
    const result = await postWebhook(row);
    setSendingId(null);
    if (!result.ok) { showToast(result.error ?? 'Resend failed', 'error'); return; }
    showToast(`Review request resent to ${row.full_name ?? 'customer'}`);
  }, [sendingId, showToast]);

  const colCount = tab === 'rate' ? 7 : tab === 'awaiting' ? 6 : 6;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '32px 28px 56px' }}>
      <style>{`
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideUp { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
        .gr-row { transition: background 120ms ease; }
        .gr-row:hover td { background: #f8fafc; }
        .gr-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
        .gr-toolbar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 18px; }
        .gr-search { position: relative; flex: 1 1 260px; min-width: 0; max-width: 420px; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              Reputation
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', lineHeight: 1.1 }}>
            Google Reviews
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>
            Rate past customers, then send Google Maps review requests to the best ones
          </p>
        </div>

        <div className="gr-tabs">
          {TABS.map(t => {
            const active = tab === t.key;
            const count = byStatus[t.key].length;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  minHeight: 44, padding: '0 18px',
                  display: 'inline-flex', alignItems: 'center', gap: 9,
                  borderRadius: 11, fontSize: 14, fontFamily: 'inherit',
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  border: active ? '1.5px solid rgba(75,166,234,0.35)' : '1px solid #e8eaed',
                  color: active ? '#2e8fd4' : '#6b7280',
                  background: active ? '#fff' : 'rgba(255,255,255,0.6)',
                  boxShadow: active ? '0 2px 10px rgba(75,166,234,0.14)' : 'none',
                  transition: 'all 140ms ease',
                }}
              >
                {t.label}
                <span style={{
                  fontSize: 11.5, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 20, minWidth: 22, textAlign: 'center',
                  color: active ? '#2e8fd4' : '#9ca3af',
                  background: active ? 'rgba(75,166,234,0.14)' : '#f1f3f5',
                }}>
                  {loading ? '…' : count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!REVIEW_WEBHOOK_URL && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '11px 15px', marginBottom: 18,
          borderRadius: 11, background: 'rgba(249,115,22,0.07)',
          border: '1px solid rgba(249,115,22,0.22)',
          fontSize: 12.5, color: '#b45309',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Webhook not configured — set <code style={{ fontFamily: 'ui-monospace, monospace', background: 'rgba(180,83,9,0.1)', borderRadius: 4, padding: '1px 5px', margin: '0 2px' }}>REVIEW_WEBHOOK_URL</code> to enable sending. Rating still works.
        </div>
      )}

      {/* Toolbar */}
      <div className="gr-toolbar">
        <div className="gr-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{
            position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none',
          }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8" />
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search name, phone, plate, booking or nationality…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              paddingLeft: 38, paddingRight: 14, height: 44,
              border: '1px solid #e8eaed', borderRadius: 11,
              fontSize: 13.5, color: '#0f1117', background: '#fff',
              outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          />
        </div>

        {tab === 'awaiting' && byStatus.awaiting.length > 0 && (
          <SendButton
            label={`Send All (${byStatus.awaiting.length})`}
            busy={bulkSending}
            onClick={handleSendAll}
          />
        )}

        {!loading && (
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#9ca3af' }}>
            {visible.length} of {byStatus[tab].length} shown
          </span>
        )}
      </div>

      {error && (
        <div style={{
          padding: '11px 15px', marginBottom: 16, borderRadius: 11,
          background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)',
          fontSize: 13, color: '#ef4444',
        }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{
        background: '#fff', borderRadius: 16,
        border: '1px solid #e8eaed',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Nationality</Th>
                {tab === 'rate' && <Th>Age</Th>}
                <Th>Phone</Th>
                <Th>Plate</Th>
                {tab !== 'sent' && <Th>Booking</Th>}
                {tab === 'sent' && <Th>Sent At</Th>}
                <Th align="right">{tab === 'rate' ? 'Rating' : 'Action'}</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: colCount }).map((__, j) => (
                      <td key={j} style={td}>
                        <div style={{ height: 13, borderRadius: 6, background: '#f1f3f5', width: j === 0 ? 160 : 90, animation: 'pulse 1.4s ease-in-out infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={colCount} style={{ padding: '64px 0', textAlign: 'center' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14,
                      background: 'linear-gradient(135deg, rgba(75,166,234,0.1) 0%, rgba(75,166,234,0.06) 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: '#4ba6ea' }}>
                        <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95L12 2.6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                      {search ? 'No matching customers'
                        : tab === 'rate' ? 'Nothing left to rate'
                        : tab === 'awaiting' ? 'No customers awaiting send'
                        : 'No requests sent yet'}
                    </div>
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>
                      {search ? 'Try a different search term'
                        : tab === 'rate' ? 'Every completed customer has been rated'
                        : tab === 'awaiting' ? 'Rate a customer 5 stars to queue them here'
                        : 'Sent review requests will appear here'}
                    </div>
                  </td>
                </tr>
              ) : (
                visible.map((row, idx) => (
                  <tr
                    key={row.customer_id}
                    className="gr-row"
                    style={{ borderTop: idx === 0 ? 'none' : '1px solid #f2f4f6' }}
                  >
                    <td style={td}><CustomerCell name={row.full_name} email={row.email} /></td>
                    <td style={td}><NationalityCell nationality={row.nationality} /></td>
                    {tab === 'rate' && (
                      <td style={{ ...td, fontSize: 13, color: row.age == null ? '#d1d5db' : '#374151', whiteSpace: 'nowrap' }}>
                        {dash(row.age)}
                      </td>
                    )}
                    <td style={td}><PhoneCell phone={row.phone} /></td>
                    <td style={td}><PlateCell plate={row.plate_number} model={row.model_name} /></td>
                    {tab !== 'sent' && (
                      <td style={td}>
                        <BookingCell start={row.booking_start_date} end={row.booking_end_date} number={row.latest_booking_number} />
                      </td>
                    )}
                    {tab === 'sent' && (
                      <td style={{ ...td, fontSize: 12.5, color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {formatDateTime(row.review_sent_at)}
                      </td>
                    )}
                    <td style={{ ...td, textAlign: 'right' }}>
                      {tab === 'rate' && (
                        <StarRating
                          value={row.our_rating}
                          busy={ratingId === row.customer_id}
                          onRate={rating => handleRate(row, rating)}
                        />
                      )}
                      {tab === 'awaiting' && (
                        <SendButton
                          label="Send Review Request"
                          busy={sendingId === row.customer_id || bulkSending}
                          onClick={() => handleSend(row)}
                        />
                      )}
                      {tab === 'sent' && (
                        <SendButton
                          label="Resend"
                          variant="ghost"
                          busy={sendingId === row.customer_id}
                          onClick={() => handleResend(row)}
                        />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {toast && <Toast message={toast.message} kind={toast.kind} />}
    </div>
  );
};

export default GoogleReviewsPage;
