import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import type { Booking, BookingStatus } from '../types';
import { printBookingContract } from '../lib/printContract';
import { printReplacementSheet, type ReplacementSheet } from '../lib/printReplacementSheet';
import { useCurrency } from '../lib/CurrencyContext';
import { LANGUAGE_OPTIONS, normalizeLanguage, type CustomerLanguage } from './CustomersPage';

// ─── Raw Supabase join shapes ─────────────────────────────────────────────────

interface CarJoin {
  plate_number: string;
  model_group: { name: string } | { name: string }[] | null;
}

interface CustomerJoin {
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

interface CarOption {
  id: number;
  plate_number: string;
  model: string;
}

interface CustomerOption {
  id: number;
  full_name: string; // derived: first_name + ' ' + last_name
}

// ─── Replacement-car shapes ───────────────────────────────────────────────────

/**
 * A car in either dropdown. The original-car picker lists every car (a withdrawn
 * car may well be inactive); the replacement picker lists only active ones.
 */
interface CarPickOption {
  id:           number;
  plate_number: string;
  model_name:   string;
  is_active:    boolean;
  status:       string;   // 'working' | 'parking' | 'maintenance' | 'replacement' | 'selling' | 'pending'
}

/** Raw booking row for the chosen original car — any status, any date. */
interface CarBookingJoin {
  id:             number;
  booking_number: string;
  start_date:     string;
  end_date:       string;
  customer_id:    string | null;   // uuid
  customers:      CustomerJoin | CustomerJoin[] | null;
}

/** A booking belonging to the chosen original car, flattened for the dropdown. */
interface CarBookingOption {
  id:             number;
  booking_number: string;
  start_date:     string;
  end_date:       string;
  customer_id:    string | null;   // uuid
  customer_name:  string;
}

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
function toPrintable(row: ReplacementSheetRow): ReplacementSheet {
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
    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', opacity: 0.80 }}>
      {label}
    </div>
    <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1 }}>
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
      fontSize: 11, fontWeight: 700,
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

// Month arrow nav button
const MonthArrow: React.FC<{ direction: 'left' | 'right'; onClick: () => void }> = ({ direction, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 36, height: 36, borderRadius: 10,
        border: `1.5px solid ${hovered ? '#4ba6ea' : '#e5e7eb'}`,
        background: hovered ? 'rgba(75,166,234,0.06)' : '#fff',
        color: hovered ? '#4ba6ea' : '#6b7280',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 140ms ease', flexShrink: 0,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        {direction === 'left'
          ? <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          : <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        }
      </svg>
    </button>
  );
};

