import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchGoalGaps, fetchGoalProgress, goalSubline, STATUS_LABELS, type GoalGap, type GoalProgress } from '../../lib/goals';
import { cn } from '../../lib/media/badgeColor';
import { currentMonth, monthLabel, shiftMonth } from '../../lib/payroll';
import type { AvatarProfile } from '../../lib/staffAvatar';
import { fetchStaffMonthTasks, type StaffTaskCounts } from '../../lib/tasks';
import { GoalGapList } from '../../pages/goals/GoalGapList';
import { GoalRing } from '../../pages/goals/GoalRing';
import { Sheet, SheetBody, SheetDescription, SheetHeader, SheetTitle } from '../media/MediaUI';
import { MonthNav } from '../shared/MonthNav';
import StaffAvatar from '../shared/StaffAvatar';

interface StaffDetail {
  goals: GoalProgress[];
  gaps: GoalGap[];
  tasks: StaffTaskCounts;
}

export const StaffDetailDrawer: React.FC<{
  profileId: string;
  name: string;
  avatar: AvatarProfile;
  onClose: () => void;
}> = ({ profileId, name, avatar, onClose }) => {
  const [month, setMonth] = useState(currentMonth);
  const [detail, setDetail] = useState<StaffDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    Promise.all([fetchGoalProgress(month, profileId), fetchGoalGaps(month, profileId), fetchStaffMonthTasks(profileId, month)])
      .then(([goals, gaps, tasks]) => {
        if (!cancelled) setDetail({ goals, gaps, tasks });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this employee.');
      });
    return () => { cancelled = true; };
  }, [month, profileId]);

  const labelOf = (key: string) => detail?.goals.find((goal) => goal.metric_key === key)?.label_en ?? key;

  const taskTiles = detail ? [
    { label: 'Open', value: detail.tasks.open },
    { label: 'Done', value: detail.tasks.done },
    { label: 'Missed', value: detail.tasks.missed, alert: detail.tasks.missed > 0 },
    { label: 'Overdue', value: detail.tasks.overdue, alert: detail.tasks.overdue > 0 },
  ] : [];

  return (
    <Sheet open onClose={onClose} ariaLabel={name} maxWidthClass="sm:max-w-[560px]">
      <SheetHeader>
        <div className="flex items-center gap-3 pr-8">
          <StaffAvatar profile={avatar} size={44} />
          <div className="min-w-0">
            <SheetTitle>{name}</SheetTitle>
            <SheetDescription>{monthLabel(month)}</SheetDescription>
          </div>
        </div>
      </SheetHeader>
      <SheetBody>
        <MonthNav
          label={monthLabel(month)}
          onPrev={() => setMonth((m) => shiftMonth(m, -1))}
          onNext={() => setMonth((m) => shiftMonth(m, 1))}
        />

        {error ? (
          <p className="text-[13px] text-red-600">Couldn't load this employee: {error}</p>
        ) : !detail ? (
          <div className="h-48 animate-pulse rounded-xl bg-black/[0.04]" />
        ) : (
          <>
            {detail.goals.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-black/45">No goals apply this month.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {detail.goals.map((goal) => (
                  <div key={goal.metric_key} className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-subtle px-2 py-3 text-center">
                    <GoalRing goal={goal} size={84} strokeWidth={8} />
                    <span className="w-full text-[12px] font-medium leading-tight text-foreground">{goal.label_en}</span>
                    <span className="font-mono text-[11px] tabular-nums text-black/45">{goalSubline(goal)}</span>
                    <span className="text-[11px] text-black/45">{STATUS_LABELS[goal.status]}</span>
                  </div>
                ))}
              </div>
            )}

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[13.5px] font-medium text-foreground">Tasks in {monthLabel(month)}</h3>
                <Link to={`/dashboard/tasks?staff=${profileId}`} className="text-[12.5px] font-medium text-brand-strong hover:underline">
                  View tasks
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {taskTiles.map((tile) => (
                  <div key={tile.label} className="rounded-xl border border-subtle px-3 py-2.5">
                    <div className="text-[12px] text-black/50">{tile.label}</div>
                    <div className={cn('mt-0.5 text-[20px] font-semibold tabular-nums', tile.alert ? 'text-red-600' : 'text-foreground')}>{tile.value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-1 text-[13.5px] font-medium text-foreground">What's missing</h3>
              <GoalGapList gaps={detail.gaps} labelOf={labelOf} />
            </section>
          </>
        )}
      </SheetBody>
    </Sheet>
  );
};
