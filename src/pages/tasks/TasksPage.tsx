import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Plus } from '../../components/media/MediaIcons';
import { PageHeader } from '../../components/media/MediaShared';
import { MediaToaster } from '../../components/media/MediaToast';
import { Button } from '../../components/media/MediaUI';
import { useShell } from '../../components/shell/shellContext';
import { cn } from '../../lib/media/badgeColor';
import { supabase } from '../../lib/supabase';
import { fetchTaskStats, type TaskStats, type TaskTemplate } from '../../lib/tasks';
import { RecurringTab } from './RecurringTab';
import { StatTiles } from './StatTiles';
import { TaskComposer } from './TaskComposer';
import { TaskListTab } from './TaskListTab';
import { PRIMARY_BUTTON, errorText, type DepartmentOption, type StaffOption } from './shared';

type Tab = 'tasks' | 'recurring';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'recurring', label: 'Recurring' },
];

interface TeamRow {
  profile_id: string;
  department_key: string | null;
  is_active: boolean | null;
}

const TasksPage: React.FC = () => {
  const { profile } = useShell();
  const [tab, setTab] = useState<Tab>('tasks');
  const [staff, setStaff] = useState<StaffOption[] | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ template: TaskTemplate | null } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from('profiles').select('id, full_name, email, avatar_url, avatar_bg, gender').eq('role', 'staff').eq('status', 'active').order('full_name'),
      supabase.from('team_members').select('profile_id, department_key, is_active'),
      supabase.from('departments').select('key, label_en').eq('is_active', true).order('sort_order'),
    ])
      .then(([people, team, teams]) => {
        if (cancelled) return;
        [people, team, teams].forEach((result) => { if (result.error) throw new Error(result.error.message); });
        const members = new Map(((team.data ?? []) as TeamRow[]).map((row) => [row.profile_id, row]));
        // The same people admin_create_task sends to: active profile, active member.
        setStaff((people.data ?? [])
          .filter((person) => members.get(person.id)?.is_active)
          .map((person) => ({ ...person, department_key: members.get(person.id)?.department_key ?? null })));
        setDepartments((teams.data ?? []) as DepartmentOption[]);
      })
      .catch((e: unknown) => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, []);

  const loadStats = useCallback(() => {
    fetchTaskStats().then(setStats).catch(() => {
      // The tiles are a summary; the list below reports any real problem.
    });
  }, []);

  useEffect(() => { loadStats(); }, [loadStats, refreshKey]);

  return (
    <div className="media-scope mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader eyebrow="Staff" title="Tasks" subtitle="Assign work, set what repeats, and see it through." />
        <Button
          size="lg"
          className={PRIMARY_BUTTON}
          disabled={!staff}
          onClick={() => setComposer({ template: null })}>
          <Plus size={14} /> New task
        </Button>
      </div>

      <div className="mt-6"><StatTiles stats={stats} /></div>

      <div role="tablist" aria-label="Task views" className="mt-5 flex gap-1 overflow-x-auto border-b border-subtle">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px min-h-[44px] shrink-0 border-b-2 px-3 text-[13.5px] transition-colors',
              tab === key ? 'border-brand-strong font-medium text-brand-strong' : 'border-transparent text-black/55 hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {error ? (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13px] text-red-700">
            <AlertTriangle size={15} className="shrink-0" />
            Couldn't load staff and departments: {error}
          </div>
        ) : !staff ? (
          <div className="h-64 animate-pulse rounded-2xl bg-black/[0.04]" />
        ) : tab === 'tasks' ? (
          <TaskListTab staff={staff} departments={departments} refreshKey={refreshKey} onChanged={loadStats} />
        ) : (
          <RecurringTab
            staff={staff}
            departments={departments}
            refreshKey={refreshKey}
            onEdit={(template) => setComposer({ template })}
          />
        )}
      </div>

      {composer && staff && (
        <TaskComposer
          key={composer.template?.id ?? 'new'}
          template={composer.template}
          staff={staff}
          departments={departments}
          admin={{
            id: profile?.id ?? '',
            full_name: profile?.full_name ?? null,
            avatar_url: profile?.avatar_url ?? null,
            avatar_bg: profile?.avatar_bg ?? null,
            gender: profile?.gender ?? null,
          }}
          onClose={() => setComposer(null)}
          onSaved={() => {
            setComposer(null);
            setRefreshKey((n) => n + 1);
          }}
        />
      )}

      <MediaToaster />
    </div>
  );
};

export default TasksPage;
