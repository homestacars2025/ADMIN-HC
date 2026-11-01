import React, { useEffect, useMemo, useRef, useState } from 'react';
import DateRangePicker from '../../components/DateRangePicker';
import { Search } from '../../components/media/MediaIcons';
import { toast } from '../../components/media/MediaToast';
import { Button, Sheet, Switch } from '../../components/media/MediaUI';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { istanbulToday } from '../../lib/homeData';
import { cn } from '../../lib/media/badgeColor';
import { PRIORITY_STYLES, type TaskPriority } from '../../lib/notifications';
import {
  WEEKDAYS,
  addDays,
  createTask,
  istanbulLocalToIso,
  nextOccurrence,
  normalizeTemplate,
  quickDueValue,
  recurrenceError,
  recurrenceSentence,
  relativeDue,
  runTaskGeneration,
  saveTemplate,
  type Frequency,
  type QuickDue,
  type TaskTemplate,
  type TemplateDraft,
} from '../../lib/tasks';
import { DueCalendar } from './DueCalendar';
import { PhonePreview } from './PhonePreview';
import { FIELD_CLASS, PRIMARY_BUTTON, errorText, staffName, type DepartmentOption, type StaffOption } from './shared';

const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];
const FREQUENCIES: Array<{ value: Frequency; label: string; unit: string }> = [
  { value: 'daily', label: 'Daily', unit: 'days' },
  { value: 'weekly', label: 'Weekly', unit: 'weeks' },
  { value: 'monthly', label: 'Monthly', unit: 'months' },
];
const QUICK_DUES: Array<{ key: QuickDue; label: string }> = [
  { key: 'today', label: 'Today 18:00' },
  { key: 'tomorrow', label: 'Tomorrow 10:00' },
  { key: 'week_end', label: 'End of week' },
  { key: 'next_week', label: 'In a week' },
];

type DueChoice = QuickDue | 'custom' | 'none';
type Who = 'person' | 'department';

const SECTION_TITLE = 'mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-black/45';
const CHIP = 'inline-flex h-11 items-center rounded-full border px-3.5 text-[13px] transition-colors md:h-9';
const chipClass = (on: boolean) => cn(
  CHIP,
  on ? 'border-brand-strong bg-brand-strong/10 font-medium text-brand-strong' : 'border-subtle text-black/60 hover:bg-black/[0.03]',
);

interface ComposerProps {
  template: TaskTemplate | null;
  staff: StaffOption[];
  departments: DepartmentOption[];
  admin: { id: string; full_name: string | null; avatar_url: string | null; avatar_bg?: string | null; gender: string | null };
  onClose: () => void;
  onSaved: () => void;
}

type Rule = Omit<TemplateDraft, 'title' | 'description' | 'department_key' | 'assignee_profile_id' | 'priority' | 'requires_proof' | 'weekdays'> & { weekdays: number[] };

const defaultRule = (): Rule => ({
  frequency: 'weekly', repeat_every: 1, weekdays: [], due_day: 1, due_time: '18:00', duration_days: 0,
  start_date: istanbulToday(), end_date: null, max_occurrences: null, is_active: true,
});

const FieldError: React.FC<{ show: boolean; message: string | null }> = ({ show, message }) => (
  show && message ? <p role="alert" className="mt-1.5 text-[12.5px] text-red-600">{message}</p> : null
);

const NumberRow: React.FC<{ before: string; after?: string; value: number | ''; min: number; max?: number; onChange: (value: number | '') => void }> = ({ before, after, value, min, max, onChange }) => (
  <label className="flex items-center gap-2 text-[13px] text-foreground">
    {before}
    <input
      type="number"
      aria-label={before}
      min={min}
      max={max}
      value={value}
      onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      className={cn(FIELD_CLASS, 'w-20')}
    />
    {after}
  </label>
);

