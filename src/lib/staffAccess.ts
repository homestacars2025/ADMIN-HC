/**
 * Who sees which page in the Team sidebar.
 *
 * This is the same rule as the database's `allowed_pages_for`, which is what the
 * Team app reads, so the admin screen can never promise something the employee
 * won't get. It stays free of Supabase so it can be tested on its own.
 */

export type OverrideEffect = 'grant' | 'deny';

export type PageSource = 'department' | 'everyone' | 'extra' | 'blocked' | 'no-department';

export interface Department {
  key: string;
  label_en: string;
  label_ar: string;
  parent_key: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface AppPage {
  key: string;
  label_en: string;
  label_ar: string;
  group_key: string;
  sort_order: number;
  is_default_for_all: boolean;
  is_restricted_legacy: boolean;
  is_active: boolean;
}

export interface StaffMember {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  status: string | null;
  department_key: string | null;
  is_department_head: boolean;
  team_active: boolean;
}

/** page_key → effect, for one employee. */
export type OverrideMap = Record<string, OverrideEffect>;

export interface AccessData {
  departments: Department[];
  /** Every active page, in sidebar order. */
  pages: AppPage[];
  /** Membership of `department_pages`, as `departmentPageKey` values. */
  departmentPages: Set<string>;
  staff: StaffMember[];
  overrides: Record<string, OverrideMap>;
}

export interface PageAccess {
  enabled: boolean;
  base: boolean;
  override: OverrideEffect | null;
  source: PageSource | null;
}

export interface PageGroup {
  key: string;
  label: string;
  pages: AppPage[];
}

const GROUP_LABELS: Record<string, string> = {
  main: 'Main',
  fleet: 'Fleet',
  operations: 'Operations',
  finance: 'Finance',
  media: 'Media',
};

type DepartmentContext = Pick<AccessData, 'departments' | 'departmentPages'>;

export function departmentPageKey(departmentKey: string, pageKey: string): string {
  return `${departmentKey}|${pageKey}`;
}

/** A disabled account sees nothing. A missing or NULL team row counts as disabled. */
export function isStaffDisabled(staff: StaffMember): boolean {
  return staff.status !== 'active' || !staff.team_active;
}

export function parentKeyOf(departmentKey: string, departments: Department[]): string | null {
  return departments.find((d) => d.key === departmentKey)?.parent_key ?? null;
}

export function hasBaseAccess(
  page: AppPage,
  departmentKey: string | null,
  context: DepartmentContext,
): boolean {
  if (page.is_default_for_all) return true;
  if (departmentKey === null) return !page.is_restricted_legacy;

  const parentKey = parentKeyOf(departmentKey, context.departments);
  return (
    context.departmentPages.has(departmentPageKey(departmentKey, page.key)) ||
    (parentKey !== null && context.departmentPages.has(departmentPageKey(parentKey, page.key)))
  );
}

function sourceOf(page: AppPage, departmentKey: string | null, base: boolean, override: OverrideEffect | null): PageSource | null {
  if (override === 'deny') return 'blocked';
  if (override === 'grant') return 'extra';
  if (!base) return null;
  if (page.is_default_for_all) return 'everyone';
  return departmentKey === null ? 'no-department' : 'department';
}

export function pageAccess(
  page: AppPage,
  staff: StaffMember,
  overrides: OverrideMap,
  context: DepartmentContext,
): PageAccess {
  const base = hasBaseAccess(page, staff.department_key, context);
  const override = overrides[page.key] ?? null;
  return {
    base,
    override,
    enabled: (base && override !== 'deny') || override === 'grant',
    source: sourceOf(page, staff.department_key, base, override),
  };
}

/** The pages this employee actually sees: none at all for a disabled account. */
export function visiblePages(staff: StaffMember, data: AccessData): AppPage[] {
  if (isStaffDisabled(staff)) return [];
  const overrides = data.overrides[staff.id] ?? {};
  return data.pages.filter((page) => page.is_active && pageAccess(page, staff, overrides, data).enabled);
}

/** The smallest override that gives the wanted state. Null means the base already does. */
export function minimalOverride(base: boolean, wantOn: boolean): OverrideEffect | null {
  if (wantOn && !base) return 'grant';
  if (!wantOn && base) return 'deny';
  return null;
}

export function groupPages(pages: AppPage[]): PageGroup[] {
  const groups = new Map<string, AppPage[]>();
  for (const page of [...pages].sort((a, b) => a.sort_order - b.sort_order)) {
    groups.set(page.group_key, [...(groups.get(page.group_key) ?? []), page]);
  }
  return Array.from(groups, ([key, groupedPages]) => ({
    key,
    label: GROUP_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
    pages: groupedPages,
  }));
}

/** Top-level departments in order, each followed by its own sub-departments. */
export function orderDepartments(departments: Department[]): Department[] {
  const sorted = [...departments].sort((a, b) => a.sort_order - b.sort_order);
  return sorted
    .filter((d) => d.parent_key === null)
    .flatMap((parent) => [parent, ...sorted.filter((d) => d.parent_key === parent.key)]);
}

/** The key for a new sub-department, or null when the name has no Latin letters. */
export function subDepartmentKey(parentKey: string, labelEn: string): string | null {
  const slug = labelEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug ? `${parentKey}_${slug}` : null;
}
