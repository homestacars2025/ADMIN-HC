import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Booking, BookingStatus } from '../types';
import { printBookingContract } from '../lib/printContract';
import { printReplacementSheet, type ReplacementSheet as PrintableSheet } from '../lib/printReplacementSheet';
import { BookingFormSheet } from './bookings/BookingFormSheet';
import { ExtendSheet } from './bookings/ExtendSheet';
import { ReplacementSheet } from './bookings/ReplacementSheet';
import { BannedBadge } from './customers/ui';
import { CustomerAvatar } from '../components/shared/PersonAvatar';
import { MonthNav } from '../components/shared/MonthNav';
import { Button } from '../components/media/MediaUI';

// ─── Raw Supabase join shapes ─────────────────────────────────────────────────

interface CarJoin {
  plate_number: string;
  model_group: { name: string } | { name: string }[] | null;
}

interface CustomerJoin {
  is_banned?: boolean;
  first_name: string;
  last_name: string;
}

interface BookingRow {
  id: number;
  booking_number: string;
  status: BookingStatus;
  car_id: number;
  customer_id: number;
  start_date: string;
  end_date: string;
  kabis_reported: boolean;
  invoice_issued: boolean;
  is_currently_active: boolean;
  pickup_location: string | null;
  dropoff_location: string | null;
  km_at_delivery: number | null;
  fuel_at_delivery: string | null;
  insurance_type: string | null;
  additional_services: string | null;
  cars: CarJoin | CarJoin[] | null;
  customers: CustomerJoin | CustomerJoin[] | null;
}

// ─── Replacement-car shapes ───────────────────────────────────────────────────

/**
 * A car in either dropdown. The original-car picker lists every car (a withdrawn
 * car may well be inactive); the replacement picker lists only active ones.
 */
/** Raw replacement_sheets row with its four embedded relations. */
interface ReplacementSheetJoin {
  id:                  number;
  sheet_number:        string | null;
  created_at:          string;
  start_date:          string;
  end_date:            string;
  km_at_handover:      number | string | null;
  fuel_at_handover:    string | null;
  notes:               string | null;
  customer_id:         string | null;
  original_booking_id: number | null;
  original_car_id:     number | null;
  replacement_car_id:  number;
  calendar_block_id:   number | null;
  customers:        CustomerJoin | CustomerJoin[] | null;
  bookings:         { booking_number: string } | { booking_number: string }[] | null;
  original_car:     CarJoin | CarJoin[] | null;
  replacement_car:  CarJoin | CarJoin[] | null;
}

/** Flattened replacement sheet, ready for the table and for reprinting. */
interface ReplacementSheetRow {
  id:                      number;
  sheet_number:            string;
  created_at:              string;
  start_date:              string;
  end_date:                string;
  km_at_handover:          number | null;
  fuel_at_handover:        string | null;
  notes:                   string | null;
  customer_id:             string | null;
  customer_name:           string;
  original_booking_number: string | null;
  original_plate:          string | null;
  original_model:          string | null;
  replacement_plate:       string;
  replacement_model:       string | null;
}

type SortCol = 'booking_number' | 'start_date' | 'end_date' | null;
type SortDir = 'asc' | 'desc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDateDisplay(s: string): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function resolveBooking(row: BookingRow): Booking {
  const carJoin = Array.isArray(row.cars) ? row.cars[0] : row.cars;
  const mg = carJoin?.model_group;
  const car_model = Array.isArray(mg)
    ? (mg[0]?.name ?? '—')
    : (mg as { name: string } | null)?.name ?? '—';

  const custJoin = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const customer_name = custJoin
    ? `${custJoin.first_name} ${custJoin.last_name}`.trim()
    : '—';
  const customer_banned = Boolean(custJoin?.is_banned);

  return {
    id: row.id,
    created_at: '',
    car_id: row.car_id,
    start_date: row.start_date,
    end_date: row.end_date,
    insurance_type: row.insurance_type ?? null,
    notes: null,
    booking_number: row.booking_number,
    additional_driver: null,
    customer_id: row.customer_id,
    kabis_reported: row.kabis_reported,
    invoice_issued: row.invoice_issued,
    is_currently_active: row.is_currently_active,
    status: row.status,
    additional_services: row.additional_services ?? null,
    pickup_location: row.pickup_location ?? null,
    dropoff_location: row.dropoff_location ?? null,
    km_at_delivery: row.km_at_delivery ?? null,
    fuel_at_delivery: row.fuel_at_delivery ?? null,
    plate_number: carJoin?.plate_number ?? '—',
    car_model,
    customer_name,
    customer_banned,
  };
}

