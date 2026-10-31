import React, { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import { AlertTriangle, Pencil, Trash2 } from '../../components/media/MediaIcons';
import { toast } from '../../components/media/MediaToast';
import { Button, Switch } from '../../components/media/MediaUI';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { istanbulToday } from '../../lib/homeData';
import { cn } from '../../lib/media/badgeColor';
import {
  deleteTemplate,
  fetchTemplates,
  nextOccurrence,
  recurrenceSentence,
  setTemplateActive,
  type TaskTemplate,
} from '../../lib/tasks';
import { useConfirm } from '../media/useConfirm';
import { PriorityChip, errorText, staffName, type DepartmentOption, type StaffOption } from './shared';

function formatDay(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}

export const RecurringTab: React.FC<{
  staff: StaffOption[];
  departments: DepartmentOption[];
  refreshKey: number;
  onEdit: (template: TaskTemplate) => void;
}> = ({ staff, departments, refreshKey, onEdit }) => {
  const [templates, setTemplates] = useState<TaskTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setError(null);
    try {
      setTemplates(await fetchTemplates());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const assignees = (template: TaskTemplate) => (
    template.assignee_profile_id
      ? staff.filter((person) => person.id === template.assignee_profile_id)
      : staff.filter((person) => person.department_key === template.department_key)
  );

  const assignLabel = (template: TaskTemplate) => {
    if (template.assignee_profile_id) {
      const person = staff.find((s) => s.id === template.assignee_profile_id);
      return person ? staffName(person) : 'Unknown person';
    }
    return departments.find((d) => d.key === template.department_key)?.label_en ?? 'Unknown department';
  };

  const toggle = async (template: TaskTemplate, next: boolean) => {
    const patch = (is_active: boolean) =>
      setTemplates((current) => current && current.map((t) => (t.id === template.id ? { ...t, is_active } : t)));

    patch(next);
    try {
      await setTemplateActive(template.id, next);
    } catch (e) {
      patch(template.is_active);
      toast.error(`Couldn't save: ${errorText(e)}`);
    }
  };

  const askDelete = (template: TaskTemplate) => {
    confirm.ask({
      title: 'Delete this recurring task?',
      description: `"${template.title}" won't create any more tasks.`,
      consequence: 'Tasks it already created stay in the Tasks tab.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await deleteTemplate(template.id);
          toast.success('Recurring task deleted');
          await load();
        } catch (e) {
          toast.error(`Couldn't delete: ${errorText(e)}`);
        }
      },
    });
  };

  const today = istanbulToday();

  return (
    <>
      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13px] text-red-700">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">Couldn't load recurring tasks: {error}</span>
          <Button variant="outline" size="lg" className="!h-11 px-4 md:!h-9" onClick={load}>Try again</Button>
        </div>
      ) : !templates ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-black/[0.04]" />)}
        </div>
      ) : templates.length === 0 ? (
        <p className="rounded-2xl border border-subtle px-5 py-16 text-center text-[13px] text-black/40">
          No recurring tasks yet. Turn on Repeat in a new task to create one.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const next = nextOccurrence(template, today);
            const people = assignees(template);
            return (
              <li key={template.id} className={cn('flex min-w-0 flex-col rounded-2xl border border-subtle bg-surface p-4', !template.is_active && 'opacity-70')}>
                <div className="flex items-start justify-between gap-3">
                  <h3 dir="auto" className="min-w-0 text-[14.5px] font-medium text-foreground">{template.title}</h3>
                  <span className="relative inline-flex shrink-0">
                    <Switch
                      checked={template.is_active}
                      onChange={(value) => toggle(template, value)}
                      ariaLabel={`${template.title} active`}
                      activeClass="bg-brand-strong"
                      className="after:absolute after:-inset-[13px] after:content-['']"
                    />
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-black/55">{recurrenceSentence(template, assignLabel(template))}</p>

                <div className="mt-3 flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {people.slice(0, 5).map((person) => <StaffAvatar key={person.id} profile={person} size={26} />)}
                  </div>
                  <span className="min-w-0 truncate text-[12.5px] text-black/50">
                    {people.length === 1 ? staffName(people[0]) : `${people.length} staff`}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-subtle pt-2.5">
                  <span className="text-[12.5px] text-black/50">
                    {!template.is_active ? 'Paused' : next ? `Next: ${formatDay(next)}` : 'Finished'}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <PriorityChip priority={template.priority} />
                    <button
                      type="button"
                      aria-label={`Edit ${template.title}`}
                      onClick={() => onEdit(template)}
                      className="grid h-11 w-11 place-items-center rounded-lg text-black/45 hover:text-foreground md:h-8 md:w-8"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${template.title}`}
                      onClick={() => askDelete(template)}
                      className="grid h-11 w-11 place-items-center rounded-lg text-black/40 hover:text-red-600 md:h-8 md:w-8"
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog state={confirm.state} pending={confirm.pending} onCancel={confirm.cancel} onConfirm={confirm.confirm} />
    </>
  );
};
