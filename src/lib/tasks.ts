import { cleanTerm } from './globalSearch';
import { supabase } from './supabase';

export type TaskStatus = 'open' | 'claimed' | 'done' | 'missed' | 'cancelled';
export type TaskKind = 'one_off' | 'recurring';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type Frequency = 'daily' | 'weekly' | 'monthly';

export interface TaskPerson {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_bg?: string | null;
  gender: string | null;
}

export interface AdminTask {
  id: string;
  title: string;
  description: string | null;
  kind: TaskKind;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  department_key: string | null;
  due_at: string | null;
  requires_proof: boolean;
  proof_url: string | null;
  completion_notes: string | null;
  completed_at: string | null;
  missed_at: string | null;
  cancel_reason: string | null;
  template_id: string | null;
  created_at: string;
  updated_at: string;
  due_soon_notified_at: string | null;
  overdue_notified_at: string | null;
  assignee: TaskPerson | TaskPerson[] | null;
  creator: { full_name: string | null } | { full_name: string | null }[] | null;
}

export interface TaskFilters {
  search: string;
  staffId: string;
  departmentKey: string;
  status: '' | 'open' | 'done' | 'missed' | 'cancelled';
  kind: '' | TaskKind;
  overdueOnly: boolean;
  from: string;
  to: string;
}

export interface TaskTemplate {
  id: string;
  title: string;
  description: string | null;
  department_key: string | null;
  assignee_profile_id: string | null;
  frequency: Frequency;
  repeat_every: number;
  weekdays: number[] | null;
  due_day: number | null;
  due_time: string;
  duration_days: number;
  start_date: string;
  end_date: string | null;
  max_occurrences: number | null;
  priority: TaskPriority;
  requires_proof: boolean;
  is_active: boolean;
}

export type TemplateDraft = Omit<TaskTemplate, 'id'>;

export interface StaffTaskCounts {
  open: number;
  done: number;
  missed: number;
  overdue: number;
}

const PAGE_SIZE = 100;
const OPEN_STATUSES: TaskStatus[] = ['open', 'claimed'];
const PROOF_BUCKET = 'task-proofs';
/** Turkey has been on UTC+3 all year since 2016. */
const ISTANBUL_OFFSET = '+03:00';
const TIME_ZONE = 'Europe/Istanbul';

const COLUMNS =
  'id, title, description, kind, status, priority, assigned_to, department_key, due_at, requires_proof, ' +
  'proof_url, completion_notes, completed_at, missed_at, cancel_reason, template_id, created_at, updated_at, ' +
  'due_soon_notified_at, overdue_notified_at, ' +
  'assignee:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url, avatar_bg, gender), ' +
  'creator:profiles!tasks_created_by_fkey(full_name)';

export const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

export const STATUS_STYLES: Record<TaskStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-brand-strong/10 text-brand-strong' },
  // Nothing creates this any more, but older rows can still hold it.
  claimed: { label: 'Open', className: 'bg-brand-strong/10 text-brand-strong' },
  done: { label: 'Done', className: 'bg-emerald-500/10 text-emerald-700' },
  missed: { label: 'Missed', className: 'bg-red-500/10 text-red-600' },
  cancelled: { label: 'Cancelled', className: 'bg-black/[0.05] text-black/55' },
};

export const isTaskOpen = (status: TaskStatus) => OPEN_STATUSES.includes(status);

export function isTaskOverdue(task: Pick<AdminTask, 'status' | 'due_at'>, now = new Date()): boolean {
  return isTaskOpen(task.status) && task.due_at !== null && new Date(task.due_at) < now;
}

/** The coloured edge on a card. A normal task carries none, so the others stand out. */
export const PRIORITY_EDGE: Record<TaskPriority, string | null> = {
  urgent: '#DC2626',
  high: '#F59E0B',
  normal: null,
  low: '#D4D4D4',
};

export function taskAssignee(task: Pick<AdminTask, 'assignee'>): TaskPerson | null {
  return Array.isArray(task.assignee) ? task.assignee[0] ?? null : task.assignee;
}

/** The value of a datetime-local field, read as Istanbul time wherever the browser is. */
export function istanbulLocalToIso(value: string): string {
  return `${value}:00${ISTANBUL_OFFSET}`;
}

export function formatDue(iso: string | null): string {
  if (!iso) return 'No due date';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const dayAfter = (date: string) => addDays(date, 1);

/** The calendar day a moment falls on in Istanbul, YYYY-MM-DD. */
function istanbulDay(moment: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(moment));
}