/** PostgREST returns an embedded to-one relation as either an object or a 1-element array. */
function resolveModelName(mg: { name: string } | { name: string }[] | null | undefined): string {
  if (!mg) return '—';
  return Array.isArray(mg) ? (mg[0]?.name ?? '—') : mg.name;
}

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function resolveReplacementSheet(row: ReplacementSheetJoin): ReplacementSheetRow {
  const cust = firstOf(row.customers);
  const bkg  = firstOf(row.bookings);
  const oCar = firstOf(row.original_car);
  const rCar = firstOf(row.replacement_car);

  return {
    id:                      row.id,
    sheet_number:            row.sheet_number ?? '—',
    created_at:              row.created_at,
    start_date:              row.start_date,
    end_date:                row.end_date,
    // numeric columns can arrive as a string from PostgREST — normalise to number.
    km_at_handover:          row.km_at_handover == null ? null : Number(row.km_at_handover),
    fuel_at_handover:        row.fuel_at_handover,
    notes:                   row.notes,
    customer_id:             row.customer_id,
    customer_name:           cust ? `${cust.first_name} ${cust.last_name}`.trim() : '—',
    original_booking_number: bkg?.booking_number ?? null,
    original_plate:          oCar?.plate_number ?? null,
    original_model:          oCar ? resolveModelName(oCar.model_group) : null,
    replacement_plate:       rCar?.plate_number ?? '—',
    replacement_model:       rCar ? resolveModelName(rCar.model_group) : null,
  };
}

/** The one place a stored sheet becomes printer input — used by create and reprint alike. */
function toPrintable(row: ReplacementSheetRow): PrintableSheet {
  return {
    sheet_number:            row.sheet_number,
    customer_id:             row.customer_id ?? '',
    customer_name:           row.customer_name,
    original_booking_number: row.original_booking_number,
    original_plate:          row.original_plate,
    original_model:          row.original_model,
    replacement_plate:       row.replacement_plate,
    replacement_model:       row.replacement_model,
    start_date:              row.start_date,
    end_date:                row.end_date,
    km_at_handover:          row.km_at_handover,
    fuel_at_handover:        row.fuel_at_handover,
    notes:                   row.notes,
  };
}

