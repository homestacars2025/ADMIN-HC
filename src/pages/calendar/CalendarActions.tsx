import React, { useState } from 'react';
import { FLEET_STATUS, type FleetStatus } from '../../lib/fleetStatus';

/**
 * The calendar's two editing popups, unchanged in what they do: a picked range of
 * days offers a booking or a block, and a block opens to be edited or deleted. A
 * booking is edited on the Bookings page.
 */

export type EditableBlockType = 'maintenance' | 'selling' | 'replacement';
const EDITABLE_TYPES: EditableBlockType[] = ['maintenance', 'selling', 'replacement'];

export interface ActionMenuState { car: { id: number; plate_number: string; model_name: string }; startDay: number; endDay: number; }
export interface BlockEntry { id: number; block_type: string; start_date: string; end_date: string; booking_id: number | null; customer_name: string | null; }
export interface BlockPopupState { entry: BlockEntry; car: { plate_number: string; model_name: string }; x: number; y: number; }

const BRAND_BLUE  = '#4ba6ea';
const TEXT_DARK   = '#222222';
const TEXT_MID    = '#717171';
const TEXT_LIGHT  = '#aaaaaa';
const BORDER_SOFT = '#f0f0f0';
const FONT        = 'var(--font-sans)';

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

const tokenOf = (blockType: string) => FLEET_STATUS[(['maintenance', 'selling', 'replacement'].includes(blockType) ? blockType : 'booked') as FleetStatus];

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

export const SelectionActionMenu: React.FC<SelectionActionMenuProps> = ({
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
          <div style={{ fontSize: 15, fontWeight: 600, color: TEXT_DARK, lineHeight: 1.2 }}>
            <span className="font-mono tabular-nums">{car.plate_number}</span>
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

export const BlockPopup: React.FC<BlockPopupProps> = ({
  state, popupRef, submitting, onSave, onDelete, onDismiss,
}) => {
  const { entry, car, x, y } = state;
  const isEditable = entry.booking_id === null && (EDITABLE_TYPES as string[]).includes(entry.block_type);
  const token = tokenOf(entry.block_type);

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
            background: token.to, borderRadius: 20,
            padding: '3px 10px', marginBottom: 6,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: token.chip, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: token.ink, letterSpacing: '0.2px' }}>
              {token.label}
            </span>
          </div>
          {/* Car info */}
          <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT_DARK, lineHeight: 1.2 }}>
            <span className="font-mono tabular-nums">{car.plate_number}</span>
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
              border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 7,
              background: 'var(--surface)', borderRadius: 8, padding: '9px 11px',
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
                {token.label} · {formatDateShort(entry.start_date)} → {formatDateShort(entry.end_date)}
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
