import React from 'react';
import { cn } from '../../lib/media/badgeColor';
import { PRIORITY_STYLES } from '../../lib/notifications';
import { STATUS_STYLES, type TaskPriority, type TaskStatus } from '../../lib/tasks';

export interface StaffOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

export interface DepartmentOption {
  key: string;
  label_en: string;
}

export const FIELD_CLASS =
  'h-11 w-full min-w-0 rounded-lg border border-input bg-surface px-2.5 text-[13.5px] text-foreground md:h-9';
export const PRIMARY_BUTTON = 'h-11 !bg-brand-strong px-4 text-white hover:!bg-brand-strong/90 md:h-9';

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export const StatusChip: React.FC<{ status: TaskStatus }> = ({ status }) => (
  <span className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-medium', STATUS_STYLES[status].className)}>
    {STATUS_STYLES[status].label}
  </span>
);

export const PriorityChip: React.FC<{ priority: TaskPriority }> = ({ priority }) => {
  const style = PRIORITY_STYLES[priority];
  return (
    <span
      className="inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-medium"
      style={{ background: style.bg, color: style.color }}
    >
      {style.label}
    </span>
  );
};

/** A person or a whole department, never both. */
export const AssignField: React.FC<{
  assignee: string;
  department: string;
  staff: StaffOption[];
  departments: DepartmentOption[];
  onChange: (next: { assignee: string; department: string }) => void;
}> = ({ assignee, department, staff, departments, onChange }) => {
  const toDepartment = department !== '' || (assignee === '' && staff.length === 0);
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1.5 text-[13px] font-medium text-foreground">Assign to</legend>
      <div className="flex gap-4">
        {[{ value: false, label: 'One person' }, { value: true, label: 'Whole department' }].map((option) => (
          <label key={option.label} className="flex min-h-[32px] cursor-pointer items-center gap-2 text-[13px] text-foreground">
            <input
              type="radio"
              name="assign-mode"
              checked={toDepartment === option.value}
              onChange={() => onChange(
                option.value
                  ? { assignee: '', department: departments[0]?.key ?? '' }
                  : { assignee: staff[0]?.id ?? '', department: '' },
              )}
              className="accent-brand-strong"
            />
            {option.label}
          </label>
        ))}
      </div>
      {toDepartment ? (
        <select
          aria-label="Department"
          value={department}
          onChange={(event) => onChange({ assignee: '', department: event.target.value })}
          className={FIELD_CLASS}
        >
          {departments.map((option) => <option key={option.key} value={option.key}>{option.label_en}</option>)}
        </select>
      ) : (
        <select
          aria-label="Person"
          value={assignee}
          onChange={(event) => onChange({ assignee: event.target.value, department: '' })}
          className={FIELD_CLASS}
        >
          <option value="">Choose a person</option>
          {staff.map((option) => <option key={option.id} value={option.id}>{option.full_name || option.email}</option>)}
        </select>
      )}
    </fieldset>
  );
};
