import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ViewRow {
  id: number;
  booking_number: string;
  customer_id: number;
  car_id: number;
  start_date: string;
  end_date: string;
  status: string;
  kabis_reported: boolean;
  invoice_issued: boolean;
  created_at: string;
}

interface EnrichedRow extends ViewRow {
  customer_name: string;
  plate: string;
  car_model: string;
}

type SortKey = 'end_date' | 'created_at';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysSince(iso: string): number {
  const ref = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - ref.getTime()) / 86400000);
}

function urgencyColor(days: number): string {
  if (days > 14) return '#dc2626';
  if (days > 7)  return '#d97706';
  return '#374151';
}

function urgencyBg(days: number): string {
  if (days > 14) return 'rgba(220,38,38,0.08)';
  if (days > 7)  return 'rgba(217,119,6,0.08)';
  return 'rgba(55,65,81,0.06)';
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastState { message: string; type: 'success' | 'error'; }

const Toast: React.FC<ToastState> = ({ message, type }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: type === 'success' ? '#0f1117' : '#ef4444',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'piSlide 200ms ease',
    }}>
      {type === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
      }
      {message}
    </div>,
    document.body,
  );

// ─── Skeleton row ─────────────────────────────────────────────────────────────

const SkeletonRow: React.FC = () => (
  <tr>
    {[88, 140, 150, 130, 80, 80, 80, 120].map((w, i) => (
      <td key={i} style={{ padding: '13px 16px' }}>
        <div style={{ height: 13, borderRadius: 6, background: '#f0f0f0', width: w, animation: 'piPulse 1.4s ease-in-out infinite' }} />
      </td>
    ))}
  </tr>
);

// ─── Sort chevron ─────────────────────────────────────────────────────────────

const SortIcon: React.FC<{ active: boolean; dir: 'asc' | 'desc' }> = ({ active, dir }) => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 4, opacity: active ? 1 : 0.25, flexShrink: 0 }}>
    <path d="M12 5l-7 7h14l-7-7z" fill="currentColor" opacity={active && dir === 'asc' ? 1 : 0.35}/>
    <path d="M12 19l7-7H5l7 7z" fill="currentColor" opacity={active && dir === 'desc' ? 1 : 0.35}/>
  </svg>
);

// ─── Main page ────────────────────────────────────────────────────────────────

