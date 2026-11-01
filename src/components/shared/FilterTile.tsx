import React from 'react';
import { cn } from '../../lib/media/badgeColor';
import { Check } from '../media/MediaIcons';

export type FilterTileTone = 'blue' | 'teal' | 'red' | 'green' | 'violet' | 'amber' | 'neutral';

/** Columns follow the room the page really has, which the sidebar changes. */
export const FilterTileRow: React.FC<{ label?: string; six?: boolean; children: React.ReactNode }> = ({ label, six, children }) => (
  <div className="filter-tiles-room">
    <div role={label ? 'group' : undefined} aria-label={label} className={cn('filter-tiles', six && 'is-six')}>{children}</div>
  </div>
);

/** A stat that is also a filter. See "Design Rules" in CLAUDE.md. */
export const FilterTile: React.FC<{
  tone: FilterTileTone;
  icon: React.ReactNode;
  /** For a 3D image, which brings its own shape and has no chip behind it. */
  bareIcon?: boolean;
  label: string;
  value: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}> = ({ tone, icon, bareIcon, label, value, sub, active, onClick }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn('filter-tile tile-depth', `tile-${tone}`, active && 'is-active')}
  >
    {active && (
      <span aria-hidden="true" className="filter-tile-check"><Check size={11} strokeWidth={3} /></span>
    )}
    <span className="filter-tile-head">
      <span aria-hidden="true" className={cn('filter-tile-icon', bareIcon && 'is-bare')}>{icon}</span>
      <span className="filter-tile-label">{label}</span>
    </span>
    <span className="filter-tile-bottom">
      <span className="filter-tile-value" style={{ '--chars': value.length } as React.CSSProperties}>{value}</span>
      <span className="filter-tile-sub">{sub}</span>
    </span>
  </button>
);

export const FilterTileSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <FilterTileRow>
    {Array.from({ length: count }, (_, index) => (
      <div key={index} className="filter-tile animate-pulse bg-black/[0.04]" />
    ))}
  </FilterTileRow>
);
