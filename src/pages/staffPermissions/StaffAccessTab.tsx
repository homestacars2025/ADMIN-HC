import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '../../lib/media/badgeColor';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import { AlertTriangle, Search, SearchX } from '../../components/media/MediaIcons';
import { toast } from '../../components/media/MediaToast';
import { Button, Input, Select, Switch } from '../../components/media/MediaUI';
import {
  groupPages,
  isStaffDisabled,
  minimalOverride,
  orderDepartments,
  pageAccess,
  parentKeyOf,
  visiblePages,
  type AccessData,
  type AppPage,
  type Department,
  type OverrideMap,
  type StaffMember,
} from '../../lib/staffAccess';
import {
  clearOverrides,
  fetchStaffOverrides,
  saveOverrides,
  updateTeamMember,
  type OverrideChange,
} from '../../lib/staffAccessApi';
import { useConfirm } from '../media/useConfirm';
import { CARD_CLASS, SmallBadge, SourceTag, StaffAvatar, SWITCH_HIT_AREA, errorMessage } from './shared';

const ALL_DEPARTMENTS = '__all__';
const NO_DEPARTMENT = '__none__';

type GroupState = 'on' | 'off' | 'mixed';

interface StaffAccessTabProps {
  data: AccessData;
  adminId: string;
  setData: (update: (current: AccessData) => AccessData) => void;
}

function displayName(staff: StaffMember): string {
  return staff.full_name?.trim() || staff.email || 'Unnamed employee';
}

function departmentLabel(key: string | null, departments: Department[]): string {
  if (key === null) return 'No department';
  return departments.find((d) => d.key === key)?.label_en ?? key;
}

function applyOverrideChanges(current: OverrideMap, changes: OverrideChange[]): OverrideMap {
  const next = { ...current };
  for (const { pageKey, next: effect } of changes) {
    if (effect) next[pageKey] = effect;
    else delete next[pageKey];
  }
  return next;
}

/** On, off, or a dash for a group that is partly on. */
const GroupSwitch: React.FC<{
  state: GroupState;
  label: string;
  disabled: boolean;
  onClick: () => void;
}> = ({ state, label, disabled, onClick }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={state === 'mixed' ? 'mixed' : state === 'on'}
    aria-label={`All ${label} pages`}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-60',
      SWITCH_HIT_AREA,
      state === 'on' && 'bg-primary',
      state === 'mixed' && 'bg-primary/40',
      state === 'off' && 'bg-black/[0.14]',
    )}
  >
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none grid h-[14px] w-[14px] place-items-center rounded-full bg-background shadow-sm transition-transform duration-150',
        state === 'on' && 'translate-x-[16px]',
        state === 'mixed' && 'translate-x-[9px]',
        state === 'off' && 'translate-x-[2px]',
      )}
    >
      {state === 'mixed' && <span className="h-[2px] w-[7px] rounded-full bg-primary" />}
    </span>
  </button>
);

