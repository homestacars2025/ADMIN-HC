import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

type CalendarStatus = 'working' | 'parking' | 'maintenance' | 'selling' | 'replacement';
type CellKind = CalendarStatus | 'booked';

interface ModelGroupJoin { name: string; image_url: string | null; }
interface CarRaw { id: number; plate_number: string; model_group: ModelGroupJoin | ModelGroupJoin[] | null; }
interface AvailabilityRaw { id: number; status: CalendarStatus; }
interface CarCalendarRaw { id: number; car_id: number; start_date: string; end_date: string; block_type: string; booking_id: number | null; }
interface CustomerJoin { first_name: string; last_name: string; }
interface BookingCustomerRaw { id: number; customers: CustomerJoin | CustomerJoin[] | null; }
interface CalendarCar { id: number; plate_number: string; model_name: string; image_url: string | null; car_status: CalendarStatus; }
interface CalendarEntry { id: number; car_id: number; start_date: string; end_date: string; block_type: string; booking_id: number | null; customer_name: string | null; }
interface TooltipState { entry: CalendarEntry; x: number; y: number; }
interface ActionMenuState { car: CalendarCar; startDay: number; endDay: number; }
interface BlockPopupState { entry: CalendarEntry; car: CalendarCar; x: number; y: number; }

type EditableBlockType = 'maintenance' | 'selling' | 'replacement';
const EDITABLE_TYPES: EditableBlockType[] = ['maintenance', 'selling', 'replacement'];

// ─── Design tokens ─────────────────────────────────────────────────────────────

const TODAY       = new Date();
const AIRBNB_RED  = '#FF385C';
const BRAND_BLUE  = '#4ba6ea';
const TEXT_DARK   = '#222222';
const TEXT_MID    = '#717171';
const TEXT_LIGHT  = '#aaaaaa';
const BORDER_SOFT = '#f0f0f0';
const FONT        = "'Circular', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const LEFT_W = 200;
const COL_W  = 40;
const ROW_H  = 64;

const BADGE: Record<CellKind, { bg: string; color: string }> = {
  working:     { bg: '#dcfce7', color: '#16a34a' },
  parking:     { bg: '#fef2f2', color: '#dc2626' },
  maintenance: { bg: '#f1f5f9', color: '#64748b' },
  selling:     { bg: '#fefce8', color: '#ca8a04' },
  replacement: { bg: '#fff7ed', color: '#ea580c' },
  booked:      { bg: '#fef2f2', color: '#dc2626' },
};

const CELL_FILL: Record<CellKind, string> = {
  working:     '#bbf7d0',
  parking:     '#fecaca',
  maintenance: '#e2e8f0',
  selling:     '#fef08a',
  replacement: '#fed7aa',
  booked:      '#bbf7d0',
};

const CELL_TEXT_COLOR: Record<CellKind, string> = {
  working:     '#15803d',
  parking:     '#dc2626',
  maintenance: '#475569',
  selling:     '#a16207',
  replacement: '#c2410c',
  booked:      '#15803d',
};

const LEGEND_DOT: Record<CalendarStatus, string> = {
  working:     '#22c55e',
  parking:     '#fecaca',
  maintenance: '#e2e8f0',
  selling:     '#fef08a',
  replacement: '#fed7aa',
};

const STATUS_LABEL: Record<CellKind, string> = {
  working:     'Working',
  parking:     'Parking',
  maintenance: 'Maintenance',
  selling:     'Selling',
  replacement: 'Replacement',
  booked:      'Booked',
};

const STATUS_OPTIONS: Array<{ value: CalendarStatus | 'all'; label: string }> = [
  { value: 'all',         label: 'All statuses'  },
  { value: 'working',     label: 'Working'        },
  { value: 'parking',     label: 'Parking'        },
  { value: 'maintenance', label: 'Maintenance'    },
  { value: 'selling',     label: 'Selling'        },
  { value: 'replacement', label: 'Replacement'    },
];

