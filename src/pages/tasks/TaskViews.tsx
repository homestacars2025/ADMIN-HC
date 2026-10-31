import React, { useEffect, useMemo, useRef } from 'react';
import { Trash2 } from '../../components/media/MediaIcons';
import { Eye } from './icons';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { cn } from '../../lib/media/badgeColor';
import {
  formatDue,
  isTaskOpen,
  isTaskOverdue,
  relativeDue,
  taskAssignee,
  type AdminTask,
} from '../../lib/tasks';
import { PriorityEdge, StatusChip, type DepartmentOption } from './shared';

const TH = 'whitespace-nowrap px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-black/45';
const TD = 'px-4 py-3 text-[13px]';

/** Hidden until a row is hovered, where hovering exists. Touch screens always see them. */
const HOVER_ONLY = 'transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100';

const RECENT_MS = 60_000;

export interface TaskActions {
  onOpen: (task: AdminTask) => void;
  onCancel: (task: AdminTask) => void;
  onDelete: (task: AdminTask) => void;
}

/** Just-created rows that weren't there last render. Filter changes shouldn't animate. */
function useNewIds(tasks: AdminTask[]): Set<string> {
  const known = useRef<Set<string> | null>(null);
  const fresh = useMemo(() => {
    const previous = known.current;
    if (!previous) return new Set<string>();
    const cutoff = Date.now() - RECENT_MS;
    return new Set(tasks
      .filter((task) => !previous.has(task.id) && new Date(task.created_at).getTime() > cutoff)
      .map((task) => task.id));
  }, [tasks]);

  useEffect(() => { known.current = new Set(tasks.map((task) => task.id)); }, [tasks]);
  return fresh;
}

