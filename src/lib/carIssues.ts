import { daysBetween, istanbulDate } from './customers';
import { compressImage } from './imageCompression';
import { getAvatarProfiles, type ProfileOption } from './notifications';
import { supabase } from './supabase';

export type IssueType = 'damage' | 'accident' | 'sound' | 'mechanical' | 'maintenance' | 'other';
export type IssueStatus = 'open' | 'resolved';
export type DaysTone = 'neutral' | 'amber' | 'red';

export const ISSUE_FILTERS = ['open', 'month', 'accidents', 'resolved'] as const;
export type IssueFilter = 'all' | typeof ISSUE_FILTERS[number];

export const MAX_PHOTOS = 10;
const BUCKET = 'car-issues';

/** `maintenance` is still allowed by the database, so an old row keeps its label. */
export const FORM_TYPES: IssueType[] = ['accident', 'damage', 'mechanical', 'sound', 'other'];

export interface Issue {
  id: number;
  car_id: number;
  plate_number: string | null;
  model_name: string | null;
  type: IssueType;
  status: IssueStatus;
  description: string | null;
  damage_photos: string[];
  repair_photos: string[];
  booking_id: number | null;
  booking_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  discovered_at: string;
  discovered_by: string | null;
  discovered_by_name: string | null;
  resolved_at: string | null;
  days_to_resolve: number | null;
}

export interface NewIssue {
  car_id: number;
  plate_number: string;
  booking_id: number | null;
  customer_id: string | null;
  type: IssueType;
  description: string;
  discovered_at: string;
  discovered_by: string | null;
}

export type UploadStep = (label: string, done: number, total: number) => void;

/** jsonb arrays arrive as unknown, so only the string entries are kept. */
function urlList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((url): url is string => typeof url === 'string' && Boolean(url)) : [];
}