const SidebarPreview: React.FC<{ staff: StaffMember; data: AccessData }> = ({ staff, data }) => {
  const groups = useMemo(() => groupPages(visiblePages(staff, data)), [staff, data]);
  return (
    <div className={cn(CARD_CLASS, 'p-4')}>
      <div className="text-[13px] font-medium text-foreground">Live preview</div>
      <div className="mt-0.5 text-[12px] text-black/45">What this employee sees in Team</div>
      <div className="mt-3 rounded-xl border border-subtle px-3 py-3">
        {groups.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-black/40">No pages to show</p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="mb-3 last:mb-0">
              <div className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-black/40">
                {group.label}
              </div>
              {group.pages.map((page) => (
                <div key={page.key} className="flex h-7 items-center gap-2 text-[12.5px] text-black/75">
                  <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-black/25" />
                  <span className="truncate">{page.label_en}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const StaffAccessTab: React.FC<StaffAccessTabProps> = ({ data, adminId, setData }) => {
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState(ALL_DEPARTMENTS);
  const [showDisabled, setShowDisabled] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => (data.staff.find((s) => !isStaffDisabled(s)) ?? data.staff[0])?.id ?? null,
  );
  const [pendingPages, setPendingPages] = useState<ReadonlySet<string>>(new Set());
  const [membershipPending, setMembershipPending] = useState(false);
  const confirm = useConfirm();

  const departments = useMemo(() => orderDepartments(data.departments), [data.departments]);
  const groups = useMemo(() => groupPages(data.pages), [data.pages]);

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.staff.filter((staff) => {
      if (!showDisabled && isStaffDisabled(staff)) return false;
      if (query && !displayName(staff).toLowerCase().includes(query)) return false;
      if (departmentFilter === ALL_DEPARTMENTS) return true;
      if (departmentFilter === NO_DEPARTMENT) return staff.department_key === null;
      return (
        staff.department_key === departmentFilter ||
        (staff.department_key !== null && parentKeyOf(staff.department_key, data.departments) === departmentFilter)
      );
    });
  }, [data.staff, data.departments, search, showDisabled, departmentFilter]);

  const selected = data.staff.find((staff) => staff.id === selectedId) ?? null;
  const selectedOverrides = useMemo(
    () => (selected ? data.overrides[selected.id] ?? {} : {}),
    [selected, data.overrides],
  );

  const patchOverrides = useCallback(
    (staffId: string, changes: OverrideChange[]) => {
      setData((current) => ({
        ...current,
        overrides: {
          ...current.overrides,
          [staffId]: applyOverrideChanges(current.overrides[staffId] ?? {}, changes),
        },
      }));
    },
    [setData],
  );

  const setPages = useCallback(
    async (staff: StaffMember, pages: AppPage[], wantOn: boolean) => {
      const overrides = data.overrides[staff.id] ?? {};
      const changes = pages.flatMap((page): OverrideChange[] => {
        const access = pageAccess(page, staff, overrides, data);
        const next = minimalOverride(access.base, wantOn);
        return next === access.override ? [] : [{ pageKey: page.key, next }];
      });
      if (changes.length === 0) return;

      const undo = changes.map(({ pageKey }) => ({ pageKey, next: overrides[pageKey] ?? null }));
      const pendingKeys = changes.map(({ pageKey }) => `${staff.id}|${pageKey}`);

      patchOverrides(staff.id, changes);
      setPendingPages((current) => new Set([...Array.from(current), ...pendingKeys]));
      try {
        await saveOverrides(staff.id, changes, adminId);
      } catch (error) {
        patchOverrides(staff.id, undo);
        toast.error(`Couldn't save: ${errorMessage(error)}`);
        // A group save is two statements, so the first may have landed.
        fetchStaffOverrides(staff.id)
          .then((fresh) => setData((current) => ({ ...current, overrides: { ...current.overrides, [staff.id]: fresh } })))
          .catch(() => undefined);
      } finally {
        setPendingPages((current) => new Set(Array.from(current).filter((key) => !pendingKeys.includes(key))));
      }
    },
    [data, adminId, patchOverrides, setData],
  );

  const updateMembership = useCallback(
    async (staff: StaffMember, patch: Pick<StaffMember, 'department_key' | 'is_department_head'>) => {
      const previous = { department_key: staff.department_key, is_department_head: staff.is_department_head };
      const applyPatch = (values: typeof patch) =>
        setData((current) => ({
          ...current,
          staff: current.staff.map((s) => (s.id === staff.id ? { ...s, ...values } : s)),
        }));

      applyPatch(patch);
      setMembershipPending(true);
      try {
        await updateTeamMember(staff.id, patch);
      } catch (error) {
        applyPatch(previous);
        toast.error(`Couldn't save: ${errorMessage(error)}`);
      } finally {
        setMembershipPending(false);
      }
    },
    [setData],
  );

  const askReset = useCallback(
    (staff: StaffMember) => {
      confirm.ask({
        title: 'Reset to department defaults?',
        description: `This removes every extra and blocked page for ${displayName(staff)}.`,
        confirmLabel: 'Reset',
        onConfirm: async () => {
          try {
            await clearOverrides(staff.id);
            setData((current) => ({ ...current, overrides: { ...current.overrides, [staff.id]: {} } }));
            toast.success('Reset to department defaults');
          } catch (error) {
            toast.error(`Couldn't reset: ${errorMessage(error)}`);
          }
        },
      });
    },
    [confirm, setData],
  );

  const departmentOptions = useMemo(
    () => [
      { value: NO_DEPARTMENT, label: 'No department' },
      ...departments
        .filter((d) => d.is_active || d.key === selected?.department_key)
        .map((d) => ({
          value: d.key,
          label: `${d.parent_key ? '    ' : ''}${d.label_en}${d.is_active ? '' : ' (inactive)'}`,
        })),
    ],
    [departments, selected?.department_key],
  );

  const filterChips = [
    { key: ALL_DEPARTMENTS, label: 'All' },
    ...departments.filter((d) => d.parent_key === null).map((d) => ({ key: d.key, label: d.label_en })),
    { key: NO_DEPARTMENT, label: 'No department' },
  ];

  const staffOptions = selected && !filteredStaff.includes(selected) ? [selected, ...filteredStaff] : filteredStaff;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_240px]">
      <section className={cn(CARD_CLASS, 'flex flex-col self-start p-3 lg:sticky lg:top-4')}>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name"
            aria-label="Search staff by name"
            className="h-11 pl-8 lg:h-9"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={departmentFilter === chip.key}
              onClick={() => setDepartmentFilter(chip.key)}
              className={cn(
                'inline-flex min-h-[30px] items-center rounded-full border px-2.5 text-[12px] transition-colors',
                departmentFilter === chip.key
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : 'border-subtle text-black/55 hover:bg-black/[0.03]',
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <label className="mt-3 flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-1 text-[12.5px] text-black/60 lg:min-h-[32px]">
          Show disabled
          <Switch
            checked={showDisabled}
            onChange={setShowDisabled}
            ariaLabel="Show disabled staff"
            activeClass="bg-primary"
          />
        </label>

        <select
          value={selected?.id ?? ''}
          onChange={(event) => setSelectedId(event.target.value)}
          aria-label="Choose an employee"
          className="order-first mb-3 h-11 w-full rounded-lg border border-subtle bg-surface px-3 text-[14px] text-foreground lg:hidden"
        >
          {staffOptions.map((staff) => (
            <option key={staff.id} value={staff.id}>
              {displayName(staff)} · {visiblePages(staff, data).length} / {data.pages.length} pages
            </option>
          ))}
        </select>

        <ul className="mt-2 hidden flex-col gap-0.5 lg:flex">
          {filteredStaff.map((staff) => (
            <li key={staff.id}>
              <button
                type="button"
                aria-current={staff.id === selected?.id}
                onClick={() => setSelectedId(staff.id)}
                className={cn(
                  'flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                  staff.id === selected?.id ? 'bg-primary/[0.08]' : 'hover:bg-black/[0.03]',
                )}
              >
                <StaffAvatar name={staff.full_name} url={staff.avatar_url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-foreground">
                    {displayName(staff)}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    <SmallBadge>{departmentLabel(staff.department_key, data.departments)}</SmallBadge>
                    {staff.is_department_head && <SmallBadge className="bg-primary/10 text-primary">Head</SmallBadge>}
                    {isStaffDisabled(staff) && <SmallBadge className="bg-red-500/10 text-red-600">Disabled</SmallBadge>}
                  </span>
                </span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-black/45">
                  {visiblePages(staff, data).length} / {data.pages.length} pages
                </span>
              </button>
            </li>
          ))}
          {filteredStaff.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-4 py-8 text-center text-[12.5px] text-black/40">
              <SearchX size={20} strokeWidth={1.6} className="text-black/25" />
              No staff match these filters
            </li>
          )}
        </ul>
      </section>

      {!selected ? (
        <section className={cn(CARD_CLASS, 'px-6 py-16 text-center text-[13.5px] text-black/45 xl:col-span-2')}>
          Choose an employee to manage their sidebar.
        </section>
      ) : (
        <>
          <section className="flex min-w-0 flex-col gap-3">
            <div className={cn(CARD_CLASS, 'p-4 sm:p-5')}>
              <div className="flex items-center gap-3">
                <StaffAvatar name={selected.full_name} url={selected.avatar_url} size={48} />
                <div className="min-w-0">
                  <h2 className="truncate text-[16px] font-medium tracking-[-0.014em] text-foreground">
                    {displayName(selected)}
                  </h2>
                  <p className="truncate text-[13px] text-black/45">{selected.email ?? 'No email'}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-medium text-black/60">Department</span>
                  <Select
                    value={selected.department_key ?? NO_DEPARTMENT}
                    options={departmentOptions}
                    size="lg"
                    ariaLabel="Department"
                    disabled={membershipPending}
                    onChange={(value) => {
                      const department_key = value === NO_DEPARTMENT ? null : value;
                      if (department_key === selected.department_key) return;
                      // Heading one department says nothing about the next one.
                      updateMembership(selected, { department_key, is_department_head: false });
                    }}
                  />
                </div>
                {selected.department_key !== null && (
                  <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-subtle px-3 text-[13px] text-foreground sm:min-h-[36px]">
                    Department head
                    <Switch
                      checked={selected.is_department_head}
                      onChange={(is_department_head) =>
                        updateMembership(selected, { department_key: selected.department_key, is_department_head })
                      }
                      ariaLabel="Department head"
                      disabled={membershipPending}
                      activeClass="bg-primary"
                      className={SWITCH_HIT_AREA}
                    />
                  </label>
                )}
              </div>

              {isStaffDisabled(selected) && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[12.5px] text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  This account is disabled, so it sees nothing in Team. The settings below apply if it's re-enabled.
                </p>
              )}
            </div>

            {groups.map((group) => {
              const access = group.pages.map((page) => pageAccess(page, selected, selectedOverrides, data));
              const onCount = access.filter((item) => item.enabled).length;
              const state: GroupState = onCount === group.pages.length ? 'on' : onCount === 0 ? 'off' : 'mixed';
              const groupPending = group.pages.some((page) => pendingPages.has(`${selected.id}|${page.key}`));

              return (
                <div key={group.key} className={CARD_CLASS}>
                  <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-subtle px-4 sm:px-5">
                    <h3 className="text-[14px] font-medium text-foreground">{group.label}</h3>
                    <GroupSwitch
                      state={state}
                      label={group.label}
                      disabled={groupPending}
                      onClick={() => setPages(selected, group.pages, state !== 'on')}
                    />
                  </div>
                  <ul>
                    {group.pages.map((page, index) => {
                      const item = access[index];
                      return (
                        <li
                          key={page.key}
                          className="flex min-h-[48px] items-center gap-3 border-b border-subtle px-4 last:border-b-0 sm:px-5"
                        >
                          <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">{page.label_en}</span>
                          {item.source && <SourceTag source={item.source} />}
                          <Switch
                            checked={item.enabled}
                            onChange={(wantOn) => setPages(selected, [page], wantOn)}
                            ariaLabel={`${group.label}: ${page.label_en}`}
                            disabled={pendingPages.has(`${selected.id}|${page.key}`)}
                            activeClass="bg-primary"
                            className={SWITCH_HIT_AREA}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}

            <div className="flex justify-end pt-1">
              <Button
                variant="outline"
                size="lg"
                className="h-11 px-4 lg:h-9"
                disabled={Object.keys(selectedOverrides).length === 0}
                onClick={() => askReset(selected)}
              >
                Reset to department defaults
              </Button>
            </div>
          </section>

          <aside className="min-w-0 self-start lg:col-start-2 xl:sticky xl:top-4 xl:col-start-3">
            <SidebarPreview staff={selected} data={data} />
          </aside>
        </>
      )}

      <ConfirmDialog
        state={confirm.state}
        pending={confirm.pending}
        onCancel={confirm.cancel}
        onConfirm={confirm.confirm}
      />
    </div>
  );
};
