import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import { AlertTriangle, Plus, Search, Trash2 } from '../../components/media/MediaIcons';
import { toast } from '../../components/media/MediaToast';
import { Button, Input } from '../../components/media/MediaUI';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { cn } from '../../lib/media/badgeColor';
import {
  deleteTask,
  fetchTasks,
  formatDue,
  isTaskOpen,
  isTaskOverdue,
  taskAssignee,
  type AdminTask,
  type TaskFilters,
} from '../../lib/tasks';
import { useConfirm } from '../media/useConfirm';
import { NewTaskSheet, TaskDetailSheet } from './TaskSheets';
import {
  FIELD_CLASS,
  PRIMARY_BUTTON,
  PriorityChip,
  StatusChip,
  errorText,
  type DepartmentOption,
  type StaffOption,
} from './shared';

const SEARCH_DELAY_MS = 250;
const PAGE_STEP = 100;
const TH = 'whitespace-nowrap px-4 py-3 text-[11px] font-medium uppercase tracking-[0.06em] text-black/45';
const TD = 'px-4 py-3 text-[13px]';

const EMPTY_FILTERS: TaskFilters = {
  search: '', staffId: '', departmentKey: '', status: '', kind: '', overdueOnly: false, from: '', to: '',
};

export const TaskListTab: React.FC<{ staff: StaffOption[]; departments: DepartmentOption[] }> = ({ staff, departments }) => {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<TaskFilters>(() => ({ ...EMPTY_FILTERS, staffId: searchParams.get('staff') ?? '' }));
  const [searchDraft, setSearchDraft] = useState('');
  const [limit, setLimit] = useState(PAGE_STEP);
  const [tasks, setTasks] = useState<AdminTask[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<{ id: string; cancelling: boolean } | null>(null);
  const confirm = useConfirm();
  const requestRef = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((current) => (current.search === searchDraft ? current : { ...current, search: searchDraft }));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(handle);
  }, [searchDraft]);

  const load = useCallback(async () => {
    // Filters can change faster than results arrive; only the latest may land.
    const request = ++requestRef.current;
    setError(null);
    try {
      const result = await fetchTasks(filters, limit);
      if (request !== requestRef.current) return;
      setTasks(result.tasks);
      setTotal(result.total);
    } catch (e) {
      if (request === requestRef.current) setError(errorText(e));
    }
  }, [filters, limit]);

  useEffect(() => {
    load();
    return () => { requestRef.current += 1; };
  }, [load]);

  const patch = (next: Partial<TaskFilters>) => {
    setLimit(PAGE_STEP);
    setFilters((current) => ({ ...current, ...next }));
  };

  const departmentLabel = useCallback(
    (key: string | null) => departments.find((d) => d.key === key)?.label_en ?? '—',
    [departments],
  );

  const detailTask = useMemo(() => tasks?.find((task) => task.id === detail?.id) ?? null, [tasks, detail]);

  const askDelete = (task: AdminTask) => {
    confirm.ask({
      title: 'Delete this task?',
      description: `"${task.title}" will be removed for good.`,
      consequence: isTaskOpen(task.status) ? undefined : 'Its note and proof go with it. Cancelling keeps the record.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await deleteTask(task.id);
          toast.success('Task deleted');
          await load();
        } catch (e) {
          toast.error(`Couldn't delete: ${errorText(e)}`);
        }
      },
    });
  };

  const anyFilter = searchDraft !== '' || JSON.stringify({ ...filters, search: '' }) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-[340px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
          <Input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search tasks"
            aria-label="Search tasks"
            className="h-11 pl-8 md:h-9"
          />
        </div>
        <Button size="lg" className={PRIMARY_BUTTON} onClick={() => setCreating(true)}>
          <Plus size={14} /> New task
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <select aria-label="Filter by staff" value={filters.staffId} onChange={(e) => patch({ staffId: e.target.value })} className={FIELD_CLASS}>
          <option value="">All staff</option>
          {staff.map((option) => <option key={option.id} value={option.id}>{option.full_name || option.email}</option>)}
        </select>
        <select aria-label="Filter by department" value={filters.departmentKey} onChange={(e) => patch({ departmentKey: e.target.value })} className={FIELD_CLASS}>
          <option value="">All departments</option>
          {departments.map((option) => <option key={option.key} value={option.key}>{option.label_en}</option>)}
        </select>
        <select aria-label="Filter by status" value={filters.status} onChange={(e) => patch({ status: e.target.value as TaskFilters['status'] })} className={FIELD_CLASS}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="done">Done</option>
          <option value="missed">Missed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select aria-label="Filter by kind" value={filters.kind} onChange={(e) => patch({ kind: e.target.value as TaskFilters['kind'] })} className={FIELD_CLASS}>
          <option value="">All kinds</option>
          <option value="one_off">One-off</option>
          <option value="recurring">Recurring</option>
        </select>
        <input type="date" aria-label="Due from" value={filters.from} onChange={(e) => patch({ from: e.target.value })} className={FIELD_CLASS} />
        <input type="date" aria-label="Due until" value={filters.to} onChange={(e) => patch({ to: e.target.value })} className={FIELD_CLASS} />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] text-foreground md:min-h-[32px]">
          <input type="checkbox" checked={filters.overdueOnly} onChange={(e) => patch({ overdueOnly: e.target.checked })} className="h-4 w-4 accent-brand-strong" />
          Overdue only
        </label>
        {anyFilter && (
          <button
            type="button"
            onClick={() => { setSearchDraft(''); setLimit(PAGE_STEP); setFilters(EMPTY_FILTERS); }}
            className="min-h-[44px] text-[12.5px] font-medium text-brand-strong md:min-h-[32px]"
          >
            Clear filters
          </button>
        )}
      </div>

      {error ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13px] text-red-700">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">Couldn't load tasks: {error}</span>
          <Button variant="outline" size="lg" className="h-11 px-4 md:h-9" onClick={load}>Try again</Button>
        </div>
      ) : !tasks ? (
        <div className="mt-3 h-64 animate-pulse rounded-2xl bg-black/[0.04]" />
      ) : (
        <section className="mt-3 overflow-hidden rounded-2xl border border-subtle bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="border-b border-subtle text-left">
                  <th className={TH}>Title</th>
                  <th className={TH}>Assignee</th>
                  <th className={TH}>Department</th>
                  <th className={TH}>Kind</th>
                  <th className={TH}>Priority</th>
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
                  return (
                    <tr
                      key={task.id}
                      onClick={() => setDetail({ id: task.id, cancelling: false })}
                      className="cursor-pointer border-b border-subtle transition-colors last:border-b-0 hover:bg-black/[0.02]"
                    >
                      <td className={cn(TD, 'max-w-[280px]')}>
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); setDetail({ id: task.id, cancelling: false }); }}
                          className="block min-h-[32px] max-w-full truncate text-left font-medium text-foreground"
                        >
                          {task.title}
                        </button>
                      </td>
                      <td className={TD}>
                        {assignee ? (
                          <span className="inline-flex items-center gap-2 whitespace-nowrap text-foreground">
                            <StaffAvatar profile={assignee} size={26} />
                            {assignee.full_name}
                          </span>
                        ) : <span className="text-black/35">—</span>}
                      </td>
                      <td className={cn(TD, 'whitespace-nowrap text-black/55')}>{departmentLabel(task.department_key)}</td>
                      <td className={cn(TD, 'whitespace-nowrap text-black/55')}>{task.kind === 'recurring' ? '↻ Recurring' : 'One-off'}</td>
                      <td className={TD}><PriorityChip priority={task.priority} /></td>
                      <td className={cn(TD, 'whitespace-nowrap', overdue ? 'font-medium text-red-600' : 'text-black/60')}>
                        {formatDue(task.due_at)}
                      </td>
                      <td className={TD}><StatusChip status={task.status} /></td>
                      <td className={cn(TD, 'whitespace-nowrap text-black/55')}>
                        {task.proof_url ? 'Added' : task.requires_proof ? 'Required' : '—'}
                      </td>
                      <td className={cn(TD, 'whitespace-nowrap text-right')} onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {isTaskOpen(task.status) && (
                            <button
                              type="button"
                              onClick={() => setDetail({ id: task.id, cancelling: true })}
                              className="min-h-[44px] rounded-lg px-2 text-[12.5px] font-medium text-black/55 hover:text-foreground md:min-h-[32px]"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Delete ${task.title}`}
                            onClick={() => askDelete(task)}
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
                  <tr>
                    <td colSpan={9} className="px-4 py-14 text-center text-[13px] text-black/40">
                      {anyFilter ? 'No tasks match these filters' : 'No tasks yet'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {tasks.length < total && (
            <div className="border-t border-subtle p-3 text-center">
              <Button variant="ghost" size="lg" className="h-11 px-4 md:h-9" onClick={() => setLimit((n) => n + PAGE_STEP)}>
                Show more ({total - tasks.length} left)
              </Button>
            </div>
          )}
        </section>
      )}

      {creating && (
        <NewTaskSheet
          staff={staff}
          departments={departments}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}

      {detailTask && (
        <TaskDetailSheet
          key={`${detailTask.id}-${detail?.cancelling}`}
          task={detailTask}
          departmentLabel={departmentLabel(detailTask.department_key)}
          startCancelling={detail?.cancelling ?? false}
          onClose={() => setDetail(null)}
          onChanged={load}
        />
      )}

      <ConfirmDialog state={confirm.state} pending={confirm.pending} onCancel={confirm.cancel} onConfirm={confirm.confirm} />
    </>
  );
};