export async function fetchIssues(): Promise<{ issues: Issue[]; staff: Record<string, ProfileOption> }> {
  const { data, error } = await supabase
    .from('car_issues_detailed')
    .select('*')
    .order('discovered_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);

  const issues = ((data ?? []) as unknown as Array<Issue & { damage_photos: unknown; repair_photos: unknown }>)
    .map((row) => ({ ...row, damage_photos: urlList(row.damage_photos), repair_photos: urlList(row.repair_photos) }));
  const ids = Array.from(new Set(issues.map((issue) => issue.discovered_by).filter(Boolean))) as string[];
  return { issues, staff: await getAvatarProfiles(ids) };
}

export async function fetchStaffOptions(): Promise<Array<{ id: string; full_name: string }>> {
  const { data, error } = await supabase.from('profiles').select('id, full_name').in('role', ['admin', 'staff']).order('full_name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; full_name: string | null }>)
    .map((row) => ({ id: row.id, full_name: row.full_name || 'Unnamed' }));
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function daysOpen(issue: Pick<Issue, 'discovered_at'>, today: string = istanbulDate()): number {
  return Math.max(daysBetween(issue.discovered_at, today), 0);
}

export const daysTone = (days: number): DaysTone => (days > 7 ? 'red' : days > 3 ? 'amber' : 'neutral');

export function issueStats(issues: Issue[], month: string = istanbulDate().slice(0, 7), today: string = istanbulDate()) {
  const timed = issues.filter((issue) => issue.days_to_resolve !== null);
  const average = timed.length > 0
    ? Math.round((timed.reduce((total, issue) => total + (issue.days_to_resolve as number), 0) / timed.length) * 10) / 10
    : null;
  return {
    all: issues.length,
    open: issues.filter((issue) => issue.status === 'open').length,
    overdue: issues.filter((issue) => issue.status === 'open' && daysTone(daysOpen(issue, today)) === 'red').length,
    resolved: issues.filter((issue) => issue.status === 'resolved').length,
    resolvedThisMonth: issues.filter((issue) => issue.resolved_at?.startsWith(month)).length,
    accidents: issues.filter((issue) => issue.type === 'accident').length,
    openAccidents: issues.filter((issue) => issue.type === 'accident' && issue.status === 'open').length,
    averageDays: average,
  };
}

export function filterIssues(
  issues: Issue[],
  filter: IssueFilter,
  type: IssueType | 'all',
  search: string,
  month: string = istanbulDate().slice(0, 7),
): Issue[] {
  const query = search.trim().toLowerCase();
  return issues.filter((issue) => {
    if (filter === 'open' && issue.status !== 'open') return false;
    if (filter === 'resolved' && issue.status !== 'resolved') return false;
    if (filter === 'month' && !issue.resolved_at?.startsWith(month)) return false;
    if (filter === 'accidents' && issue.type !== 'accident') return false;
    if (type !== 'all' && issue.type !== type) return false;
    if (!query) return true;
    return [issue.plate_number, issue.model_name, issue.customer_name, issue.description]
      .some((field) => (field ?? '').toLowerCase().includes(query));
  });
}

/** `car_issues` has no column for a note on the repair, so it joins the description. */
export function withResolutionNote(description: string | null, note: string): string | null {
  const text = note.trim();
  if (!text) return description;
  return description?.trim() ? `${description.trim()}\n\nResolution note: ${text}` : `Resolution note: ${text}`;
}

function plateFolder(plate: string): string {
  return plate.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9\-_]/g, '');
}

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

/**
 * Repair photos live beside the damage photos of the same issue. The folder comes
 * from an existing damage URL, or a fresh one for an older row that has none.
 */
export function issueFolder(damagePhotos: string[], plate: string): string {
  const first = damagePhotos[0];
  if (first) {
    const folder = first.split(`/public/${BUCKET}/`)[1]?.split('/damage/')[0];
    if (folder && !folder.includes('..')) return decodeURIComponent(folder);
  }
  return `${plateFolder(plate) || 'unknown'}/${newId()}`;
}

/** One at a time, and the first failure stops it, so nothing is half saved. */
async function uploadPhotos(folder: string, kind: 'damage' | 'repair', files: File[], step: UploadStep): Promise<string[]> {
  const urls: string[] = [];
  for (let index = 0; index < files.length; index += 1) {
    step(`Uploading photo ${index + 1} of ${files.length}…`, index, files.length);
    const photo = await compressImage(files[index]);
    const path = `${folder}/${kind}/${index + 1}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, photo, { upsert: true, contentType: photo.type });
    if (error) throw new Error(`Photo ${index + 1} didn't upload: ${error.message}`);
    urls.push(`${supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?t=${Date.now()}`);
  }
  return urls;
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function createIssue(issue: NewIssue, photos: File[], step: UploadStep): Promise<void> {
  const folder = `${plateFolder(issue.plate_number) || 'unknown'}/${newId()}`;
  const urls = await uploadPhotos(folder, 'damage', photos, step);
  step('Saving the issue…', 0, 0);
  const { plate_number: _plate, description, ...row } = issue;
  const { error } = await supabase.from('car_issues').insert({ ...row, description: description.trim() || null, damage_photos: urls });
  if (error) throw new Error(error.message);
}

export async function resolveCarIssue(issue: Issue, photos: File[], resolvedAt: string, note: string, step: UploadStep): Promise<void> {
  const urls = photos.length > 0
    ? await uploadPhotos(issueFolder(issue.damage_photos, issue.plate_number ?? ''), 'repair', photos, step)
    : [];
  step('Marking it resolved…', 0, 0);
  const { error } = await supabase
    .from('car_issues')
    .update({ status: 'resolved', repair_photos: urls, resolved_at: resolvedAt, description: withResolutionNote(issue.description, note) })
    .eq('id', issue.id);
  if (error) throw new Error(error.message);
}

export async function updateCarIssue(id: number, type: IssueType, description: string): Promise<void> {
  const { error } = await supabase.from('car_issues').update({ type, description: description.trim() || null }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteCarIssue(id: number): Promise<void> {
  const { error } = await supabase.from('car_issues').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
