import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/media/ConfirmDialog';
import { AlertTriangle } from '../components/media/MediaIcons';
import { PageHeader } from '../components/media/MediaShared';
import { MediaToaster, toast } from '../components/media/MediaToast';
import { Button } from '../components/media/MediaUI';
import { useShell } from '../components/shell/shellContext';
import { MonthNav } from '../components/shared/MonthNav';
import StaffAvatar from '../components/shared/StaffAvatar';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  copyMonthlyTargets,
  fetchGoalSettings,
  fetchGoalsOverview,
  grantGoalBonus,
  type DepartmentBonus,
  type DepartmentDefault,
  type GoalMetric,
  type GoalStatus,
  type StaffGoals,
} from '../lib/goals';
import { cn } from '../lib/media/badgeColor';
import { currentMonth, formatTry, monthLabel, shiftMonth } from '../lib/payroll';
import { orderDepartments, type Department } from '../lib/staffAccess';
import type { AvatarProfile } from '../lib/staffAvatar';
import { supabase } from '../lib/supabase';
import { DepartmentSettings } from './goals/DepartmentSettings';
import { GoalDrawer } from './goals/GoalDrawer';
import { GoalRing } from './goals/GoalRing';
import { useConfirm } from './media/useConfirm';

const CARD = 'rounded-2xl border border-subtle bg-surface';
const TH = 'whitespace-nowrap px-4 py-3 text-[11px] font-medium uppercase tracking-[0.06em] text-black/45';
const LEGEND: GoalStatus[] = ['green', 'amber', 'red', 'progress', 'none'];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

interface GoalSetup {
  metrics: GoalMetric[];
  departments: Department[];
  avatars: Record<string, AvatarProfile>;
}

