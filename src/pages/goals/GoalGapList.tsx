import React from 'react';
import { missingLabel, type GoalGap } from '../../lib/goals';

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export const GoalGapList: React.FC<{ gaps: GoalGap[]; labelOf: (metricKey: string) => string }> = ({ gaps, labelOf }) => {
  if (gaps.length === 0) return <p className="py-6 text-center text-[13px] text-black/40">Nothing missing</p>;

  return (
    <ul>
      {gaps.map((gap) => (
        <li key={`${gap.ref_type}-${gap.ref_id}-${gap.metric_key}`} className="border-b border-subtle py-2.5 last:border-b-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12.5px]">
            <span className="text-black/55">{formatDate(gap.ref_date)}</span>
            {gap.plate && <span className="font-mono font-medium tabular-nums text-foreground">{gap.plate}</span>}
            <span className="text-black/40">{labelOf(gap.metric_key)}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {gap.missing.map((item) => (
              <span key={item} className="inline-flex h-5 items-center rounded-full bg-red-500/10 px-2 text-[11px] font-medium text-red-600">
                {missingLabel(item)}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
};