const REPLACEMENT_SHEET_SELECT = `
  id, sheet_number, created_at, start_date, end_date,
  km_at_handover, fuel_at_handover, notes,
  customer_id, original_booking_id, original_car_id, replacement_car_id, calendar_block_id,
  customers!replacement_sheets_customer_id_fkey(first_name, last_name),
  bookings!replacement_sheets_original_booking_id_fkey(booking_number),
  original_car:cars!replacement_sheets_original_car_id_fkey(plate_number, model_group(name)),
  replacement_car:cars!replacement_sheets_replacement_car_id_fkey(plate_number, model_group(name))
`;

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; bg: string }> = {
  confirmed: { label: 'Confirmed', color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  pending:   { label: 'Pending',   color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  completed: { label: 'Completed', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

// Stat card
const StatCard: React.FC<{ label: string; value: number; bg: string; loading: boolean }> = ({
  label, value, bg, loading,
}) => (
  <div style={{
    background: bg, borderRadius: 12, padding: '14px 18px', color: '#fff',
    display: 'flex', flexDirection: 'column', gap: 6,
  }}>
    <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', opacity: 0.80 }}>
      {label}
    </div>
    <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-1.5px', lineHeight: 1 }}>
      {loading ? '—' : value}
    </div>
  </div>
);

// Toggle switch
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled = false }) => (
  <button
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={e => { e.stopPropagation(); onChange(); }}
    style={{
      width: 36, height: 20, borderRadius: 10, border: 'none',
      background: checked ? '#4ba6ea' : '#d1d5db',
      cursor: disabled ? 'not-allowed' : 'pointer',
      position: 'relative', padding: 0, flexShrink: 0,
      transition: 'background 200ms ease',
      opacity: disabled ? 0.6 : 1,
    }}
  >
    <span style={{
      position: 'absolute', top: 2, left: checked ? 18 : 2,
      width: 16, height: 16, borderRadius: 8, background: '#fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.20)',
      transition: 'left 200ms ease',
      display: 'block',
    }} />
  </button>
);

// Status badge
const StatusBadge: React.FC<{ status: BookingStatus }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 600,
      color: cfg.color, background: cfg.bg,
      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

// Skeleton row
const SkeletonRow: React.FC = () => (
  <tr>
    {[44, 100, 30, 90, 120, 80, 130, 80, 80, 44, 44, 60].map((w, i) => (
      <td key={i} style={{ padding: '9px 12px' }}>
        <div style={{ height: 13, width: w, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </td>
    ))}
  </tr>
);

// Toast
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
      animation: 'slideUpIn 200ms ease',
    }}>
      {type === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
      }
      {message}
    </div>,
    document.body,
  );


// Table header cell
const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ children, style, ...rest }) => (
  <th
    style={{
      padding: '9px 12px', fontSize: 11, fontWeight: 600,
      color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
      textAlign: 'left', background: 'var(--surface)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky', top: 0, zIndex: 1,
      whiteSpace: 'nowrap', userSelect: 'none',
      ...style,
    }}
    {...rest}
  >
    {children}
  </th>
);

// Action icon button
const ActionBtn: React.FC<{
  onClick: () => void;
  title: string;
  hoverColor: string;
  children: React.ReactNode;
}> = ({ onClick, title, hoverColor, children }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 30, height: 30, borderRadius: 7, border: 'none',
        background: hovered ? `${hoverColor}18` : 'transparent',
        color: hovered ? hoverColor : '#9ca3af',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 140ms ease', flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
};

// ─── Booking table row ────────────────────────────────────────────────────────

