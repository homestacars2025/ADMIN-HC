import React from 'react';
import { cn } from '../../lib/media/badgeColor';
import type { TaskStats } from '../../lib/tasks';

const WIDTH = 96;
const HEIGHT = 30;

const Sparkline: React.FC<{ points: number[]; color: string }> = ({ points, color }) => {
  const max = Math.max(...points, 1);
  const step = WIDTH / Math.max(points.length - 1, 1);
  const line = points
    .map((value, index) => `${(index * step).toFixed(1)},${(HEIGHT - 3 - (value / max) * (HEIGHT - 6)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true" className="shrink-0">
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const StatTiles: React.FC<{ stats: TaskStats | null }> = ({ stats }) => {
  const tiles = stats ? [
    { label: 'Open', value: stats.open, trend: stats.trends.open, color: '#3A74C2' },
    { label: 'Overdue', value: stats.overdue, trend: stats.trends.overdue, color: '#DC2626' },
    { label: 'Done this week', value: stats.doneThisWeek, trend: stats.trends.done, color: '#16A34A' },
    { label: 'Missed this month', value: stats.missedThisMonth, trend: stats.trends.missed, color: '#F59E0B' },
  ] : [];

  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-black/[0.04]" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className={cn('flex min-w-0 items-end justify-between gap-2 rounded-2xl border border-subtle bg-surface p-4')}>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] text-black/50">{tile.label}</div>
            <div className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">{tile.value}</div>
          </div>
          <div className="hidden sm:block"><Sparkline points={tile.trend} color={tile.color} /></div>
        </div>
      ))}
    </div>
  );
};
