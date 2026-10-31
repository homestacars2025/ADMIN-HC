import React, { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import { AlertTriangle, Pencil, Plus, Trash2 } from '../../components/media/MediaIcons';
import { toast } from '../../components/media/MediaToast';
import {
  Button,
  Field,
  Input,
  Sheet,
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
  Textarea,
} from '../../components/media/MediaUI';
import { istanbulToday } from '../../lib/homeData';
import { cn } from '../../lib/media/badgeColor';
import { PRIORITY_STYLES, type TaskPriority } from '../../lib/notifications';
import {
  WEEKDAYS,
  deleteTemplate,
  fetchTemplates,
  normalizeTemplate,
  runTaskGeneration,
  saveTemplate,
  scheduleSummary,
  setTemplateActive,
  templateError,
  type Frequency,
  type TaskTemplate,
  type TemplateDraft,
} from '../../lib/tasks';
import { useConfirm } from '../media/useConfirm';
import {
  AssignField,
  FIELD_CLASS,
  PRIMARY_BUTTON,
  PriorityChip,
  errorText,
  type DepartmentOption,
  type StaffOption,
} from './shared';

const PRIORITIES = Object.keys(PRIORITY_STYLES) as TaskPriority[];
const REPEAT_UNITS: Record<Frequency, string> = { daily: 'days', weekly: 'weeks', monthly: 'months' };
const FREQUENCIES: Array<{ value: Frequency; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const emptyDraft = (): TemplateDraft => ({
  title: '', description: null, department_key: null, assignee_profile_id: null, frequency: 'daily', repeat_every: 1,
  weekdays: null, due_day: null, due_time: '18:00', duration_days: 0, start_date: istanbulToday(), end_date: null,
  max_occurrences: null, priority: 'normal', requires_proof: false, is_active: true,
});

const TemplateSheet: React.FC<{
  template: TaskTemplate | null;
  staff: StaffOption[];
  departments: DepartmentOption[];
  adminId: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ template, staff, departments, adminId, onClose, onSaved }) => {
  const [draft, setDraft] = useState<TemplateDraft>(() => {
    if (!template) return emptyDraft();
    const { id, ...rest } = template;
    return { ...rest, due_time: template.due_time.slice(0, 5) };
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const toggleWeekday = (day: number) => {
    setDraft((current) => {
      const days = current.weekdays ?? [];
      return { ...current, weekdays: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] };
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = templateError(draft);
    if (problem) {
      toast.error(problem);
      return;
    }

    setSaving(true);
    try {
      await saveTemplate(template?.id ?? null, normalizeTemplate(draft), adminId);
    } catch (error) {
      toast.error(`Couldn't save: ${errorText(error)}`);
      setSaving(false);
      return;
    }

    // Saved either way from here, so a failed run isn't reported as a failed save.
    try {
      const created = await runTaskGeneration();
      toast.success(created > 0 ? `Saved. ${created} ${created === 1 ? 'task' : 'tasks'} created for today` : 'Saved');
    } catch (error) {
      toast.warning(`Saved, but today's tasks weren't generated: ${errorText(error)}`);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Sheet open onClose={onClose} ariaLabel={template ? 'Edit recurring task' : 'New recurring task'} maxWidthClass="sm:max-w-[560px]">
      <form onSubmit={submit} className="flex h-full flex-col">
        <SheetHeader>
          <SheetTitle>{template ? 'Edit recurring task' : 'New recurring task'}</SheetTitle>
          <SheetDescription>
            {template ? 'Changes apply from the next task. Any task already created stays as it is.' : 'Times are Istanbul time.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <Field label="Title">
            <Input autoFocus value={draft.title} onChange={(event) => set('title', event.target.value)} className="h-11 md:h-9" />
          </Field>
          <Field label="Description">
            <Textarea value={draft.description ?? ''} onChange={(event) => set('description', event.target.value)} rows={2} />
          </Field>

          <AssignField
            assignee={draft.assignee_profile_id ?? ''}
            department={draft.department_key ?? ''}
            staff={staff}
            departments={departments}
            onChange={({ assignee, department }) => setDraft((current) => ({
              ...current, assignee_profile_id: assignee || null, department_key: department || null,
            }))}
          />

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1.5 text-[13px] font-medium text-foreground">Repeats</legend>
            <div role="group" aria-label="Frequency" className="flex gap-1.5">
              {FREQUENCIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={draft.frequency === option.value}
                  onClick={() => setDraft((current) => ({
                    ...current,
                    frequency: option.value,
                    weekdays: option.value === 'weekly' ? current.weekdays ?? [] : current.weekdays,
                    due_day: option.value === 'monthly' ? current.due_day ?? 1 : current.due_day,
                  }))}
                  className={cn(
                    'h-11 flex-1 rounded-lg border text-[13px] font-medium transition-colors md:h-9',
                    draft.frequency === option.value
                      ? 'border-brand-strong bg-brand-strong/10 text-brand-strong'
                      : 'border-subtle text-black/60 hover:bg-black/[0.03]',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-[13px] text-foreground">
              Every
              <input
                type="number"
                min="1"
                aria-label="Repeat every"
                value={draft.repeat_every}
                onChange={(event) => set('repeat_every', Number(event.target.value))}
                className={cn(FIELD_CLASS, 'w-20')}
              />
              {REPEAT_UNITS[draft.frequency]}
            </label>

            {draft.frequency === 'weekly' && (
              <div role="group" aria-label="Weekdays" className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const on = draft.weekdays?.includes(day.value) ?? false;
                  return (
                    <button
                      key={day.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleWeekday(day.value)}
                      className={cn(
                        'h-11 min-w-[48px] rounded-full border px-3 text-[12.5px] font-medium transition-colors md:h-9',
                        on ? 'border-brand-strong bg-brand-strong/10 text-brand-strong' : 'border-subtle text-black/55 hover:bg-black/[0.03]',
                      )}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            )}

            {draft.frequency === 'monthly' && (
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                On day
                <input
                  type="number"
                  min="1"
                  max="28"
                  aria-label="Day of the month"
                  value={draft.due_day ?? ''}
                  onChange={(event) => set('due_day', event.target.value ? Number(event.target.value) : null)}
                  className={cn(FIELD_CLASS, 'w-20')}
                />
                of the month
              </label>
            )}
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Due time">
              <input type="time" value={draft.due_time} onChange={(event) => set('due_time', event.target.value)} className={FIELD_CLASS} />
            </Field>
            <Field label="Days to complete">
              <input
                type="number"
                min="0"
                value={draft.duration_days}
                onChange={(event) => set('duration_days', Number(event.target.value))}
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="Start date">
              <input type="date" value={draft.start_date} onChange={(event) => set('start_date', event.target.value)} className={FIELD_CLASS} />
            </Field>
            <Field label="End date (optional)">
              <input type="date" value={draft.end_date ?? ''} onChange={(event) => set('end_date', event.target.value || null)} className={FIELD_CLASS} />
            </Field>
            <Field label="Maximum times (optional)">
              <input
                type="number"
                min="1"
                value={draft.max_occurrences ?? ''}
                onChange={(event) => set('max_occurrences', event.target.value ? Number(event.target.value) : null)}
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="Priority">
              <select value={draft.priority} onChange={(event) => set('priority', event.target.value as TaskPriority)} className={FIELD_CLASS}>
                {PRIORITIES.map((option) => <option key={option} value={option}>{PRIORITY_STYLES[option].label}</option>)}
              </select>
            </Field>
          </div>

          <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-[13px] text-foreground">
            <input
              type="checkbox"
              checked={draft.requires_proof}
              onChange={(event) => set('requires_proof', event.target.checked)}
              className="h-4 w-4 accent-brand-strong"
            />
            Requires a proof photo
          </label>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" size="lg" className="h-11 !border-subtle px-4 md:h-9" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="lg" disabled={saving} className={PRIMARY_BUTTON}>{saving ? 'Saving…' : 'Save'}</Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
};

export const RecurringTab: React.FC<{
  staff: StaffOption[];
  departments: DepartmentOption[];
  adminId: string;
}> = ({ staff, departments, adminId }) => {
  const [templates, setTemplates] = useState<TaskTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TaskTemplate | 'new' | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setError(null);
    try {
      setTemplates(await fetchTemplates());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const assignLabel = (template: TaskTemplate) => {
    if (template.assignee_profile_id) {
      const person = staff.find((s) => s.id === template.assignee_profile_id);
      return person?.full_name || person?.email || 'Unknown person';
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

  return (
    <>
      <div className="flex justify-end">
        <Button size="lg" className={PRIMARY_BUTTON} onClick={() => setEditing('new')}>
          <Plus size={14} /> New recurring task
        </Button>
      </div>

      {error ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13px] text-red-700">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">Couldn't load recurring tasks: {error}</span>
          <Button variant="outline" size="lg" className="h-11 px-4 md:h-9" onClick={load}>Try again</Button>
        </div>
      ) : !templates ? (
        <div className="mt-3 h-48 animate-pulse rounded-2xl bg-black/[0.04]" />
      ) : templates.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-subtle px-5 py-14 text-center text-[13px] text-black/40">No recurring tasks yet</p>
      ) : (
        <ul className="mt-3 overflow-hidden rounded-2xl border border-subtle bg-surface">
          {templates.map((template) => (
            <li key={template.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-subtle px-5 py-3 last:border-b-0">
              <div className="min-w-[220px] flex-1">
                <div className={cn('text-[14px] font-medium text-foreground', !template.is_active && 'text-black/40')}>{template.title}</div>
                <div className="mt-0.5 text-[12.5px] text-black/50">{scheduleSummary(template)} · {assignLabel(template)}</div>
              </div>
              <PriorityChip priority={template.priority} />
              {template.requires_proof && <span className="text-[12px] text-black/45">Proof</span>}
              <div className="flex items-center gap-1">
                <span className="relative me-2 inline-flex">
                  <Switch
                    checked={template.is_active}
                    onChange={(next) => toggle(template, next)}
                    ariaLabel={`${template.title} active`}
                    activeClass="bg-brand-strong"
                    className="after:absolute after:-inset-[13px] after:content-['']"
                  />
                </span>
                <button
                  type="button"
                  aria-label={`Edit ${template.title}`}
                  onClick={() => setEditing(template)}
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
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <TemplateSheet
          key={editing === 'new' ? 'new' : editing.id}
          template={editing === 'new' ? null : editing}
          staff={staff}
          departments={departments}
          adminId={adminId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      <ConfirmDialog state={confirm.state} pending={confirm.pending} onCancel={confirm.cancel} onConfirm={confirm.confirm} />
    </>
  );
};