const ProofThumb: React.FC<{ task: AdminTask }> = ({ task }) => {
  if (!task.proof_url) {
    return <span className="text-black/35">{task.requires_proof ? 'Required' : '—'}</span>;
  }
  if (!/^https?:\/\//i.test(task.proof_url)) return <span className="text-black/55">Added</span>;
  return <img src={task.proof_url} alt="Proof" loading="lazy" className="h-8 w-8 rounded-lg border border-subtle object-cover" />;
};

export const TaskTable: React.FC<{
  tasks: AdminTask[];
  departments: DepartmentOption[];
  empty: string;
} & TaskActions> = ({ tasks, departments, empty, onOpen, onCancel, onDelete }) => {
  const fresh = useNewIds(tasks);
  const departmentLabel = (key: string | null) => departments.find((d) => d.key === key)?.label_en;

  return (
    <div className="relative overflow-x-auto rounded-2xl border border-subtle bg-surface">
      <table className="w-full min-w-[960px] border-collapse">
        <thead>
          <tr className="border-b border-subtle">
            <th className={TH}>Assignee</th>
            <th className={TH}>Task</th>
            <th className={TH}>Department</th>
            <th className={TH}>Due</th>
            <th className={TH}>Status</th>
            <th className={TH}>Proof</th>
            <th className={TH}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const assignee = taskAssignee(task);
            const overdue = isTaskOverdue(task);
            const department = departmentLabel(task.department_key);
            return (
              <tr
                key={task.id}
                onClick={() => onOpen(task)}
                className={cn(
                  'group relative cursor-pointer border-b border-subtle transition-colors last:border-b-0 hover:bg-black/[0.02]',
                  fresh.has(task.id) && 'motion-safe:animate-[task-row-in_500ms_ease-out]',
                )}
              >
                <td className={cn(TD, 'relative')}>
                  <PriorityEdge priority={task.priority} />
                  {assignee ? (
                    <span className="inline-flex items-center gap-2 whitespace-nowrap font-medium text-foreground">
                      <StaffAvatar profile={assignee} size={28} />
                      {assignee.full_name}
                    </span>
                  ) : <span className="text-black/35">Nobody</span>}
                </td>
                <td className={cn(TD, 'max-w-[320px]')}>
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); onOpen(task); }}
                    className="flex min-h-[32px] max-w-full items-center gap-1.5 text-left text-foreground"
                  >
                    {task.kind === 'recurring' && <span aria-label="Recurring" className="shrink-0 text-black/40">↻</span>}
                    <span dir="auto" className="truncate">{task.title}</span>
                  </button>
                </td>
                <td className={TD}>
                  {department
                    ? <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-black/[0.05] px-2.5 text-[11.5px] text-black/60">{department}</span>
                    : <span className="text-black/35">—</span>}
                </td>
                <td className={cn(TD, 'whitespace-nowrap', overdue ? 'font-medium text-red-600' : 'text-black/60')} title={formatDue(task.due_at)}>
                  {task.due_at ? relativeDue(task.due_at) : 'No due date'}
                </td>
                <td className={TD}><StatusChip status={task.status} overdue={overdue} /></td>
                <td className={cn(TD, 'text-[12.5px]')}><ProofThumb task={task} /></td>
                <td className={cn(TD, 'whitespace-nowrap')} onClick={(event) => event.stopPropagation()}>
                  <div className={cn('flex items-center justify-end gap-0.5', HOVER_ONLY)}>
                    <button
                      type="button"
                      aria-label={`View ${task.title}`}
                      onClick={() => onOpen(task)}
                      className="grid h-11 w-11 place-items-center rounded-lg text-black/45 hover:text-foreground md:h-8 md:w-8"
                    >
                      <Eye size={15} />
                    </button>
                    {isTaskOpen(task.status) && (
                      <button
                        type="button"
                        onClick={() => onCancel(task)}
                        className="min-h-[44px] rounded-lg px-2 text-[12.5px] font-medium text-black/55 hover:text-foreground md:min-h-[32px]"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete ${task.title}`}
                      onClick={() => onDelete(task)}
                      className="grid h-11 w-11 place-items-center rounded-lg text-black/40 hover:text-red-600 md:h-8 md:w-8"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {tasks.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-16 text-center text-[13px] text-black/40">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const BOARD_COLUMNS: Array<{ key: string; label: string; color: string; match: (task: AdminTask) => boolean }> = [
  { key: 'open', label: 'Open', color: '#3A74C2', match: (task) => isTaskOpen(task.status) && !isTaskOverdue(task) },
  { key: 'overdue', label: 'Overdue', color: '#DC2626', match: (task) => isTaskOverdue(task) },
  { key: 'done', label: 'Done', color: '#16A34A', match: (task) => task.status === 'done' },
  { key: 'missed', label: 'Missed', color: '#F59E0B', match: (task) => task.status === 'missed' },
];

export const TaskBoard: React.FC<{ tasks: AdminTask[]; onOpen: (task: AdminTask) => void }> = ({ tasks, onOpen }) => {
  const fresh = useNewIds(tasks);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {BOARD_COLUMNS.map((column) => {
        const items = tasks.filter(column.match);
        return (
          <section key={column.key} aria-label={column.label} className="min-w-0 rounded-2xl border border-subtle bg-surface p-2.5">
            <h2 className="flex items-center gap-2 px-1.5 pb-2 pt-1 text-[13px] font-medium text-foreground">
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: column.color }} />
              {column.label}
              <span className="ms-auto text-[12px] font-normal tabular-nums text-black/40">{items.length}</span>
            </h2>
            <div className="flex flex-col gap-2">
              {items.map((task) => {
                const assignee = taskAssignee(task);
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpen(task)}
                    className={cn(
                      'relative min-h-[44px] w-full overflow-hidden rounded-xl border border-subtle bg-surface p-3 text-left transition',
                      'hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(0,0,0,0.06)] motion-reduce:hover:translate-y-0',
                      fresh.has(task.id) && 'motion-safe:animate-[task-row-in_500ms_ease-out]',
                    )}
                  >
                    <PriorityEdge priority={task.priority} />
                    <div dir="auto" className="line-clamp-2 text-[13px] font-medium text-foreground">
                      {task.kind === 'recurring' && <span className="me-1 text-black/40">↻</span>}
                      {task.title}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {assignee && <StaffAvatar profile={assignee} size={22} />}
                      <span className={cn('min-w-0 truncate text-[12px]', column.key === 'overdue' ? 'text-red-600' : 'text-black/50')}>
                        {task.due_at ? relativeDue(task.due_at) : 'No due date'}
                      </span>
                    </div>
                  </button>
                );
              })}
              {items.length === 0 && <p className="px-1.5 py-6 text-center text-[12.5px] text-black/35">Nothing here</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
};