// Table header cell
const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ children, style, ...rest }) => (
  <th
    style={{
      padding: '9px 12px', fontSize: 11, fontWeight: 700,
      color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
      textAlign: 'left', background: '#fff',
      borderBottom: '1.5px solid #f0f0f0',
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
  isEven: boolean;
  onSelect: () => void;
  onToggle: (id: number, field: 'kabis_reported' | 'invoice_issued', current: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onPrint: () => void;
}

const BookingTableRow: React.FC<RowProps> = ({
  booking, isSelected, isEven, onSelect, onToggle, onEdit, onDelete, onPrint,
}) => (
  <tr
    className="bk-row"
    style={{ background: isSelected ? 'rgba(75,166,234,0.05)' : isEven ? '#fafafa' : '#fff' }}
  >
    <td style={{ padding: '9px 8px 9px 16px' }}>
      <input type="checkbox" checked={isSelected} onChange={onSelect}
        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#4ba6ea' }} />
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1117', letterSpacing: '0.1px' }}>
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
      <span style={{
        display: 'inline-block', background: '#f3f4f6', borderRadius: 6,
        padding: '2px 8px', fontSize: 12, fontWeight: 700, color: '#0f1117', letterSpacing: '0.2px',
      }}>
        {booking.plate_number}
      </span>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <span style={{ fontSize: 13, color: '#374151' }}>{booking.customer_name}</span>
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

// ─── Country / dial-code data ─────────────────────────────────────────────────

interface Country { code: string; name: string; dial: string; flag: string; }

const COUNTRIES: Country[] = [
  { code: 'AF', name: 'Afghanistan',                    dial: '+93',   flag: '🇦🇫' },
  { code: 'AL', name: 'Albania',                        dial: '+355',  flag: '🇦🇱' },
  { code: 'DZ', name: 'Algeria',                        dial: '+213',  flag: '🇩🇿' },
  { code: 'AD', name: 'Andorra',                        dial: '+376',  flag: '🇦🇩' },
  { code: 'AO', name: 'Angola',                         dial: '+244',  flag: '🇦🇴' },
  { code: 'AG', name: 'Antigua and Barbuda',            dial: '+1268', flag: '🇦🇬' },
  { code: 'AR', name: 'Argentina',                      dial: '+54',   flag: '🇦🇷' },
  { code: 'AM', name: 'Armenia',                        dial: '+374',  flag: '🇦🇲' },
  { code: 'AU', name: 'Australia',                      dial: '+61',   flag: '🇦🇺' },
  { code: 'AT', name: 'Austria',                        dial: '+43',   flag: '🇦🇹' },
  { code: 'AZ', name: 'Azerbaijan',                     dial: '+994',  flag: '🇦🇿' },
  { code: 'BS', name: 'Bahamas',                        dial: '+1242', flag: '🇧🇸' },
  { code: 'BH', name: 'Bahrain',                        dial: '+973',  flag: '🇧🇭' },
  { code: 'BD', name: 'Bangladesh',                     dial: '+880',  flag: '🇧🇩' },
  { code: 'BB', name: 'Barbados',                       dial: '+1246', flag: '🇧🇧' },
  { code: 'BY', name: 'Belarus',                        dial: '+375',  flag: '🇧🇾' },
  { code: 'BE', name: 'Belgium',                        dial: '+32',   flag: '🇧🇪' },
  { code: 'BZ', name: 'Belize',                         dial: '+501',  flag: '🇧🇿' },
  { code: 'BJ', name: 'Benin',                          dial: '+229',  flag: '🇧🇯' },
  { code: 'BT', name: 'Bhutan',                         dial: '+975',  flag: '🇧🇹' },
  { code: 'BO', name: 'Bolivia',                        dial: '+591',  flag: '🇧🇴' },
  { code: 'BA', name: 'Bosnia and Herzegovina',         dial: '+387',  flag: '🇧🇦' },
  { code: 'BW', name: 'Botswana',                       dial: '+267',  flag: '🇧🇼' },
  { code: 'BR', name: 'Brazil',                         dial: '+55',   flag: '🇧🇷' },
  { code: 'BN', name: 'Brunei',                         dial: '+673',  flag: '🇧🇳' },
  { code: 'BG', name: 'Bulgaria',                       dial: '+359',  flag: '🇧🇬' },
  { code: 'BF', name: 'Burkina Faso',                   dial: '+226',  flag: '🇧🇫' },
  { code: 'BI', name: 'Burundi',                        dial: '+257',  flag: '🇧🇮' },
  { code: 'CV', name: 'Cabo Verde',                     dial: '+238',  flag: '🇨🇻' },
  { code: 'KH', name: 'Cambodia',                       dial: '+855',  flag: '🇰🇭' },
  { code: 'CM', name: 'Cameroon',                       dial: '+237',  flag: '🇨🇲' },
  { code: 'CA', name: 'Canada',                         dial: '+1',    flag: '🇨🇦' },
  { code: 'CF', name: 'Central African Republic',       dial: '+236',  flag: '🇨🇫' },
  { code: 'TD', name: 'Chad',                           dial: '+235',  flag: '🇹🇩' },
  { code: 'CL', name: 'Chile',                          dial: '+56',   flag: '🇨🇱' },
  { code: 'CN', name: 'China',                          dial: '+86',   flag: '🇨🇳' },
  { code: 'CO', name: 'Colombia',                       dial: '+57',   flag: '🇨🇴' },
  { code: 'KM', name: 'Comoros',                        dial: '+269',  flag: '🇰🇲' },
  { code: 'CG', name: 'Congo',                          dial: '+242',  flag: '🇨🇬' },
  { code: 'CD', name: 'Congo (DRC)',                    dial: '+243',  flag: '🇨🇩' },
  { code: 'CR', name: 'Costa Rica',                     dial: '+506',  flag: '🇨🇷' },
  { code: 'HR', name: 'Croatia',                        dial: '+385',  flag: '🇭🇷' },
  { code: 'CU', name: 'Cuba',                           dial: '+53',   flag: '🇨🇺' },
  { code: 'CY', name: 'Cyprus',                         dial: '+357',  flag: '🇨🇾' },
  { code: 'CZ', name: 'Czech Republic',                 dial: '+420',  flag: '🇨🇿' },
  { code: 'DK', name: 'Denmark',                        dial: '+45',   flag: '🇩🇰' },
  { code: 'DJ', name: 'Djibouti',                       dial: '+253',  flag: '🇩🇯' },
  { code: 'DM', name: 'Dominica',                       dial: '+1767', flag: '🇩🇲' },
  { code: 'DO', name: 'Dominican Republic',             dial: '+1809', flag: '🇩🇴' },
  { code: 'EC', name: 'Ecuador',                        dial: '+593',  flag: '🇪🇨' },
  { code: 'EG', name: 'Egypt',                          dial: '+20',   flag: '🇪🇬' },
  { code: 'SV', name: 'El Salvador',                    dial: '+503',  flag: '🇸🇻' },
  { code: 'GQ', name: 'Equatorial Guinea',              dial: '+240',  flag: '🇬🇶' },
  { code: 'ER', name: 'Eritrea',                        dial: '+291',  flag: '🇪🇷' },
  { code: 'EE', name: 'Estonia',                        dial: '+372',  flag: '🇪🇪' },
  { code: 'SZ', name: 'Eswatini',                       dial: '+268',  flag: '🇸🇿' },
  { code: 'ET', name: 'Ethiopia',                       dial: '+251',  flag: '🇪🇹' },
  { code: 'FJ', name: 'Fiji',                           dial: '+679',  flag: '🇫🇯' },
  { code: 'FI', name: 'Finland',                        dial: '+358',  flag: '🇫🇮' },
  { code: 'FR', name: 'France',                         dial: '+33',   flag: '🇫🇷' },
  { code: 'GA', name: 'Gabon',                          dial: '+241',  flag: '🇬🇦' },
  { code: 'GM', name: 'Gambia',                         dial: '+220',  flag: '🇬🇲' },
  { code: 'GE', name: 'Georgia',                        dial: '+995',  flag: '🇬🇪' },
  { code: 'DE', name: 'Germany',                        dial: '+49',   flag: '🇩🇪' },
  { code: 'GH', name: 'Ghana',                          dial: '+233',  flag: '🇬🇭' },
  { code: 'GR', name: 'Greece',                         dial: '+30',   flag: '🇬🇷' },
  { code: 'GD', name: 'Grenada',                        dial: '+1473', flag: '🇬🇩' },
  { code: 'GT', name: 'Guatemala',                      dial: '+502',  flag: '🇬🇹' },
  { code: 'GN', name: 'Guinea',                         dial: '+224',  flag: '🇬🇳' },
  { code: 'GW', name: 'Guinea-Bissau',                  dial: '+245',  flag: '🇬🇼' },
  { code: 'GY', name: 'Guyana',                         dial: '+592',  flag: '🇬🇾' },
  { code: 'HT', name: 'Haiti',                          dial: '+509',  flag: '🇭🇹' },
  { code: 'HN', name: 'Honduras',                       dial: '+504',  flag: '🇭🇳' },
  { code: 'HU', name: 'Hungary',                        dial: '+36',   flag: '🇭🇺' },
  { code: 'IS', name: 'Iceland',                        dial: '+354',  flag: '🇮🇸' },
  { code: 'IN', name: 'India',                          dial: '+91',   flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia',                      dial: '+62',   flag: '🇮🇩' },
  { code: 'IR', name: 'Iran',                           dial: '+98',   flag: '🇮🇷' },
  { code: 'IQ', name: 'Iraq',                           dial: '+964',  flag: '🇮🇶' },
  { code: 'IE', name: 'Ireland',                        dial: '+353',  flag: '🇮🇪' },
  { code: 'IL', name: 'Israel',                         dial: '+972',  flag: '🇮🇱' },
  { code: 'IT', name: 'Italy',                          dial: '+39',   flag: '🇮🇹' },
  { code: 'JM', name: 'Jamaica',                        dial: '+1876', flag: '🇯🇲' },
  { code: 'JP', name: 'Japan',                          dial: '+81',   flag: '🇯🇵' },
  { code: 'JO', name: 'Jordan',                         dial: '+962',  flag: '🇯🇴' },
  { code: 'KZ', name: 'Kazakhstan',                     dial: '+7',    flag: '🇰🇿' },
  { code: 'KE', name: 'Kenya',                          dial: '+254',  flag: '🇰🇪' },
  { code: 'KI', name: 'Kiribati',                       dial: '+686',  flag: '🇰🇮' },
  { code: 'KP', name: 'North Korea',                    dial: '+850',  flag: '🇰🇵' },
  { code: 'KR', name: 'South Korea',                    dial: '+82',   flag: '🇰🇷' },
  { code: 'KW', name: 'Kuwait',                         dial: '+965',  flag: '🇰🇼' },
  { code: 'KG', name: 'Kyrgyzstan',                     dial: '+996',  flag: '🇰🇬' },
  { code: 'LA', name: 'Laos',                           dial: '+856',  flag: '🇱🇦' },
  { code: 'LV', name: 'Latvia',                         dial: '+371',  flag: '🇱🇻' },
  { code: 'LB', name: 'Lebanon',                        dial: '+961',  flag: '🇱🇧' },
  { code: 'LS', name: 'Lesotho',                        dial: '+266',  flag: '🇱🇸' },
  { code: 'LR', name: 'Liberia',                        dial: '+231',  flag: '🇱🇷' },
  { code: 'LY', name: 'Libya',                          dial: '+218',  flag: '🇱🇾' },
  { code: 'LI', name: 'Liechtenstein',                  dial: '+423',  flag: '🇱🇮' },
  { code: 'LT', name: 'Lithuania',                      dial: '+370',  flag: '🇱🇹' },
  { code: 'LU', name: 'Luxembourg',                     dial: '+352',  flag: '🇱🇺' },
  { code: 'MG', name: 'Madagascar',                     dial: '+261',  flag: '🇲🇬' },
  { code: 'MW', name: 'Malawi',                         dial: '+265',  flag: '🇲🇼' },
  { code: 'MY', name: 'Malaysia',                       dial: '+60',   flag: '🇲🇾' },
  { code: 'MV', name: 'Maldives',                       dial: '+960',  flag: '🇲🇻' },
  { code: 'ML', name: 'Mali',                           dial: '+223',  flag: '🇲🇱' },
  { code: 'MT', name: 'Malta',                          dial: '+356',  flag: '🇲🇹' },
  { code: 'MH', name: 'Marshall Islands',               dial: '+692',  flag: '🇲🇭' },
  { code: 'MR', name: 'Mauritania',                     dial: '+222',  flag: '🇲🇷' },
  { code: 'MU', name: 'Mauritius',                      dial: '+230',  flag: '🇲🇺' },
  { code: 'MX', name: 'Mexico',                         dial: '+52',   flag: '🇲🇽' },
  { code: 'FM', name: 'Micronesia',                     dial: '+691',  flag: '🇫🇲' },
  { code: 'MD', name: 'Moldova',                        dial: '+373',  flag: '🇲🇩' },
  { code: 'MC', name: 'Monaco',                         dial: '+377',  flag: '🇲🇨' },
  { code: 'MN', name: 'Mongolia',                       dial: '+976',  flag: '🇲🇳' },
  { code: 'ME', name: 'Montenegro',                     dial: '+382',  flag: '🇲🇪' },
  { code: 'MA', name: 'Morocco',                        dial: '+212',  flag: '🇲🇦' },
  { code: 'MZ', name: 'Mozambique',                     dial: '+258',  flag: '🇲🇿' },
  { code: 'MM', name: 'Myanmar',                        dial: '+95',   flag: '🇲🇲' },
  { code: 'NA', name: 'Namibia',                        dial: '+264',  flag: '🇳🇦' },
  { code: 'NR', name: 'Nauru',                          dial: '+674',  flag: '🇳🇷' },
  { code: 'NP', name: 'Nepal',                          dial: '+977',  flag: '🇳🇵' },
  { code: 'NL', name: 'Netherlands',                    dial: '+31',   flag: '🇳🇱' },
  { code: 'NZ', name: 'New Zealand',                    dial: '+64',   flag: '🇳🇿' },
  { code: 'NI', name: 'Nicaragua',                      dial: '+505',  flag: '🇳🇮' },
  { code: 'NE', name: 'Niger',                          dial: '+227',  flag: '🇳🇪' },
  { code: 'NG', name: 'Nigeria',                        dial: '+234',  flag: '🇳🇬' },
  { code: 'NO', name: 'Norway',                         dial: '+47',   flag: '🇳🇴' },
  { code: 'OM', name: 'Oman',                           dial: '+968',  flag: '🇴🇲' },
  { code: 'PK', name: 'Pakistan',                       dial: '+92',   flag: '🇵🇰' },
  { code: 'PW', name: 'Palau',                          dial: '+680',  flag: '🇵🇼' },
  { code: 'PA', name: 'Panama',                         dial: '+507',  flag: '🇵🇦' },
  { code: 'PG', name: 'Papua New Guinea',               dial: '+675',  flag: '🇵🇬' },
  { code: 'PY', name: 'Paraguay',                       dial: '+595',  flag: '🇵🇾' },
  { code: 'PE', name: 'Peru',                           dial: '+51',   flag: '🇵🇪' },
  { code: 'PH', name: 'Philippines',                    dial: '+63',   flag: '🇵🇭' },
  { code: 'PL', name: 'Poland',                         dial: '+48',   flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal',                       dial: '+351',  flag: '🇵🇹' },
  { code: 'QA', name: 'Qatar',                          dial: '+974',  flag: '🇶🇦' },
  { code: 'RO', name: 'Romania',                        dial: '+40',   flag: '🇷🇴' },
  { code: 'RU', name: 'Russia',                         dial: '+7',    flag: '🇷🇺' },
  { code: 'RW', name: 'Rwanda',                         dial: '+250',  flag: '🇷🇼' },
  { code: 'KN', name: 'Saint Kitts and Nevis',          dial: '+1869', flag: '🇰🇳' },
  { code: 'LC', name: 'Saint Lucia',                    dial: '+1758', flag: '🇱🇨' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', dial: '+1784', flag: '🇻🇨' },
  { code: 'WS', name: 'Samoa',                          dial: '+685',  flag: '🇼🇸' },
  { code: 'SM', name: 'San Marino',                     dial: '+378',  flag: '🇸🇲' },
  { code: 'ST', name: 'Sao Tome and Principe',          dial: '+239',  flag: '🇸🇹' },
  { code: 'SA', name: 'Saudi Arabia',                   dial: '+966',  flag: '🇸🇦' },
  { code: 'SN', name: 'Senegal',                        dial: '+221',  flag: '🇸🇳' },
  { code: 'RS', name: 'Serbia',                         dial: '+381',  flag: '🇷🇸' },
  { code: 'SC', name: 'Seychelles',                     dial: '+248',  flag: '🇸🇨' },
  { code: 'SL', name: 'Sierra Leone',                   dial: '+232',  flag: '🇸🇱' },
  { code: 'SG', name: 'Singapore',                      dial: '+65',   flag: '🇸🇬' },
  { code: 'SK', name: 'Slovakia',                       dial: '+421',  flag: '🇸🇰' },
  { code: 'SI', name: 'Slovenia',                       dial: '+386',  flag: '🇸🇮' },
  { code: 'SB', name: 'Solomon Islands',                dial: '+677',  flag: '🇸🇧' },
  { code: 'SO', name: 'Somalia',                        dial: '+252',  flag: '🇸🇴' },
  { code: 'ZA', name: 'South Africa',                   dial: '+27',   flag: '🇿🇦' },
  { code: 'SS', name: 'South Sudan',                    dial: '+211',  flag: '🇸🇸' },
  { code: 'ES', name: 'Spain',                          dial: '+34',   flag: '🇪🇸' },
  { code: 'LK', name: 'Sri Lanka',                      dial: '+94',   flag: '🇱🇰' },
  { code: 'SD', name: 'Sudan',                          dial: '+249',  flag: '🇸🇩' },
  { code: 'SR', name: 'Suriname',                       dial: '+597',  flag: '🇸🇷' },
  { code: 'SE', name: 'Sweden',                         dial: '+46',   flag: '🇸🇪' },
  { code: 'CH', name: 'Switzerland',                    dial: '+41',   flag: '🇨🇭' },
  { code: 'SY', name: 'Syria',                          dial: '+963',  flag: '🇸🇾' },
  { code: 'TW', name: 'Taiwan',                         dial: '+886',  flag: '🇹🇼' },
  { code: 'TJ', name: 'Tajikistan',                     dial: '+992',  flag: '🇹🇯' },
  { code: 'TZ', name: 'Tanzania',                       dial: '+255',  flag: '🇹🇿' },
  { code: 'TH', name: 'Thailand',                       dial: '+66',   flag: '🇹🇭' },
  { code: 'TL', name: 'Timor-Leste',                    dial: '+670',  flag: '🇹🇱' },
  { code: 'TG', name: 'Togo',                           dial: '+228',  flag: '🇹🇬' },
  { code: 'TO', name: 'Tonga',                          dial: '+676',  flag: '🇹🇴' },
  { code: 'TT', name: 'Trinidad and Tobago',            dial: '+1868', flag: '🇹🇹' },
  { code: 'TN', name: 'Tunisia',                        dial: '+216',  flag: '🇹🇳' },
  { code: 'TR', name: 'Turkey',                         dial: '+90',   flag: '🇹🇷' },
  { code: 'TM', name: 'Turkmenistan',                   dial: '+993',  flag: '🇹🇲' },
  { code: 'TV', name: 'Tuvalu',                         dial: '+688',  flag: '🇹🇻' },
  { code: 'UG', name: 'Uganda',                         dial: '+256',  flag: '🇺🇬' },
  { code: 'UA', name: 'Ukraine',                        dial: '+380',  flag: '🇺🇦' },
  { code: 'AE', name: 'United Arab Emirates',           dial: '+971',  flag: '🇦🇪' },
  { code: 'GB', name: 'United Kingdom',                 dial: '+44',   flag: '🇬🇧' },
  { code: 'US', name: 'United States',                  dial: '+1',    flag: '🇺🇸' },
  { code: 'UY', name: 'Uruguay',                        dial: '+598',  flag: '🇺🇾' },
  { code: 'UZ', name: 'Uzbekistan',                     dial: '+998',  flag: '🇺🇿' },
  { code: 'VU', name: 'Vanuatu',                        dial: '+678',  flag: '🇻🇺' },
  { code: 'VE', name: 'Venezuela',                      dial: '+58',   flag: '🇻🇪' },
  { code: 'VN', name: 'Vietnam',                        dial: '+84',   flag: '🇻🇳' },
  { code: 'YE', name: 'Yemen',                          dial: '+967',  flag: '🇾🇪' },
  { code: 'ZM', name: 'Zambia',                         dial: '+260',  flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe',                       dial: '+263',  flag: '🇿🇼' },
];

// ─── Phone parsing helper ─────────────────────────────────────────────────────

function parseStoredPhone(stored: string | null): { dial: string; local: string } {
  if (!stored) return { dial: '+90', local: '' };
  const s = stored.startsWith('+') ? stored : `+${stored}`;
  // Match longest dial code first to avoid e.g. +1 matching +1868 (Trinidad)
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (s.startsWith(c.dial)) {
      return { dial: c.dial, local: s.slice(c.dial.length) };
    }
  }
  return { dial: '+90', local: stored };
}

// ─── Searchable dial-code picker ──────────────────────────────────────────────

const DialCodePicker: React.FC<{
  value: string;
  onChange: (dial: string) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find(c => c.dial === value && c.code === 'TR') ??
                   COUNTRIES.find(c => c.dial === value) ??
                   COUNTRIES.find(c => c.code === 'TR')!;

  const filtered = search.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dial.includes(search.replace(/^\+/, ''))
      )
    : COUNTRIES;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={{
          height: 40, padding: '0 10px',
          display: 'flex', alignItems: 'center', gap: 5,
          background: '#fff', border: '1.5px solid #e5e7eb',
          borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 13, color: '#0f1117', whiteSpace: 'nowrap',
          transition: 'border-color 150ms ease',
        }}
      >
        <span style={{ fontSize: 17, lineHeight: 1 }}>{selected.flag}</span>
        <span style={{ fontWeight: 500 }}>{selected.dial}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, left: 0, zIndex: 300,
          background: '#fff', border: '1.5px solid #e5e7eb',
          borderRadius: 10, width: 272,
          boxShadow: '0 8px 32px rgba(0,0,0,0.13)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px 6px' }}>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search country or code…"
              style={{
                width: '100%', height: 34, padding: '0 10px',
                fontSize: 13, border: '1.5px solid #e5e7eb',
                borderRadius: 7, outline: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 210, overflowY: 'auto' }}>
            {filtered.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.dial); setOpen(false); setSearch(''); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                  padding: '7px 12px', border: 'none', background: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                  textAlign: 'left', color: '#374151',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>{c.flag}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ color: '#9ca3af', fontSize: 12, flexShrink: 0 }}>{c.dial}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                No results
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Booking form modal ───────────────────────────────────────────────────────

const LOCATION_PRESETS = [
  'Şişli Branch',
  'Kayaşehir Branch',
  'Istanbul Airport (IST)',
  'Sabiha Gökçen Airport (SAW)',
  'Other',
] as const;

function resolveLocationSelect(saved: string | null): { select: string; custom: string } {
  if (!saved) return { select: '', custom: '' };
  if ((LOCATION_PRESETS as readonly string[]).includes(saved) && saved !== 'Other')
    return { select: saved, custom: '' };
  return { select: 'Other', custom: saved };
}

const INSURANCE_PRESETS = ['Korumasız', 'Kısmi Koruma', 'Orta Koruma', 'Tam Koruma'] as const;
const ADDITIONAL_SERVICE_PRESETS = ['Çocuk Koltuğu', 'Yedek Sürücü', 'Ek Kilometre'] as const;

function resolveInsuranceSelect(saved: string | null): { select: string; custom: string } {
  if (!saved) return { select: '', custom: '' };
  if ((INSURANCE_PRESETS as readonly string[]).includes(saved as typeof INSURANCE_PRESETS[number]))
    return { select: saved, custom: '' };
  return { select: 'Diğer', custom: saved };
}

function parseAdditionalServices(saved: string | null): string[] {
  if (!saved) return [];
  const parts = saved.split(',').map(s => s.trim()).filter(Boolean);
  const selected: string[] = [];
  let hasCustom = false;
  for (const part of parts) {
    if ((ADDITIONAL_SERVICE_PRESETS as readonly string[]).includes(part as typeof ADDITIONAL_SERVICE_PRESETS[number])) {
      selected.push(part);
    } else {
      hasCustom = true;
    }
  }
  if (hasCustom) selected.push('Diğer');
  return selected;
}

function parseAdditionalServicesCustom(saved: string | null): string {
  if (!saved) return '';
  const parts = saved.split(',').map(s => s.trim()).filter(Boolean);
  return parts.filter(p => !(ADDITIONAL_SERVICE_PRESETS as readonly string[]).includes(p as typeof ADDITIONAL_SERVICE_PRESETS[number])).join(', ');
}

type BookingFormData = {
  // Booking fields
  booking_number: string;
  status: BookingStatus;
  car_id: string;
  start_date: string;
  end_date: string;
  is_currently_active: boolean;
  // Vehicle condition at delivery
  pickup_location: string;
  pickup_location_select: string;
  pickup_location_custom: string;
  dropoff_location: string;
  dropoff_location_select: string;
  dropoff_location_custom: string;
  km_at_delivery: string;
  fuel_at_delivery: string;
  // Insurance & additional services
  insurance_type_select: string;
  insurance_type_custom: string;
  additional_services_selected: string[];
  additional_services_custom: string;
  // Customer fields (add mode only)
  cust_id_type: 'passport' | 'national_id';
  cust_id_number: string;
  cust_first_name: string;
  cust_last_name: string;
  cust_phone_dial: string;
  cust_phone: string;
  cust_nationality: string;
  cust_language: CustomerLanguage;
  cust_driving_license: string;
  cust_driving_license_number: string;
  cust_address: string;
  cust_birth_date: string;
  cust_license_issue_date: string;
  cust_notes: string;
  // Financial fields
  fin_currency: 'TRY' | 'USD';
  fin_rental_amount: string;
  fin_deposit_amount: string;
  fin_paid_amount: string;
};

const EMPTY_FORM: BookingFormData = {
  booking_number: '', status: 'pending', car_id: '',
  start_date: '', end_date: '', is_currently_active: false,
  pickup_location: '', pickup_location_select: '', pickup_location_custom: '',
  dropoff_location: '', dropoff_location_select: '', dropoff_location_custom: '',
  km_at_delivery: '', fuel_at_delivery: '',
  insurance_type_select: '', insurance_type_custom: '',
  additional_services_selected: [], additional_services_custom: '',
  cust_id_type: 'passport', cust_id_number: '',
  cust_first_name: '', cust_last_name: '',
  cust_phone_dial: '+90', cust_phone: '',
  cust_nationality: '', cust_language: 'ar', cust_driving_license: '',
  cust_driving_license_number: '', cust_address: '',
  cust_birth_date: '', cust_license_issue_date: '', cust_notes: '',
  fin_currency: 'TRY', fin_rental_amount: '', fin_deposit_amount: '', fin_paid_amount: '',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px',
  fontSize: 14, color: '#0f1117',
  background: '#fff', border: '1.5px solid #e5e7eb',
  borderRadius: 8, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 150ms ease',
};

const focusBlue = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  { (e.target as HTMLElement & { style: CSSStyleDeclaration }).style.borderColor = '#4ba6ea'; };
const blurGray = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  { (e.target as HTMLElement & { style: CSSStyleDeclaration }).style.borderColor = '#e5e7eb'; };

// ─── Document upload field ────────────────────────────────────────────────────

const DocUploadField: React.FC<{
  label:       string;
  existingUrl?: string | null;
  file:        File | null;
  onChange:    (f: File | null) => void;
}> = ({ label, existingUrl, file, onChange }) => {
  const [preview, setPreview] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isImage = (url: string) => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);

  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
        {label}
      </label>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,.pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0] ?? null; onChange(f); e.target.value = ''; }} />

      {/* Existing file row */}
      {existingUrl && !file && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '6px 10px', borderRadius: 8, background: '#f8faff', border: '1px solid rgba(75,166,234,0.18)' }}>
          {isImage(existingUrl) ? (
            <img src={existingUrl} alt="doc" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 6, background: '#e0edfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          )}
          <a href={existingUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 12, color: '#4ba6ea', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            View current file
          </a>
          <button type="button" onClick={() => inputRef.current?.click()} style={{ fontSize: 11, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            Replace
          </button>
        </div>
      )}

      {/* New file preview */}
      {file && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, border: '1.5px solid #4ba6ea', background: 'rgba(75,166,234,0.04)', marginBottom: 0 }}>
          {preview ? (
            <img src={preview} alt="preview" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid rgba(75,166,234,0.2)' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 6, background: 'rgba(75,166,234,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
            <div style={{ fontSize: 11, color: '#4ba6ea', marginTop: 1 }}>Ready · {(file.size / 1024).toFixed(0)} KB</div>
          </div>
          <button type="button" onClick={() => onChange(null)}
            style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexShrink: 0 }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.color = '#ef4444'; b.style.borderColor = '#fca5a5'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.color = '#9ca3af'; b.style.borderColor = '#e5e7eb'; }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}

      {/* Upload zone — only when no new file */}
      {!file && (
        <button type="button" onClick={() => inputRef.current?.click()}
          style={{ width: '100%', height: existingUrl ? 44 : 68, borderRadius: 9, border: '1.5px dashed #e5e7eb', background: '#fafafa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', color: '#9ca3af', transition: 'all 140ms ease' }}
          onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; b.style.background = 'rgba(75,166,234,0.04)'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; b.style.background = '#fafafa'; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          {!existingUrl && <span style={{ fontSize: 11, fontWeight: 500 }}>Upload file</span>}
        </button>
      )}
    </div>
  );
};

