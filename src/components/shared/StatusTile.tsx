import React from 'react';
import { cn } from '../../lib/media/badgeColor';
import { Check } from '../media/MediaIcons';

/** A big stat that is also a filter: colored top bar, a 3D sticker over the corner, then the number. */
export const StatusTile: React.FC<{
  accent: string;
  art: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  /** A share of the whole, with the tint behind it. */
  pct?: { value: number; tint: string } | null;
  active: boolean;
  onClick: () => void;
}> = ({ accent, art, label, value, sub, pct, active, onClick }) => (
  <button
    type="button"
    aria-pressed={active}
    aria-label={`${label}: ${value}, ${sub}`}
    onClick={onClick}
    className={cn('status-tile', active && 'is-active')}
    style={{ '--tile-accent': accent, '--tile-chip': accent, '--chars': value.length } as React.CSSProperties}
  >
    <span aria-hidden="true" className="status-tile-bar" />
    <span aria-hidden="true" className="status-tile-art">{art}</span>
    {active && <span aria-hidden="true" className="filter-tile-check"><Check size={11} strokeWidth={3} /></span>}
    <span className="status-tile-body">
      <span className="status-tile-top">
        {pct && !active && <span className="status-tile-pct" style={{ color: accent, background: pct.tint }}>{pct.value}%</span>}
      </span>
      <span className="status-tile-value">{value}</span>
      <span className="status-tile-label">{label}</span>
      <span className="status-tile-sub">{sub}</span>
    </span>
  </button>
);