interface RowProps {
  booking: Booking;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: (id: number, field: 'kabis_reported' | 'invoice_issued', current: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onPrint: () => void;
  onExtend: () => void;
}

const BookingTableRow: React.FC<RowProps> = ({
  booking, isSelected, onSelect, onToggle, onEdit, onDelete, onPrint, onExtend,
}) => (
  <tr
    className="bk-row"
    style={{ borderBottom: '1px solid var(--border-subtle)', background: isSelected ? 'rgba(75,166,234,0.05)' : 'var(--surface)' }}
  >
    <td style={{ padding: '9px 8px 9px 16px' }}>
      <input type="checkbox" checked={isSelected} onChange={onSelect}
        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#4ba6ea' }} />
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span className="font-mono tabular-nums" style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', letterSpacing: '0.1px' }}>
        {booking.booking_number}
      </span>
    </td>
    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
      <span title={booking.is_currently_active ? 'Active' : 'Inactive'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: booking.is_currently_active ? '#16a34a' : '#d1d5db',
          boxShadow: booking.is_currently_active ? '0 0 0 2px rgba(22,163,74,0.2)' : 'none',
          display: 'inline-block',
        }} />
      </span>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <StatusBadge status={booking.status} />
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{booking.car_model}</span>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span className="font-mono tabular-nums" style={{
        display: 'inline-block', background: '#f3f4f6', borderRadius: 6,
        padding: '2px 8px', fontSize: 12, fontWeight: 600, color: '#0f1117', letterSpacing: '0.2px',
      }}>
        {booking.plate_number}
      </span>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <Link
        to={`/dashboard/customers/${booking.customer_id}`}
        onClick={e => e.stopPropagation()}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', textDecoration: 'none' }}
      >
        <CustomerAvatar size={26} />
        {booking.customer_name}
        {booking.customer_banned && <BannedBadge />}
      </Link>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>
        {formatDateDisplay(booking.start_date)}
      </span>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>
        {formatDateDisplay(booking.end_date)}
      </span>
    </td>
    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
      <ToggleSwitch
        checked={booking.kabis_reported}
        onChange={() => onToggle(booking.id, 'kabis_reported', booking.kabis_reported)}
      />
    </td>
    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
      <ToggleSwitch
        checked={booking.invoice_issued}
        onChange={() => onToggle(booking.id, 'invoice_issued', booking.invoice_issued)}
      />
    </td>
    <td style={{ padding: '9px 16px 9px 8px', textAlign: 'right' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        {/* A cancelled booking has nothing to extend. */}
        {booking.status !== 'cancelled' && (
          <ActionBtn onClick={onExtend} title="Extend Booking" hoverColor="#16a34a">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </ActionBtn>
        )}
        <ActionBtn onClick={onPrint} title="Print Contract" hoverColor="#8b5cf6">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 9V2h12v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="6" y="14" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </ActionBtn>
        <ActionBtn onClick={onEdit} title="Edit" hoverColor="#4ba6ea">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </ActionBtn>
        <ActionBtn onClick={onDelete} title="Delete" hoverColor="#ef4444">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </ActionBtn>
      </div>
    </td>
  </tr>
);

const ReplacementSheetsSection: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState<ReplacementSheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('replacement_sheets')
        .select(REPLACEMENT_SHEET_SELECT)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (fetchError) { setError(fetchError.message); setLoading(false); return; }
      setError(null);
      setRows(((data ?? []) as unknown as ReplacementSheetJoin[]).map(resolveReplacementSheet));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border-subtle)', marginTop: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          minHeight: 52, padding: '12px 20px',
          border: 'none', background: '#fff', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease', flexShrink: 0 }}>
          <path d="M9 6l6 6-6 6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#0f1117' }}>Replacement Sheets</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#3A74C2', background: 'rgba(75,166,234,0.10)', borderRadius: 20, padding: '2px 9px' }}>
          {loading ? '…' : rows.length}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #f3f4f6' }}>
          {loading && <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>Loading…</div>}

          {!loading && error && (
            <div style={{ padding: '16px 20px', fontSize: 13, color: '#ef4444' }}>{error}</div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
              No replacement sheets yet.
            </div>
          )}