const GoalsPage: React.FC = () => {
  const { profile } = useShell();
  const [month, setMonth] = useState(currentMonth);
  const [overview, setOverview] = useState<StaffGoals[] | null>(null);
  const [setup, setSetup] = useState<GoalSetup | null>(null);
  const [defaults, setDefaults] = useState<DepartmentDefault[]>([]);
  const [bonuses, setBonuses] = useState<DepartmentBonus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const confirm = useConfirm();
  const requestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchGoalSettings(),
      supabase.from('departments').select('key, label_en, label_ar, parent_key, sort_order, is_active'),
      supabase.from('profiles').select('id, avatar_url, avatar_bg, gender').eq('role', 'staff'),
    ])
      .then(([settings, departments, profiles]) => {
        if (cancelled) return;
        if (departments.error) throw new Error(departments.error.message);
        if (profiles.error) throw new Error(profiles.error.message);
        setSetup({
          metrics: settings.metrics,
          departments: orderDepartments((departments.data ?? []) as Department[]),
          avatars: Object.fromEntries((profiles.data ?? []).map((p) => [p.id, p])),
        });
        setDefaults(settings.defaults);
        setBonuses(settings.bonuses);
      })
      .catch((e: unknown) => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, [reloadCount]);

  const loadOverview = useCallback(async () => {
    // Quick month changes can finish out of order; only the latest may land.
    const request = ++requestRef.current;
    setError(null);
    try {
      const fresh = await fetchGoalsOverview(month);
      if (request === requestRef.current) setOverview(fresh);
    } catch (e) {
      if (request === requestRef.current) setError(errorText(e));
    }
  }, [month]);

  useEffect(() => {
    loadOverview();
    return () => { requestRef.current += 1; };
  }, [loadOverview, reloadCount]);

  const departmentLabel = useCallback(
    (key: string | null) => setup?.departments.find((d) => d.key === key)?.label_en ?? 'No department',
    [setup],
  );

  const label = monthLabel(month);
  const adminId = profile?.id ?? '';
  const drawerStaff = overview?.find((staff) => staff.profile_id === drawerId) ?? null;
  const allGreenCount = useMemo(() => (overview ?? []).filter((staff) => staff.all_green).length, [overview]);

  const askGrant = (staff: StaffGoals) => {
    const monthOpen = month >= currentMonth();
    confirm.ask({
      title: `Grant ${formatTry(staff.bonus_amount)} to ${staff.full_name ?? 'this employee'}?`,
      description: `This adds the goals bonus for ${label} to their wallet.`,
      consequence: monthOpen ? `${label} isn't over yet, so their indicators can still change.` : undefined,
      confirmLabel: 'Grant bonus',
      onConfirm: async () => {
        try {
          // The RPC doesn't check the indicators, so this page has to, on fresh data.
          const fresh = (await fetchGoalsOverview(month)).find((row) => row.profile_id === staff.profile_id);
          if (!fresh?.all_green) {
            toast.error('Their indicators are no longer all green.');
          } else if (fresh.bonus_granted) {
            toast.error('This bonus was already granted.');
          } else {
            await grantGoalBonus(staff.profile_id, month);
            toast.success(`Bonus granted to ${staff.full_name ?? 'employee'}`);
          }
          await loadOverview();
        } catch (e) {
          toast.error(`Couldn't grant the bonus: ${errorText(e)}`);
        }
      },
    });
  };

  const askCopy = () => {
    const previous = shiftMonth(month, -1);
    confirm.ask({
      title: `Copy ${monthLabel(previous)} targets to ${label}?`,
      description: `Individual targets set for ${monthLabel(previous)} will apply to ${label}.`,
      consequence: `Any target already set for the same metric in ${label} is replaced.`,
      confirmLabel: 'Copy targets',
      onConfirm: async () => {
        setCopying(true);
        try {
          const copied = await copyMonthlyTargets(previous, month, adminId);
          if (copied === 0) {
            toast.warning(`No individual targets were set for ${monthLabel(previous)}.`);
          } else {
            toast.success(`Copied ${copied} ${copied === 1 ? 'target' : 'targets'} to ${label}`);
          }
          await loadOverview();
        } catch (e) {
          toast.error(`Couldn't copy the targets: ${errorText(e)}`);
        } finally {
          setCopying(false);
        }
      },
    });
  };

  return (
    <div className="media-scope mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader eyebrow="Finance" title="Goals & bonuses" subtitle="Each employee's indicators for the month, and the bonus when they're all green." />
        <MonthNav
          label={label}
          onPrev={() => setMonth((m) => shiftMonth(m, -1))}
          onNext={() => setMonth((m) => shiftMonth(m, 1))}
          justify="flex-start"
        />
      </div>

      {error ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13px] text-red-700">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">Couldn't load goals: {error}</span>
          <Button
            variant="outline"
            size="lg"
            className="!h-11 px-4 md:!h-10"
            onClick={() => setReloadCount((n) => n + 1)}>Try again</Button>
        </div>
      ) : !overview || !setup ? (
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-black/[0.04]" />
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-black/55">
              {allGreenCount} of {overview.length} staff all green for {label}
            </p>
            <Button
              variant="outline"
              size="lg"
              className="!h-11 px-3 md:!h-10"
              disabled={copying}
              onClick={askCopy}>
              Copy last month's targets
            </Button>
          </div>

          <section className={cn(CARD, 'mt-3 overflow-hidden')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b border-subtle text-left">
                    <th className={TH}>Staff</th>
                    <th className={TH}>Department</th>
                    <th className={TH}>Indicators</th>
                    <th className={cn(TH, 'text-right')}>Bonus</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.map((staff) => (
                    <tr
                      key={staff.profile_id}
                      onClick={() => setDrawerId(staff.profile_id)}
                      className="cursor-pointer border-b border-subtle transition-colors last:border-b-0 hover:bg-black/[0.02]"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); setDrawerId(staff.profile_id); }}
                          className="flex min-h-[44px] items-center gap-2.5 text-left text-[13px] font-medium text-foreground"
                        >
                          <StaffAvatar profile={setup.avatars[staff.profile_id]} size={32} />
                          {staff.full_name ?? 'Unnamed employee'}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-black/55">{departmentLabel(staff.department_key)}</td>
                      <td className="px-4 py-3">
                        {staff.metrics.length === 0 ? (
                          <span className="text-[12.5px] text-black/40">No goals set</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            {staff.metrics.map((goal) => (
                              <GoalRing key={goal.metric_key} goal={goal} size={40} strokeWidth={4} />
                            ))}
                            {staff.all_green && (
                              <span className="ms-1 inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium text-white" style={{ background: STATUS_COLORS.green }}>
                                All green
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                        {staff.bonus_granted ? (
                          <span className="text-[12.5px] font-medium text-emerald-700">Bonus granted ✓</span>
                        ) : !staff.all_green ? (
                          <span className="text-[12.5px] text-black/35">—</span>
                        ) : staff.bonus_amount > 0 ? (
                          <Button
                            size="lg"
                            onClick={() => askGrant(staff)}
                            className="!h-11 px-3 hover:/90 md:!h-10"
                          >
                            Grant bonus <span className="font-mono tabular-nums">{formatTry(staff.bonus_amount)}</span>
                          </Button>
                        ) : (
                          <span className="text-[12.5px] text-black/45">Set a bonus amount below</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {overview.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-12 text-center text-[13px] text-black/40">No active staff</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1" aria-label="Status colours">
            {LEGEND.map((status) => (
              <span key={status} className="inline-flex items-center gap-1.5 text-[12px] text-black/50">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                {STATUS_LABELS[status]}
              </span>
            ))}
          </div>

          <div className="mt-6">
            <DepartmentSettings
              departments={setup.departments}
              metrics={setup.metrics}
              defaults={defaults}
              bonuses={bonuses}
              onDefaults={setDefaults}
              onBonuses={setBonuses}
              onChanged={loadOverview}
            />
          </div>
        </>
      )}

      {drawerStaff && setup && (
        <GoalDrawer
          staff={drawerStaff}
          avatar={setup.avatars[drawerStaff.profile_id]}
          departmentLabel={departmentLabel(drawerStaff.department_key)}
          month={month}
          adminId={adminId}
          metrics={setup.metrics}
          defaults={defaults}
          onClose={() => setDrawerId(null)}
          onChanged={loadOverview}
        />
      )}

      <ConfirmDialog state={confirm.state} pending={confirm.pending} onCancel={confirm.cancel} onConfirm={confirm.confirm} />
      <MediaToaster />
    </div>
  );
};

export default GoalsPage;