const LEGEND_KINDS: CalendarStatus[] = ['working', 'parking', 'maintenance', 'selling', 'replacement'];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function parseLocalDate(s: string): Date {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function formatDateShort(s: string): string {
  return parseLocalDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDayLabel(year: number, month: number, day: number): string {
  return new Date(year, month, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function resolveModelGroup(raw: ModelGroupJoin | ModelGroupJoin[] | null): ModelGroupJoin {
  if (!raw) return { name: '—', image_url: null };
  return Array.isArray(raw) ? (raw[0] ?? { name: '—', image_url: null }) : raw;
}

function resolveCustomer(raw: CustomerJoin | CustomerJoin[] | null): CustomerJoin {
  if (!raw) return { first_name: '—', last_name: '' };
  return Array.isArray(raw) ? (raw[0] ?? { first_name: '—', last_name: '' }) : raw;
}

function blockTypeToKind(blockType: string): CellKind {
  switch (blockType) {
    case 'selling':     return 'selling';
    case 'maintenance': return 'maintenance';
    case 'replacement': return 'replacement';
    default:            return 'booked';
  }
}

function padTwo(n: number): string {
  return String(n).padStart(2, '0');
}

// ─── Tooltip ───────────────────────────────────────────────────────────────────

const Tooltip: React.FC<{ state: TooltipState }> = ({ state }) => {
  const { entry, x, y } = state;
  const flipLeft = x + 260 > window.innerWidth;
  const kind = blockTypeToKind(entry.block_type);
  return (
    <div style={{
      position: 'fixed',
      left: flipLeft ? x - 248 : x + 14,
      top: y - 16,
      zIndex: 9999,
      background: 'white',
      borderRadius: 12,
      padding: '14px 16px',
      pointerEvents: 'none',
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      minWidth: 220,
      fontFamily: FONT,
      animation: 'ttFadeIn 0.15s ease',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: BADGE[kind].bg, borderRadius: 20,
        padding: '3px 9px', marginBottom: 10,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: CELL_TEXT_COLOR[kind], flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: BADGE[kind].color, letterSpacing: '0.2px' }}>
          {STATUS_LABEL[kind]}
        </span>
      </div>
      {entry.customer_name && (
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_DARK, marginBottom: 10, lineHeight: 1.3 }}>
          {entry.customer_name}
        </div>
      )}
      <div style={{ height: 1, background: BORDER_SOFT, marginBottom: 10 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: TEXT_MID }}>From</span>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: TEXT_DARK }}>{formatDateShort(entry.start_date)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: TEXT_MID }}>To</span>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: TEXT_DARK }}>{formatDateShort(entry.end_date)}</span>
        </div>
      </div>
    </div>
  );
};

// ─── Toast ─────────────────────────────────────────────────────────────────────

const Toast: React.FC<{ message: string; type: 'success' | 'error' }> = ({ message, type }) => (
  <div style={{
    position: 'fixed',
    bottom: 120,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 11000,
    background: type === 'success' ? '#0f172a' : '#b91c1c',
    color: 'white',
    padding: '12px 20px',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 500,
    fontFamily: FONT,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    whiteSpace: 'nowrap',
    animation: 'toastIn 0.2s ease',
    pointerEvents: 'none',
  }}>
    {type === 'success' ? (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/>
        <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ) : (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/>
        <path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    )}
    {message}
  </div>
);

// ─── SelectionActionMenu ───────────────────────────────────────────────────────

interface SelectionActionMenuProps {
  state: ActionMenuState;
  year: number;
  month: number;
  menuRef: React.RefObject<HTMLDivElement | null>;
  submitting: boolean;
  onBooking: () => void;
  onBlock: (blockType: 'maintenance' | 'selling' | 'replacement') => void;
  onDismiss: () => void;
}

