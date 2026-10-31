import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '../../components/media/MediaToast';
import { Sheet, SheetBody, SheetDescription, SheetHeader, SheetTitle } from '../../components/media/MediaUI';
import StaffAvatar from '../../components/shared/StaffAvatar';
import type { AvatarProfile } from '../../lib/staffAvatar';
import {
  STATUS_LABELS,
  buildTargetRows,
  fetchGoalGaps,
  fetchMonthlyTargets,
  goalSubline,
  saveMonthlyTarget,
  targetError,
  type DepartmentDefault,
  type GoalGap,
  type GoalMetric,
  type MonthlyTarget,
  type StaffGoals,
  type TargetRow,
} from '../../lib/goals';
import { cn } from '../../lib/media/badgeColor';
import { monthLabel } from '../../lib/payroll';
import { GoalGapList } from './GoalGapList';
import { GoalRing } from './GoalRing';
import { NumberCell } from './NumberCell';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export const GoalDrawer: React.FC<{
  staff: StaffGoals;
  avatar: AvatarProfile | undefined;
  departmentLabel: string;
  month: string;
  adminId: string;
  metrics: GoalMetric[];
  defaults: DepartmentDefault[];
  onClose: () => void;
  onChanged: () => void;
}> = ({ staff, avatar, departmentLabel, month, adminId, metrics, defaults, onClose, onChanged }) => {
  const [gaps, setGaps] = useState<GoalGap[] | null>(null);
  const [monthly, setMonthly] = useState<MonthlyTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setGaps(null);
    setMonthly(null);
    setError(null);
    Promise.all([fetchGoalGaps(month, staff.profile_id), fetchMonthlyTargets(month, staff.profile_id)])
      .then(([foundGaps, foundTargets]) => {
        if (cancelled) return;
        setGaps(foundGaps);
        setMonthly(foundTargets);
      })
      .catch((e: unknown) => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, [month, staff.profile_id]);

  const rows = useMemo(
    () => (monthly ? buildTargetRows(metrics, staff.department_key, defaults, monthly) : []),
    [metrics, defaults, monthly, staff.department_key],
  );

  const write = useCallback(async (row: TargetRow, target: number, isActive: boolean) => {
    setSaving(true);
    try {
      await saveMonthlyTarget({ profileId: staff.profile_id, month, metricKey: row.metric.key, target, isActive }, adminId);
      setMonthly(await fetchMonthlyTargets(month, staff.profile_id));
      onChanged();
    } catch (e) {
      toast.error(`Couldn't save: ${errorText(e)}`);
    } finally {
      setSaving(false);
    }
  }, [adminId, month, onChanged, staff.profile_id]);

  const commitTarget = (row: TargetRow, value: number | null) => {
    if (value === null) {
      toast.error('Enter a target, or turn this metric off.');
      return;
    }
    const problem = targetError(row.metric.kind, value);
    if (problem) {
      toast.error(problem);
      return;
    }
    write(row, value, row.active);
  };

  const visibleGaps = (gaps ?? []).filter((gap) => !focus || gap.metric_key === focus);
  const labelOf = (key: string) => metrics.find((metric) => metric.key === key)?.label_en ?? key;

  return (
    <Sheet open onClose={onClose} ariaLabel={`Goals for ${staff.full_name ?? 'employee'}`} maxWidthClass="sm:max-w-[600px]">
      <SheetHeader>
        <div className="flex items-center gap-3 pr-8">
          <StaffAvatar profile={avatar} size={44} />
          <div className="min-w-0">
            <SheetTitle>{staff.full_name ?? 'Unnamed employee'}</SheetTitle>
            <SheetDescription>{departmentLabel} · {monthLabel(month)}</SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <SheetBody>
        {staff.metrics.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-black/45">No goals apply this month.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {staff.metrics.map((goal) => (
              <button
                key={goal.metric_key}
                type="button"
                aria-pressed={focus === goal.metric_key}
                onClick={() => setFocus((current) => (current === goal.metric_key ? null : goal.metric_key))}
                className={cn(
                  'flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors',
                  focus === goal.metric_key ? 'border-brand-strong' : 'border-subtle hover:bg-black/[0.02]',
                )}
              >
                <GoalRing goal={goal} size={84} strokeWidth={8} />
                <span className="w-full text-[12px] font-medium leading-tight text-foreground">{goal.label_en}</span>
                <span className="font-mono text-[11px] tabular-nums text-black/45">{goalSubline(goal)}</span>
                <span className="text-[11px] text-black/45">{STATUS_LABELS[goal.status]}</span>
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-[13px] text-red-600">Couldn't load the details: {error}</p>}

        <section>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-[13.5px] font-medium text-foreground">
              What's missing{focus ? ` · ${labelOf(focus)}` : ''}
            </h3>
            {focus && (
              <button type="button" onClick={() => setFocus(null)} className="min-h-[32px] text-[12px] font-medium text-brand-strong">
                Show all
              </button>
            )}
          </div>
          {!gaps && !error ? (
            <div className="h-20 animate-pulse rounded-xl bg-black/[0.04]" />
          ) : (
            <GoalGapList gaps={visibleGaps} labelOf={labelOf} />
          )}
        </section>

        <section>
          <h3 className="mb-1 text-[13.5px] font-medium text-foreground">Targets for {monthLabel(month)}</h3>
          {!monthly && !error ? (
            <div className="h-20 animate-pulse rounded-xl bg-black/[0.04]" />
          ) : (
            <ul>
              {rows.map((row) => (
                <li key={row.metric.key} className="flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-1 border-b border-subtle py-2 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className={cn('text-[13px] text-foreground', !row.active && 'text-black/40 line-through')}>{row.metric.label_en}</div>
                    <div className="text-[11.5px] text-black/40">
                      {!row.active
                        ? 'Off this month'
                        : row.hasOverride
                          ? `Set for this month${row.defaultTarget !== null ? ` · department default ${row.defaultTarget}` : ''}`
                          : row.target !== null ? 'Department default' : 'No target'}
                    </div>
                  </div>
                  <NumberCell
                    value={row.target}
                    ariaLabel={`${row.metric.label_en} target`}
                    suffix={row.metric.kind === 'percent' ? '%' : undefined}
                    disabled={saving || !row.active}
                    onCommit={(value) => commitTarget(row, value)}
                  />
                  <button
                    type="button"
                    disabled={saving || row.target === null}
                    onClick={() => write(row, row.target as number, !row.active)}
                    className="min-h-[44px] whitespace-nowrap text-[12px] font-medium text-black/50 hover:text-foreground disabled:opacity-40 md:min-h-[32px]"
                  >
                    {row.active ? 'Turn off this metric' : 'Turn on'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </SheetBody>
    </Sheet>
  );
};