export const TaskComposer: React.FC<ComposerProps> = ({ template, staff, departments, admin, onClose, onSaved }) => {
  const editing = template !== null;
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [title, setTitle] = useState(template?.title ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [who, setWho] = useState<Who>(template?.department_key && !template.assignee_profile_id ? 'department' : 'person');
  const [personId, setPersonId] = useState(template?.assignee_profile_id ?? '');
  const [departmentKey, setDepartmentKey] = useState(template?.department_key ?? '');
  const [personSearch, setPersonSearch] = useState('');

  const today = istanbulToday();
  const todayAvailable = new Date(istanbulLocalToIso(quickDueValue('today'))) > new Date();
  const [due, setDue] = useState<DueChoice>(todayAvailable ? 'today' : 'tomorrow');
  const [customDue, setCustomDue] = useState('');

  const [repeat, setRepeat] = useState(editing);
  const [rule, setRule] = useState<Rule>(() => (template
    ? {
        frequency: template.frequency, repeat_every: template.repeat_every, weekdays: template.weekdays ?? [],
        due_day: template.due_day ?? 1, due_time: template.due_time.slice(0, 5), duration_days: template.duration_days,
        start_date: template.start_date, end_date: template.end_date, max_occurrences: template.max_occurrences,
        is_active: template.is_active,
      }
    : defaultRule()));
  const [priority, setPriority] = useState<TaskPriority>(template?.priority ?? 'normal');
  const [requiresProof, setRequiresProof] = useState(template?.requires_proof ?? false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { titleRef.current?.focus(); }, []);

  // Grows with what's typed, instead of scrolling inside a small box.
  useEffect(() => {
    const box = bodyRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }, [description]);

  const membersOf = (key: string) => staff.filter((person) => person.department_key === key);

  const filteredStaff = useMemo(() => {
    const query = personSearch.trim().toLowerCase();
    return query ? staff.filter((person) => staffName(person).toLowerCase().includes(query)) : staff;
  }, [staff, personSearch]);

  const departmentName = (key: string | null) => departments.find((d) => d.key === key)?.label_en ?? '';
  const person = staff.find((option) => option.id === personId);
  const assigneeLabel = who === 'person' ? (person ? staffName(person) : '') : departmentName(departmentKey);
  const recipientCount = who === 'person' ? (personId ? 1 : 0) : membersOf(departmentKey).length;

  const dueValue = due === 'none' ? '' : due === 'custom' ? customDue : quickDueValue(due);
  const dueIso = dueValue ? istanbulLocalToIso(dueValue) : null;

  const firstDay = repeat ? nextOccurrence(rule, today) : null;
  const previewDue = repeat
    ? (firstDay ? istanbulLocalToIso(`${addDays(firstDay, rule.duration_days || 0)}T${rule.due_time}`) : null)
    : dueIso;

  const draft: TemplateDraft = {
    ...rule,
    title,
    description,
    department_key: who === 'department' ? departmentKey || null : null,
    assignee_profile_id: who === 'person' ? personId || null : null,
    priority,
    requires_proof: requiresProof,
  };

  const errors = {
    title: title.trim() ? null : 'Give the task a title.',
    who: who === 'person'
      ? (personId ? null : 'Choose a person.')
      : !departmentKey ? 'Choose a department.' : recipientCount === 0 ? 'Nobody is active in this department.' : null,
    due: repeat || due === 'none'
      ? null
      : !dueIso ? 'Choose a date and time.' : new Date(dueIso) <= new Date() ? 'That time has already passed.' : null,
    repeat: repeat ? recurrenceError(draft) : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (invalid || saving) return;

    setSaving(true);
    if (repeat) {
      try {
        await saveTemplate(template?.id ?? null, normalizeTemplate(draft), admin.id);
      } catch (error) {
        toast.error(`Couldn't save: ${errorText(error)}`);
        setSaving(false);
        return;
      }
      // Saved either way from here, so a failed run isn't reported as a failed save.
      try {
        const created = await runTaskGeneration();
        toast.success(created > 0 ? `Saved. ${created} ${created === 1 ? 'task' : 'tasks'} sent today` : 'Recurring task saved');
      } catch (error) {
        toast.warning(`Saved, but today's tasks weren't sent: ${errorText(error)}`);
      }
      setSaving(false);
      onSaved();
      return;
    }

    try {
      const count = await createTask({
        title: title.trim(),
        description: description.trim() || null,
        assignee: who === 'person' ? personId : null,
        department: who === 'department' ? departmentKey : null,
        dueAt: dueIso,
        priority,
        requiresProof,
      });
      if (count === 0) {
        toast.warning('Nobody is active in that department, so no task was created.');
        setSaving(false);
        return;
      }
      toast.success("Task sent. They've been notified");
      setSaving(false);
      onSaved();
    } catch (error) {
      toast.error(`Couldn't create the task: ${errorText(error)}`);
      setSaving(false);
    }
  };

  const setRuleField = <K extends keyof Rule>(key: K, value: Rule[K]) =>
    setRule((current) => ({ ...current, [key]: value }));

  const toggleWeekday = (day: number) => setRule((current) => ({
    ...current,
    weekdays: current.weekdays.includes(day) ? current.weekdays.filter((d) => d !== day) : [...current.weekdays, day],
  }));

  const createLabel = editing
    ? 'Save changes'
    : recipientCount > 0 ? `Create for ${recipientCount} staff` : 'Create';

  return (
    <Sheet open onClose={onClose} ariaLabel={editing ? 'Edit recurring task' : 'New task'} maxWidthClass="sm:max-w-[520px]">
      <form onSubmit={submit} noValidate className="flex h-full min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-7 px-6 pb-6 pt-7">
            <div className="pe-8">
              <input
                ref={titleRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What needs doing?"
                aria-label="Title"
                dir="auto"
                className="w-full bg-transparent text-[22px] font-medium tracking-[-0.018em] text-foreground outline-none placeholder:text-black/25"
              />
              <FieldError show={attempted} message={errors.title} />
              <textarea
                ref={bodyRef}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit();
                }}
                placeholder="Add details"
                aria-label="Description"
                dir="auto"
                rows={1}
                className="mt-2 w-full resize-none overflow-hidden bg-transparent text-[14px] leading-relaxed text-black/70 outline-none placeholder:text-black/30"
              />
            </div>

            <section>
              <h3 className={SECTION_TITLE}>Who</h3>
              <div role="tablist" aria-label="Who" className="mb-3 inline-flex rounded-full border border-subtle p-0.5">
                {(['person', 'department'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={who === option}
                    onClick={() => setWho(option)}
                    className={cn(
                      'h-11 rounded-full px-4 text-[13px] capitalize transition-colors md:h-8',
                      who === option ? 'bg-brand-strong/10 font-medium text-brand-strong' : 'text-black/55',
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>

              {who === 'person' ? (
                <>
                  <div className="relative mb-2">
                    <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-black/35" />
                    <input
                      value={personSearch}
                      onChange={(event) => setPersonSearch(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }}
                      placeholder="Search staff"
                      aria-label="Search staff"
                      className={cn(FIELD_CLASS, 'ps-8')}
                    />
                  </div>
                  <ul className="flex max-h-[220px] flex-col gap-0.5 overflow-y-auto">
                    {filteredStaff.map((option) => (
                      <li key={option.id}>
                        <button
                          type="button"
                          aria-pressed={personId === option.id}
                          onClick={() => setPersonId(option.id)}
                          className={cn(
                            'flex min-h-[48px] w-full items-center gap-2.5 rounded-xl px-2 text-left transition-colors',
                            personId === option.id ? 'bg-brand-strong/[0.08]' : 'hover:bg-black/[0.03]',
                          )}
                        >
                          <StaffAvatar profile={option} size={32} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] text-foreground">{staffName(option)}</span>
                            <span className="block truncate text-[12px] text-black/45">{departmentName(option.department_key) || 'No department'}</span>
                          </span>
                          {personId === option.id && <span aria-hidden="true" className="text-[15px] text-brand-strong">✓</span>}
                        </button>
                      </li>
                    ))}
                    {filteredStaff.length === 0 && <li className="py-6 text-center text-[13px] text-black/40">Nobody matches</li>}
                  </ul>
                </>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {departments.map((department) => {
                    const members = membersOf(department.key);
                    const selected = departmentKey === department.key;
                    return (
                      <button
                        key={department.key}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setDepartmentKey(department.key)}
                        className={cn(
                          'min-h-[88px] rounded-xl border p-3 text-left transition-colors',
                          selected ? 'border-brand-strong bg-brand-strong/[0.06]' : 'border-subtle hover:bg-black/[0.02]',
                        )}
                      >
                        <div className="text-[13.5px] font-medium text-foreground">{department.label_en}</div>
                        <div className="mt-2 flex -space-x-2 rtl:space-x-reverse">
                          {members.slice(0, 5).map((member) => <StaffAvatar key={member.id} profile={member} size={24} />)}
                        </div>
                        <div className="mt-1.5 text-[12px] text-black/50">
                          {members.length === 0 ? 'Nobody active' : members.length === 1 ? '1 staff gets this' : `${members.length} staff will each get a copy`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <FieldError show={attempted} message={errors.who} />
            </section>

            {!repeat && (
              <section>
                <h3 className={SECTION_TITLE}>When</h3>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_DUES.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      aria-pressed={due === chip.key}
                      disabled={chip.key === 'today' && !todayAvailable}
                      onClick={() => setDue(chip.key)}
                      className={cn(chipClass(due === chip.key), 'disabled:cursor-not-allowed disabled:opacity-40')}
                    >
                      {chip.label}
                    </button>
                  ))}
                  <button type="button" aria-pressed={due === 'custom'} onClick={() => setDue('custom')} className={chipClass(due === 'custom')}>Custom</button>
                  <button type="button" aria-pressed={due === 'none'} onClick={() => setDue('none')} className={chipClass(due === 'none')}>No due date</button>
                </div>
                {due === 'custom' && <DueCalendar value={customDue} today={today} onChange={setCustomDue} />}
                {dueIso && <p className="mt-2 text-[12.5px] text-black/45">Due {relativeDue(dueIso)}, Istanbul time</p>}
                <FieldError show={attempted} message={errors.due} />
              </section>
            )}

            <section className="rounded-xl border border-subtle p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[13.5px] font-medium text-foreground">Repeat</h3>
                  <p className="text-[12px] text-black/45">{editing ? 'Changes apply from the next task.' : 'Send this on a schedule.'}</p>
                </div>
                {!editing && (
                  <Switch
                    checked={repeat}
                    onChange={setRepeat}
                    ariaLabel="Repeat"
                    activeClass="bg-brand-strong"
                    className="after:absolute after:-inset-[13px] after:content-['']"
                  />
                )}
              </div>

              {repeat && (
                <div className="mt-4 flex flex-col gap-3">
                  <div role="group" aria-label="Frequency" className="flex gap-1.5">
                    {FREQUENCIES.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={rule.frequency === option.value}
                        onClick={() => setRuleField('frequency', option.value)}
                        className={cn(chipClass(rule.frequency === option.value), 'flex-1 justify-center')}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {rule.frequency === 'weekly' && (
                    <div role="group" aria-label="Weekdays" className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map((day) => (
                        <button
                          key={day.value}
                          type="button"
                          aria-pressed={rule.weekdays.includes(day.value)}
                          aria-label={day.label}
                          onClick={() => toggleWeekday(day.value)}
                          className={cn(chipClass(rule.weekdays.includes(day.value)), 'w-11 justify-center px-0')}
                        >
                          {day.label.charAt(0)}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <NumberRow
                      before="Every"
                      after={FREQUENCIES.find((f) => f.value === rule.frequency)?.unit}
                      min={1}
                      value={rule.repeat_every}
                      onChange={(value) => setRuleField('repeat_every', value === '' ? 0 : value)}
                    />
                    {rule.frequency === 'monthly' && (
                      <NumberRow
                        before="On day"
                        min={1}
                        max={28}
                        value={rule.due_day ?? ''}
                        onChange={(value) => setRuleField('due_day', value === '' ? null : value)}
                      />
                    )}
                    <label className="flex items-center gap-2 text-[13px] text-foreground">
                      At
                      <input type="time" aria-label="Due time" value={rule.due_time} onChange={(event) => setRuleField('due_time', event.target.value)} className={cn(FIELD_CLASS, 'w-[110px]')} />
                    </label>
                  </div>

                  <div className="text-[12.5px] text-black/55">
                    Runs from, and optionally until
                    <DateRangePicker
                      value={{ from: rule.start_date, to: rule.end_date ?? '' }}
                      onApply={(range) => setRule((current) => ({ ...current, start_date: range.from, end_date: range.to || null }))}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-[12.5px] text-black/55">
                      Days to complete
                      <input type="number" min="0" value={rule.duration_days} onChange={(event) => setRuleField('duration_days', Number(event.target.value))} className={cn(FIELD_CLASS, 'mt-1')} />
                    </label>
                    <label className="text-[12.5px] text-black/55">
                      Maximum times (optional)
                      <input
                        type="number"
                        min="1"
                        value={rule.max_occurrences ?? ''}
                        onChange={(event) => setRuleField('max_occurrences', event.target.value ? Number(event.target.value) : null)}
                        className={cn(FIELD_CLASS, 'mt-1')}
                      />
                    </label>
                  </div>

                  <p className="rounded-lg bg-brand-strong/[0.06] px-3 py-2 text-[13px] text-brand-strong">
                    {rule.frequency === 'weekly' && rule.weekdays.length === 0
                      ? 'Choose the days it repeats on.'
                      : recurrenceSentence(rule, assigneeLabel)}
                  </p>
                  <FieldError show={attempted} message={errors.repeat} />
                </div>
              )}
            </section>

            <section>
              <h3 className={SECTION_TITLE}>Priority</h3>
              <div role="group" aria-label="Priority" className="flex flex-wrap gap-1.5">
                {PRIORITIES.map((option) => {
                  const style = PRIORITY_STYLES[option];
                  const on = priority === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPriority(option)}
                      style={on ? { background: style.bg, color: style.color, borderColor: style.color } : undefined}
                      className={cn(CHIP, on ? 'font-medium' : 'border-subtle text-black/60 hover:bg-black/[0.03]')}
                    >
                      {style.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="flex min-h-[44px] items-center justify-between gap-3">
              <span className="text-[13.5px] text-foreground">Requires a proof photo</span>
              <Switch
                checked={requiresProof}
                onChange={setRequiresProof}
                ariaLabel="Requires a proof photo"
                activeClass="bg-brand-strong"
                className="after:absolute after:-inset-[13px] after:content-['']"
              />
            </div>

            <section>
              <h3 className={SECTION_TITLE}>On their phone</h3>
              <PhonePreview
                title={title}
                description={description}
                priority={priority}
                dueIso={previewDue}
                recurring={repeat}
                requiresProof={requiresProof}
                from={admin}
              />
            </section>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-subtle bg-surface px-6 py-3">
          <Button type="button" variant="ghost" size="lg" className="!h-11 px-4 md:!h-10" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="lg" disabled={saving} className={PRIMARY_BUTTON}>{saving ? 'Sending…' : createLabel}</Button>
        </div>
      </form>
    </Sheet>
  );
};
