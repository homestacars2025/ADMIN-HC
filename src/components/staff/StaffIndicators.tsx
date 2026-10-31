import React, { useEffect, useState } from 'react';
import { STATUS_COLORS, fetchGoalsOverview, type StaffGoals } from '../../lib/goals';
import { currentMonth } from '../../lib/payroll';
import { GoalRing } from '../../pages/goals/GoalRing';

export interface StaffIndicatorMap {
  byProfile: Record<string, StaffGoals>;
  loading: boolean;
  failed: boolean;
}

/** Every employee's indicators for this month, in one request rather than one per row. */
export function useStaffIndicators(): StaffIndicatorMap {
  const [state, setState] = useState<StaffIndicatorMap>({ byProfile: {}, loading: true, failed: false });

  useEffect(() => {
    let cancelled = false;
    fetchGoalsOverview(currentMonth())
      .then((rows) => {
        if (cancelled) return;
        setState({ byProfile: Object.fromEntries(rows.map((row) => [row.profile_id, row])), loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ byProfile: {}, loading: false, failed: true });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

export const StaffIndicatorCell: React.FC<{ goals: StaffGoals | undefined; indicators: StaffIndicatorMap }> = ({ goals, indicators }) => {
  if (indicators.loading) return <span style={{ fontSize: 12, color: '#9ca3af' }}>…</span>;
  if (indicators.failed) return <span title="Couldn't load indicators" style={{ fontSize: 12, color: '#9ca3af' }}>—</span>;
  if (!goals?.metrics.length) return <span style={{ fontSize: 12, color: '#9ca3af' }}>No goals</span>;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {goals.metrics.map((goal) => (
        <GoalRing key={goal.metric_key} goal={goal} size={26} strokeWidth={3.5} showValue={false} />
      ))}
      {goals.all_green && (
        <span style={{
          marginInlineStart: 4, height: 22, padding: '0 8px', borderRadius: 999, display: 'inline-flex',
          alignItems: 'center', fontSize: 11, fontWeight: 500, color: '#fff', background: STATUS_COLORS.green, whiteSpace: 'nowrap',
        }}>
          All green
        </span>
      )}
    </span>
  );
};
