import React from 'react';
import { Check } from '../../components/media/MediaIcons';
import { cn } from '../../lib/media/badgeColor';

export type TileTone = 'blue' | 'teal' | 'red' | 'green' | 'violet' | 'amber' | 'neutral';

/** Tiles are the filters: a compact row on desktop, two to a row below that. */
export const FILTER_TILE_ROW = 'grid max-w-[900px] grid-cols-2 gap-3 lg:grid-cols-5';

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 28;

const Sparkline: React.FC<{ points: number[] }> = ({ points }) => {
  const low = Math.min(...points);
  const range = Math.max(...points) - low || 1;
  const step = SPARK_WIDTH / Math.max(points.length - 1, 1);
  const line = points.map((value, index) => (
    `${(index * step).toFixed(1)},${(SPARK_HEIGHT - 3 - ((value - low) / range) * (SPARK_HEIGHT - 6)).toFixed(1)}`
  ));
  return (
    <svg viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" className="mt-2 h-7 w-full">
      <polygon points={`0,${SPARK_HEIGHT} ${line.join(' ')} ${SPARK_WIDTH},${SPARK_HEIGHT}`} fill="var(--tile-chip)" opacity="0.14" />
      <polyline
        points={line.join(' ')}
        fill="none"
        stroke="var(--tile-chip)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

const Delta: React.FC<{ change: number; upIsBad?: boolean }> = ({ change, upIsBad }) => {
  const up = change >= 0;
  const good = upIsBad ? !up : up;
  return (
    <span
      title="Compared with last month"
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/60 px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums',
        good ? 'text-[#15803D]' : 'text-[#B91C1C]',
      )}
    >
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(change)}%
    </span>
  );
};

export interface PremiumTileProps {
  tone: TileTone;
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  change?: number | null;
  upIsBad?: boolean;
  spark?: number[];
  active?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  /** Below desktop this one lies flat across the row, for the odd tile out. */
  slim?: boolean;
  /** A smaller figure for a strip of six on the profile. */
  compact?: boolean;
}

export const PremiumTile: React.FC<PremiumTileProps> = ({
  tone,
  icon,
  label,
  value,
  hint,
  change,
  upIsBad,
  spark,
  active,
  onClick,
  ariaLabel,
  compact,
  slim,
}) => {
  const body = (
    <>
      {active && (
        <span aria-hidden="true" className="absolute end-2 top-2 grid h-5 w-5 place-items-center rounded-full text-white" style={{ background: 'var(--tile-chip)' }}>
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      <span className="flex items-center justify-between gap-2">
        <span
          className={cn('grid shrink-0 place-items-center rounded-[10px] text-white', compact ? 'h-7 w-7' : 'h-8 w-8')}
          style={{ background: 'var(--tile-chip)' }}
        >
          {icon}
        </span>
        {change !== null && change !== undefined && <Delta change={change} upIsBad={upIsBad} />}
      </span>
      <span className={cn('mt-2.5 block text-[12.5px] font-medium leading-snug opacity-80', slim && 'max-lg:mt-0 max-lg:flex-1')}>{label}</span>
      <span className={cn(
        'mt-1 block font-semibold leading-none tracking-[-0.02em] tabular-nums',
        compact ? 'truncate text-[17px] sm:text-[19px]' : 'text-[24px] sm:text-[28px]',
        slim && 'max-lg:mt-0 max-lg:me-7 max-lg:shrink-0',
      )}>
        {value}
      </span>
      {hint && <span className={cn('mt-1.5 block text-[12px] font-medium leading-snug tabular-nums opacity-75', compact && 'truncate', slim && 'max-lg:hidden')}>{hint}</span>}
      {spark && spark.length > 1 && <Sparkline points={spark} />}
    </>
  );

  const shape = cn(
    'tile-depth relative block min-w-0 rounded-[20px] text-left',
    compact ? 'p-3.5' : 'p-4',
    `tile-${tone}`,
    slim && 'max-lg:col-span-2 max-lg:flex max-lg:items-center max-lg:gap-2.5 max-lg:py-2.5',
  );

  if (!onClick) return <div className={shape}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        shape,
        'w-full transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40',
        active && 'outline outline-2 -outline-offset-2 outline-[var(--tile-chip)] saturate-[1.35]',
      )}
    >
      {body}
    </button>
  );
};

export const TileSkeleton: React.FC<{ count?: number; className?: string; compact?: boolean }> = ({ count = 4, className, compact }) => (
  <>
    {Array.from({ length: count }, (_, index) => (
      <div key={index} className={cn('animate-pulse rounded-[20px] bg-black/[0.04]', compact ? 'h-[128px]' : 'h-[176px]', className)} />
    ))}
  </>
);
