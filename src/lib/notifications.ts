import { supabase } from './supabase';

/**
 * Notifications, reminders and tasks — the whole data layer for the feature.
 *
 * Everything the user acts on goes through a SECURITY DEFINER RPC. The tables
 * behind them (notifications_v2, notification_recipients, tasks) carry a SELECT
 * policy and no INSERT/UPDATE policy at all, so a direct write would be rejected
 * by RLS anyway — the RPCs are the only way in, by design.
 *
 * The two rule tables are the deliberate exception: `notification_rules` and
 * `reminder_rules` each have an `is_admin()` ALL policy, so the admin reads and
 * writes them directly.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationCategory = 'event' | 'reminder' | 'task' | 'manual';
export type TaskStatus = 'open' | 'claimed' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TargetRole = 'admin' | 'staff' | 'investor' | 'customer';

export interface NotificationRow {
  id: string;
  category: NotificationCategory;
  event_key: string | null;
  title: string;
  body: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  claimed_by: string | null;
  claimed_by_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  due_at: string | null;
  created_at: string;
  /**
   * Not returned by `my_tasks` — merged in from a follow-up read of `tasks`
   * for the Done tab only. See `getTasks`.
   */
  completed_at?: string | null;
}

/** `[{ kind: 'role', value: 'staff' }, { kind: 'profile', value: '<uuid>' }]` */
export interface NotificationTarget {
  kind: 'role' | 'profile';
  value: string;
}

export interface NotificationRule {
  id: string;
  name: string;
  event_key: string;
  category: NotificationCategory;
  is_active: boolean;
  targets: NotificationTarget[] | null;
  conditions: Record<string, unknown> | null;
  title_template: string | null;
  body_template: string | null;
  link_template: string | null;
}

export interface ReminderRule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  check_query: string | null;
  mode: 'per_row' | 'aggregate';
  category: NotificationCategory;
  target_role: TargetRole;
  title_template: string | null;
  body_template: string | null;
  link_template: string | null;
  dedupe_template: string | null;
  run_frequency: string | null;
  last_run_at: string | null;
  last_run_count: number | null;
}

export interface ProfileOption {
  id: string;
  full_name: string | null;
  role: string | null;
}

export interface RunResult {
  rule_name: string;
  generated: number;
}

/**
 * Turns a Postgres failure into something an admin can act on. The RPCs raise
 * plain exceptions for permission problems, so the message is usually the most
 * informative thing available.
 */
export function friendlyError(error: { code?: string; message: string } | null): string {
  if (!error) return 'Something went wrong.';
  const msg = (error.message ?? '').toLowerCase();

  if (msg.includes('admin') && (msg.includes('only') || msg.includes('permission')))
    return 'Admins only — you do not have permission to do that.';
  if (error.code === '42501' || msg.includes('row-level security'))
    return 'You do not have permission to do that.';
  if (error.code === 'PGRST202' || msg.includes('could not find the function'))
    return 'That database function is not available. Ask a developer to check the deployment.';
  if (msg.includes('jwt') || msg.includes('not authenticated'))
    return 'Your session expired. Sign in again.';
  return error.message;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function getNotifications(
  limit: number,
  offset: number,
  onlyUnread: boolean,
): Promise<NotificationRow[]> {
  const { data, error } = await supabase.rpc('my_notifications', {
    p_limit: limit,
    p_offset: offset,
    p_only_unread: onlyUnread,
  });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []) as NotificationRow[];
}

export async function getUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('my_unread_count');
  if (error) throw new Error(friendlyError(error));
  return (data as number) ?? 0;
}

export async function getOpenTasksCount(): Promise<number> {
  const { data, error } = await supabase.rpc('my_open_tasks_count');
  if (error) throw new Error(friendlyError(error));
  return (data as number) ?? 0;
}

