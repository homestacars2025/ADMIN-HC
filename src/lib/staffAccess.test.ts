import {
  departmentPageKey,
  groupPages,
  isStaffDisabled,
  minimalOverride,
  orderDepartments,
  pageAccess,
  subDepartmentKey,
  visiblePages,
  type AccessData,
  type AppPage,
  type Department,
  type StaffMember,
} from './staffAccess';

const department = (key: string, parent_key: string | null = null, sort_order = 0): Department => ({
  key, label_en: key, label_ar: key, parent_key, sort_order, is_active: true,
});

const page = (key: string, over: Partial<AppPage> = {}): AppPage => ({
  key, label_en: key, label_ar: key, group_key: 'main', sort_order: 0,
  is_default_for_all: false, is_restricted_legacy: false, is_active: true, ...over,
});

const staff = (over: Partial<StaffMember> = {}): StaffMember => ({
  id: 's1', full_name: 'Test', email: null, avatar_url: null, status: 'active',
  department_key: 'ops', is_department_head: false, team_active: true, ...over,
});

const tasks = page('tasks', { is_default_for_all: true });
const bookings = page('bookings');
const kabis = page('kabis', { is_restricted_legacy: true });
const accounting = page('accounting', { is_restricted_legacy: true });

const data: AccessData = {
  departments: [department('ops'), department('ops_night', 'ops'), department('finance')],
  pages: [tasks, bookings, kabis, accounting],
  departmentPages: new Set([departmentPageKey('ops', 'kabis'), departmentPageKey('finance', 'accounting')]),
  staff: [],
  overrides: {},
};

describe('pageAccess', () => {
  it('gives a page from the department', () => {
    expect(pageAccess(kabis, staff(), {}, data)).toEqual({ base: true, override: null, enabled: true, source: 'department' });
  });

  it('gives a page from the parent to a sub-department', () => {
    expect(pageAccess(kabis, staff({ department_key: 'ops_night' }), {}, data).source).toBe('department');
  });

  it('does not give a sibling department its pages', () => {
    expect(pageAccess(accounting, staff(), {}, data)).toEqual({ base: false, override: null, enabled: false, source: null });
  });

  it('gives default pages to everyone', () => {
    expect(pageAccess(tasks, staff({ department_key: 'finance' }), {}, data).source).toBe('everyone');
  });

  it('gives no-department staff every page except restricted ones', () => {
    const noDepartment = staff({ department_key: null });
    expect(pageAccess(bookings, noDepartment, {}, data).source).toBe('no-department');
    expect(pageAccess(kabis, noDepartment, {}, data).enabled).toBe(false);
  });

  it('lets a grant add a page and a deny remove one', () => {
    expect(pageAccess(accounting, staff(), { accounting: 'grant' }, data)).toMatchObject({ enabled: true, source: 'extra' });
    expect(pageAccess(kabis, staff(), { kabis: 'deny' }, data)).toMatchObject({ enabled: false, source: 'blocked' });
    expect(pageAccess(tasks, staff(), { tasks: 'deny' }, data).enabled).toBe(false);
  });
});

describe('visiblePages', () => {
  it('shows nothing to a disabled account, whichever flag disabled it', () => {
    expect(visiblePages(staff({ status: 'disabled' }), data)).toEqual([]);
    expect(visiblePages(staff({ team_active: false }), data)).toEqual([]);
    expect(isStaffDisabled(staff({ status: 'pending' }))).toBe(true);
  });

  it('applies overrides to the pages the employee sees', () => {
    const withOverrides = { ...data, overrides: { s1: { kabis: 'deny' as const, accounting: 'grant' as const } } };
    expect(visiblePages(staff(), withOverrides).map((p) => p.key)).toEqual(['tasks', 'accounting']);
  });
});

describe('minimalOverride', () => {
  it('writes a row only when the base disagrees', () => {
    expect(minimalOverride(false, true)).toBe('grant');
    expect(minimalOverride(true, false)).toBe('deny');
    expect(minimalOverride(true, true)).toBeNull();
    expect(minimalOverride(false, false)).toBeNull();
  });
});

describe('ordering', () => {
  it('groups pages by group in sort order', () => {
    const groups = groupPages([
      page('b', { group_key: 'fleet', sort_order: 11 }),
      page('a', { group_key: 'fleet', sort_order: 10 }),
      page('c', { group_key: 'main', sort_order: 1 }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['main', 'fleet']);
    expect(groups[1].pages.map((p) => p.key)).toEqual(['a', 'b']);
  });

  it('places sub-departments directly under their parent', () => {
    const ordered = orderDepartments([department('b', null, 2), department('a_sub', 'a', 3), department('a', null, 1)]);
    expect(ordered.map((d) => d.key)).toEqual(['a', 'a_sub', 'b']);
  });
});

describe('subDepartmentKey', () => {
  it('builds a lowercase key from the English name', () => {
    expect(subDepartmentKey('operations', ' Night Shift ')).toBe('operations_night_shift');
  });

  it('refuses a name with no Latin letters', () => {
    expect(subDepartmentKey('operations', 'الوردية')).toBeNull();
  });
});
