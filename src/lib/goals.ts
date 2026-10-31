import { supabase } from './supabase';

export type GoalStatus = 'green' | 'amber' | 'red' | 'progress' | 'none';
export type GoalKind = 'count' | 'percent';

export interface GoalProgress {
  metric_key: string;
  label_en: string;
  kind: GoalKind;
  description_en: string | null;
  target: number;
  numerator: number | null;
  denominator: number | null;
  value: number | null;
  status: GoalStatus;
  sort_order: number;
}

export interface StaffGoals {
  profile_id: string;
  full_name: string | null;
  department_key: string | null;
  metrics: GoalProgress[];
  all_green: boolean;
  bonus_amount: number;
  bonus_granted: boolean;
}

export interface GoalGap {
  metric_key: string;
  ref_type: 'operation' | 'custody';
  ref_id: number;
  ref_date: string;
  plate: string | null;
  missing: string[];
}

export interface GoalMetric {
  key: string;
  label_en: string;
  kind: GoalKind;
  description_en: string | null;
  sort_order: number;
}

export interface DepartmentDefault {
  department_key: string;
  metric_key: string;
  target: number;
}

export interface DepartmentBonus {
  department_key: string;
  bonus_amount: number;
}

export interface MonthlyTarget {
  metric_key: string;
  target: number;
  is_active: boolean;
}

export interface TargetRow {
  metric: GoalMetric;
  /** What applies this month: the employee's own target, else the department's. */
  target: number | null;
  defaultTarget: number | null;
  hasOverride: boolean;
  active: boolean;
}

export const STATUS_COLORS: Record<GoalStatus, string> = {
  green: '#16A34A',
  amber: '#F59E0B',
  red: '#DC2626',
  progress: '#6EA4E7',
  none: '#D4D4D4',
};

export const STATUS_LABELS: Record<GoalStatus, string> = {
  green: 'On target',
  amber: 'Close',
  red: 'Behind',
  progress: 'In progress',
  none: 'No data yet',
};

const MISSING_LABELS: Record<string, string> = {
  customer_card: 'Customer card',
  air_freshener: 'Air freshener',
  license: 'License',
  tutanak: 'Tutanak',
  km: 'KM',
  fuel: 'Fuel',
  receipt: 'Receipt',
};

export function missingLabel(item: string): string {
  if (item.startsWith('photo:')) {
    const name = item.slice('photo:'.length).replace(/_/g, ' ');
    return `Photo: ${name}`;
  }
  return MISSING_LABELS[item] ?? item;
}

/** How full a ring is, 0 to 1. A target of zero is met by definition. */
export function ringFraction(goal: Pick<GoalProgress, 'value' | 'target' | 'status'>): number {
  if (goal.status === 'none' || goal.value === null) return 0;
  if (Number(goal.target) <= 0) return 1;
  return Math.min(1, Math.max(0, Number(goal.value) / Number(goal.target)));
}

export function goalValueText(goal: Pick<GoalProgress, 'value' | 'kind' | 'status'>): string {
  if (goal.status === 'none' || goal.value === null) return '—';
  const value = Number(goal.value);
  return goal.kind === 'percent' ? `${Math.round(value)}%` : String(value);
}

/** "12 / 16" for a percent metric, "42 / 50" for a count. */
export function goalSubline(goal: Pick<GoalProgress, 'kind' | 'numerator' | 'denominator' | 'target'>): string {
  if (goal.kind === 'count') return `${Number(goal.numerator ?? 0)} / ${Number(goal.target)}`;
  return goal.denominator ? `${Number(goal.numerator ?? 0)} / ${Number(goal.denominator)}` : `Target ${Number(goal.target)}%`;
}

export function buildTargetRows(
  metrics: GoalMetric[],
  departmentKey: string | null,
  defaults: DepartmentDefault[],
  monthly: MonthlyTarget[],
): TargetRow[] {
  return metrics.map((metric) => {
    const own = monthly.find((row) => row.metric_key === metric.key);
    const fallback = defaults.find((row) => row.department_key === departmentKey && row.metric_key === metric.key);
    const defaultTarget = fallback ? Number(fallback.target) : null;
    return {
      metric,
      target: own ? Number(own.target) : defaultTarget,
      defaultTarget,
      hasOverride: Boolean(own),
      active: own?.is_active ?? true,
    };
  });
}

