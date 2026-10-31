import React, { useEffect, useState } from 'react';
import { AlertTriangle } from '../../components/media/MediaIcons';
import { PageHeader } from '../../components/media/MediaShared';
import { MediaToaster } from '../../components/media/MediaToast';
import { useShell } from '../../components/shell/shellContext';
import { cn } from '../../lib/media/badgeColor';
import { supabase } from '../../lib/supabase';
import { RecurringTab } from './RecurringTab';
import { TaskListTab } from './TaskListTab';
import { errorText, type DepartmentOption, type StaffOption } from './shared';

type Tab = 'tasks' | 'recurring';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'recurring', label: 'Recurring' },
];

const TasksPage: React.FC = () => {
  const { profile } = useShell();
  const [tab, setTab] = useState<Tab>('tasks');
  const [staff, setStaff] = useState<StaffOption[] | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from('profiles').select('id, full_name, email').eq('role', 'staff').eq('status', 'active').order('full_name'),
      supabase.from('departments').select('key, label_en').eq('is_active', true).order('sort_order'),
    ])
      .then(([people, teams]) => {
        if (cancelled) return;
        if (people.error) throw new Error(people.error.message);
        if (teams.error) throw new Error(teams.error.message);
        setStaff((people.data ?? []) as StaffOption[]);
        setDepartments((teams.data ?? []) as DepartmentOption[]);
      })
      .catch((e: unknown) => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="media-scope mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <PageHeader eyebrow="Staff" title="Tasks" subtitle="Assign one-off and recurring tasks, and follow them through." />

      <div role="tablist" aria-label="Task views" className="mt-6 flex gap-1 overflow-x-auto border-b border-subtle">
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
          <TaskListTab staff={staff} departments={departments} />
        ) : (
          <RecurringTab staff={staff} departments={departments} adminId={profile?.id ?? ''} />
        )}
      </div>

      <MediaToaster />
    </div>
  );
};

export default TasksPage;