// Section heading inside the form
const SectionHeading: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    gridColumn: 'span 2', margin: '4px 0 2px',
  }}>
    <div style={{
      width: 28, height: 28, borderRadius: 8,
      background: 'rgba(75,166,234,0.10)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#4ba6ea', flexShrink: 0,
    }}>
      {icon}
    </div>
    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
      {title}
    </span>
    <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
  </div>
);

interface FormModalProps {
  mode: 'add' | 'edit';
  initial: BookingFormData;
  editId?: number;
  editCustomerId?: number;
  onClose: () => void;
  onSaved: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

const BookingFormModal: React.FC<FormModalProps> = ({
  mode, initial, editId, editCustomerId, onClose, onSaved, showToast,
}) => {
  const { rates } = useCurrency();
  const [form, setForm] = useState<BookingFormData>(initial);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    cust_id_number: string | null;
    cust_id_type: string | null;
    cust_nationality: string | null;
    cust_phone: string | null;
    cust_license_issue_date: string | null;
  }>({ cust_id_number: null, cust_id_type: null, cust_nationality: null, cust_phone: null, cust_license_issue_date: null });
  const [cars, setCars] = useState<CarOption[]>([]);
  const [bookingNumLoading, setBookingNumLoading] = useState(mode === 'add');
  const [idLookup, setIdLookup] = useState<'idle' | 'searching' | 'found' | 'not-found'>('idle');

  // True only when a pointer press *starts* on the backdrop itself, so that a
  // click/drag that begins inside the modal (or gets retargeted to the backdrop
  // by a scroll-into-view or re-render between mousedown and mouseup) never
  // dismisses the modal. Protects every field, not just the ID number input.
  const backdropPressRef   = useRef(false);

  const idNumberRef        = useRef<HTMLDivElement>(null);
  const idTypeRef          = useRef<HTMLDivElement>(null);
  const phoneRef           = useRef<HTMLDivElement>(null);
  const nationalityRef     = useRef<HTMLDivElement>(null);
  const licenseIssueDateRef = useRef<HTMLDivElement>(null);

  // Document uploads
  const [docIdPhoto,            setDocIdPhoto]            = useState<File | null>(null);
  const [docIdPhotoBack,        setDocIdPhotoBack]        = useState<File | null>(null);
  const [docDrivingLicense,     setDocDrivingLicense]     = useState<File | null>(null);
  const [docDrivingLicenseBack, setDocDrivingLicenseBack] = useState<File | null>(null);
  const [docEntryStamp,         setDocEntryStamp]         = useState<File | null>(null);
  const [existingDocUrls,       setExistingDocUrls]       = useState<{
    id_photo_url:                  string | null;
    id_photo_back_url:             string | null;
    driving_license_photo_url:     string | null;
    driving_license_back_url:      string | null;
    entry_stamp_photo_url:         string | null;
  }>({ id_photo_url: null, id_photo_back_url: null, driving_license_photo_url: null, driving_license_back_url: null, entry_stamp_photo_url: null });

  const [existingLedger, setExistingLedger] = useState<{
    rental:    { id: number; amount: number } | null;
    deposit:   { id: number; amount: number } | null;
    payment:   { id: number; amount: number } | null;
  }>({ rental: null, deposit: null, payment: null });