          {!loading && !error && rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface)' }}>
                    <Th>Sheet</Th>
                    <Th>Customer</Th>
                    <Th>Original → Replacement</Th>
                    <Th>Period</Th>
                    <Th style={{ textAlign: 'right', paddingRight: 16 }}>Print</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="bk-row" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface)' }}>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#0f1117', whiteSpace: 'nowrap' }}>
                        {r.sheet_number}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151' }}>
                        {r.customer_name}
                        {r.original_booking_number && (
                          <span className="font-mono tabular-nums" style={{ display: 'block', fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>
                            {r.original_booking_number}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
                        <span className="font-mono tabular-nums" style={{ color: '#9ca3af' }}>{r.original_plate ?? '—'}</span>
                        <span style={{ margin: '0 7px', color: '#3A74C2' }}>→</span>
                        <strong className="font-mono tabular-nums" style={{ color: '#0f1117' }}>{r.replacement_plate}</strong>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
                        {formatDateDisplay(r.start_date)} – {formatDateDisplay(r.end_date)}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                        <ActionBtn
                          onClick={() => printReplacementSheet(toPrintable(r))}
                          title="Reprint sheet"
                          hoverColor="#4ba6ea"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M6 9V2h12v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            <rect x="6" y="14" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </ActionBtn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Delete confirm modal ─────────────────────────────────────────────────────

const DeleteConfirm: React.FC<{
  booking: Booking;
  deleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ booking, deleting, onConfirm, onClose }) => {
  const backdropPressRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      onMouseDown={e => { backdropPressRef.current = e.target === e.currentTarget; }}
      onClick={e => {
        if (e.target === e.currentTarget && backdropPressRef.current) onClose();
        backdropPressRef.current = false;
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'fadeIn 150ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, width: '100%', maxWidth: 400,
          padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
          animation: 'slideUp 180ms ease',
        }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#0f1117', marginBottom: 8 }}>Delete Booking?</div>
        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.6 }}>
          Booking <strong className="font-mono tabular-nums" style={{ color: '#0f1117' }}>{booking.booking_number}</strong> for{' '}
          <strong style={{ color: '#0f1117' }}>{booking.customer_name}</strong> will be permanently deleted.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #EBEBEB', background: '#fff', fontSize: 14, fontWeight: 500, color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={deleting}
            style={{ padding: '9px 22px', fontSize: 14, fontFamily: 'inherit' }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const BookingsPage: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => getMonthStart(new Date()));
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookings, setBookings]           = useState<Booking[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [stats, setStats]                 = useState({ total: 0, confirmed: 0, pending: 0, completed: 0 });
  const [statsLoading, setStatsLoading]   = useState(true);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<BookingStatus | ''>('');

  // The list only holds one month, so a link to a booking has to bring its month.
  useEffect(() => {
    const q = searchParams.get('q');
    const month = searchParams.get('month');
    if (q !== null) setSearch(q);
    if (month) setSelectedMonth(getMonthStart(new Date(`${month}-01T00:00:00`)));
  }, [searchParams]);

  const [sort, setSort]                   = useState<{ col: SortCol; dir: SortDir }>({ col: null, dir: 'asc' });
  const [selectedIds, setSelectedIds]     = useState<Set<number>>(new Set());
  const [modal, setModal]                 = useState<null | 'add' | 'replacement' | { mode: 'edit'; booking: Booking }>(null);
  const [bookingFor, setBookingFor]       = useState<string | undefined>(undefined);

  // "New booking" on a customer opens the form for that customer, once.
  useEffect(() => {
    const customer = searchParams.get('customer');
    if (searchParams.get('new') !== '1' || !customer) return;
    setBookingFor(customer);
    setModal('add');
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.delete('new');
      next.delete('customer');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);
  const [sheetsRefresh, setSheetsRefresh]  = useState(0);
  const [deleteTarget, setDeleteTarget]   = useState<Booking | null>(null);
  const [extendTarget, setExtendTarget]   = useState<Booking | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [toast, setToast]                 = useState<ToastState | null>(null);
  const toastTimer                        = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Fetch stats (separate lightweight query) ────────────────────────────────
  const fetchStats = useCallback(async (month: Date) => {
    setStatsLoading(true);
    const { data, error: statsError } = await supabase
      .from('bookings')
      .select('status', { count: 'exact' })
      .gte('start_date', toDateStr(getMonthStart(month)))
      .lte('start_date', toDateStr(getMonthEnd(month)));
    setStatsLoading(false);
    if (statsError || !data) return;
    const rows = data as Array<{ status: string }>;
    setStats({
      total:     rows.length,
      confirmed: rows.filter(r => r.status === 'confirmed').length,
      pending:   rows.filter(r => r.status === 'pending').length,
      completed: rows.filter(r => r.status === 'completed').length,
    });
  }, []);

  // ── Fetch bookings ──────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async (month: Date) => {
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());

    const { data, error: fetchError } = await supabase
      .from('bookings')
      .select(`
        id, booking_number, status, car_id, customer_id,
        start_date, end_date, kabis_reported, invoice_issued, is_currently_active,
        pickup_location, dropoff_location, km_at_delivery, fuel_at_delivery,
        insurance_type, additional_services,
        cars(plate_number, model_group(name)),
        customers(first_name, last_name, is_banned)
      `)
      .gte('start_date', toDateStr(getMonthStart(month)))
      .lte('start_date', toDateStr(getMonthEnd(month)))
      .order('created_at', { ascending: false });

    setLoading(false);
    if (fetchError) { setError(fetchError.message); return; }
    setBookings(((data ?? []) as unknown as BookingRow[]).map(resolveBooking));
  }, []);

  useEffect(() => {
    fetchStats(selectedMonth);
    fetchBookings(selectedMonth);
  }, [selectedMonth, fetchStats, fetchBookings]);

  // ── Filter + sort ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = bookings;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(b =>
        b.booking_number.toLowerCase().includes(q) ||
        b.customer_name.toLowerCase().includes(q) ||
        b.plate_number.toLowerCase().includes(q)
      );
    }
    if (statusFilter) result = result.filter(b => b.status === statusFilter);
    return result;
  }, [bookings, search, statusFilter]);

  const sorted = useMemo(() => {
    if (!sort.col) return filtered;
    const col = sort.col;
    return [...filtered].sort((a, b) => {
      const av = a[col] as string;
      const bv = b[col] as string;
      return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sort]);

  const handleSort = (col: Exclude<SortCol, null>) => {
    setSort(prev => {
      if (prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return { col: null, dir: 'asc' };
    });
  };

  const sortIcon = (col: Exclude<SortCol, null>) =>
    sort.col !== col
      ? <span style={{ color: '#d1d5db', fontSize: 11 }}>↕</span>
      : <span style={{ color: '#3A74C2', fontSize: 11 }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>;

  // ── Selection ───────────────────────────────────────────────────────────────
  const allSelected  = sorted.length > 0 && sorted.every(b => selectedIds.has(b.id));
  const someSelected = sorted.some(b => selectedIds.has(b.id)) && !allSelected;

  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(sorted.map(b => b.id)));

  const toggleSelectRow = (id: number) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // ── Toggle kabis / invoice ──────────────────────────────────────────────────
  const handleToggle = useCallback(async (
    bookingId: number,
    field: 'kabis_reported' | 'invoice_issued',
    currentValue: boolean,
  ) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, [field]: !currentValue } : b));
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ [field]: !currentValue })
      .eq('id', bookingId);
    if (updateError) {
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, [field]: currentValue } : b));
      showToast('Update failed', 'error');
    }
  }, [showToast]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from('bookings').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (deleteError) {
      showToast('Failed to delete booking', 'error');
    } else {
      showToast('Booking deleted', 'success');
      fetchStats(selectedMonth);
      setBookings(prev => prev.filter(b => b.id !== deleteTarget.id));
      setDeleteTarget(null);
    }
  };

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    const headers = ['Booking #', 'Status', 'Car', 'Plate', 'Customer', 'Start Date', 'End Date', 'Kabis', 'Invoice'];
    const rows = sorted.map(b => [
      b.booking_number, b.status, b.car_model, b.plate_number, b.customer_name,
      b.start_date, b.end_date,
      b.kabis_reported ? 'Yes' : 'No',
      b.invoice_issued ? 'Yes' : 'No',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${formatMonthLabel(selectedMonth).replace(' ', '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Edit form initial data ──────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '44px 40px' }}>
      <div>

        {/* ── Page header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap', marginBottom: 36,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#3A74C2', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                Operations
              </span>
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-0.8px', color: '#0f1117', lineHeight: 1.1, marginBottom: 6 }}>
              Bookings
            </h1>
            <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>Monthly bookings control center</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Secondary — outline, so the blue CTA beside it stays dominant. */}
            <button
              className="bk-hdr-btn"
              onClick={() => setModal('replacement')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 16px',
                background: '#fff', color: 'var(--foreground)',
                border: '1px solid #EBEBEB',
                borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                transition: 'all 150ms ease',
              }}
              onMouseEnter={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.borderColor = '#4ba6ea'; b.style.color = '#3A74C2';
              }}
              onMouseLeave={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.borderColor = '#EBEBEB'; b.style.color = 'var(--foreground)';
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M4 8h13l-3-3M20 16H7l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Replacement Car
            </button>

            <Button
              className="bk-hdr-btn"
              onClick={() => setModal('add')}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px', fontSize: 14, fontFamily: 'inherit', flexShrink: 0 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
              Add New Booking
            </Button>
          </div>
        </div>

        {/* ── Month navigation ── */}
        <MonthNav
          label={formatMonthLabel(selectedMonth)}
          onPrev={() => setSelectedMonth(m => addMonths(m, -1))}
          onNext={() => setSelectedMonth(m => addMonths(m, 1))}
          style={{ marginBottom: 28 }}
        />

        {/* ── Stat cards ── */}
        <div className="bk-stats">
          <StatCard label="Total Bookings" value={stats.total}     bg="#4ba6ea" loading={statsLoading} />
          <StatCard label="Confirmed"      value={stats.confirmed} bg="#22c55e" loading={statsLoading} />
          <StatCard label="Pending"        value={stats.pending}   bg="#f97316" loading={statsLoading} />
          <StatCard label="Completed"      value={stats.completed} bg="#6b7280" loading={statsLoading} />
        </div>

        {/* ── Search + filter bar ── */}
        <div style={{
          background: 'var(--surface)', borderRadius: 14,
          border: '1px solid var(--border-subtle)', padding: '12px 14px',
          marginBottom: 16,
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{ flex: '1 1 220px', position: 'relative', minWidth: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search booking number, customer, plate…"
              style={{
                width: '100%', height: 40, paddingLeft: 34, paddingRight: 12,
                fontSize: 13, color: '#0f1117',
                background: '#f9fafb', border: '1.5px solid #f0f0f0',
                borderRadius: 9, outline: 'none', fontFamily: 'inherit',
                transition: 'all 150ms ease',
              }}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; (e.target as HTMLInputElement).style.background = '#fff'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#f0f0f0'; (e.target as HTMLInputElement).style.background = '#f9fafb'; }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as BookingStatus | '')}
            style={{ height: 40, padding: '0 12px', fontSize: 13, color: '#374151', background: '#f9fafb', border: '1.5px solid #f0f0f0', borderRadius: 9, outline: 'none', fontFamily: 'inherit', cursor: 'pointer', minWidth: 136 }}
            onFocus={e => { (e.target as HTMLSelectElement).style.borderColor = '#4ba6ea'; }}
            onBlur={e => { (e.target as HTMLSelectElement).style.borderColor = '#f0f0f0'; }}
          >
            <option value="">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>

          <button
            onClick={handleExport}
            style={{ height: 40, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#374151', background: '#f9fafb', border: '1.5px solid #f0f0f0', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease', flexShrink: 0 }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#3A74C2'; }}
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

        {/* ── Error ── */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid rgba(239,68,68,0.2)', borderLeft: '4px solid #ef4444', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <span style={{ fontSize: 14, color: '#0f1117' }}>Failed to load bookings: <span style={{ color: '#6b7280' }}>{error}</span></span>
          </div>
        )}

        {/* ── Table ── */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr>
                  <Th style={{ width: 48, paddingLeft: 16, paddingRight: 8 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#4ba6ea' }}
                    />
                  </Th>
                  <Th onClick={() => handleSort('booking_number')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      Booking # {sortIcon('booking_number')}
                    </span>
                  </Th>
                  <Th style={{ textAlign: 'center' }}>Active</Th>
                  <Th style={{ minWidth: 120 }}>Status</Th>
                  <Th>Car</Th>
                  <Th>Plate</Th>
                  <Th style={{ minWidth: 150 }}>Customer</Th>
                  <Th onClick={() => handleSort('start_date')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      Start {sortIcon('start_date')}
                    </span>
                  </Th>
                  <Th onClick={() => handleSort('end_date')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      End {sortIcon('end_date')}
                    </span>
                  </Th>
                  <Th style={{ textAlign: 'center' }}>Kabis</Th>
                  <Th style={{ textAlign: 'center' }}>Invoice</Th>
                  <Th style={{ textAlign: 'right', paddingRight: 16 }}>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)}

                {!loading && sorted.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ padding: '60px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                      {search || statusFilter ? 'No bookings match your filters.' : 'No bookings for this month.'}
                    </td>
                  </tr>
                )}

                {!loading && sorted.map((booking, idx) => (
                  <BookingTableRow
                    key={booking.id}
                    booking={booking}
                    isSelected={selectedIds.has(booking.id)}
                    onSelect={() => toggleSelectRow(booking.id)}
                    onToggle={handleToggle}
                    onEdit={() => setModal({ mode: 'edit', booking })}
                    onDelete={() => setDeleteTarget(booking)}
                    onPrint={() => printBookingContract(booking)}
                    onExtend={() => setExtendTarget(booking)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {!loading && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#9ca3af' }}>
                Showing{' '}
                <strong style={{ color: '#374151' }}>{sorted.length}</strong>
                {' '}of{' '}
                <strong style={{ color: '#374151' }}>{bookings.length}</strong>
                {' '}booking{bookings.length !== 1 ? 's' : ''}
              </span>
              {selectedIds.size > 0 && (
                <span style={{ fontSize: 13, color: '#3A74C2', fontWeight: 600 }}>
                  {selectedIds.size} selected
                </span>
              )}
            </div>
          )}
        </div>

        <ReplacementSheetsSection refreshKey={sheetsRefresh} />
      </div>

      {/* ── Modals ── */}
      {modal === 'add' && (
        <BookingFormSheet
          mode="add"
          existingCustomerId={bookingFor}
          showToast={showToast}
          onClose={() => { setModal(null); setBookingFor(undefined); }}
          onSaved={() => {
            showToast('Booking added successfully', 'success');
            fetchStats(selectedMonth);
            fetchBookings(selectedMonth);
          }}
        />
      )}
      {modal === 'replacement' && (
        <ReplacementSheet
          showToast={showToast}
          onClose={() => setModal(null)}
          onSaved={() => {
            fetchStats(selectedMonth);
            fetchBookings(selectedMonth);
            setSheetsRefresh(k => k + 1);
          }}
        />
      )}
      {typeof modal === 'object' && modal !== null && (
        <BookingFormSheet
          mode="edit"
          booking={modal.booking}
          showToast={showToast}
          onClose={() => setModal(null)}
          onSaved={() => {
            showToast('Booking updated', 'success');
            fetchStats(selectedMonth);
            fetchBookings(selectedMonth);
          }}
        />
      )}
      {extendTarget && (
        <ExtendSheet
          booking={extendTarget}
          showToast={showToast}
          onClose={() => setExtendTarget(null)}
          onSaved={() => {
            fetchStats(selectedMonth);
            fetchBookings(selectedMonth);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          booking={deleteTarget}
          deleting={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {toast && <Toast {...toast} />}

      <style>{`
        .bk-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
        @media (min-width: 768px) { .bk-stats { grid-template-columns: repeat(4, 1fr); gap: 16px; } }
        .bk-hdr-btn { height: 44px; }
        @media (min-width: 768px) { .bk-hdr-btn { height: 40px; } }
        .bk-row:hover td { background: #f9fafb !important; }
        @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes slideUpIn { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>
  );
};

export default BookingsPage;