/** 1 = Monday … 7 = Sunday, the same numbering as `weekdays` and Postgres isodow. */
export function isoWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** "in 2 hours", "3 days ago". */
export function relativeDue(iso: string | null, now = new Date(), locale = 'en'): string {
  if (!iso) return '';
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');
  return format.format(Math.round(hours / 24), 'day');
}

function plural(count: number, one: string): string {
  return count === 1 ? one : `${count} ${one}s`;
}

/** "Every 2 weeks on Mon, Wed at 18:00" */
export function scheduleSummary(
  template: Pick<TaskTemplate, 'frequency' | 'repeat_every' | 'weekdays' | 'due_day' | 'due_time'>,
): string {
  const every = template.repeat_every;
  const time = template.due_time.slice(0, 5);

  if (template.frequency === 'daily') {
    return `${every === 1 ? 'Every day' : `Every ${every} days`} at ${time}`;
  }
  if (template.frequency === 'weekly') {
    const days = WEEKDAYS.filter((day) => template.weekdays?.includes(day.value)).map((day) => day.label).join(', ');
    return `${every === 1 ? 'Every week' : `Every ${plural(every, 'week')}`} on ${days} at ${time}`;
  }
  return `${every === 1 ? 'Every month' : `Every ${plural(every, 'month')}`} on day ${template.due_day} at ${time}`;
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function listOf(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}

/** "Repeats every Monday and Thursday at 18:00 for Operations, starting 1 Nov" */
export function recurrenceSentence(
  template: Pick<TaskTemplate, 'frequency' | 'repeat_every' | 'weekdays' | 'due_day' | 'due_time' | 'start_date'>,
  assignee: string,
): string {
  const every = template.repeat_every;
  const time = template.due_time.slice(0, 5);
  let when: string;

  if (template.frequency === 'daily') {
    when = every === 1 ? 'every day' : `every ${every} days`;
  } else if (template.frequency === 'weekly') {
    const days = (template.weekdays ?? []).slice().sort((a, b) => a - b).map((day) => WEEKDAY_NAMES[day - 1]);
    const named = days.length ? listOf(days) : 'no day yet';
    when = every === 1 ? `every ${named}` : `every ${every} weeks on ${named}`;
  } else {
    const prefix = every === 1 ? 'every month' : `every ${every} months`;
    when = `${prefix} on day ${template.due_day ?? '—'}`;
  }

  return `Repeats ${when} at ${time}${assignee ? ` for ${assignee}` : ''}, starting ${shortDate(template.start_date)}`;
}

function monthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

type Schedule = Pick<TaskTemplate, 'frequency' | 'repeat_every' | 'weekdays' | 'due_day' | 'start_date'>;

/** The same test `generate_recurring_tasks` runs for a day. */
function occursOn(template: Schedule, date: string): boolean {
  const every = template.repeat_every;
  if (template.frequency === 'daily') {
    return (Date.parse(date) - Date.parse(template.start_date)) / 86_400_000 % every === 0;
  }
  if (template.frequency === 'weekly') {
    if (!template.weekdays?.includes(isoWeekday(date))) return false;
    const weeks = (Date.parse(mondayOf(date)) - Date.parse(mondayOf(template.start_date))) / (7 * 86_400_000);
    return weeks % every === 0;
  }
  return Number(date.slice(8)) === template.due_day && monthsBetween(template.start_date, date) % every === 0;
}

/** The next day this template creates a task, on or after today. Null if it never will. */
export function nextOccurrence(
  template: Schedule & Pick<TaskTemplate, 'end_date' | 'is_active'>,
  today: string,
): string | null {
  if (!template.is_active) return null;
  const SEARCH_DAYS = 1500;
  const start = template.start_date > today ? template.start_date : today;
  for (let offset = 0; offset < SEARCH_DAYS; offset += 1) {
    const date = addDays(start, offset);
    if (template.end_date && date > template.end_date) return null;
    if (occursOn(template, date)) return date;
  }
  return null;
}

export type QuickDue = 'today' | 'tomorrow' | 'week_end' | 'next_week';

/** The moment a quick chip stands for, as a datetime-local value in Istanbul time. */
export function quickDueValue(choice: QuickDue, now = new Date()): string {
  const today = istanbulDay(now);
  if (choice === 'today') return `${today}T18:00`;
  if (choice === 'tomorrow') return `${addDays(today, 1)}T10:00`;
  if (choice === 'week_end') return `${addDays(today, 7 - isoWeekday(today))}T18:00`;
  return `${addDays(today, 7)}T18:00`;
}

export interface TaskStatRow {
  status: TaskStatus;
  created_at: string;
  due_at: string | null;
  completed_at: string | null;
  missed_at: string | null;
  updated_at: string;
}

export interface TaskStats {
  open: number;
  overdue: number;
  doneThisWeek: number;
  missedThisMonth: number;
  trends: Record<'open' | 'overdue' | 'done' | 'missed', number[]>;
}

const TREND_DAYS = 14;

export function computeTaskStats(rows: TaskStatRow[], now = new Date()): TaskStats {
  const today = istanbulDay(now);
  const weekStart = mondayOf(today);
  const monthStart = `${today.slice(0, 7)}-01`;

  const dayOf = (value: string | null) => (value ? istanbulDay(value) : null);
  const days = Array.from({ length: TREND_DAYS }, (_, i) => addDays(today, i - TREND_DAYS + 1));

  // How a day's end looked: created by then, and not yet closed by then.
  const openOn = (row: TaskStatRow, day: string) => {
    const created = dayOf(row.created_at) as string;
    if (created > day) return false;
    const closed = dayOf(row.completed_at) ?? dayOf(row.missed_at) ?? (row.status === 'cancelled' ? dayOf(row.updated_at) : null);
    return closed === null || closed > day;
  };

  return {
    open: rows.filter((row) => isTaskOpen(row.status)).length,
    overdue: rows.filter((row) => isTaskOverdue(row, now)).length,
    doneThisWeek: rows.filter((row) => (dayOf(row.completed_at) ?? '') >= weekStart).length,
    missedThisMonth: rows.filter((row) => (dayOf(row.missed_at) ?? '') >= monthStart).length,
    trends: {
      open: days.map((day) => rows.filter((row) => openOn(row, day)).length),
      overdue: days.map((day) => rows.filter((row) => openOn(row, day) && (dayOf(row.due_at) ?? '9') < day).length),
      done: days.map((day) => rows.filter((row) => dayOf(row.completed_at) === day).length),
      missed: days.map((day) => rows.filter((row) => dayOf(row.missed_at) === day).length),
    },
  };
}

/** Why a template can't be saved, or null when it can. */
/** The schedule alone, for a form that reports title and assignee in their own places. */
export function recurrenceError(draft: TemplateDraft): string | null {
  if (!Number.isInteger(draft.repeat_every) || draft.repeat_every < 1) return 'Repeat must be 1 or more.';
  if (draft.frequency === 'weekly' && !draft.weekdays?.length) return 'Choose at least one weekday.';
  if (draft.frequency === 'monthly') {
    const day = draft.due_day ?? 0;
    if (!Number.isInteger(day) || day < 1 || day > 28) return 'The monthly day must be between 1 and 28.';
  }
  if (!Number.isInteger(draft.duration_days) || draft.duration_days < 0) return 'Duration can’t be negative.';
  if (!draft.start_date) return 'Choose a start date.';
  if (draft.end_date && draft.end_date < draft.start_date) return 'The end date is before the start date.';
  if (draft.max_occurrences !== null && (!Number.isInteger(draft.max_occurrences) || draft.max_occurrences < 1)) {
    return 'Maximum occurrences must be 1 or more.';
  }
  return null;
}

export function templateError(draft: TemplateDraft): string | null {
  if (!draft.title.trim()) return 'Enter a title.';
  if (!draft.assignee_profile_id && !draft.department_key) return 'Choose a person or a department.';
  return recurrenceError(draft);
}

/** Keeps only the fields this frequency and assignment actually use. */
export function normalizeTemplate(draft: TemplateDraft): TemplateDraft {
  return {
    ...draft,
    title: draft.title.trim(),
    description: draft.description?.trim() || null,
    department_key: draft.assignee_profile_id ? null : draft.department_key,
    weekdays: draft.frequency === 'weekly' ? [...(draft.weekdays ?? [])].sort((a, b) => a - b) : null,
    due_day: draft.frequency === 'monthly' ? draft.due_day : null,
  };
}

function failIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function fetchTasks(filters: TaskFilters, limit = PAGE_SIZE): Promise<{ tasks: AdminTask[]; total: number }> {
  let query = supabase
    .from('tasks')
    .select(COLUMNS, { count: 'exact' })
    .order('due_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  const term = cleanTerm(filters.search);
  if (term) query = query.or(`title.ilike.*${term}*,description.ilike.*${term}*`);
  if (filters.staffId) query = query.eq('assigned_to', filters.staffId);
  if (filters.departmentKey) query = query.eq('department_key', filters.departmentKey);
  if (filters.kind) query = query.eq('kind', filters.kind);
  if (filters.status === 'open') query = query.in('status', OPEN_STATUSES);
  else if (filters.status) query = query.eq('status', filters.status);
  if (filters.overdueOnly) query = query.in('status', OPEN_STATUSES).lt('due_at', new Date().toISOString());
  if (filters.from) query = query.gte('due_at', `${filters.from}T00:00:00${ISTANBUL_OFFSET}`);
  if (filters.to) query = query.lt('due_at', `${dayAfter(filters.to)}T00:00:00${ISTANBUL_OFFSET}`);

  const { data, error, count } = await query;
  failIf(error);
  return { tasks: (data ?? []) as unknown as AdminTask[], total: count ?? 0 };
}

export async function fetchTask(id: string): Promise<AdminTask | null> {
  const { data, error } = await supabase.from('tasks').select(COLUMNS).eq('id', id).maybeSingle();
  failIf(error);
  return data as unknown as AdminTask | null;
}

export async function fetchTaskStats(): Promise<TaskStats> {
  const { data, error } = await supabase
    .from('tasks')
    .select('status, created_at, due_at, completed_at, missed_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(5000);
  failIf(error);
  return computeTaskStats((data ?? []) as TaskStatRow[]);
}

export async function createTask(input: {
  title: string;
  description: string | null;
  assignee: string | null;
  department: string | null;
  dueAt: string | null;
  priority: TaskPriority;
  requiresProof: boolean;
}): Promise<number> {
  const { data, error } = await supabase.rpc('admin_create_task', {
    p_title: input.title,
    p_description: input.description,
    p_assignee: input.assignee,
    p_department: input.department,
    p_due_at: input.dueAt,
    p_priority: input.priority,
    p_requires_proof: input.requiresProof,
  });
  failIf(error);
  return Number(data ?? 0);
}

export async function cancelTask(taskId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('admin_cancel_task', { p_task_id: taskId, p_reason: reason });
  failIf(error);
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_task', { p_task_id: taskId });
  failIf(error);
}

export async function runTaskGeneration(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_run_task_generation');
  failIf(error);
  return Number(data ?? 0);
}

export async function fetchTemplates(): Promise<TaskTemplate[]> {
  const { data, error } = await supabase
    .from('task_templates')
    .select('id, title, description, department_key, assignee_profile_id, frequency, repeat_every, weekdays, due_day, due_time, duration_days, start_date, end_date, max_occurrences, priority, requires_proof, is_active')
    .order('created_at', { ascending: false });
  failIf(error);
  return (data ?? []) as TaskTemplate[];
}

export async function saveTemplate(id: string | null, draft: TemplateDraft, adminId: string): Promise<void> {
  const { error } = id
    ? await supabase.from('task_templates').update({ ...draft, updated_at: new Date().toISOString() }).eq('id', id)
    : await supabase.from('task_templates').insert({ ...draft, created_by: adminId });
  failIf(error);
}

export async function setTemplateActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('task_templates')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id);
  failIf(error);
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('task_templates').delete().eq('id', id);
  failIf(error);
}

/** The Team app may store either a link or a path inside the proofs bucket. */
export async function proofLink(proof: string): Promise<string> {
  if (/^https?:\/\//i.test(proof)) return proof;
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(proof, 300);
  failIf(error);
  return data?.signedUrl ?? '';
}

export function countStaffTasks(tasks: Array<Pick<AdminTask, 'status' | 'due_at'>>, now = new Date()): StaffTaskCounts {
  return {
    open: tasks.filter((task) => isTaskOpen(task.status)).length,
    done: tasks.filter((task) => task.status === 'done').length,
    missed: tasks.filter((task) => task.status === 'missed').length,
    overdue: tasks.filter((task) => isTaskOverdue(task, now)).length,
  };
}

/** Tasks due in a month, or created in it when they have no due date. */
export async function fetchStaffMonthTasks(profileId: string, month: string): Promise<StaffTaskCounts> {
  const start = `${month}T00:00:00${ISTANBUL_OFFSET}`;
  const [year, monthIndex] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);
  const end = `${next}T00:00:00${ISTANBUL_OFFSET}`;

  const { data, error } = await supabase
    .from('tasks')
    .select('status, due_at')
    .eq('assigned_to', profileId)
    .or(`and(due_at.gte."${start}",due_at.lt."${end}"),and(due_at.is.null,created_at.gte."${start}",created_at.lt."${end}")`);
  failIf(error);
  return countStaffTasks((data ?? []) as Array<Pick<AdminTask, 'status' | 'due_at'>>);
}
