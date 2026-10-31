import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import { AlertTriangle } from '../../components/media/MediaIcons';
import { toast } from '../../components/media/MediaToast';
import { Button } from '../../components/media/MediaUI';
import { cn } from '../../lib/media/badgeColor';
import { notificationActivity } from '../../lib/notificationEvents';
import { deleteTask, fetchTask, fetchTasks, isTaskOpen, type AdminTask, type TaskFilters } from '../../lib/tasks';
import { useConfirm } from '../media/useConfirm';
import { FilterBar } from './FilterBar';
import { TaskPanel } from './TaskPanel';
import { TaskBoard, TaskTable } from './TaskViews';
import { errorText, type DepartmentOption, type StaffOption } from './shared';

const SEARCH_DELAY_MS = 250;
const LIVE_RELOAD_MS = 600;
const PAGE_STEP = 100;

const EMPTY_FILTERS: TaskFilters = {
  search: '', staffId: '', departmentKey: '', status: '', kind: '', overdueOnly: false, from: '', to: '',
};

type View = 'list' | 'board';

export const TaskListTab: React.FC<{
  staff: StaffOption[];
  departments: DepartmentOption[];
  /** Bumped by the page after a task is created, so the list reloads. */
  refreshKey: number;
  onChanged: () => void;
}> = ({ staff, departments, refreshKey, onChanged }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<TaskFilters>(() => ({ ...EMPTY_FILTERS, staffId: searchParams.get('staff') ?? '' }));
  const [searchDraft, setSearchDraft] = useState('');
  const [view, setView] = useState<View>('list');
  const [limit, setLimit] = useState(PAGE_STEP);
  const [tasks, setTasks] = useState<AdminTask[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ task: AdminTask; cancelling: boolean } | null>(null);
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
  }, [load, refreshKey]);

  // New recipient rows mean tasks changed somewhere, usually several at once.
  useEffect(() => {
    let handle: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = notificationActivity.subscribe(() => {
      if (handle) clearTimeout(handle);
      handle = setTimeout(() => { load(); onChanged(); }, LIVE_RELOAD_MS);
    });
    return () => {
      unsubscribe();
      if (handle) clearTimeout(handle);
    };
  }, [load, onChanged]);

  // A link from a notification opens that task, even if it's filtered out of view.
  const linkedTaskId = searchParams.get('task');
  useEffect(() => {
    if (!linkedTaskId) return undefined;
    let cancelled = false;
    // The link is cleared once it has landed; clearing it sooner would cancel this load.
    const clearLink = () => setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('task');
      return next;
    }, { replace: true });
    fetchTask(linkedTaskId)
      .then((task) => {
        if (cancelled) return;
        if (task) setDetail({ task, cancelling: false });
        else toast.error('That task no longer exists.');
        clearLink();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        toast.error(errorText(e));
        clearLink();
      });
    return () => { cancelled = true; };
  }, [linkedTaskId, setSearchParams]);

  const patch = (next: Partial<TaskFilters>) => {
    setLimit(PAGE_STEP);
    setFilters((current) => ({ ...current, ...next }));
  };

  const clearFilters = () => {
    setSearchDraft('');
    setLimit(PAGE_STEP);
    setFilters(EMPTY_FILTERS);
  };

  const departmentLabel = useCallback(
    (key: string | null) => departments.find((d) => d.key === key)?.label_en ?? '—',
    [departments],
  );

  const refresh = useCallback(() => { load(); onChanged(); }, [load, onChanged]);

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
          refresh();
        } catch (e) {
          toast.error(`Couldn't delete: ${errorText(e)}`);
        }
      },
    });
  };

  const anyFilter = useMemo(
    () => searchDraft !== '' || JSON.stringify({ ...filters, search: '' }) !== JSON.stringify(EMPTY_FILTERS),
    [filters, searchDraft],
  );

  const actions = {
    onOpen: (task: AdminTask) => setDetail({ task, cancelling: false }),
    onCancel: (task: AdminTask) => setDetail({ task, cancelling: true }),
    onDelete: askDelete,
  };

  return (
    <>
      <FilterBar
        filters={filters}
        search={searchDraft}
        staff={staff}
        departments={departments}
        onSearch={setSearchDraft}
        onChange={patch}
        onClear={clearFilters}
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[12.5px] tabular-nums text-black/45">{tasks ? `${total} ${total === 1 ? 'task' : 'tasks'}` : ' '}</p>
        <div role="group" aria-label="View" className="inline-flex rounded-full border border-subtle p-0.5">
          {(['list', 'board'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={cn(
                'h-11 rounded-full px-3.5 text-[12.5px] capitalize transition-colors md:h-8',
                view === option ? 'bg-brand-strong/10 font-medium text-brand-strong' : 'text-black/55 hover:text-foreground',
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        {error ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13px] text-red-700">
            <AlertTriangle size={15} className="shrink-0" />
            <span className="min-w-0 flex-1">Couldn't load tasks: {error}</span>
            <Button variant="outline" size="lg" className="!h-11 px-4 md:!h-9" onClick={load}>Try again</Button>
          </div>
        ) : !tasks ? (
          <div className="h-64 animate-pulse rounded-2xl bg-black/[0.04]" />
        ) : view === 'list' ? (
          <TaskTable tasks={tasks} departments={departments} empty={anyFilter ? 'No tasks match these filters' : 'No tasks yet'} {...actions} />
        ) : (
          <TaskBoard tasks={tasks} onOpen={actions.onOpen} />
        )}

        {tasks && tasks.length < total && (
          <div className="mt-3 text-center">
            <Button variant="ghost" size="lg" className="!h-11 px-4 md:!h-9" onClick={() => setLimit((n) => n + PAGE_STEP)}>
              Show more ({total - tasks.length} left)
            </Button>
          </div>
        )}
      </div>

      {detail && (
        <TaskPanel
          key={`${detail.task.id}-${detail.cancelling}`}
          task={detail.task}
          departmentLabel={departmentLabel(detail.task.department_key)}
          startCancelling={detail.cancelling}
          onClose={() => setDetail(null)}
          onChanged={refresh}
        />
      )}

      <ConfirmDialog state={confirm.state} pending={confirm.pending} onCancel={confirm.cancel} onConfirm={confirm.confirm} />
    </>
  );
};
