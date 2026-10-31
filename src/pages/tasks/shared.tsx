import React from 'react';
import { cn } from '../../lib/media/badgeColor';
import { PRIORITY_STYLES } from '../../lib/notifications';
import { PRIORITY_EDGE, STATUS_STYLES, type TaskPriority, type TaskStatus } from '../../lib/tasks';

export interface StaffOption {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  gender: string | null;
  department_key: string | null;
}

export interface DepartmentOption {
  key: string;
  label_en: string;
}

export const FIELD_CLASS =
  'h-11 w-full min-w-0 rounded-lg border border-input bg-surface px-2.5 text-[13.5px] text-foreground md:h-9';
export const PRIMARY_BUTTON = '!h-11 !bg-brand-strong px-4 text-white hover:!bg-brand-strong/90 md:!h-9';

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export const staffName = (person: Pick<StaffOption, 'full_name' | 'email'>) => person.full_name || person.email || 'Unnamed';

export const StatusChip: React.FC<{ status: TaskStatus; overdue?: boolean }> = ({ status, overdue }) => (
  <span
    className={cn(
      'inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-medium',
      overdue ? 'bg-red-500/10 text-red-600' : STATUS_STYLES[status].className,
    )}
  >
    {overdue ? 'Overdue' : STATUS_STYLES[status].label}
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

/** The priority edge. A normal task has none, so the ones that matter stand out. */
export const PriorityEdge: React.FC<{ priority: TaskPriority }> = ({ priority }) => {
  const color = PRIORITY_EDGE[priority];
  if (!color) return null;
  return <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-full" style={{ background: color }} />;
};