/**
 * `my_tasks` decides visibility and is the only source of *which* tasks to show.
 *
 * It does not project `completed_at`, though, so the Done tab would have no
 * completion time to render. Rather than widen the contract or guess from
 * `created_at`, the ids it returned are used to read that one timestamp from
 * `tasks` — a read the admin's SELECT policy already allows. No write ever
 * bypasses the RPCs.
 */
export async function getTasks(
  status: 'active' | 'done' | 'all',
  limit: number,
  offset: number,
): Promise<TaskRow[]> {
  const { data, error } = await supabase.rpc('my_tasks', {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(friendlyError(error));

  const rows = (data ?? []) as TaskRow[];
  if (status === 'active' || rows.length === 0) return rows;

  const { data: stamps, error: stampError } = await supabase
    .from('tasks')
    .select('id, completed_at')
    .in('id', rows.map((r) => r.id));

  // A failure here costs a timestamp, not the list — the tasks still render.
  if (stampError) {
    // eslint-disable-next-line no-console
    console.error('[notifications] completed_at lookup:', stampError.message);
    return rows;
  }

  const byId = new Map(
    (stamps ?? []).map((s: { id: string; completed_at: string | null }) => [s.id, s.completed_at]),
  );
  return rows.map((r) => ({ ...r, completed_at: byId.get(r.id) ?? null }));
}

// ── Notification actions ──────────────────────────────────────────────────────

export async function markRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw new Error(friendlyError(error));
}

export async function markAllRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw new Error(friendlyError(error));
}