/** Why a target can't be saved, or null when it can. */
export function targetError(kind: GoalKind, value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return 'Enter a target of zero or more.';
  if (kind === 'percent' && value > 100) return 'A percentage target can’t be above 100.';
  return null;
}

function failIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function fetchGoalsOverview(month: string): Promise<StaffGoals[]> {
  const { data, error } = await supabase.rpc('admin_goals_overview', { p_month: month });
  failIf(error);
  return ((data ?? []) as StaffGoals[]).map((row) => ({
    ...row,
    metrics: row.metrics ?? [],
    bonus_amount: Number(row.bonus_amount ?? 0),
  }));
}

export async function fetchGoalSettings() {
  const [metrics, defaults, bonuses] = await Promise.all([
    supabase.from('goal_metrics').select('key, label_en, kind, description_en, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('department_goal_defaults').select('department_key, metric_key, target'),
    supabase.from('department_bonus_settings').select('department_key, bonus_amount'),
  ]);
  [metrics, defaults, bonuses].forEach((result) => failIf(result.error));
  return {
    metrics: (metrics.data ?? []) as GoalMetric[],
    defaults: (defaults.data ?? []) as DepartmentDefault[],
    bonuses: (bonuses.data ?? []) as DepartmentBonus[],
  };
}

export async function fetchGoalGaps(month: string, profileId: string): Promise<GoalGap[]> {
  const { data, error } = await supabase.rpc('staff_goal_gaps', { p_month: month, p_profile: profileId });
  failIf(error);
  return (data ?? []) as GoalGap[];
}

export async function fetchMonthlyTargets(month: string, profileId: string): Promise<MonthlyTarget[]> {
  const { data, error } = await supabase
    .from('staff_monthly_goals')
    .select('metric_key, target, is_active')
    .eq('profile_id', profileId)
    .eq('month', month);
  failIf(error);
  return (data ?? []) as MonthlyTarget[];
}

export async function saveMonthlyTarget(
  goal: { profileId: string; month: string; metricKey: string; target: number; isActive: boolean },
  adminId: string,
): Promise<void> {
  const { error } = await supabase.from('staff_monthly_goals').upsert(
    {
      profile_id: goal.profileId,
      month: goal.month,
      metric_key: goal.metricKey,
      target: goal.target,
      is_active: goal.isActive,
      set_by: adminId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,month,metric_key' },
  );
  failIf(error);
}

/** Copies every target set for one month onto another. Returns how many were copied. */
export async function copyMonthlyTargets(fromMonth: string, toMonth: string, adminId: string): Promise<number> {
  const { data, error } = await supabase
    .from('staff_monthly_goals')
    .select('profile_id, metric_key, target, is_active')
    .eq('month', fromMonth);
  failIf(error);
  if (!data?.length) return 0;

  const rows = data.map((row) => ({ ...row, month: toMonth, set_by: adminId, updated_at: new Date().toISOString() }));
  const { error: writeError } = await supabase
    .from('staff_monthly_goals')
    .upsert(rows, { onConflict: 'profile_id,month,metric_key' });
  failIf(writeError);
  return rows.length;
}

export async function saveDepartmentDefault(departmentKey: string, metricKey: string, target: number | null): Promise<void> {
  const { error } = target === null
    ? await supabase.from('department_goal_defaults').delete().eq('department_key', departmentKey).eq('metric_key', metricKey)
    : await supabase.from('department_goal_defaults').upsert(
        { department_key: departmentKey, metric_key: metricKey, target },
        { onConflict: 'department_key,metric_key' },
      );
  failIf(error);
}

export async function saveDepartmentBonus(departmentKey: string, bonusAmount: number): Promise<void> {
  const { error } = await supabase.from('department_bonus_settings').upsert(
    { department_key: departmentKey, bonus_amount: bonusAmount, updated_at: new Date().toISOString() },
    { onConflict: 'department_key' },
  );
  failIf(error);
}

export async function grantGoalBonus(profileId: string, month: string): Promise<void> {
  const { error } = await supabase.rpc('admin_grant_goal_bonus', { p_profile: profileId, p_month: month });
  failIf(error);
}
