import { supabase } from './supabase';
import {
  departmentPageKey,
  type AccessData,
  type AppPage,
  type Department,
  type OverrideEffect,
  type OverrideMap,
  type StaffMember,
} from './staffAccess';

export interface OverrideChange {
  pageKey: string;
  next: OverrideEffect | null;
}

interface TeamMemberRow {
  profile_id: string;
  department_key: string | null;
  is_department_head: boolean;
  is_active: boolean | null;
}

interface OverrideRow {
  profile_id: string;
  page_key: string;
  effect: OverrideEffect;
}

const DEPARTMENT_COLUMNS = 'key, label_en, label_ar, parent_key, sort_order, is_active';
const PAGE_COLUMNS = 'key, label_en, label_ar, group_key, sort_order, is_default_for_all, is_restricted_legacy, is_active';

function failIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function fetchAccessData(): Promise<AccessData> {
  const [departments, pages, departmentPages, profiles, teamMembers, overrides] = await Promise.all([
    supabase.from('departments').select(DEPARTMENT_COLUMNS).order('sort_order'),
    supabase.from('app_pages').select(PAGE_COLUMNS).eq('is_active', true).order('sort_order'),
    supabase.from('department_pages').select('department_key, page_key'),
    supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, avatar_bg, gender, status')
      .eq('role', 'staff')
      .order('full_name'),
    supabase.from('team_members').select('profile_id, department_key, is_department_head, is_active'),
    supabase.from('staff_page_overrides').select('profile_id, page_key, effect'),
  ]);

  for (const result of [departments, pages, departmentPages, profiles, teamMembers, overrides]) {
    failIf(result.error);
  }

  const memberByProfile = new Map(
    ((teamMembers.data ?? []) as TeamMemberRow[]).map((row) => [row.profile_id, row]),
  );

  const staff: StaffMember[] = (profiles.data ?? []).map((profile) => {
    const member = memberByProfile.get(profile.id);
    return {
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      avatar_url: profile.avatar_url,
      avatar_bg: profile.avatar_bg,
      gender: profile.gender,
      status: profile.status,
      department_key: member?.department_key ?? null,
      is_department_head: member?.is_department_head ?? false,
      team_active: member?.is_active === true,
    };
  });

  const overridesByStaff: Record<string, OverrideMap> = {};
  for (const row of (overrides.data ?? []) as OverrideRow[]) {
    overridesByStaff[row.profile_id] = { ...overridesByStaff[row.profile_id], [row.page_key]: row.effect };
  }

  return {
    departments: (departments.data ?? []) as Department[],
    pages: (pages.data ?? []) as AppPage[],
    departmentPages: new Set(
      (departmentPages.data ?? []).map((row) => departmentPageKey(row.department_key, row.page_key)),
    ),
    staff,
    overrides: overridesByStaff,
  };
}

export async function fetchStaffOverrides(profileId: string): Promise<OverrideMap> {
  const { data, error } = await supabase
    .from('staff_page_overrides')
    .select('page_key, effect')
    .eq('profile_id', profileId);
  failIf(error);
  return Object.fromEntries(((data ?? []) as Array<Omit<OverrideRow, 'profile_id'>>).map((r) => [r.page_key, r.effect]));
}

/**
 * Rows that stay are upserted rather than deleted and re-inserted, so a failure
 * part-way can't leave an employee with the override gone.
 */
export async function saveOverrides(
  profileId: string,
  changes: OverrideChange[],
  adminId: string,
): Promise<void> {
  const upserts = changes.flatMap(({ pageKey, next }) =>
    next ? [{ profile_id: profileId, page_key: pageKey, effect: next, granted_by: adminId }] : [],
  );
  const removals = changes.filter((change) => change.next === null).map((change) => change.pageKey);

  if (upserts.length > 0) {
    const { error } = await supabase
      .from('staff_page_overrides')
      .upsert(upserts, { onConflict: 'profile_id,page_key' });
    failIf(error);
  }
  if (removals.length > 0) {
    const { error } = await supabase
      .from('staff_page_overrides')
      .delete()
      .eq('profile_id', profileId)
      .in('page_key', removals);
    failIf(error);
  }
}

export async function clearOverrides(profileId: string): Promise<void> {
  const { error } = await supabase.from('staff_page_overrides').delete().eq('profile_id', profileId);
  failIf(error);
}

export async function updateTeamMember(
  profileId: string,
  patch: { department_key?: string | null; is_department_head?: boolean },
): Promise<void> {
  const { data, error } = await supabase
    .from('team_members')
    .update(patch)
    .eq('profile_id', profileId)
    .select('profile_id');
  failIf(error);
  // An upsert here would create the row with is_active true and quietly switch
  // on an account that has no team record.
  if (!data?.length) throw new Error('This employee has no team record.');
}

export async function setDepartmentPage(
  departmentKey: string,
  pageKey: string,
  enabled: boolean,
): Promise<void> {
  const { error } = enabled
    ? await supabase.from('department_pages').insert({ department_key: departmentKey, page_key: pageKey })
    : await supabase
        .from('department_pages')
        .delete()
        .eq('department_key', departmentKey)
        .eq('page_key', pageKey);
  failIf(error);
}

export async function insertDepartment(department: Department): Promise<void> {
  const { error } = await supabase.from('departments').insert(department);
  failIf(error);
}

export async function updateDepartment(
  key: string,
  patch: Partial<Pick<Department, 'label_en' | 'label_ar' | 'is_active'>>,
): Promise<void> {
  const { error } = await supabase.from('departments').update(patch).eq('key', key);
  failIf(error);
}
