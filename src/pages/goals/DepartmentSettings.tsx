import React from 'react';
import { toast } from '../../components/media/MediaToast';
import {
  saveDepartmentBonus,
  saveDepartmentDefault,
  targetError,
  type DepartmentBonus,
  type DepartmentDefault,
  type GoalMetric,
} from '../../lib/goals';
import type { Department } from '../../lib/staffAccess';
import { NumberCell } from './NumberCell';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export const DepartmentSettings: React.FC<{
  departments: Department[];
  metrics: GoalMetric[];
  defaults: DepartmentDefault[];
  bonuses: DepartmentBonus[];
  onDefaults: (update: (current: DepartmentDefault[]) => DepartmentDefault[]) => void;
  onBonuses: (update: (current: DepartmentBonus[]) => DepartmentBonus[]) => void;
  onChanged: () => void;
}> = ({ departments, metrics, defaults, bonuses, onDefaults, onBonuses, onChanged }) => {
  const targetOf = (departmentKey: string, metricKey: string) => {
    const row = defaults.find((d) => d.department_key === departmentKey && d.metric_key === metricKey);
    return row ? Number(row.target) : null;
  };

  const bonusOf = (departmentKey: string) =>
    Number(bonuses.find((b) => b.department_key === departmentKey)?.bonus_amount ?? 0);

  const commitDefault = async (departmentKey: string, metric: GoalMetric, target: number | null) => {
    const problem = target === null ? null : targetError(metric.kind, target);
    if (problem) {
      toast.error(problem);
      return;
    }

    const previous = defaults;
    onDefaults((current) => [
      ...current.filter((d) => !(d.department_key === departmentKey && d.metric_key === metric.key)),
      ...(target === null ? [] : [{ department_key: departmentKey, metric_key: metric.key, target }]),
    ]);
    try {
      await saveDepartmentDefault(departmentKey, metric.key, target);
      onChanged();
    } catch (error) {
      onDefaults(() => previous);
      toast.error(`Couldn't save: ${errorText(error)}`);
    }
  };

  const commitBonus = async (departmentKey: string, amount: number | null) => {
    const value = amount ?? 0;
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Enter a bonus of zero or more.');
      return;
    }

    const previous = bonuses;
    onBonuses((current) => [
      ...current.filter((b) => b.department_key !== departmentKey),
      { department_key: departmentKey, bonus_amount: value },
    ]);
    try {
      await saveDepartmentBonus(departmentKey, value);
      onChanged();
    } catch (error) {
      onBonuses(() => previous);
      toast.error(`Couldn't save: ${errorText(error)}`);
    }
  };

  return (
    <section className="rounded-2xl border border-subtle bg-surface">
      <div className="border-b border-subtle px-5 py-3">
        <h2 className="text-[14px] font-medium text-foreground">Department settings</h2>
        <p className="mt-0.5 text-[12.5px] text-black/45">
          Default targets for every month. Leave a target empty if a department doesn't use that metric.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-b border-subtle text-left">
              <th className="px-5 py-3 text-[12px] font-medium text-black/45">Department</th>
              {metrics.map((metric) => (
                <th key={metric.key} className="px-3 py-3 text-[12px] font-medium text-black/45">{metric.label_en}</th>
              ))}
              <th className="px-5 py-3 text-[12px] font-medium text-black/45">Bonus</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((department) => (
              <tr key={department.key} className="border-b border-subtle last:border-b-0">
                <td className={`px-5 py-2.5 text-[13.5px] text-foreground ${department.parent_key ? 'pl-9' : ''}`}>{department.label_en}</td>
                {metrics.map((metric) => (
                  <td key={metric.key} className="px-3 py-2.5">
                    <NumberCell
                      value={targetOf(department.key, metric.key)}
                      ariaLabel={`${department.label_en} ${metric.label_en} target`}
                      suffix={metric.kind === 'percent' ? '%' : undefined}
                      placeholder="—"
                      width={72}
                      onCommit={(value) => commitDefault(department.key, metric, value)}
                    />
                  </td>
                ))}
                <td className="px-5 py-2.5">
                  <NumberCell
                    value={bonusOf(department.key)}
                    ariaLabel={`${department.label_en} bonus`}
                    prefix="₺"
                    width={100}
                    onCommit={(value) => commitBonus(department.key, value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
