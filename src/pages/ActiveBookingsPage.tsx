import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

interface ActiveBookingRow {
  booking_id: number;
  booking_number: string;
  car_id: number;
  customer_id: number;
  customer_full_name: string | null;
  customer_phone: string | null;
  start_date: string;
  end_date: string;
  plate_number: string;
  car_model: string;
  kabis_reported: boolean;
  invoice_issued: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysLeft(endDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(endDate + 'T00:00:00');
  return Math.ceil((end.getTime() - now.getTime()) / 86400000);
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#16a34a' }}>
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#d1d5db' }}>
    <path d="M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const SkeletonRow: React.FC = () => (
  <tr>
    {[80, 110, 120, 140, 120, 90, 90, 50, 50, 50].map((w, i) => (
      <td key={i} style={{ padding: '12px 14px' }}>
        <div style={{
          height: 13, borderRadius: 6, background: '#f0f0f0',
          width: w, animation: 'pulse 1.4s ease-in-out infinite',
        }} />
      </td>
    ))}
  </tr>
);

const ActiveBookingsPage: React.FC = () => {
  const [rows, setRows] = useState<ActiveBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from('active_bookings')
        .select('*')
        .order('end_date', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error('[active_bookings] fetch error:', error);
        setRows([]);
        setLoading(false);
        return;
      }

      const bookings = (data ?? []) as ActiveBookingRow[];
      if (bookings.length > 0) {
        console.log('[active_bookings] first row:', bookings[0]);
      }

      setRows(bookings);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.booking_number ?? '').toLowerCase().includes(q) ||
      (r.plate_number ?? '').toLowerCase().includes(q) ||
      (r.customer_full_name ?? '').toLowerCase().includes(q) ||
      (r.car_model ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .ab-tr:hover td { background: #f9fafb !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.5px' }}>
              Active Bookings
            </h1>
            {!loading && (
              <span style={{
                background: 'linear-gradient(135deg, rgba(75,166,234,0.12) 0%, rgba(75,166,234,0.07) 100%)',
                color: '#4ba6ea',
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 20,
                border: '1px solid rgba(75,166,234,0.2)',
              }}>
                {rows.length} {rows.length === 1 ? 'booking' : 'bookings'}
              </span>
            )}
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: '#9ca3af' }}>
            Cars currently out on active rentals
          </p>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', minWidth: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{
            position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none',
          }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8" />
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search bookings..."
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

      {/* Table */}
      <div style={{
        background: 'white', borderRadius: 14,
        border: '1px solid #ebebeb',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: 820 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                {['Booking #', 'Plate', 'Car', 'Customer', 'Phone', 'Start', 'End', 'Days Left', 'Kabis', 'Invoice'].map(h => (
                  <th key={h} style={{
                    padding: '11px 14px', textAlign: 'left',
                    fontSize: 11, fontWeight: 700, color: '#9ca3af',
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                    whiteSpace: 'nowrap', background: '#fafafa',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '52px 0', textAlign: 'center' }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: 'linear-gradient(135deg, rgba(75,166,234,0.1) 0%, rgba(75,166,234,0.06) 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 14px',
                    }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: '#4ba6ea' }}>
                        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        <path d="M8 14h.01M12 14h.01M16 14h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                      {search ? 'No matching bookings' : 'No active bookings right now'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      {search ? 'Try a different search term' : 'Active rentals will appear here'}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(row => {
                  const dl = daysLeft(row.end_date);
                  const dlColor = dl < 0 ? '#ef4444' : dl <= 1 ? '#f59e0b' : dl <= 3 ? '#f97316' : '#374151';
                  const phoneStripped = row.customer_phone ? row.customer_phone.replace(/\D/g, '') : null;

                  return (
                    <tr key={row.booking_id} className="ab-tr" style={{ borderBottom: '1px solid #f5f5f5' }}>
                      {/* Booking # */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontFamily: 'ui-monospace, monospace',
                          fontSize: 12, fontWeight: 600,
                          color: '#4ba6ea', letterSpacing: '0.3px',
                        }}>
                          {row.booking_number}
                        </span>
                      </td>

                      {/* Plate */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          background: '#f3f4f6', borderRadius: 6,
                          padding: '3px 8px', fontSize: 12, fontWeight: 700,
                          color: '#374151', letterSpacing: '0.5px',
                        }}>
                          {row.plate_number}
                        </span>
                      </td>

                      {/* Car */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 13, color: '#374151' }}>{row.car_model}</span>
                      </td>

                      {/* Customer */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#0f1117' }}>
                          {row.customer_full_name || '—'}
                        </span>
                      </td>

                      {/* Phone */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        {phoneStripped ? (
                          <a
                            href={`https://wa.me/${phoneStripped}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              color: '#16a34a', textDecoration: 'none',
                              fontSize: 12, fontWeight: 500,
                              padding: '3px 8px', borderRadius: 6,
                              background: 'rgba(22,163,74,0.07)',
                              transition: 'background 140ms ease',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(22,163,74,0.13)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(22,163,74,0.07)')}
                          >
                            <WhatsAppIcon />
                            {row.customer_phone}
                          </a>
                        ) : (
                          <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>
                        )}
                      </td>

                      {/* Start */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{formatDate(row.start_date)}</span>
                      </td>

                      {/* End */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{formatDate(row.end_date)}</span>
                      </td>

                      {/* Days Left */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: dlColor }}>
                          {dl < 0 ? `${Math.abs(dl)}d overdue` : dl === 0 ? 'Today' : `${dl}d`}
                        </span>
                      </td>

                      {/* Kabis */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        {row.kabis_reported ? <CheckIcon /> : <DashIcon />}
                      </td>

                      {/* Invoice */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        {row.invoice_issued ? <CheckIcon /> : <DashIcon />}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ActiveBookingsPage;