export async function sendManualNotification(input: {
  title: string;
  body: string | null;
  targets: NotificationTarget[];
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('send_manual_notification', {
    p_title: input.title,
    p_body: input.body,
    p_targets: input.targets,
    p_link: input.link ?? null,
    p_entity_type: input.entityType ?? null,
    p_entity_id: input.entityId ?? null,
  });
  if (error) throw new Error(friendlyError(error));
  return data as string;
}

// ── Task actions ──────────────────────────────────────────────────────────────

export async function completeTask(taskId: string, notes?: string | null): Promise<void> {
  const { error } = await supabase.rpc('complete_task', {
    p_task_id: taskId,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(friendlyError(error));
}

export async function claimTask(taskId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_task', { p_task_id: taskId });
  if (error) throw new Error(friendlyError(error));
}

export async function cancelTask(taskId: string, notes?: string | null): Promise<void> {
  const { error } = await supabase.rpc('cancel_task', {
    p_task_id: taskId,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(friendlyError(error));
}

// ── Reminder rules ────────────────────────────────────────────────────────────

/** `null` runs every active rule; an id runs just that one. */
export async function runReminderRule(ruleId: string | null): Promise<RunResult[]> {
  const { data, error } = await supabase.rpc('admin_run_reminder_rule', {
    p_rule_id: ruleId,
  });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []) as RunResult[];
}

const REMINDER_RULE_SELECT =
  'id, name, description, is_active, check_query, mode, category, target_role, title_template, body_template, link_template, dedupe_template, run_frequency, last_run_at, last_run_count';

export async function getReminderRules(): Promise<ReminderRule[]> {
  const { data, error } = await supabase
    .from('reminder_rules')
    .select(REMINDER_RULE_SELECT)
    .order('name', { ascending: true });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []) as ReminderRule[];
}

export async function updateReminderRule(
  id: string,
  patch: Partial<Omit<ReminderRule, 'id' | 'last_run_at' | 'last_run_count'>>,
): Promise<void> {
  const { error } = await supabase.from('reminder_rules').update(patch).eq('id', id);
  if (error) throw new Error(friendlyError(error));
}

// ── Notification rules ────────────────────────────────────────────────────────

const NOTIFICATION_RULE_SELECT =
  'id, name, event_key, category, is_active, targets, conditions, title_template, body_template, link_template';

export async function getNotificationRules(): Promise<NotificationRule[]> {
  const { data, error } = await supabase
    .from('notification_rules')
    .select(NOTIFICATION_RULE_SELECT)
    .order('name', { ascending: true });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []) as NotificationRule[];
}

export async function createNotificationRule(
  input: Omit<NotificationRule, 'id'>,
): Promise<string> {
  const { data, error } = await supabase
    .from('notification_rules')
    .insert(input)
    .select('id')
    .single();
  if (error) throw new Error(friendlyError(error));
  return (data as { id: string }).id;
}

export async function updateNotificationRule(
  id: string,
  patch: Partial<Omit<NotificationRule, 'id'>>,
): Promise<void> {
  const { error } = await supabase.from('notification_rules').update(patch).eq('id', id);
  if (error) throw new Error(friendlyError(error));
}

// ── Profiles (recipient picker) ───────────────────────────────────────────────

export async function searchProfiles(query: string): Promise<ProfileOption[]> {
  let request = supabase.from('profiles').select('id, full_name, role').order('full_name');
  const q = query.trim();
  if (q) request = request.ilike('full_name', `%${q}%`);

  const { data, error } = await request.limit(20);
  if (error) throw new Error(friendlyError(error));
  return (data ?? []) as ProfileOption[];
}


// ── Link resolution ───────────────────────────────────────────────────────────

/**
 * Top-level sections this app actually routes, all of them under `/dashboard`.
 * Only first segments that a notification could plausibly point at are listed.
 */
const DASHBOARD_SECTIONS = new Set([
  'accounting', 'bookings', 'calendar', 'car-issues', 'cars', 'customers',
  'fines', 'google-reviews', 'inbox', 'investors', 'kabis', 'kgm', 'marketing',
  'media', 'model-groups', 'notifications', 'online-users', 'operations',
  'pending-invoices', 'pricing', 'reminder-rules', 'sourcing',
  'staff-permissions', 'tasks', 'team', 'users',
]);

/**
 * Notification links are stored app-agnostically — `/kabis`, `/car-issues`,
 * `/cars/57` — because the same rows feed the team app, where those are
 * top-level routes. This admin app nests everything under `/dashboard`, and its
 * catch-all sends an unmatched path to `/login`, so navigating to a raw stored
 * link would sign-post the admin straight out of the page they clicked.
 *
 * The first segment is mapped onto the matching dashboard section. Deeper
 * segments are dropped: no notification-relevant section here has a detail
 * route (`/cars/57` has no `/dashboard/cars/:id` to land on), so the section
 * index is the closest honest destination.
 *
 * Returns `null` when nothing sensible matches — callers then render the row as
 * plain text instead of a dead link.
 */
export function resolveNotificationLink(link: string | null | undefined): string | null {
  const raw = link?.trim();
  if (!raw || !raw.startsWith('/')) return null;
  if (raw === '/dashboard' || raw.startsWith('/dashboard/')) return raw;

  const section = raw.split('/').filter(Boolean)[0];
  if (!section || !DASHBOARD_SECTIONS.has(section)) return null;
  return `/dashboard/${section}`;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** "just now" · "5m ago" · "3h ago" · "2d ago" · then an absolute date. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.floor((Date.now() - then) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const CATEGORY_STYLES: Record<NotificationCategory, { label: string; color: string; bg: string }> = {
  event: { label: 'Event', color: '#4ba6ea', bg: 'rgba(75,166,234,0.10)' },
  reminder: { label: 'Reminder', color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  task: { label: 'Task', color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
  manual: { label: 'Manual', color: '#059669', bg: 'rgba(5,150,105,0.10)' },
};

export const PRIORITY_STYLES: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: '#6b7280', bg: '#f3f4f6' },
  normal: { label: 'Normal', color: '#4ba6ea', bg: 'rgba(75,166,234,0.10)' },
  high: { label: 'High', color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  urgent: { label: 'Urgent', color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
};

export const TARGET_ROLES: TargetRole[] = ['admin', 'staff', 'investor', 'customer'];