const PendingInvoicesPage: React.FC = () => {
  const [rows, setRows]         = useState<EnrichedRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [sortKey, setSortKey]   = useState<SortKey>('end_date');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc');
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [toast, setToast]       = useState<ToastState | null>(null);
  const toastTimer              = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Load data ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: viewData, error: viewErr } = await supabase
      .from('bookings_kabis_no_invoice')
      .select('*')
      .order('end_date', { ascending: false });

    if (viewErr) {
      console.error('[pending-invoices] fetch:', viewErr);
      setError(viewErr.message);
      setLoading(false);
      return;
    }

    const viewRows = (viewData ?? []) as ViewRow[];

    if (viewRows.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const customerIds = [...new Set(viewRows.map(r => r.customer_id))];
    const carIds      = [...new Set(viewRows.map(r => r.car_id))];

    const [{ data: custData }, { data: carsData }] = await Promise.all([
      supabase.from('customers').select('id, first_name, last_name').in('id', customerIds),
      supabase.from('cars').select('id, plate_number, model_group(name)').in('id', carIds),
    ]);

    // Customer name map
    const custMap = new Map<number, string>();
    (custData ?? []).forEach((c: { id: number; first_name: string; last_name: string }) => {
      custMap.set(c.id, `${c.first_name} ${c.last_name}`.trim());
    });

    // Car info map
    const carMap = new Map<number, { plate: string; model: string }>();
    (carsData ?? []).forEach((c: { id: number; plate_number: string; model_group: { name: string } | { name: string }[] | null }) => {
      const mg = c.model_group;
      const modelName = Array.isArray(mg) ? (mg[0]?.name ?? '—') : (mg?.name ?? '—');
      carMap.set(c.id, { plate: c.plate_number, model: modelName });
    });

    setRows(viewRows.map(r => ({
      ...r,
      customer_name: custMap.get(r.customer_id) ?? '—',
      plate:     carMap.get(r.car_id)?.plate ?? '—',
      car_model: carMap.get(r.car_id)?.model ?? '—',
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Mark as invoiced ──────────────────────────────────────────────────────

  const markInvoiced = useCallback(async (row: EnrichedRow) => {
    if (markingId !== null) return;
    setMarkingId(row.id);

    // Optimistic removal
    setRows(prev => prev.filter(r => r.id !== row.id));

    const { error: updateErr } = await supabase
      .from('bookings')
      .update({ invoice_issued: true })
      .eq('id', row.id);

    setMarkingId(null);

    if (updateErr) {
      console.error('[pending-invoices] update:', updateErr);
      // Restore row on failure
      setRows(prev => {
        const next = [row, ...prev];
        next.sort((a, b) => b.end_date.localeCompare(a.end_date));
        return next;
      });
      showToast(`Update failed: ${updateErr.message}`, 'error');
      return;
    }

    showToast(`${row.booking_number} marked as invoiced`, 'success');
  }, [markingId, showToast]);

  // ── Sort ──────────────────────────────────────────────────────────────────

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? rows.filter(r =>
          r.booking_number.toLowerCase().includes(q) ||
          r.customer_name.toLowerCase().includes(q) ||
          r.plate.toLowerCase().includes(q)
        )
      : rows;

    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, search, sortKey, sortDir]);

  // ── Summary stats ─────────────────────────────────────────────────────────

  const over14 = rows.filter(r => daysSince(r.end_date) > 14).length;
  const over7  = rows.filter(r => { const d = daysSince(r.end_date); return d > 7 && d <= 14; }).length;

  // ─────────────────────────────────────────────────────────────────────────

  const thStyle: React.CSSProperties = {
    padding: '11px 16px', textAlign: 'left',
    fontSize: 11, fontWeight: 700, color: '#9ca3af',
    letterSpacing: '0.5px', textTransform: 'uppercase',
    whiteSpace: 'nowrap', background: '#fafafa',
    userSelect: 'none',
  };

  return (
    <div style={{ padding: '28px 28px 56px', maxWidth: 1300, margin: '0 auto' }}>
      <style>{`
        @keyframes piPulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes piSlide  { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
        .pi-tr { transition: opacity 200ms ease; }
        .pi-tr:hover td { background: #f9fafb !important; }
        .pi-mark-btn { transition: all 140ms ease; }
        .pi-mark-btn:hover:not(:disabled) {
          background: rgba(75,166,234,0.08) !important;
          color: #4ba6ea !important;
          border-color: rgba(75,166,234,0.25) !important;
        }
      `}</style>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 26 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6 }}>
            • Bookings
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.5px' }}>
              Pending Invoices
            </h1>
            {!loading && (
              <span style={{
                background: rows.length > 0
                  ? 'linear-gradient(135deg, rgba(220,38,38,0.10) 0%, rgba(220,38,38,0.06) 100%)'
                  : 'linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(16,185,129,0.06) 100%)',
                color: rows.length > 0 ? '#dc2626' : '#16a34a',
                fontSize: 12, fontWeight: 700,
                padding: '3px 10px', borderRadius: 20,
                border: `1px solid ${rows.length > 0 ? 'rgba(220,38,38,0.18)' : 'rgba(16,185,129,0.18)'}`,
              }}>
                {rows.length} pending
              </span>
            )}
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: '#9ca3af' }}>
            Completed bookings reported to KABİS, still awaiting an invoice.
          </p>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', minWidth: 260 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search booking #, customer, plate…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              paddingLeft: 32, paddingRight: 12, height: 38,
              border: '1px solid #e5e7eb', borderRadius: 9,
              fontSize: 13, color: '#0f1117', background: 'white',
              outline: 'none', width: '100%', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
          {/* Total */}
          <div style={{ background: 'white', borderRadius: 13, border: '1px solid #ebebeb', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 16, minWidth: 170 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: rows.length > 0 ? 'rgba(220,38,38,0.08)' : 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {rows.length > 0 ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#dc2626' }}>
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <path d="M12 18v-1M12 15V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#16a34a' }}>
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: rows.length > 0 ? '#dc2626' : '#16a34a', letterSpacing: '-0.8px', lineHeight: 1 }}>{rows.length}</div>
              <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4 }}>invoices pending</div>
            </div>
          </div>

          {over14 > 0 && (
            <div style={{ background: 'white', borderRadius: 13, border: '1px solid rgba(220,38,38,0.18)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 14, minWidth: 150 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }}/>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626', letterSpacing: '-0.5px', lineHeight: 1 }}>{over14}</div>
                <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4 }}>over 14 days</div>
              </div>
            </div>
          )}

          {over7 > 0 && (
            <div style={{ background: 'white', borderRadius: 13, border: '1px solid rgba(217,119,6,0.18)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 14, minWidth: 150 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#d97706', flexShrink: 0 }}/>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#d97706', letterSpacing: '-0.5px', lineHeight: 1 }}>{over7}</div>
                <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4 }}>7 – 14 days</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '18px 22px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#dc2626', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#991b1b', marginBottom: 2 }}>Failed to load</div>
            <div style={{ fontSize: 12.5, color: '#dc2626' }}>{error}</div>
          </div>
          <button
            onClick={load}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #fecaca', background: 'white', color: '#dc2626', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #ebebeb', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                <th style={thStyle}>Booking #</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Car</th>
                <th
                  style={{ ...thStyle, cursor: 'pointer' }}
                  onClick={() => toggleSort('end_date')}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    Period <SortIcon active={sortKey === 'end_date'} dir={sortDir} />
                  </span>
                </th>
                <th
                  style={{ ...thStyle, cursor: 'pointer' }}
                  onClick={() => toggleSort('end_date')}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    Days Waiting <SortIcon active={sortKey === 'end_date'} dir={sortDir} />
                  </span>
                </th>
                <th style={thStyle}>KABİS</th>
                <th style={thStyle}>Invoice</th>
                <th style={{ ...thStyle, textAlign: 'right' }}></th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '72px 0', textAlign: 'center' }}>
                    <div style={{ width: 54, height: 54, borderRadius: 14, background: 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ color: '#16a34a' }}>
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1117', marginBottom: 5 }}>
                      {search ? 'No matching bookings' : 'All caught up!'}
                    </div>
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>
                      {search ? 'Try a different search term' : 'No pending invoices. Finance is up to date.'}
                    </div>
                  </td>
                </tr>
              ) : (
                displayed.map(row => {
                  const days = daysSince(row.end_date);
                  const isMarking = markingId === row.id;
                  return (
                    <tr
                      key={row.id}
                      className="pi-tr"
                      style={{ borderBottom: '1px solid #f5f5f5', opacity: isMarking ? 0.35 : 1 }}
                    >
                      {/* Booking # */}
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.3px' }}>
                          {row.booking_number}
                        </span>
                      </td>

                      {/* Customer */}
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#0f1117' }}>{row.customer_name}</span>
                      </td>

                      {/* Car */}
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ background: '#f3f4f6', borderRadius: 6, padding: '3px 7px', fontSize: 11.5, fontWeight: 700, color: '#374151', letterSpacing: '0.5px' }}>
                            {row.plate}
                          </span>
                          <span style={{ fontSize: 13, color: '#6b7280' }}>{row.car_model}</span>
                        </div>
                      </td>

                      {/* Period */}
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 12.5, color: '#6b7280' }}>
                          {fmtDate(row.start_date)} → {fmtDate(row.end_date)}
                        </span>
                      </td>

                      {/* Days waiting */}
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block',
                          background: urgencyBg(days),
                          color: urgencyColor(days),
                          fontWeight: 700, fontSize: 12,
                          padding: '3px 9px', borderRadius: 6,
                        }}>
                          {days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`}
                        </span>
                      </td>

                      {/* KABİS */}
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(22,163,74,0.08)', color: '#16a34a', fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 6 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          Reported
                        </span>
                      </td>

                      {/* Invoice */}
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(220,38,38,0.07)', color: '#dc2626', fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 6, border: '1px solid rgba(220,38,38,0.15)' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2"/><path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                          Not issued
                        </span>
                      </td>

                      {/* Action */}
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button
                          onClick={() => markInvoiced(row)}
                          disabled={isMarking}
                          className="pi-mark-btn"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '6px 13px', borderRadius: 8,
                            border: '1px solid #e5e7eb',
                            background: 'white', color: '#6b7280',
                            fontSize: 12.5, fontWeight: 600,
                            cursor: isMarking ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                            opacity: isMarking ? 0.5 : 1,
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                            <path d="M9 13l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Mark invoiced
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {toast && <Toast {...toast} />}
    </div>
  );
};

export default PendingInvoicesPage;