  // Every customer document goes through this one uploader. The key is keyed on
  // the customer id — never the name — because Supabase Storage rejects
  // non-ASCII object keys (Turkish/Arabic names) and same-name customers would
  // otherwise overwrite each other.
  const uploadDocById = async (file: File, customerId: number | string, fieldName: string): Promise<string | null> => {
    const ext  = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
    const path = `${customerId}/${fieldName}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('customers_doc').upload(path, file, { upsert: true });
    if (error) { console.error(`[Booking] upload ${fieldName} error:`, error); return null; }
    const { data } = supabase.storage.from('customers_doc').getPublicUrl(path);
    return data.publicUrl;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    (async () => {
      // Cars — sorted by model name
      const { data: carsData } = await supabase
        .from('cars').select('id, plate_number, model_group(name)').eq('is_active', true);
      if (!active) return;
      const carOpts: CarOption[] = ((carsData ?? []) as Array<{
        id: number;
        plate_number: string;
        model_group: { name: string } | { name: string }[] | null;
      }>).map(c => {
        const mg = c.model_group;
        const model = Array.isArray(mg) ? (mg[0]?.name ?? '') : (mg as { name: string } | null)?.name ?? '';
        return { id: c.id, plate_number: c.plate_number, model };
      });
      // Group by model, then plate within each model
      carOpts.sort((a, b) => a.model.localeCompare(b.model) || a.plate_number.localeCompare(b.plate_number));
      setCars(carOpts);

      // Auto-generate booking number (add mode only)
      if (mode === 'add') {
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        const prefix = `HOM-${mm}-${yy}-`;
        const { count } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .like('booking_number', `${prefix}%`);
        if (!active) return;
        const seq = String((count ?? 0) + 1).padStart(3, '0');
        setForm(f => ({ ...f, booking_number: `${prefix}${seq}` }));
        setBookingNumLoading(false);
      }
    })();
    return () => { active = false; };
  }, [mode]);

  // Fetch existing customer data in edit mode
  useEffect(() => {
    if (mode !== 'edit' || !editCustomerId) return;
    let active = true;
    supabase
      .from('customers')
      .select('*')
      .eq('id', editCustomerId)
      .single()
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        const c = data as {
          first_name: string; last_name: string; phone: string | null;
          nationality: string | null; language: string | null;
          id_type: string | null; id_number: string | null;
          driving_license_number: string | null;
          address: string | null; birth_date: string | null; license_issue_date: string | null;
          notes: string | null;
          id_photo_url: string | null; id_photo_back_url: string | null;
          driving_license_photo_url: string | null; driving_license_back_url: string | null;
          entry_stamp_photo_url: string | null;
        };
        setForm(f => ({
          ...f,
          cust_first_name:             c.first_name,
          cust_last_name:              c.last_name,
          cust_phone_dial:             parseStoredPhone(c.phone).dial,
          cust_phone:                  parseStoredPhone(c.phone).local,
          cust_nationality:            c.nationality ?? '',
          cust_language:               normalizeLanguage(c.language),
          cust_id_type:                (c.id_type === 'national_id' ? 'national_id' : 'passport') as 'passport' | 'national_id',
          cust_id_number:              c.id_number ?? '',
          cust_driving_license:        c.driving_license_number ?? '',
          cust_driving_license_number: '',
          cust_address:                c.address ?? '',
          cust_birth_date:             c.birth_date ?? '',
          cust_license_issue_date:     c.license_issue_date ?? '',
          cust_notes:                  c.notes ?? '',
        }));
        setExistingDocUrls({
          id_photo_url:                  c.id_photo_url                  ?? null,
          id_photo_back_url:             c.id_photo_back_url             ?? null,
          driving_license_photo_url:     c.driving_license_photo_url     ?? null,
          driving_license_back_url:      c.driving_license_back_url      ?? null,
          entry_stamp_photo_url:         c.entry_stamp_photo_url         ?? null,
        });
      });
    return () => { active = false; };
  }, [mode, editCustomerId]);

  const set = <K extends keyof BookingFormData>(key: K, value: BookingFormData[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  // ── Fetch existing ledger rows in edit mode ───────────────────────────────
  useEffect(() => {
    if (mode !== 'edit' || !editId) return;
    let active = true;
    supabase
      .from('customer_accounting_ledger')
      .select('id, type, amount')
      .eq('booking_id', editId)
      .in('type', ['rental', 'deposit', 'payment'])
      .then(({ data }) => {
        if (!active || !data) return;
        const rows = data as { id: number; type: string; amount: number }[];
        const rentalRow    = rows.find(r => r.type === 'rental')    ?? null;
        const depositRow   = rows.find(r => r.type === 'deposit')   ?? null;
        const paymentRow   = rows.find(r => r.type === 'payment')   ?? null;
        setExistingLedger({
          rental:    rentalRow    ? { id: rentalRow.id,    amount: rentalRow.amount    } : null,
          deposit:   depositRow   ? { id: depositRow.id,   amount: depositRow.amount   } : null,
          payment:   paymentRow   ? { id: paymentRow.id,   amount: paymentRow.amount   } : null,
        });
        // Pre-fill form in TRY (amounts are stored in TRY, fin_currency defaults to TRY)
        setForm(f => ({
          ...f,
          fin_rental_amount:    rentalRow    ? String(rentalRow.amount)    : '',
          fin_deposit_amount: depositRow   ? String(depositRow.amount)   : '',
          fin_paid_amount:      paymentRow   ? String(paymentRow.amount)   : '',
        }));
      });
    return () => { active = false; };
  }, [mode, editId]);

  // ── Currency toggle with live field conversion ────────────────────────────
  const handleFinCurrencyChange = (cur: 'TRY' | 'USD') => {
    if (cur === form.fin_currency) return;
    const usdRate = rates.find(r => r.currency === 'USD')?.rate_to_try ?? 0;
    if (!usdRate) { set('fin_currency', cur); return; }
    const toTRYFactor   = form.fin_currency === 'USD' ? usdRate : 1;
    const fromTRYFactor = cur === 'USD' ? (1 / usdRate) : 1;
    const cvt = (s: string) => {
      const n = parseFloat(s);
      if (!s || isNaN(n) || n === 0) return s;
      return String(Math.round(n * toTRYFactor * fromTRYFactor * 100) / 100);
    };
    setForm(f => ({
      ...f,
      fin_currency:         cur,
      fin_rental_amount:    cvt(f.fin_rental_amount),
      fin_deposit_amount: cvt(f.fin_deposit_amount),
      fin_paid_amount:      cvt(f.fin_paid_amount),
    }));
  };

  // ── ID-number auto-fill (add mode only, 500 ms debounce) ─────────────────
  useEffect(() => {
    if (mode !== 'add') return;
    const idNum = form.cust_id_number.trim();
    if (!idNum) { setIdLookup('idle'); return; }
    setIdLookup('searching');
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id_number', idNum)
        .maybeSingle();
      if (error || !data) { setIdLookup('not-found'); return; }
      const c = data as {
        first_name: string; last_name: string; phone: string | null;
        nationality: string | null; language: string | null;
        id_type: string | null; id_number: string | null;
        driving_license_number: string | null;
        address: string | null; birth_date: string | null; notes: string | null;
      };
      setForm(f => ({
        ...f,
        cust_id_type:                (c.id_type === 'national_id' ? 'national_id' : 'passport') as 'passport' | 'national_id',
        cust_first_name:             c.first_name,
        cust_last_name:              c.last_name,
        cust_phone_dial:             parseStoredPhone(c.phone).dial,
        cust_phone:                  parseStoredPhone(c.phone).local,
        cust_nationality:            c.nationality ?? '',
        cust_language:               normalizeLanguage(c.language),
        cust_driving_license:        c.driving_license_number ?? '',
        cust_driving_license_number: '',
        cust_birth_date:             c.birth_date ?? '',
        cust_address:                c.address ?? '',
        cust_notes:                  c.notes ?? '',
      }));
      setIdLookup('found');
    }, 500);
    return () => clearTimeout(t);
  }, [form.cust_id_number, mode]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const errors = {
      cust_id_number:          !form.cust_id_number.trim()          ? 'ID number is required'           : null,
      cust_id_type:            !form.cust_id_type                   ? 'ID type is required'             : null,
      cust_nationality:        !form.cust_nationality               ? 'Nationality is required'         : null,
      cust_phone:              !form.cust_phone.trim()              ? 'Phone number is required'        : null,
      cust_license_issue_date: !form.cust_license_issue_date.trim() ? 'License issue date is required'  : null,
    };
    setFieldErrors(errors);
    const firstError = [
      errors.cust_id_number          ? idNumberRef        : null,
      errors.cust_id_type            ? idTypeRef          : null,
      errors.cust_phone              ? phoneRef           : null,
      errors.cust_nationality        ? nationalityRef     : null,
      errors.cust_license_issue_date ? licenseIssueDateRef : null,
    ].find(Boolean);
    if (firstError?.current) {
      firstError.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (Object.values(errors).some(Boolean)) return;

    setSaving(true);

    if (mode === 'add') {
      // Step 1: create customer
      const phone = form.cust_phone
        ? `${form.cust_phone_dial}${form.cust_phone}`
        : null;

      const { data: custData, error: custError } = await supabase
        .from('customers')
        .insert({
          id_type:             form.cust_id_type,
          id_number:           form.cust_id_number   || null,
          first_name:          form.cust_first_name,
          last_name:           form.cust_last_name,
          phone:               phone,
          nationality:         form.cust_nationality        || null,
          language:            normalizeLanguage(form.cust_language),
          driving_license_number: form.cust_driving_license || null,
          address:             form.cust_address            || null,
          birth_date:          form.cust_birth_date         || null,
          license_issue_date:  form.cust_license_issue_date || null,
          notes:               form.cust_notes              || null,
        })
        .select('id')
        .single();

      if (custError) {
        setSaving(false);
        setFormError(custError.message);
        return;
      }

      // Step 2: upload documents and patch customer
      const customerId = (custData as { id: number }).id;
      const docUpdates: Record<string, string> = {};

      const [idUrl, idBackUrl, dlUrl, dlBackUrl, esUrl] = await Promise.all([
        docIdPhoto            ? uploadDocById(docIdPhoto,            customerId, 'id-photo')             : Promise.resolve(null),
        docIdPhotoBack        ? uploadDocById(docIdPhotoBack,        customerId, 'id-photo-back')        : Promise.resolve(null),
        docDrivingLicense     ? uploadDocById(docDrivingLicense,     customerId, 'driving-license')      : Promise.resolve(null),
        docDrivingLicenseBack ? uploadDocById(docDrivingLicenseBack, customerId, 'driving-license-back') : Promise.resolve(null),
        docEntryStamp         ? uploadDocById(docEntryStamp,         customerId, 'entry-stamp')          : Promise.resolve(null),
      ]);
      if (idUrl)     docUpdates.id_photo_url                = idUrl;
      if (idBackUrl) docUpdates.id_photo_back_url           = idBackUrl;
      if (dlUrl)     docUpdates.driving_license_photo_url   = dlUrl;
      if (dlBackUrl) docUpdates.driving_license_back_url    = dlBackUrl;
      if (esUrl)     docUpdates.entry_stamp_photo_url       = esUrl;
      if (Object.keys(docUpdates).length > 0) {
        const { error: docErr } = await supabase.from('customers').update(docUpdates).eq('id', customerId);
        if (docErr) console.error('[Booking] customer doc update error:', docErr);
      }

      // Step 3: create booking with the new customer id
      const carId = Number(form.car_id);
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          booking_number:   form.booking_number,
          status:           form.status,
          car_id:           carId,
          customer_id:      customerId,
          start_date:       form.start_date,
          end_date:         form.end_date,
          kabis_reported:   false,
          invoice_issued:   false,
          pickup_location:  form.pickup_location  || null,
          dropoff_location: form.dropoff_location || null,
          km_at_delivery:   form.km_at_delivery   ? Number(form.km_at_delivery)  : null,
          fuel_at_delivery: form.fuel_at_delivery || null,
        })
        .select('id')
        .single();

      if (bookingError) { setSaving(false); setFormError(bookingError.message); return; }

      // Step 4: insert ledger rows (skip if amount is 0 or empty)
      const bookingId = (bookingData as { id: number }).id;
      const ledgerRows: {
        booking_id: number; customer_id: number; car_id: number;
        type: string; amount: number; direction: 'IN' | 'OUT'; description: string;
      }[] = [];

      // Determine TRY conversion multiplier
      const usdRate = rates.find(r => r.currency === 'USD')?.rate_to_try ?? 1;
      const toTRY = (n: number) => form.fin_currency === 'USD' ? Math.round(n * usdRate * 100) / 100 : n;

      const rentalAmt   = parseFloat(form.fin_rental_amount);
      const depositAmt    = parseFloat(form.fin_deposit_amount);
      const paidAmt     = parseFloat(form.fin_paid_amount);

      if (!isNaN(rentalAmt) && rentalAmt > 0)
        ledgerRows.push({ booking_id: bookingId, customer_id: customerId, car_id: carId, type: 'rental',    amount: toTRY(rentalAmt),  direction: 'OUT', description: 'Rental fee' });
      if (!isNaN(depositAmt)  && depositAmt  > 0)
        ledgerRows.push({ booking_id: bookingId, customer_id: customerId, car_id: carId, type: 'deposit',   amount: toTRY(depositAmt), direction: 'IN',  description: 'Deposit' });
      if (!isNaN(paidAmt)   && paidAmt   > 0)
        ledgerRows.push({ booking_id: bookingId, customer_id: customerId, car_id: carId, type: 'payment',   amount: toTRY(paidAmt),    direction: 'IN',  description: 'Customer payment' });

      if (ledgerRows.length > 0) {
        const { error: ledgerErr } = await supabase.from('customer_accounting_ledger').insert(ledgerRows);
        if (ledgerErr) {
          console.error('[Booking] ledger insert error:', ledgerErr);
          showToast('Booking saved, but ledger entries failed', 'error');
        }
      }

      setSaving(false);
    } else {
      // Edit: update booking
      const insuranceValue = form.insurance_type_select === 'Diğer'
        ? (form.insurance_type_custom.trim() || null)
        : (form.insurance_type_select || null);
      const additionalServicesArr = [
        ...form.additional_services_selected.filter(s => s !== 'Diğer'),
        ...(form.additional_services_selected.includes('Diğer') && form.additional_services_custom.trim()
          ? [form.additional_services_custom.trim()]
          : []),
      ];
      const additionalServicesValue = additionalServicesArr.length > 0 ? additionalServicesArr.join(', ') : null;

      const { error: bookingErr } = await supabase
        .from('bookings')
        .update({
          booking_number:      form.booking_number,
          status:              form.status,
          car_id:              Number(form.car_id),
          start_date:          form.start_date,
          end_date:            form.end_date,
          is_currently_active: form.is_currently_active,
          pickup_location:     form.pickup_location  || null,
          dropoff_location:    form.dropoff_location || null,
          km_at_delivery:      form.km_at_delivery   ? Number(form.km_at_delivery)  : null,
          fuel_at_delivery:    form.fuel_at_delivery || null,
          insurance_type:      insuranceValue,
          additional_services: additionalServicesValue,
        })
        .eq('id', editId!);

      if (bookingErr) { setSaving(false); setFormError(bookingErr.message); return; }

      // Edit: update customer + upload docs
      if (editCustomerId) {
        const phone = form.cust_phone
          ? `${form.cust_phone_dial}${form.cust_phone}`
          : null;

        const [idUrl, idBackUrl, dlUrl, dlBackUrl, esUrl] = await Promise.all([
          docIdPhoto            ? uploadDocById(docIdPhoto,            editCustomerId, 'id-photo')             : Promise.resolve(null),
          docIdPhotoBack        ? uploadDocById(docIdPhotoBack,        editCustomerId, 'id-photo-back')        : Promise.resolve(null),
          docDrivingLicense     ? uploadDocById(docDrivingLicense,     editCustomerId, 'driving-license')      : Promise.resolve(null),
          docDrivingLicenseBack ? uploadDocById(docDrivingLicenseBack, editCustomerId, 'driving-license-back') : Promise.resolve(null),
          docEntryStamp         ? uploadDocById(docEntryStamp,         editCustomerId, 'entry-stamp')          : Promise.resolve(null),
        ]);

        const { error: custErr } = await supabase
          .from('customers')
          .update({
            first_name:              form.cust_first_name,
            last_name:               form.cust_last_name,
            phone,
            nationality:             form.cust_nationality            || null,
            language:                normalizeLanguage(form.cust_language),
            id_type:                 form.cust_id_type,
            id_number:               form.cust_id_number              || null,
            driving_license_number:  form.cust_driving_license        || null,
            address:                 form.cust_address                || null,
            birth_date:              form.cust_birth_date             || null,
            license_issue_date:      form.cust_license_issue_date     || null,
            notes:                   form.cust_notes                  || null,
            ...(idUrl     && { id_photo_url:                idUrl     }),
            ...(idBackUrl && { id_photo_back_url:           idBackUrl }),
            ...(dlUrl     && { driving_license_photo_url:   dlUrl     }),
            ...(dlBackUrl && { driving_license_back_url:    dlBackUrl }),
            ...(esUrl     && { entry_stamp_photo_url:       esUrl     }),
          })
          .eq('id', editCustomerId);

        if (custErr) console.error('[Booking] customer update error:', custErr);
      }

      // Edit: upsert / delete ledger rows
      const usdRateEdit = rates.find(r => r.currency === 'USD')?.rate_to_try ?? 1;
      const toTRYEdit   = (n: number) => form.fin_currency === 'USD' ? Math.round(n * usdRateEdit * 100) / 100 : n;

      type LedgerResult = { error: unknown };
      const ledgerOps: (() => Promise<LedgerResult>)[] = [];

      const processLedgerRow = (
        type: string,
        fieldValue: string,
        existing: { id: number; amount: number } | null,
        direction: 'IN' | 'OUT',
        description: string,
      ) => {
        const amt = parseFloat(fieldValue);
        const hasAmt = !isNaN(amt) && amt > 0;
        if (existing) {
          if (hasAmt) {
            ledgerOps.push(() =>
              supabase.from('customer_accounting_ledger')
                .update({ amount: toTRYEdit(amt) })
                .eq('id', existing.id) as unknown as Promise<LedgerResult>,
            );
          } else {
            ledgerOps.push(() =>
              supabase.from('customer_accounting_ledger')
                .delete()
                .eq('id', existing.id) as unknown as Promise<LedgerResult>,
            );
          }
        } else if (hasAmt && editId && editCustomerId) {
          ledgerOps.push(() =>
            supabase.from('customer_accounting_ledger').insert({
              booking_id:  editId,
              customer_id: editCustomerId,
              car_id:      Number(form.car_id),
              type,
              amount:      toTRYEdit(amt),
              direction,
              description,
            }) as unknown as Promise<LedgerResult>,
          );
        }
      };

      processLedgerRow('rental',    form.fin_rental_amount,    existingLedger.rental,    'OUT', 'Rental fee');
      processLedgerRow('deposit',   form.fin_deposit_amount, existingLedger.deposit, 'IN',  'Deposit');
      processLedgerRow('payment',   form.fin_paid_amount,      existingLedger.payment,   'IN',  'Customer payment');

      if (ledgerOps.length > 0) {
        const results = await Promise.all(ledgerOps.map(fn => fn()));
        if (results.some(r => r.error)) showToast('Ledger update failed', 'error');
      }

      setSaving(false);
    }

    onSaved();
    onClose();
  };

  return ReactDOM.createPortal(
    <div
      onMouseDown={e => { backdropPressRef.current = e.target === e.currentTarget; }}
      onClick={e => {
        // Only dismiss when the press both started and ended on the backdrop.
        if (e.target === e.currentTarget && backdropPressRef.current) onClose();
        backdropPressRef.current = false;
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
        animation: 'fadeIn 150ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, width: '100%', maxWidth: 720,
          marginTop: 'auto', marginBottom: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
          animation: 'slideUp 180ms ease',
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>
              {mode === 'add' ? 'New Booking' : 'Edit Booking'}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              {mode === 'add' ? 'Create a new customer and booking' : 'Update booking details'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e5e7eb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>

            {/* ── Booking Details ── */}
            <SectionHeading
              title="Booking Details"
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
            />

            <Field label="Booking Number">
              <div style={{
                ...INPUT_STYLE, display: 'flex', alignItems: 'center',
                background: '#f9fafb', color: bookingNumLoading ? '#9ca3af' : '#0f1117',
                fontWeight: bookingNumLoading ? 400 : 700, letterSpacing: bookingNumLoading ? 0 : '0.3px',
                cursor: 'default',
              }}>
                {bookingNumLoading ? 'Generating…' : form.booking_number}
              </div>
            </Field>

            <Field label="Status">
              <select value={form.status} onChange={e => set('status', e.target.value as BookingStatus)}
                style={{ ...INPUT_STYLE, cursor: 'pointer' }} onFocus={focusBlue} onBlur={blurGray}>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>

            <div style={{ gridColumn: 'span 2' }}>
              <Field label="Car" required>
                <select required value={form.car_id} onChange={e => set('car_id', e.target.value)}
                  style={{ ...INPUT_STYLE, cursor: 'pointer' }} onFocus={focusBlue} onBlur={blurGray}>
                  <option value="">Select car…</option>
                  {cars.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.plate_number}{c.model ? ` — ${c.model}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Start Date" required>
              <input required type="date" value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
            </Field>

            <Field label="End Date" required>
              <input required type="date" value={form.end_date}
                onChange={e => set('end_date', e.target.value)}
                style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
            </Field>

            {mode === 'edit' && (
              <div style={{ gridColumn: 'span 2' }}>
                <Field label="Currently Active">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 40 }}>
                    <ToggleSwitch
                      checked={form.is_currently_active}
                      onChange={() => set('is_currently_active', !form.is_currently_active)}
                    />
                    <span style={{
                      fontSize: 13, fontWeight: 600,
                      color: form.is_currently_active ? '#16a34a' : '#6b7280',
                    }}>
                      {form.is_currently_active ? 'Yes — booking is active' : 'No — booking is inactive'}
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
                      Manual override
                    </span>
                  </div>
                </Field>
              </div>
            )}

            {/* ── Vehicle Condition at Delivery ── */}
            <SectionHeading
              title="Vehicle Condition at Delivery"
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 11l2-6h14l2 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><rect x="1" y="11" width="22" height="7" rx="2" stroke="currentColor" strokeWidth="1.8"/><circle cx="7" cy="18" r="2" stroke="currentColor" strokeWidth="1.8"/><circle cx="17" cy="18" r="2" stroke="currentColor" strokeWidth="1.8"/></svg>}
            />

            <div>
              <Field label="Pickup Location">
                <select
                  value={form.pickup_location_select}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === 'Other') {
                      setForm(f => ({ ...f, pickup_location_select: 'Other', pickup_location_custom: '', pickup_location: '' }));
                    } else {
                      setForm(f => ({ ...f, pickup_location_select: v, pickup_location_custom: '', pickup_location: v }));
                    }
                  }}
                  style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                  onFocus={focusBlue}
                  onBlur={blurGray}
                >
                  <option value="">Select location…</option>
                  {LOCATION_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              {form.pickup_location_select === 'Other' && (
                <input
                  type="text"
                  value={form.pickup_location_custom}
                  onChange={e => setForm(f => ({ ...f, pickup_location_custom: e.target.value, pickup_location: e.target.value }))}
                  placeholder="Enter custom location"
                  style={{ ...INPUT_STYLE, marginTop: 6 }}
                  onFocus={focusBlue}
                  onBlur={blurGray}
                />
              )}
            </div>

            <div>
              <Field label="Drop-off Location">
                <select
                  value={form.dropoff_location_select}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === 'Other') {
                      setForm(f => ({ ...f, dropoff_location_select: 'Other', dropoff_location_custom: '', dropoff_location: '' }));
                    } else {
                      setForm(f => ({ ...f, dropoff_location_select: v, dropoff_location_custom: '', dropoff_location: v }));
                    }
                  }}
                  style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                  onFocus={focusBlue}
                  onBlur={blurGray}
                >
                  <option value="">Select location…</option>
                  {LOCATION_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              {form.dropoff_location_select === 'Other' && (
                <input
                  type="text"
                  value={form.dropoff_location_custom}
                  onChange={e => setForm(f => ({ ...f, dropoff_location_custom: e.target.value, dropoff_location: e.target.value }))}
                  placeholder="Enter custom location"
                  style={{ ...INPUT_STYLE, marginTop: 6 }}
                  onFocus={focusBlue}
                  onBlur={blurGray}
                />
              )}
            </div>

            <Field label="KM at Delivery">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={form.km_at_delivery}
                onChange={e => set('km_at_delivery', e.target.value)}
                placeholder="e.g. 45230"
                style={INPUT_STYLE}
                onFocus={focusBlue}
                onBlur={blurGray}
              />
            </Field>

            <div>
              <Field label="Fuel at Delivery">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={form.fuel_at_delivery}
                  onChange={e => set('fuel_at_delivery', e.target.value)}
                  placeholder="e.g. 75"
                  style={INPUT_STYLE}
                  onFocus={focusBlue}
                  onBlur={blurGray}
                />
              </Field>
              <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, display: 'block' }}>
                Enter any value (0 or higher)
              </span>
            </div>

            {/* ── Insurance & Additional Services ── */}
            <SectionHeading
              title="Sigorta ve Ek Hizmetler"
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3l8 4v5c0 4.4-3.4 8.5-8 9.5C7.4 20.5 4 16.4 4 12V7l8-4z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            />

            <div>
              <Field label="Insurance Type">
                <select
                  value={form.insurance_type_select}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(f => ({ ...f, insurance_type_select: v, insurance_type_custom: v !== 'Diğer' ? '' : f.insurance_type_custom }));
                  }}
                  style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                  onFocus={focusBlue}
                  onBlur={blurGray}
                >
                  <option value="">Select insurance type…</option>
                  {INSURANCE_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                  <option value="Diğer">Diğer</option>
                </select>
              </Field>
              {form.insurance_type_select === 'Diğer' && (
                <input
                  type="text"
                  value={form.insurance_type_custom}
                  onChange={e => setForm(f => ({ ...f, insurance_type_custom: e.target.value }))}
                  placeholder="Enter custom insurance type"
                  style={{ ...INPUT_STYLE, marginTop: 6 }}
                  onFocus={focusBlue}
                  onBlur={blurGray}
                />
              )}
            </div>

            <div>
              <Field label="Additional Services">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                  {([...ADDITIONAL_SERVICE_PRESETS, 'Diğer'] as string[]).map(service => (
                    <label key={service} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', minHeight: 28 }}>
                      <input
                        type="checkbox"
                        checked={form.additional_services_selected.includes(service)}
                        onChange={e => {
                          setForm(f => {
                            const next = e.target.checked
                              ? [...f.additional_services_selected, service]
                              : f.additional_services_selected.filter(s => s !== service);
                            return {
                              ...f,
                              additional_services_selected: next,
                              additional_services_custom: (!e.target.checked && service === 'Diğer') ? '' : f.additional_services_custom,
                            };
                          });
                        }}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#4ba6ea', flexShrink: 0 }}
                      />
                      {service}
                    </label>
                  ))}
                </div>
              </Field>
              {form.additional_services_selected.includes('Diğer') && (
                <input
                  type="text"
                  value={form.additional_services_custom}
                  onChange={e => setForm(f => ({ ...f, additional_services_custom: e.target.value }))}
                  placeholder="Enter custom service"
                  style={{ ...INPUT_STYLE, marginTop: 6 }}
                  onFocus={focusBlue}
                  onBlur={blurGray}
                />
              )}
            </div>

            {/* ── Customer Information ── */}
            <>
              <SectionHeading
                title="Customer Information"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
              />

                {/* ID Number — first, triggers auto-fill */}
                <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <div ref={idNumberRef}>
                    <Field label="ID Number" required>
                      <input
                        value={form.cust_id_number}
                        onChange={e => { set('cust_id_number', e.target.value); setIdLookup('idle'); setFieldErrors(fe => ({ ...fe, cust_id_number: null })); }}
                        placeholder="Passport / national ID number"
                        style={{
                          ...INPUT_STYLE,
                          borderColor: fieldErrors.cust_id_number ? '#ef4444' : idLookup === 'found' ? '#16a34a' : idLookup === 'not-found' ? '#e5e7eb' : undefined,
                          transition: 'border-color 150ms ease',
                        }}
                        onFocus={focusBlue}
                        onBlur={blurGray}
                      />
                    </Field>
                    {fieldErrors.cust_id_number && (
                      <span style={{ fontSize: 12, color: '#ef4444', marginTop: 4, display: 'block' }}>{fieldErrors.cust_id_number}</span>
                    )}
                    {/* Lookup status badge */}
                    {!fieldErrors.cust_id_number && idLookup === 'searching' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 12, color: '#6b7280' }}>
                        <svg style={{ animation: 'spin 0.7s linear infinite' }} width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                        Searching…
                      </div>
                    )}
                    {!fieldErrors.cust_id_number && idLookup === 'found' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 12, color: '#16a34a', fontWeight: 500 }}>
                        ✅ Customer found
                      </div>
                    )}
                    {!fieldErrors.cust_id_number && idLookup === 'not-found' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 12, color: '#6b7280' }}>
                        ✏️ New customer — fill in details
                      </div>
                    )}
                  </div>
                  <div ref={idTypeRef}>
                    <Field label="ID Type" required>
                      <select value={form.cust_id_type}
                        onChange={e => { set('cust_id_type', e.target.value as 'passport' | 'national_id'); setFieldErrors(fe => ({ ...fe, cust_id_type: null })); }}
                        style={{ ...INPUT_STYLE, cursor: 'pointer', borderColor: fieldErrors.cust_id_type ? '#ef4444' : undefined }} onFocus={focusBlue} onBlur={blurGray}>
                        <option value="passport">Passport</option>
                        <option value="national_id">National ID</option>
                      </select>
                    </Field>
                    {fieldErrors.cust_id_type && (
                      <span style={{ fontSize: 12, color: '#ef4444', marginTop: 4, display: 'block' }}>{fieldErrors.cust_id_type}</span>
                    )}
                  </div>
                </div>

                {/* Row 2: First Name | Last Name */}
                <Field label="First Name" required>
                  <input required value={form.cust_first_name}
                    onChange={e => set('cust_first_name', e.target.value)}
                    placeholder="First name" style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                <Field label="Last Name" required>
                  <input required value={form.cust_last_name}
                    onChange={e => set('cust_last_name', e.target.value)}
                    placeholder="Last name" style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                {/* Row 3: Driving License | License Issue Date */}
                <Field label="Driving License">
                  <input value={form.cust_driving_license}
                    onChange={e => set('cust_driving_license', e.target.value)}
                    placeholder="License number" style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                <div ref={licenseIssueDateRef}>
                  <Field label="License Issue Date" required>
                    <input type="date" value={form.cust_license_issue_date}
                      onChange={e => { set('cust_license_issue_date', e.target.value); setFieldErrors(fe => ({ ...fe, cust_license_issue_date: null })); }}
                      style={{ ...INPUT_STYLE, borderColor: fieldErrors.cust_license_issue_date ? '#ef4444' : undefined }}
                      onFocus={focusBlue} onBlur={blurGray} />
                  </Field>
                  {fieldErrors.cust_license_issue_date && (
                    <span style={{ fontSize: 12, color: '#ef4444', marginTop: 4, display: 'block' }}>{fieldErrors.cust_license_issue_date}</span>
                  )}
                  {!fieldErrors.cust_license_issue_date && form.cust_license_issue_date && (() => {
                    const diffDays = (Date.now() - new Date(form.cust_license_issue_date).getTime()) / (1000 * 60 * 60 * 24);
                    return diffDays < 365 ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 6, padding: '7px 10px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 7, fontSize: 12, color: '#92400e', lineHeight: 1.45 }}>
                        <span style={{ flexShrink: 0 }}>⚠️</span>
                        <span>Driver's license was issued less than 1 year ago.<br/>This booking may require additional review.</span>
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Row 4: Phone | Nationality */}
                <div ref={phoneRef}>
                  <Field label="Phone" required>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <DialCodePicker
                        value={form.cust_phone_dial}
                        onChange={dial => set('cust_phone_dial', dial)}
                      />
                      <input value={form.cust_phone}
                        onChange={e => { set('cust_phone', e.target.value); setFieldErrors(fe => ({ ...fe, cust_phone: null })); }}
                        placeholder="Phone number" type="tel"
                        style={{ ...INPUT_STYLE, flex: 1, borderColor: fieldErrors.cust_phone ? '#ef4444' : undefined }}
                        onFocus={focusBlue} onBlur={blurGray} />
                    </div>
                  </Field>
                  {fieldErrors.cust_phone && (
                    <span style={{ fontSize: 12, color: '#ef4444', marginTop: 4, display: 'block' }}>{fieldErrors.cust_phone}</span>
                  )}
                </div>

                <div ref={nationalityRef}>
                  <Field label="Nationality" required>
                    <select value={form.cust_nationality}
                      onChange={e => { set('cust_nationality', e.target.value); setFieldErrors(fe => ({ ...fe, cust_nationality: null })); }}
                      style={{ ...INPUT_STYLE, cursor: 'pointer', borderColor: fieldErrors.cust_nationality ? '#ef4444' : undefined }} onFocus={focusBlue} onBlur={blurGray}>
                      <option value="">Select country…</option>
                      {COUNTRIES.map(c => (
                        <option key={c.code} value={c.name}>{c.flag} {c.name}</option>
                      ))}
                    </select>
                  </Field>
                  {fieldErrors.cust_nationality && (
                    <span style={{ fontSize: 12, color: '#ef4444', marginTop: 4, display: 'block' }}>{fieldErrors.cust_nationality}</span>
                  )}
                </div>

                {/* Language — drives the WhatsApp template language in automations */}
                <div>
                  <Field label="Language">
                    <select
                      value={form.cust_language}
                      onChange={e => set('cust_language', normalizeLanguage(e.target.value))}
                      style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                      onFocus={focusBlue}
                      onBlur={blurGray}
                    >
                      {LANGUAGE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                {/* Row 5: Birth Date | Address */}
                <div>
                  <Field label="Birth Date">
                    <input type="date" value={form.cust_birth_date}
                      onChange={e => set('cust_birth_date', e.target.value)}
                      style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
                  </Field>
                  {form.cust_birth_date && (() => {
                    const diffMs = Date.now() - new Date(form.cust_birth_date).getTime();
                    const ageYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
                    return ageYears < 22 ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 6, padding: '7px 10px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 7, fontSize: 12, color: '#92400e', lineHeight: 1.45 }}>
                        <span style={{ flexShrink: 0 }}>⚠️</span>
                        <span>Customer is under 22 years old.<br/>Young driver surcharge may apply.</span>
                      </div>
                    ) : null;
                  })()}
                </div>

                <Field label="Address">
                  <input value={form.cust_address}
                    onChange={e => set('cust_address', e.target.value)}
                    placeholder="Home address" style={INPUT_STYLE}
                    onFocus={focusBlue} onBlur={blurGray} />
                </Field>

                {/* Row 6: Notes */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                    Notes
                  </label>
                  <textarea
                    value={form.cust_notes}
                    onChange={e => set('cust_notes', e.target.value)}
                    placeholder="Any notes about this customer…"
                    rows={2}
                    style={{ ...INPUT_STYLE, height: 'auto', padding: '10px 12px', resize: 'vertical' }}
                    onFocus={focusBlue} onBlur={blurGray}
                  />
                </div>

                {/* ── Customer Documents ── */}
                <SectionHeading
                  title="Customer Documents"
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                />

                <DocUploadField
                  label="ID Photo"
                  existingUrl={existingDocUrls.id_photo_url}
                  file={docIdPhoto}
                  onChange={setDocIdPhoto}
                />

                <DocUploadField
                  label="ID Photo (Back)"
                  existingUrl={existingDocUrls.id_photo_back_url}
                  file={docIdPhotoBack}
                  onChange={setDocIdPhotoBack}
                />

                <DocUploadField
                  label="Driving License"
                  existingUrl={existingDocUrls.driving_license_photo_url}
                  file={docDrivingLicense}
                  onChange={setDocDrivingLicense}
                />

                <DocUploadField
                  label="Driving License (Back)"
                  existingUrl={existingDocUrls.driving_license_back_url}
                  file={docDrivingLicenseBack}
                  onChange={setDocDrivingLicenseBack}
                />

                <DocUploadField
                  label="Entry Stamp"
                  existingUrl={existingDocUrls.entry_stamp_photo_url}
                  file={docEntryStamp}
                  onChange={setDocEntryStamp}
                />
            </>
          </div>

          {/* ── Financial Information ── */}
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
              {/* Section heading + currency toggle on the same row */}
              <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 10, borderBottom: '1.5px solid #f0f0f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#4ba6ea', display: 'flex', alignItems: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7v1m0 8v1M9 10h6M9 14h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Financial Information</span>
                </div>
                {/* Currency toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1.5px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                  {(['TRY', 'USD'] as const).map(cur => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => handleFinCurrencyChange(cur)}
                      style={{
                        height: 32, padding: '0 14px',
                        fontSize: 12, fontWeight: 700,
                        border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit',
                        background: form.fin_currency === cur ? '#4ba6ea' : '#fff',
                        color:      form.fin_currency === cur ? '#fff'    : '#6b7280',
                        transition: 'background 140ms ease, color 140ms ease',
                      }}
                    >
                      {cur === 'TRY' ? '₺ TRY' : '$ USD'}
                    </button>
                  ))}
                </div>
              </div>

              <Field label={`Rental Amount${form.fin_currency === 'USD' ? ' (USD)' : ' (TRY)'}`}>
                <input
                  type="number" min="0" step="0.01"
                  value={form.fin_rental_amount}
                  onChange={e => set('fin_rental_amount', e.target.value)}
                  placeholder="0.00"
                  style={INPUT_STYLE}
                  onFocus={focusBlue} onBlur={blurGray}
                />
              </Field>
              <Field label={`Deposit${form.fin_currency === 'USD' ? ' (USD)' : ' (TRY)'}`}>
                <input
                  type="number" min="0" step="0.01"
                  value={form.fin_deposit_amount}
                  onChange={e => set('fin_deposit_amount', e.target.value)}
                  placeholder="0.00"
                  style={INPUT_STYLE}
                  onFocus={focusBlue} onBlur={blurGray}
                />
              </Field>
              <div style={{ gridColumn: 'span 2' }}>
                <Field label={`Paid Amount${form.fin_currency === 'USD' ? ' (USD)' : ' (TRY)'}`}>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.fin_paid_amount}
                    onChange={e => set('fin_paid_amount', e.target.value)}
                    placeholder="0.00"
                    style={{ ...INPUT_STYLE, maxWidth: 'calc(50% - 8px)' }}
                    onFocus={focusBlue} onBlur={blurGray}
                  />
                </Field>
              </div>

              {/* Conversion note when USD is selected */}
              {form.fin_currency === 'USD' && (() => {
                const rate = rates.find(r => r.currency === 'USD')?.rate_to_try;
                return rate ? (
                  <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 7, background: 'rgba(75,166,234,0.07)', border: '1px solid rgba(75,166,234,0.18)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#4ba6ea" strokeWidth="1.8"/><path d="M12 11v5M12 8h.01" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round"/></svg>
                    <span style={{ fontSize: 11.5, color: '#4ba6ea', fontWeight: 500 }}>
                      Stored in TRY · 1 USD = ₺{rate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ) : (
                  <div style={{ gridColumn: 'span 2', fontSize: 11.5, color: '#f97316', padding: '6px 10px', borderRadius: 7, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.18)' }}>
                    Exchange rate not loaded — amounts will be stored as-is
                  </div>
                );
              })()}
          </div>

          {formError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
                <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 13, color: '#ef4444' }}>{formError}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, paddingTop: 18, borderTop: '1px solid #f3f4f6' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#9ca3af'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: saving ? '#a8d4f5' : '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 150ms ease' }}
              onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
              onMouseLeave={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
            >
              {saving ? 'Saving…' : mode === 'add' ? 'Add Booking' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes spin    { to { transform: rotate(360deg); } }
      `}</style>
    </div>,
    document.body,
  );
};

// Small form field wrapper
const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({
  label, required, children,
}) => (
  <div>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
      {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
    </label>
    {children}
  </div>
);

// ─── Replacement car ──────────────────────────────────────────────────────────

// The six statuses the car_availability view can emit — verbatim, no invented
// labels. Colours match CarsPage's STATUS_CONFIG; `pending` takes CalendarPage's.
const CAR_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  working:     { label: 'Working',     color: '#16a34a', bg: 'rgba(34,197,94,0.1)'   },
  parking:     { label: 'Parking',     color: '#ea580c', bg: 'rgba(249,115,22,0.1)'  },
  maintenance: { label: 'Maintenance', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  replacement: { label: 'Replacement', color: '#0891b2', bg: 'rgba(6,182,212,0.1)'   },
  selling:     { label: 'Selling',     color: '#ca8a04', bg: 'rgba(234,179,8,0.1)'   },
  pending:     { label: 'Pending',     color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'  },
};

function carStatus(status: string) {
  return CAR_STATUS_CONFIG[status] ?? { label: status || '—', color: '#6b7280', bg: '#f3f4f6' };
}

interface ReplacementModalProps {
  onClose:   () => void;
  onSaved:   () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

const ReplacementFormModal: React.FC<ReplacementModalProps> = ({ onClose, onSaved, showToast }) => {
  const backdropPressRef = useRef(false);

  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [cars, setCars] = useState<CarPickOption[]>([]);

  // Step 1 — the original car, chosen by plate.
  const [plateSearch,  setPlateSearch]  = useState('');
  const [originalCar,  setOriginalCar]  = useState<CarPickOption | null>(null);

  // Step 2 — a booking on that car. Loaded only once a plate is picked.
  const [carBookings,        setCarBookings]        = useState<CarBookingOption[]>([]);
  const [carBookingsLoading, setCarBookingsLoading] = useState(false);
  const [carBookingsError,   setCarBookingsError]   = useState<string | null>(null);
  const [bookingId,          setBookingId]          = useState('');

  const [replacementCarId, setReplacementCarId] = useState('');
  const [startDate,        setStartDate]        = useState(toDateStr(new Date()));
  const [endDate,          setEndDate]          = useState('');
  const [kmAtHandover,     setKmAtHandover]     = useState('');
  const [fuelAtHandover,   setFuelAtHandover]   = useState('');
  const [notes,            setNotes]            = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // Every car plus live availability in one parallel round trip — no waterfall.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [carsRes, availRes] = await Promise.all([
        supabase.from('cars').select('id, plate_number, is_active, model_group(name)').order('plate_number'),
        supabase.from('car_availability').select('id, status'),
      ]);

      if (cancelled) return;

      if (carsRes.error) {
        setLoadError(carsRes.error.message);
        setLoading(false);
        return;
      }

      const statusById = new Map<number, string>();
      for (const row of (availRes.data ?? []) as { id: number; status: string }[]) {
        statusById.set(row.id, row.status);
      }

      setCars(
        ((carsRes.data ?? []) as unknown as {
          id: number; plate_number: string; is_active: boolean;
          model_group: { name: string } | { name: string }[] | null;
        }[]).map(c => ({
          id:           c.id,
          plate_number: c.plate_number,
          model_name:   resolveModelName(c.model_group),
          is_active:    c.is_active,
          status:       statusById.get(c.id) ?? 'parking',
        })),
      );
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  // Step 2 — every booking on the chosen car, regardless of status or date. The
  // replacement is often arranged before the original booking is active, so
  // filtering by is_currently_active here would hide the booking we need.
  useEffect(() => {
    if (!originalCar) { setCarBookings([]); setCarBookingsError(null); return; }

    let cancelled = false;
    setCarBookingsLoading(true);
    setCarBookingsError(null);

    (async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_number, start_date, end_date, customer_id, customers(first_name, last_name)')
        .eq('car_id', originalCar.id)
        .order('start_date', { ascending: false });

      if (cancelled) return;

      if (error) {
        setCarBookingsError(error.message);
        setCarBookings([]);
        setCarBookingsLoading(false);
        return;
      }

      setCarBookings(((data ?? []) as unknown as CarBookingJoin[]).map(b => {
        const cust = firstOf(b.customers);
        return {
          id:             b.id,
          booking_number: b.booking_number,
          start_date:     b.start_date,
          end_date:       b.end_date,
          customer_id:    b.customer_id,
          customer_name:  cust ? `${cust.first_name} ${cust.last_name}`.trim() : '—',
        };
      }));
      setCarBookingsLoading(false);
    })();

    return () => { cancelled = true; };
  }, [originalCar]);

  const filteredCars = useMemo(() => {
    const q = plateSearch.trim().toLowerCase();
    if (!q) return cars;
    return cars.filter(c =>
      c.plate_number.toLowerCase().includes(q) ||
      c.model_name.toLowerCase().includes(q)
    );
  }, [cars, plateSearch]);

  // Only active cars can be handed out, and free ones are listed first.
  const replacementCars = useMemo(() => {
    const active = cars.filter(c => c.is_active);
    return {
      parking: active.filter(c => c.status === 'parking'),
      other:   active.filter(c => c.status !== 'parking'),
    };
  }, [cars]);

  const chosenCar = useMemo(
    () => cars.find(c => String(c.id) === replacementCarId) ?? null,
    [cars, replacementCarId],
  );

  const selectedBooking = useMemo(
    () => carBookings.find(b => String(b.id) === bookingId) ?? null,
    [carBookings, bookingId],
  );

  const pickOriginalCar = (c: CarPickOption) => {
    setOriginalCar(c);
    setBookingId('');
    setFormError(null);
  };

  // A sheet is always tied to a customer, so a booking must be picked — a car
  // with no bookings at all can never be the original.
  const submitBlocked =
    saving || loading || !!loadError ||
    !originalCar || carBookingsLoading || !selectedBooking;

  // Default the return date to the chosen booking's end date.
  const pickBooking = (id: string) => {
    setBookingId(id);
    const b = carBookings.find(x => String(x.id) === id);
    if (b) setEndDate(b.end_date);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (!originalCar)           { setFormError('Select the original car by plate.'); return; }
    if (!selectedBooking)       { setFormError('Select the original booking — the sheet must be tied to a customer.'); return; }
    if (!replacementCarId)      { setFormError('Select a replacement car.'); return; }
    if (!startDate || !endDate) { setFormError('Handover and return dates are both required.'); return; }
    if (endDate < startDate)    { setFormError('The return date cannot be before the handover date.'); return; }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    const carId = Number(replacementCarId);

    // Step 1 — block the replacement car's calendar.
    // booking_id MUST stay null: it is UNIQUE, and the original booking already
    // owns its own booked_* row. Pointing it at the original booking would collide.
    const { data: blockData, error: blockError } = await supabase
      .from('car_calendar')
      .insert({
        car_id:     carId,
        start_date: startDate,
        end_date:   endDate,
        block_type: 'replacement',
        booking_id: null,
        created_by: user?.id ?? null,
        notes:      `Replacement for booking ${selectedBooking.booking_number}`,
      })
      .select('id')
      .single();

    if (blockError) {
      setSaving(false);
      setFormError(blockError.message);
      return;
    }

    const blockId = (blockData as { id: number }).id;

    // Step 2 — the sheet record, linked back to the block it just created.
    const { data: sheetData, error: sheetError } = await supabase
      .from('replacement_sheets')
      .insert({
        created_by:          user?.id ?? null,
        original_booking_id: selectedBooking.id,
        customer_id:         selectedBooking.customer_id,   // uuid — never cast
        original_car_id:     originalCar.id,                // from the plate choice, not the booking
        replacement_car_id:  carId,
        start_date:          startDate,
        end_date:            endDate,
        km_at_handover:      kmAtHandover.trim()   ? Number(kmAtHandover) : null,
        fuel_at_handover:    fuelAtHandover.trim() || null,
        notes:               notes.trim()          || null,
        calendar_block_id:   blockId,
      })
      .select('sheet_number')
      .single();

    // Step 3 — roll the block back so a failed sheet never leaves an orphan
    // block sitting on the calendar.
    if (sheetError) {
      const { error: rollbackError } = await supabase.from('car_calendar').delete().eq('id', blockId);
      setSaving(false);
      setFormError(sheetError.message);
      showToast(
        rollbackError
          ? `Sheet failed and the calendar block could not be rolled back — remove block #${blockId} manually`
          : 'Replacement sheet failed — the calendar block was rolled back',
        'error',
      );
      return;
    }

    setSaving(false);

    const printable: ReplacementSheet = {
      sheet_number:            (sheetData as { sheet_number: string | null }).sheet_number ?? '—',
      customer_id:             selectedBooking.customer_id ?? '',
      customer_name:           selectedBooking.customer_name,
      original_booking_number: selectedBooking.booking_number,
      original_plate:          originalCar.plate_number,
      original_model:          originalCar.model_name,
      replacement_plate:       chosenCar?.plate_number ?? '—',
      replacement_model:       chosenCar?.model_name ?? null,
      start_date:              startDate,
      end_date:                endDate,
      km_at_handover:          kmAtHandover.trim() ? Number(kmAtHandover) : null,
      fuel_at_handover:        fuelAtHandover.trim() || null,
      notes:                   notes.trim() || null,
    };

    showToast('Replacement sheet created', 'success');
    onSaved();
    onClose();
    await printReplacementSheet(printable);
  };

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
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
        animation: 'fadeIn 150ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, width: '100%', maxWidth: 640,
          marginTop: 'auto', marginBottom: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
          animation: 'slideUp 180ms ease',
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>
              Replacement Car
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              Hand a substitute vehicle to a customer and block its calendar
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e5e7eb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>

          {loading && (
            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
              Loading active bookings…
            </div>
          )}

          {!loading && loadError && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#ef4444' }}>
              {loadError}
            </div>
          )}

          {!loading && !loadError && (
            <>
              {/* ── Original car ── */}
              <SectionHeadingBlock
                title="Original Car"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M4 8h10l2 4h4v5H4V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                    <circle cx="7.5" cy="17" r="1.6" stroke="currentColor" strokeWidth="1.6"/>
                    <circle cx="16.5" cy="17" r="1.6" stroke="currentColor" strokeWidth="1.6"/>
                  </svg>
                }
              />

              {originalCar ? (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
                  padding: '12px 14px', borderRadius: 10,
                  background: 'rgba(75,166,234,0.06)', border: '1px solid rgba(75,166,234,0.25)',
                  marginBottom: 14,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1117' }}>
                      {originalCar.plate_number}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                      {originalCar.model_name}
                      {!originalCar.is_active && ' · inactive'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setOriginalCar(null); setPlateSearch(''); setBookingId(''); }}
                    style={{ flexShrink: 0, minHeight: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, fontWeight: 600, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <input
                    type="text"
                    value={plateSearch}
                    onChange={e => setPlateSearch(e.target.value)}
                    placeholder="Search by plate or model…"
                    style={{ ...INPUT_STYLE, marginBottom: 8 }}
                    onFocus={focusBlue}
                    onBlur={blurGray}
                  />
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1.5px solid #e5e7eb', borderRadius: 8 }}>
                    {filteredCars.length === 0 && (
                      <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
                        No cars match your search.
                      </div>
                    )}
                    {filteredCars.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickOriginalCar(c)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          minHeight: 44, padding: '9px 12px',
                          border: 'none', borderBottom: '1px solid #f3f4f6',
                          background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
                      >
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f1117' }}>
                          {c.plate_number}
                        </span>
                        <span style={{ display: 'block', fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>
                          {c.model_name}{!c.is_active && ' · inactive'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Original booking / customer ── */}
              {originalCar && (
                <div style={{ marginBottom: 16 }}>
                  <Field label="Original booking / customer" required>
                    {carBookingsLoading ? (
                      <div style={{ fontSize: 13, color: '#9ca3af', padding: '11px 0' }}>Loading bookings…</div>
                    ) : carBookingsError ? (
                      <div style={{ fontSize: 13, color: '#ef4444', padding: '11px 0' }}>{carBookingsError}</div>
                    ) : carBookings.length === 0 ? (
                      <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.25)', fontSize: 12.5, color: '#b45309' }}>
                        No bookings found for this car — a replacement sheet must be tied to a booking's customer.
                      </div>
                    ) : (
                      <select
                        value={bookingId}
                        onChange={e => pickBooking(e.target.value)}
                        style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                        onFocus={focusBlue}
                        onBlur={blurGray}
                      >
                        <option value="">Select a booking…</option>
                        {carBookings.map(b => (
                          <option key={b.id} value={String(b.id)}>
                            {b.customer_name} · {b.booking_number} · {formatDateDisplay(b.start_date)} – {formatDateDisplay(b.end_date)}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                </div>
              )}

              {/* ── Replacement vehicle ── */}
              <SectionHeadingBlock
                title="Replacement Vehicle"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M4 8h10l2 4h4v5H4V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                    <circle cx="7.5" cy="17" r="1.6" stroke="currentColor" strokeWidth="1.6"/>
                    <circle cx="16.5" cy="17" r="1.6" stroke="currentColor" strokeWidth="1.6"/>
                  </svg>
                }
              />

              <div style={{ marginBottom: 12 }}>
                <Field label="Replacement car" required>
                  <select
                    value={replacementCarId}
                    onChange={e => setReplacementCarId(e.target.value)}
                    style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                    onFocus={focusBlue}
                    onBlur={blurGray}
                  >
                    <option value="">Select a car…</option>
                    {replacementCars.parking.length > 0 && (
                      <optgroup label="Parking">
                        {replacementCars.parking.map(c => (
                          <option key={c.id} value={String(c.id)}>
                            {c.plate_number} · {c.model_name} — {carStatus(c.status).label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {replacementCars.other.length > 0 && (
                      <optgroup label="Other">
                        {replacementCars.other.map(c => (
                          <option key={c.id} value={String(c.id)}>
                            {c.plate_number} · {c.model_name} — {carStatus(c.status).label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </Field>
              </div>

              {chosenCar && (
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                    color: carStatus(chosenCar.status).color,
                    background: carStatus(chosenCar.status).bg,
                  }}>
                    {carStatus(chosenCar.status).label}
                  </span>
                  {chosenCar.status !== 'parking' && (
                    <span style={{ fontSize: 11.5, color: '#b45309' }}>
                      This car is not free today — check the calendar before handing it over.
                    </span>
                  )}
                </div>
              )}

              {originalCar && chosenCar && originalCar.id === chosenCar.id && (
                <div style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 8, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.25)', fontSize: 12, color: '#b45309' }}>
                  This is the same car as the original — pick a different replacement.
                </div>
              )}

              {/* ── Handover ── */}
              <SectionHeadingBlock
                title="Handover"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M4 7h11M4 7l3-3M4 7l3 3M20 17H9M20 17l-3-3M20 17l-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                }
              />

              <div className="rpl-grid">
                <Field label="Handover date" required>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
                </Field>
                <Field label="Return date" required>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
                </Field>
                <Field label="KM at handover">
                  <input type="number" min="0" value={kmAtHandover} onChange={e => setKmAtHandover(e.target.value)}
                    placeholder="e.g. 48250" style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
                </Field>
                <Field label="Fuel at handover">
                  <input type="text" value={fuelAtHandover} onChange={e => setFuelAtHandover(e.target.value)}
                    placeholder="e.g. 3/4" style={INPUT_STYLE} onFocus={focusBlue} onBlur={blurGray} />
                </Field>
                <div className="rpl-span">
                  <Field label="Notes">
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Why the original car was withdrawn…"
                      style={{ ...INPUT_STYLE, height: 'auto', padding: '9px 12px', resize: 'vertical' }}
                      onFocus={focusBlue}
                      onBlur={blurGray}
                    />
                  </Field>
                </div>
              </div>
            </>
          )}

          {formError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
                <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 13, color: '#ef4444' }}>{formError}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, paddingTop: 18, borderTop: '1px solid #f3f4f6' }}>
            <button type="button" onClick={onClose}
              style={{ minHeight: 44, padding: '9px 18px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#9ca3af'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
            >
              Cancel
            </button>
            <button type="submit" disabled={submitBlocked}
              style={{ minHeight: 44, padding: '9px 22px', borderRadius: 9, border: 'none', background: submitBlocked ? '#a8d4f5' : '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: submitBlocked ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 150ms ease' }}
              onMouseEnter={e => { if (!submitBlocked) (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
              onMouseLeave={e => { if (!submitBlocked) (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
            >
              {saving ? 'Saving…' : 'Create & Print'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .rpl-grid { display: grid; grid-template-columns: 1fr; gap: 14px 16px; }
        .rpl-span { grid-column: 1 / -1; }
        @media (min-width: 640px) { .rpl-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </div>,
    document.body,
  );
};

/** Section heading matching the booking form's, without its `grid-column: span 2`. */
const SectionHeadingBlock: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 10px' }}>
    <div style={{
      width: 28, height: 28, borderRadius: 8,
      background: 'rgba(75,166,234,0.10)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#4ba6ea', flexShrink: 0,
    }}>
      {icon}
    </div>
    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
      {title}
    </span>
    <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
  </div>
);

// ─── Replacement sheets list (reprint) ────────────────────────────────────────

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
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ebebeb', marginTop: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
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
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f1117' }}>Replacement Sheets</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', background: 'rgba(75,166,234,0.10)', borderRadius: 20, padding: '2px 9px' }}>
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
                  <tr style={{ background: '#fafafa' }}>
                    <Th>Sheet</Th>
                    <Th>Customer</Th>
                    <Th>Original → Replacement</Th>
                    <Th>Period</Th>
                    <Th style={{ textAlign: 'right', paddingRight: 16 }}>Print</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.id} className="bk-row" style={{ background: idx % 2 === 1 ? '#fcfcfd' : '#fff' }}>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: '#0f1117', whiteSpace: 'nowrap' }}>
                        {r.sheet_number}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151' }}>
                        {r.customer_name}
                        {r.original_booking_number && (
                          <span style={{ display: 'block', fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>
                            {r.original_booking_number}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#9ca3af' }}>{r.original_plate ?? '—'}</span>
                        <span style={{ margin: '0 7px', color: '#4ba6ea' }}>→</span>
                        <strong style={{ color: '#0f1117' }}>{r.replacement_plate}</strong>
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
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', marginBottom: 8 }}>Delete Booking?</div>
        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.6 }}>
          Booking <strong style={{ color: '#0f1117' }}>{booking.booking_number}</strong> for{' '}
          <strong style={{ color: '#0f1117' }}>{booking.customer_name}</strong> will be permanently deleted.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: deleting ? '#fca5a5' : '#ef4444', color: '#fff', fontSize: 14, fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 150ms ease' }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const BookingsPage: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => getMonthStart(new Date()));
  const [bookings, setBookings]           = useState<Booking[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [stats, setStats]                 = useState({ total: 0, confirmed: 0, pending: 0, completed: 0 });
  const [statsLoading, setStatsLoading]   = useState(true);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<BookingStatus | ''>('');
  const [sort, setSort]                   = useState<{ col: SortCol; dir: SortDir }>({ col: null, dir: 'asc' });
  const [selectedIds, setSelectedIds]     = useState<Set<number>>(new Set());
  const [modal, setModal]                 = useState<null | 'add' | 'replacement' | { mode: 'edit'; booking: Booking }>(null);
  const [sheetsRefresh, setSheetsRefresh]  = useState(0);
  const [deleteTarget, setDeleteTarget]   = useState<Booking | null>(null);
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
        customers(first_name, last_name)
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
      : <span style={{ color: '#4ba6ea', fontSize: 11 }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>;

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
  const editFormData = (b: Booking): BookingFormData => ({
    booking_number:      b.booking_number,
    status:              b.status,
    car_id:              String(b.car_id),
    start_date:          b.start_date,
    end_date:            b.end_date,
    is_currently_active: b.is_currently_active,
    pickup_location:        b.pickup_location  ?? '',
    pickup_location_select: resolveLocationSelect(b.pickup_location).select,
    pickup_location_custom: resolveLocationSelect(b.pickup_location).custom,
    dropoff_location:        b.dropoff_location ?? '',
    dropoff_location_select: resolveLocationSelect(b.dropoff_location).select,
    dropoff_location_custom: resolveLocationSelect(b.dropoff_location).custom,
    km_at_delivery:      b.km_at_delivery   != null ? String(b.km_at_delivery) : '',
    fuel_at_delivery:    b.fuel_at_delivery ?? '',
    insurance_type_select:        resolveInsuranceSelect(b.insurance_type).select,
    insurance_type_custom:        resolveInsuranceSelect(b.insurance_type).custom,
    additional_services_selected: parseAdditionalServices(b.additional_services),
    additional_services_custom:   parseAdditionalServicesCustom(b.additional_services),
    // Customer fields unused in edit mode — provide empty defaults
    cust_id_type: 'passport', cust_id_number: '',
    cust_first_name: '', cust_last_name: '',
    cust_phone_dial: '+90', cust_phone: '',
    cust_nationality: '', cust_language: 'ar', cust_driving_license: '',
    cust_driving_license_number: '', cust_address: '',
    cust_birth_date: '', cust_license_issue_date: '', cust_notes: '',
    fin_currency: 'TRY', fin_rental_amount: '', fin_deposit_amount: '', fin_paid_amount: '',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>
      <div>

        {/* ── Page header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap', marginBottom: 36,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                Operations
              </span>
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', lineHeight: 1.1, marginBottom: 6 }}>
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
                background: '#fff', color: '#374151',
                border: '1.5px solid #e5e7eb',
                borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                transition: 'all 150ms ease',
              }}
              onMouseEnter={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea';
              }}
              onMouseLeave={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.borderColor = '#e5e7eb'; b.style.color = '#374151';
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M4 8h13l-3-3M20 16H7l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Replacement Car
            </button>

            <button
              className="bk-hdr-btn"
              onClick={() => setModal('add')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 18px',
                background: '#4ba6ea', color: '#fff', border: 'none',
                borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                boxShadow: '0 2px 8px rgba(75,166,234,0.30)',
                transition: 'background 150ms ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
              Add New Booking
            </button>
          </div>
        </div>

        {/* ── Month navigation ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 28 }}>
          <MonthArrow direction="left"  onClick={() => setSelectedMonth(m => addMonths(m, -1))} />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.4px', minWidth: 160, textAlign: 'center' }}>
            {formatMonthLabel(selectedMonth)}
          </span>
          <MonthArrow direction="right" onClick={() => setSelectedMonth(m => addMonths(m, 1))} />
        </div>

        {/* ── Stat cards ── */}
        <div className="bk-stats">
          <StatCard label="Total Bookings" value={stats.total}     bg="#4ba6ea" loading={statsLoading} />
          <StatCard label="Confirmed"      value={stats.confirmed} bg="#22c55e" loading={statsLoading} />
          <StatCard label="Pending"        value={stats.pending}   bg="#f97316" loading={statsLoading} />
          <StatCard label="Completed"      value={stats.completed} bg="#6b7280" loading={statsLoading} />
        </div>

        {/* ── Search + filter bar ── */}
        <div style={{
          background: '#fff', borderRadius: 14,
          border: '1px solid #ebebeb', padding: '12px 14px',
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

        {/* ── Error ── */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid rgba(239,68,68,0.2)', borderLeft: '4px solid #ef4444', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <span style={{ fontSize: 14, color: '#0f1117' }}>Failed to load bookings: <span style={{ color: '#6b7280' }}>{error}</span></span>
          </div>
        )}

        {/* ── Table ── */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ebebeb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
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
                    isEven={idx % 2 === 1}
                    onSelect={() => toggleSelectRow(booking.id)}
                    onToggle={handleToggle}
                    onEdit={() => setModal({ mode: 'edit', booking })}
                    onDelete={() => setDeleteTarget(booking)}
                    onPrint={() => printBookingContract(booking)}
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
                <span style={{ fontSize: 13, color: '#4ba6ea', fontWeight: 600 }}>
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
        <BookingFormModal
          mode="add"
          initial={EMPTY_FORM}
          showToast={showToast}
          onClose={() => setModal(null)}
          onSaved={() => {
            showToast('Booking added successfully', 'success');
            fetchStats(selectedMonth);
            fetchBookings(selectedMonth);
          }}
        />
      )}
      {modal === 'replacement' && (
        <ReplacementFormModal
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
        <BookingFormModal
          mode="edit"
          initial={editFormData(modal.booking)}
          editId={modal.booking.id}
          editCustomerId={modal.booking.customer_id}
          showToast={showToast}
          onClose={() => setModal(null)}
          onSaved={() => {
            showToast('Booking updated', 'success');
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