const SelectionActionMenu: React.FC<SelectionActionMenuProps> = ({
  state, year, month, menuRef, submitting, onBooking, onBlock, onDismiss,
}) => {
  const { car, startDay, endDay } = state;
  const startLabel = formatDayLabel(year, month, startDay);
  const endLabel   = endDay !== startDay ? formatDayLabel(year, month, endDay) : null;

  const actions: Array<{
    label: string;
    emoji: string;
    bg: string;
    color: string;
    hoverBg: string;
    onClick: () => void;
  }> = [
    {
      label: 'Add Booking',
      emoji: '📅',
      bg: BRAND_BLUE,
      color: 'white',
      hoverBg: '#3a95d9',
      onClick: onBooking,
    },
    {
      label: 'Maintenance',
      emoji: '🔧',
      bg: '#f1f5f9',
      color: '#334155',
      hoverBg: '#e2e8f0',
      onClick: () => onBlock('maintenance'),
    },
    {
      label: 'Selling',
      emoji: '💰',
      bg: '#fefce8',
      color: '#854d0e',
      hoverBg: '#fef9c3',
      onClick: () => onBlock('selling'),
    },
    {
      label: 'Replacement',
      emoji: '🔄',
      bg: '#fff7ed',
      color: '#9a3412',
      hoverBg: '#ffedd5',
      onClick: () => onBlock('replacement'),
    },
  ];

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        background: 'white',
        borderRadius: 18,
        padding: '18px 20px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)',
        fontFamily: FONT,
        minWidth: 320,
        maxWidth: 'calc(100vw - 48px)',
        animation: 'menuSlideUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_DARK, lineHeight: 1.2 }}>
            {car.plate_number}
            <span style={{ fontWeight: 400, color: TEXT_MID, marginLeft: 6 }}>{car.model_name}</span>
          </div>
          <div style={{
            marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 5,
            background: '#eff6ff', borderRadius: 20, padding: '3px 10px',
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ color: BRAND_BLUE, flexShrink: 0 }}>
              <rect x="3" y="4" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: BRAND_BLUE }}>
              {startLabel}{endLabel ? ` → ${endLabel}` : ''}
            </span>
          </div>
        </div>
        <button
          onClick={onDismiss}
          style={{
            width: 28, height: 28, borderRadius: '50%', border: 'none',
            background: '#f5f5f5', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            color: TEXT_MID, transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#ebebeb'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5'; }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: BORDER_SOFT, marginBottom: 14 }} />

      {/* Action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {actions.map(action => (
          <button
            key={action.label}
            disabled={submitting}
            onClick={action.onClick}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '11px 14px',
              borderRadius: 12, border: 'none',
              background: action.bg, color: action.color,
              fontSize: 13.5, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: FONT, transition: 'background 0.15s ease, opacity 0.15s ease',
              opacity: submitting ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.background = action.hoverBg; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = action.bg; }}
          >
            <span>{action.emoji}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── BlockPopup ───────────────────────────────────────────────────────────────

interface BlockPopupProps {
  state: BlockPopupState;
  popupRef: React.RefObject<HTMLDivElement | null>;
  submitting: boolean;
  onSave: (id: number, data: { block_type: string; start_date: string; end_date: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onDismiss: () => void;
}

const BLOCK_TYPE_OPTIONS: Array<{ value: EditableBlockType; label: string; emoji: string }> = [
  { value: 'maintenance', label: 'Maintenance', emoji: '🔧' },
  { value: 'selling',     label: 'Selling',     emoji: '💰' },
  { value: 'replacement', label: 'Replacement', emoji: '🔄' },
];

const BlockPopup: React.FC<BlockPopupProps> = ({
  state, popupRef, submitting, onSave, onDelete, onDismiss,
}) => {
  const { entry, car, x, y } = state;
  const isEditable = entry.booking_id === null && (EDITABLE_TYPES as string[]).includes(entry.block_type);
  const kind = blockTypeToKind(entry.block_type);

  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view');
  const [editType,  setEditType]  = useState<string>(entry.block_type);
  const [editStart, setEditStart] = useState(entry.start_date);
  const [editEnd,   setEditEnd]   = useState(entry.end_date);

  // Smart positioning — prefer right of click, flip if near edge
  const POPUP_W = 296;
  const flipX   = x + POPUP_W + 20 > window.innerWidth;
  const left    = flipX ? x - POPUP_W - 8 : x + 8;
  const top     = Math.min(Math.max(y - 24, 60), window.innerHeight - 280);

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 36, padding: '0 10px',
    borderRadius: 8, border: `1px solid ${BORDER_SOFT}`,
    background: '#fafafa', fontSize: 13, color: TEXT_DARK,
    fontFamily: FONT, outline: 'none', boxSizing: 'border-box',
  };

  const saveDisabled = submitting || !editStart || !editEnd || editEnd < editStart;

  return (
    <div
      ref={popupRef}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', left, top, zIndex: 10000,
        background: 'white', borderRadius: 16,
        padding: '16px 18px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.07)',
        fontFamily: FONT, width: POPUP_W,
        animation: 'popupFadeIn 0.15s ease',
      }}
    >
      {/* ── Header: always shown ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          {/* Type badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: BADGE[kind].bg, borderRadius: 20,
            padding: '3px 10px', marginBottom: 6,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: CELL_TEXT_COLOR[kind], flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: BADGE[kind].color, letterSpacing: '0.2px' }}>
              {STATUS_LABEL[kind]}
            </span>
          </div>
          {/* Car info */}
          <div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT_DARK, lineHeight: 1.2 }}>
            {car.plate_number}
            <span style={{ fontWeight: 400, color: TEXT_MID, marginLeft: 5 }}>{car.model_name}</span>
          </div>
          {/* Customer for booked */}
          {entry.customer_name && (
            <div style={{ fontSize: 13, color: TEXT_MID, marginTop: 3 }}>{entry.customer_name}</div>
          )}
        </div>
        {/* Close */}
        <button
          onClick={onDismiss}
          style={{
            width: 26, height: 26, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: '#f5f5f5', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: TEXT_MID,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#ebebeb'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5'; }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: BORDER_SOFT, marginBottom: 12 }} />

      {/* ── VIEW mode ────────────────────────────────────────────── */}
      {mode === 'view' && (
        <>
          {/* Date range */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: TEXT_MID }}>From</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: TEXT_DARK }}>{formatDateShort(entry.start_date)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: TEXT_MID }}>To</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: TEXT_DARK }}>{formatDateShort(entry.end_date)}</span>
            </div>
          </div>

          {/* Booked → read-only note */}
          {!isEditable && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: '#f8fafc', borderRadius: 8, padding: '9px 11px',
              fontSize: 12, color: TEXT_MID, lineHeight: 1.4,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: BRAND_BLUE }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Manage this booking from the Bookings page
            </div>
          )}

          {/* Editable → Edit + Delete */}
          {isEditable && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setMode('edit')}
                style={{
                  flex: 1, height: 36, borderRadius: 10, border: `1px solid ${BORDER_SOFT}`,
                  background: 'white', color: TEXT_DARK, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 6, transition: 'background 0.15s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f7'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white'; }}
              >
                <span>✏️</span> Edit
              </button>
              <button
                onClick={() => setMode('confirm-delete')}
                style={{
                  flex: 1, height: 36, borderRadius: 10, border: 'none',
                  background: '#fff5f5', color: '#dc2626', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 6, transition: 'background 0.15s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fee2e2'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff5f5'; }}
              >
                <span>🗑️</span> Delete
              </button>
            </div>
          )}
        </>
      )}

      {/* ── EDIT mode ────────────────────────────────────────────── */}
      {mode === 'edit' && (
        <>
          {/* Block type */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: TEXT_MID, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Type
            </label>
            <select
              value={editType}
              onChange={e => setEditType(e.target.value)}
              style={{
                ...inputStyle,
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23aaaaaa' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' fill='none'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
                paddingRight: 28, cursor: 'pointer',
              }}
            >
              {BLOCK_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.emoji} {o.label}</option>
              ))}
            </select>
          </div>

          {/* Start date */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: TEXT_MID, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Start date
            </label>
            <input
              type="date"
              value={editStart}
              onChange={e => setEditStart(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* End date */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: TEXT_MID, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              End date
            </label>
            <input
              type="date"
              value={editEnd}
              min={editStart}
              onChange={e => setEditEnd(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setMode('view')}
              disabled={submitting}
              style={{
                flex: 1, height: 36, borderRadius: 10, border: `1px solid ${BORDER_SOFT}`,
                background: 'white', color: TEXT_DARK, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: FONT, transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f7'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white'; }}
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(entry.id, { block_type: editType, start_date: editStart, end_date: editEnd })}
              disabled={saveDisabled}
              style={{
                flex: 1, height: 36, borderRadius: 10, border: 'none',
                background: saveDisabled ? '#e5e7eb' : BRAND_BLUE,
                color: saveDisabled ? TEXT_LIGHT : 'white',
                fontSize: 13, fontWeight: 600,
                cursor: saveDisabled ? 'not-allowed' : 'pointer',
                fontFamily: FONT, transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={e => { if (!saveDisabled) (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}

      {/* ── CONFIRM DELETE mode ───────────────────────────────────── */}
      {mode === 'confirm-delete' && (
        <>
          <div style={{
            background: '#fff5f5', borderRadius: 10, padding: '12px 14px',
            marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 9v4M12 17h.01" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', marginBottom: 3 }}>Delete this block?</div>
              <div style={{ fontSize: 12, color: '#b91c1c', lineHeight: 1.4 }}>
                {STATUS_LABEL[kind]} · {formatDateShort(entry.start_date)} → {formatDateShort(entry.end_date)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setMode('view')}
              disabled={submitting}
              style={{
                flex: 1, height: 36, borderRadius: 10, border: `1px solid ${BORDER_SOFT}`,
                background: 'white', color: TEXT_DARK, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: FONT, transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f7'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white'; }}
            >
              Cancel
            </button>
            <button
              onClick={() => onDelete(entry.id)}
              disabled={submitting}
              style={{
                flex: 1, height: 36, borderRadius: 10, border: 'none',
                background: submitting ? '#e5e7eb' : '#dc2626',
                color: submitting ? TEXT_LIGHT : 'white',
                fontSize: 13, fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: FONT, transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={e => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            >
              {submitting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── CalendarPage ─────────────────────────────────────────────────────────────

const CalendarPage: React.FC = () => {
  const navigate = useNavigate();

  // ── State ───────────────────────────────────────────────────────────────
  const [currentMonth, setCurrentMonth] = useState<Date>(
    () => new Date(TODAY.getFullYear(), TODAY.getMonth(), 1)
  );
  const [allCars, setAllCars]           = useState<CalendarCar[]>([]);
  const [calendarMap, setCalendarMap]   = useState<Map<number, CalendarEntry[]>>(new Map());
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<CalendarStatus | 'all'>('all');
  const [tooltip, setTooltip]           = useState<TooltipState | null>(null);

  // ── Click-based selection state ─────────────────────────────────────────
  const [selCarId, setSelCarId] = useState<number | null>(null);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd]     = useState<number | null>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]           = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const actionMenuRef               = useRef<HTMLDivElement>(null);

  // ── Block popup (click-to-edit existing blocks) ──────────────────────────
  const [blockPopup, setBlockPopup]   = useState<BlockPopupState | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);
  const blockPopupRef                 = useRef<HTMLDivElement>(null);

  const year        = currentMonth.getFullYear();
  const month       = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);

  const isCurrentMonth = TODAY.getFullYear() === year && TODAY.getMonth() === month;
  const todayDay       = isCurrentMonth ? TODAY.getDate() : -1;

  const dayMeta = useMemo(() =>
    Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const d   = new Date(year, month, day);
      const dow = d.getDay();
      return {
        day,
        isWeekend: dow === 0 || dow === 6,
        abbr: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
      };
    }),
    [year, month, daysInMonth]
  );

  // ── Data fetching ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTooltip(null);
    setActionMenu(null);
    setSelCarId(null);
    setSelStart(null);
    setSelEnd(null);
    setHoverDay(null);

    const pad        = (n: number) => String(n).padStart(2, '0');
    const monthStart = `${year}-${pad(month + 1)}-01`;
    const monthEnd   = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;

    const [carsRes, availRes, calRes] = await Promise.all([
      supabase.from('cars').select('id, plate_number, model_group(name, image_url)').eq('is_active', true).order('plate_number'),
      supabase.from('car_availability').select('id, status'),
      supabase.from('car_calendar')
        .select('id, car_id, start_date, end_date, block_type, booking_id')
        .lte('start_date', monthEnd)
        .gte('end_date', monthStart),
    ]);

    if (carsRes.error || availRes.error || calRes.error) {
      setError(carsRes.error?.message ?? availRes.error?.message ?? calRes.error?.message ?? 'Failed to load data');
      setLoading(false);
      return;
    }

    const statusById = new Map<number, CalendarStatus>();
    for (const row of (availRes.data ?? []) as AvailabilityRaw[]) {
      statusById.set(row.id, row.status);
    }

    const mappedCars: CalendarCar[] = (carsRes.data as CarRaw[])
      .map(row => {
        const mg = resolveModelGroup(row.model_group);
        return { id: row.id, plate_number: row.plate_number, model_name: mg.name, image_url: mg.image_url, car_status: statusById.get(row.id) ?? 'working' };
      })
      .sort((a, b) => a.model_name.localeCompare(b.model_name));

    const calRows    = (calRes.data ?? []) as CarCalendarRaw[];
    const bookingIds = Array.from(new Set(calRows.map(r => r.booking_id).filter((id): id is number => id !== null)));

    const customerByBookingId = new Map<number, string>();
    if (bookingIds.length > 0) {
      const bookRes = await supabase.from('bookings').select('id, customers(first_name, last_name)').in('id', bookingIds);
      if (!bookRes.error) {
        for (const b of (bookRes.data ?? []) as BookingCustomerRaw[]) {
          const c = resolveCustomer(b.customers);
          customerByBookingId.set(b.id, `${c.first_name} ${c.last_name}`.trim());
        }
      }
    }

    const calMap = new Map<number, CalendarEntry[]>();
    for (const row of calRows) {
      const entry: CalendarEntry = {
        id: row.id, car_id: row.car_id,
        start_date: row.start_date.slice(0, 10),
        end_date: row.end_date.slice(0, 10),
        block_type: row.block_type, booking_id: row.booking_id,
        customer_name: row.booking_id !== null ? (customerByBookingId.get(row.booking_id) ?? null) : null,
      };
      const list = calMap.get(row.car_id);
      if (list) list.push(entry);
      else calMap.set(row.car_id, [entry]);
    }

    setAllCars(mappedCars);
    setCalendarMap(calMap);
    setLoading(false);
  }, [year, month, daysInMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Outside-click dismisses action menu + resets selection ──────────────
  useEffect(() => {
    if (!actionMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setActionMenu(null);
        setSelCarId(null);
        setSelStart(null);
        setSelEnd(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [actionMenu]);

  // ── Outside-click dismisses block popup ─────────────────────────────────
  useEffect(() => {
    if (!blockPopup) return;
    const handleClick = (e: MouseEvent) => {
      if (blockPopupRef.current && !blockPopupRef.current.contains(e.target as Node)) {
        setBlockPopup(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [blockPopup]);

  // ── Block save (update) ──────────────────────────────────────────────────
  const handleBlockSave = useCallback(async (
    id: number,
    data: { block_type: string; start_date: string; end_date: string },
  ) => {
    setBlockSaving(true);
    const { error: updateError } = await supabase
      .from('car_calendar')
      .update({ block_type: data.block_type, start_date: data.start_date, end_date: data.end_date })
      .eq('id', id);
    setBlockSaving(false);
    if (updateError) {
      setToast({ message: `Failed to update: ${updateError.message}`, type: 'error' });
    } else {
      setBlockPopup(null);
      setToast({ message: 'Block updated', type: 'success' });
      loadData();
    }
  }, [loadData]);

  // ── Block delete ─────────────────────────────────────────────────────────
  const handleBlockDelete = useCallback(async (id: number) => {
    setBlockSaving(true);
    const { error: deleteError } = await supabase
      .from('car_calendar')
      .delete()
      .eq('id', id);
    setBlockSaving(false);
    if (deleteError) {
      setToast({ message: `Failed to delete: ${deleteError.message}`, type: 'error' });
    } else {
      setBlockPopup(null);
      setToast({ message: 'Block deleted', type: 'success' });
      loadData();
    }
  }, [loadData]);

  // ── Toast auto-dismiss ───────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Filtered cars ────────────────────────────────────────────────────────
  const filteredCars = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCars.filter(car => {
      const matchSearch = !q || car.plate_number.toLowerCase().includes(q) || car.model_name.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || car.car_status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [allCars, search, statusFilter]);

  const handleHover = useCallback((entry: CalendarEntry | null, e: React.MouseEvent) => {
    setTooltip(entry ? { entry, x: e.clientX, y: e.clientY } : null);
  }, []);

  // ── Click handler for day cells ─────────────────────────────────────────
  const handleDayClick = useCallback((carId: number, day: number) => {
    // Clicking a different car row → reset and start fresh on new car
    if (selCarId !== carId) {
      setSelCarId(carId);
      setSelStart(day);
      setSelEnd(null);
      setActionMenu(null);
      return;
    }
    // No start yet
    if (selStart === null) {
      setSelStart(day);
      return;
    }
    // Clicked the same day as start → cancel selection
    if (day === selStart) {
      setSelCarId(null);
      setSelStart(null);
      setSelEnd(null);
      return;
    }
    // Clicked before start → make this the new start
    if (day < selStart) {
      setSelStart(day);
      setSelEnd(null);
      return;
    }
    // Valid end → confirm range and show action menu
    setSelEnd(day);
    const car = allCars.find(c => c.id === carId);
    if (car) {
      setActionMenu({ car, startDay: selStart, endDay: day });
    }
  }, [selCarId, selStart, allCars]);

  // ── Selection range for a given car ─────────────────────────────────────
  const getSelectionRange = useCallback((carId: number) => {
    if (selCarId !== carId) return null;
    if (selStart === null) return null;
    // After confirmation keep showing via actionMenu
    if (actionMenu && actionMenu.car.id === carId) {
      return { min: actionMenu.startDay, max: actionMenu.endDay, pending: false };
    }
    const previewEnd = selEnd ?? (hoverDay !== null && hoverDay > selStart ? hoverDay : selStart);
    return {
      min: Math.min(selStart, previewEnd),
      max: Math.max(selStart, previewEnd),
      pending: selEnd === null,
    };
  }, [selCarId, selStart, selEnd, hoverDay, actionMenu]);

  const isAwaitingEnd = selStart !== null && selEnd === null;

  // ── Action handlers ──────────────────────────────────────────────────────
  const handleBooking = useCallback(() => {
    if (!actionMenu) return;
    const { car, startDay, endDay } = actionMenu;
    const startDate = `${year}-${padTwo(month + 1)}-${padTwo(startDay)}`;
    const endDate   = `${year}-${padTwo(month + 1)}-${padTwo(endDay)}`;
    navigate(`/dashboard/bookings?car_id=${car.id}&start_date=${startDate}&end_date=${endDate}`);
    setActionMenu(null);
    setSelCarId(null); setSelStart(null); setSelEnd(null);
  }, [actionMenu, year, month, navigate]);

  const handleBlock = useCallback(async (blockType: 'maintenance' | 'selling' | 'replacement') => {
    if (!actionMenu) return;
    setSubmitting(true);
    const { car, startDay, endDay } = actionMenu;
    const startDate = `${year}-${padTwo(month + 1)}-${padTwo(startDay)}`;
    const endDate   = `${year}-${padTwo(month + 1)}-${padTwo(endDay)}`;

    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from('car_calendar').insert({
      car_id:     car.id,
      start_date: startDate,
      end_date:   endDate,
      block_type: blockType,
      created_by: user?.id ?? null,
      booking_id: null,
    });

    setSubmitting(false);

    if (insertError) {
      setToast({ message: `Failed to save: ${insertError.message}`, type: 'error' });
    } else {
      setActionMenu(null);
      setSelCarId(null); setSelStart(null); setSelEnd(null);
      setToast({ message: `${blockType.charAt(0).toUpperCase() + blockType.slice(1)} block added`, type: 'success' });
      loadData();
    }
  }, [actionMenu, year, month, loadData]);

  const gridCols = `${LEFT_W}px repeat(${daysInMonth}, ${COL_W}px)`;
  const gridMinW = LEFT_W + COL_W * daysInMonth;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'white',
      fontFamily: FONT,
      color: TEXT_DARK,
    }}>

      <style>{`
        @keyframes ttFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes calSpin { to { transform: rotate(360deg); } }
        @keyframes menuSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes popupFadeIn {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ padding: '32px 32px 20px', flexShrink: 0, background: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            Fleet Calendar
          </span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', margin: '0 0 6px', lineHeight: 1.1 }}>
          Fleet Calendar
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5, margin: 0 }}>
          {allCars.length} vehicle{allCars.length !== 1 ? 's' : ''} · {formatMonthLabel(currentMonth)}
        </p>
      </div>

      {/* ── Controls bar ─────────────────────────────────────────────────── */}
      <div style={{
        height: 56,
        flexShrink: 0,
        borderTop: `1px solid ${BORDER_SOFT}`,
        borderBottom: `1px solid ${BORDER_SOFT}`,
        background: 'white',
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        position: 'relative',
      }}>

        <div style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <button
            onClick={() => setCurrentMonth(m => addMonths(m, -1))}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              border: `1px solid ${BORDER_SOFT}`,
              background: 'white',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: TEXT_DARK,
              transition: 'background 0.15s ease, border-color 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f7';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#dddddd';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'white';
              (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER_SOFT;
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <span style={{
            fontSize: 18, fontWeight: 700, color: TEXT_DARK,
            minWidth: 168, textAlign: 'center', letterSpacing: '-0.4px',
            userSelect: 'none',
          }}>
            {formatMonthLabel(currentMonth)}
          </span>

          <button
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              border: `1px solid ${BORDER_SOFT}`,
              background: 'white',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: TEXT_DARK,
              transition: 'background 0.15s ease, border-color 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f7';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#dddddd';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'white';
              (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER_SOFT;
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {!isCurrentMonth && (
            <button
              onClick={() => setCurrentMonth(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))}
              style={{
                height: 34, padding: '0 18px',
                borderRadius: 20, border: 'none',
                background: AIRBNB_RED, color: 'white',
                fontSize: 13.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: FONT,
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            >
              Today
            </button>
          )}
        </div>

        {/* Right: search + filter */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{
              position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: TEXT_LIGHT,
            }}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                paddingLeft: 36, paddingRight: 16, height: 38,
                borderRadius: 24, border: 'none',
                background: '#f7f7f7', fontSize: 13.5, color: TEXT_DARK,
                outline: 'none', width: 168, fontFamily: FONT,
                transition: 'box-shadow 0.15s ease',
              }}
              onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 2px ${AIRBNB_RED}50`; }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as CalendarStatus | 'all')}
            style={{
              height: 38, paddingLeft: 16, paddingRight: 34,
              borderRadius: 24, border: 'none',
              background: '#f7f7f7', fontSize: 13.5, color: TEXT_DARK,
              cursor: 'pointer', outline: 'none', fontFamily: FONT,
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23aaaaaa' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' fill='none'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
            }}
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Legend bar ────────────────────────────────────────────────────── */}
      <div style={{
        height: 44,
        flexShrink: 0,
        borderBottom: `1px solid ${BORDER_SOFT}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        gap: 24,
        background: 'white',
      }}>
        {LEGEND_KINDS.map(kind => (
          <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 11, height: 11, borderRadius: '50%',
              background: LEGEND_DOT[kind], flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: TEXT_MID }}>{STATUS_LABEL[kind]}</span>
          </div>
        ))}
      </div>

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            border: `2.5px solid #f0f0f0`,
            borderTop: `2.5px solid ${AIRBNB_RED}`,
            animation: 'calSpin 0.75s linear infinite',
          }} />
          <span style={{ fontSize: 14, color: TEXT_MID, letterSpacing: '-0.1px' }}>Loading calendar…</span>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && !loading && (
        <div style={{
          margin: '24px 32px 0',
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#fff5f5', borderRadius: 12,
          border: '1px solid #fecdd3',
          padding: '14px 18px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
            <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 14, color: '#b91c1c', flex: 1 }}>{error}</span>
          <button
            onClick={loadData}
            style={{
              background: AIRBNB_RED, color: 'white', border: 'none',
              borderRadius: 20, padding: '7px 18px', fontSize: 13,
              fontWeight: 600, cursor: 'pointer', fontFamily: FONT, flexShrink: 0,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Calendar grid ─────────────────────────────────────────────────── */}
      {!loading && !error && (
        <div style={{ flex: 1, overflow: 'auto', marginTop: 24 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            gridAutoRows: ROW_H,
            minWidth: gridMinW,
            userSelect: 'none',
          }}>

            {/* ── Header row ─────────────────────────────────────────────── */}

            <div style={{
              position: 'sticky', top: 0, left: 0, zIndex: 20,
              background: 'white',
              borderBottom: `1px solid ${BORDER_SOFT}`,
              display: 'flex', alignItems: 'center',
              padding: '0 20px',
            }}>
              <span style={{
                fontSize: 11, fontWeight: 600, color: TEXT_LIGHT,
                letterSpacing: '0.6px', textTransform: 'uppercase',
              }}>
                {filteredCars.length} car{filteredCars.length !== 1 ? 's' : ''}
              </span>
            </div>

            {dayMeta.map(({ day, abbr, isWeekend }) => {
              const isToday = day === todayDay;
              return (
                <div
                  key={`h-${day}`}
                  style={{
                    position: 'sticky', top: 0, zIndex: 10,
                    background: 'white',
                    borderBottom: `1px solid ${BORDER_SOFT}`,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 3,
                  }}
                >
                  <span style={{
                    fontSize: 10, fontWeight: 500,
                    color: TEXT_LIGHT, letterSpacing: '0.3px',
                    textTransform: 'uppercase', lineHeight: 1,
                  }}>
                    {abbr}
                  </span>

                  {isToday ? (
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: AIRBNB_RED,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: 'white',
                        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                      }}>
                        {day}
                      </span>
                    </div>
                  ) : (
                    <span style={{
                      fontSize: 14, fontWeight: 600,
                      color: isWeekend ? '#cccccc' : TEXT_DARK,
                      lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    }}>
                      {day}
                    </span>
                  )}
                </div>
              );
            })}

            {/* ── Car rows ───────────────────────────────────────────────── */}

            {filteredCars.length === 0 && (
              <div style={{
                gridColumn: '1 / -1',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '80px 20px', gap: 8,
              }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: TEXT_DARK }}>No vehicles found</div>
                <div style={{ fontSize: 13, color: TEXT_MID }}>Try adjusting your search or filter.</div>
              </div>
            )}

            {filteredCars.map((car, rowIdx) => {
              const rowBg  = rowIdx % 2 === 0 ? 'white' : '#fafafa';
              const status = car.car_status;
              const selRange = getSelectionRange(car.id);

              return (
                <React.Fragment key={car.id}>

                  {/* Left panel */}
                  <div style={{
                    position: 'sticky', left: 0, zIndex: 5,
                    background: rowBg,
                    borderRight: `1px solid ${BORDER_SOFT}`,
                    display: 'flex', flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '0 20px',
                    width: LEFT_W,
                    gap: 2,
                  }}>
                    <div style={{
                      fontSize: 15, fontWeight: 700, color: TEXT_DARK, lineHeight: 1.2,
                    }}>
                      {car.plate_number || '—'}
                    </div>
                    <div style={{
                      fontSize: 13, color: TEXT_MID, lineHeight: 1.2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {car.model_name}
                    </div>
                    <div style={{
                      marginTop: 5,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: BADGE[status].bg, borderRadius: 20,
                      padding: '2px 8px', alignSelf: 'flex-start',
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: BADGE[status].color, flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 11, fontWeight: 500, color: BADGE[status].color,
                        whiteSpace: 'nowrap', lineHeight: 1.4,
                      }}>
                        {STATUS_LABEL[status]}
                      </span>
                    </div>
                  </div>

                  {/* Day cells */}
                  {dayMeta.map(({ day, isWeekend }) => {
                    const isToday    = day === todayDay;
                    const dayStr     = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const entries    = calendarMap.get(car.id) ?? [];
                    const calEntry   = entries.find(e => e.start_date.slice(0, 10) <= dayStr && dayStr <= e.end_date.slice(0, 10)) ?? null;
                    const kind       = calEntry ? blockTypeToKind(calEntry.block_type) : status;

                    const isSelected  = selRange ? day >= selRange.min && day <= selRange.max : false;
                    const isSelStart  = selRange ? day === selRange.min : false;
                    const isSelEnd    = selRange ? day === selRange.max : false;
                    const isPending   = selRange?.pending ?? false;

                    // Solid blue endpoint vs light fill for in-between
                    const selEndpointAlpha = isPending ? 0.55 : 0.8;
                    const selMidAlpha      = isPending ? 0.06 : 0.12;

                    const circleBg = calEntry
                      ? CELL_FILL[kind]
                      : isToday
                        ? '#fff1f2'
                        : '#fecaca';

                    const circleColor = calEntry
                      ? CELL_TEXT_COLOR[kind]
                      : isToday
                        ? AIRBNB_RED
                        : '#dc2626';

                    // Cursor: pointer when a selection is in progress or on existing entries
                    const cellCursor = calEntry
                      ? 'pointer'
                      : isAwaitingEnd && selCarId === car.id
                        ? (day > selStart! ? 'pointer' : 'not-allowed')
                        : 'pointer';

                    return (
                      <div
                        key={`${car.id}-${day}`}
                        style={{
                          background: isSelected ? `rgba(75, 166, 234, ${selMidAlpha})` : rowBg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: cellCursor,
                          position: 'relative',
                        }}
                        onClick={e => {
                          if (calEntry) {
                            setTooltip(null);
                            setBlockPopup({ entry: calEntry, car, x: e.clientX, y: e.clientY });
                            return;
                          }
                          setTooltip(null);
                          handleDayClick(car.id, day);
                        }}
                        onMouseEnter={e => {
                          if (isAwaitingEnd && selCarId === car.id) {
                            setHoverDay(day);
                          }
                          if (calEntry) handleHover(calEntry, e);
                        }}
                        onMouseLeave={e => {
                          if (isAwaitingEnd) setHoverDay(null);
                          if (calEntry) handleHover(null, e);
                        }}
                        onMouseMove={e => {
                          if (calEntry) handleHover(calEntry, e);
                        }}
                      >
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: isSelected && (isSelStart || isSelEnd)
                            ? `rgba(75, 166, 234, ${selEndpointAlpha})`
                            : isSelected
                              ? 'transparent'
                              : circleBg,
                          border: isSelected && (isSelStart || isSelEnd)
                            ? `1.5px solid rgba(75, 166, 234, 0.8)`
                            : undefined,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 0.1s ease',
                        }}>
                          <span style={{
                            fontSize: 13,
                            fontWeight: isSelected && (isSelStart || isSelEnd) ? 700 : calEntry ? 600 : isToday ? 700 : 400,
                            color: isSelected ? (isSelStart || isSelEnd ? 'white' : BRAND_BLUE) : circleColor,
                            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                            userSelect: 'none',
                          }}>
                            {day}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                </React.Fragment>
              );
            })}

          </div>
        </div>
      )}

      {tooltip && !blockPopup && <Tooltip state={tooltip} />}

      {blockPopup && (
        <BlockPopup
          state={blockPopup}
          popupRef={blockPopupRef}
          submitting={blockSaving}
          onSave={handleBlockSave}
          onDelete={handleBlockDelete}
          onDismiss={() => setBlockPopup(null)}
        />
      )}

      {actionMenu && (
        <SelectionActionMenu
          state={actionMenu}
          year={year}
          month={month}
          menuRef={actionMenuRef}
          submitting={submitting}
          onBooking={handleBooking}
          onBlock={handleBlock}
          onDismiss={() => setActionMenu(null)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};

export default CalendarPage;
