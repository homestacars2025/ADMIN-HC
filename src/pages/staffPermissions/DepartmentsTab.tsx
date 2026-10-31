import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '../../lib/media/badgeColor';
import { Pencil, Plus } from '../../components/media/MediaIcons';
import { toast } from '../../components/media/MediaToast';
import {
  Button,
  Field,
  Input,
  Select,
  Sheet,
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
} from '../../components/media/MediaUI';
import {
  departmentPageKey,
  groupPages,
  orderDepartments,
  subDepartmentKey,
  type AccessData,
  type AppPage,
  type Department,
} from '../../lib/staffAccess';
import { insertDepartment, setDepartmentPage, updateDepartment } from '../../lib/staffAccessApi';
import { CARD_CLASS, SmallBadge, SWITCH_HIT_AREA, errorMessage } from './shared';

interface DepartmentsTabProps {
  data: AccessData;
  setData: (update: (current: AccessData) => AccessData) => void;
}

interface DepartmentForm {
  /** The department being renamed. Null when adding a sub-department. */
  editingKey: string | null;
  labelEn: string;
  labelAr: string;
  parentKey: string;
}

const PageCheckbox: React.FC<{
  page: AppPage;
  department: Department;
  parent: Department | null;
  data: AccessData;
  pending: boolean;
  onToggle: (enabled: boolean) => void;
}> = ({ page, department, parent, data, pending, onToggle }) => {
  const direct = data.departmentPages.has(departmentPageKey(department.key, page.key));
  const inherited = parent !== null && data.departmentPages.has(departmentPageKey(parent.key, page.key));
  const label = `${department.label_en}: ${page.label_en}`;

  // These two are on whatever is stored here, so a tick would be a false control.
  let lockedReason: string | null = null;
  if (page.is_default_for_all) lockedReason = 'Everyone gets this page';
  else if (inherited && !direct) lockedReason = `Inherited from ${parent?.label_en}`;

  return (
    <label className="flex h-11 w-full items-center justify-center" title={lockedReason ?? undefined}>
      <input
        type="checkbox"
        checked={direct || lockedReason !== null}
        disabled={lockedReason !== null || pending}
        aria-label={label}
        onChange={(event) => onToggle(event.target.checked)}
        className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
};

export const DepartmentsTab: React.FC<DepartmentsTabProps> = ({ data, setData }) => {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [form, setForm] = useState<DepartmentForm | null>(null);
  const [saving, setSaving] = useState(false);

  const departments = useMemo(() => orderDepartments(data.departments), [data.departments]);
  const groups = useMemo(() => groupPages(data.pages), [data.pages]);
  const parentOptions = useMemo(
    () =>
      departments
        .filter((d) => d.parent_key === null && d.is_active)
        .map((d) => ({ value: d.key, label: d.label_en })),
    [departments],
  );

  const patchDepartmentPage = useCallback(
    (key: string, enabled: boolean) => {
      setData((current) => {
        const departmentPages = new Set(current.departmentPages);
        if (enabled) departmentPages.add(key);
        else departmentPages.delete(key);
        return { ...current, departmentPages };
      });
    },
    [setData],
  );

  const togglePage = useCallback(
    async (departmentKey: string, pageKey: string, enabled: boolean) => {
      const key = departmentPageKey(departmentKey, pageKey);
      patchDepartmentPage(key, enabled);
      setPending((current) => new Set(current).add(key));
      try {
        await setDepartmentPage(departmentKey, pageKey, enabled);
      } catch (error) {
        patchDepartmentPage(key, !enabled);
        toast.error(`Couldn't save: ${errorMessage(error)}`);
      } finally {
        setPending((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [patchDepartmentPage],
  );

  const patchDepartment = useCallback(
    (key: string, patch: Partial<Department>) => {
      setData((current) => ({
        ...current,
        departments: current.departments.map((d) => (d.key === key ? { ...d, ...patch } : d)),
      }));
    },
    [setData],
  );

  const toggleActive = useCallback(
    async (department: Department, is_active: boolean) => {
      patchDepartment(department.key, { is_active });
      try {
        await updateDepartment(department.key, { is_active });
      } catch (error) {
        patchDepartment(department.key, { is_active: department.is_active });
        toast.error(`Couldn't save: ${errorMessage(error)}`);
      }
    },
    [patchDepartment],
  );

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const labelEn = form.labelEn.trim();
    const labelAr = form.labelAr.trim();
    if (!labelEn || !labelAr) {
      toast.error('Enter the name in English and Arabic.');
      return;
    }

    setSaving(true);
    try {
      if (form.editingKey) {
        await updateDepartment(form.editingKey, { label_en: labelEn, label_ar: labelAr });
        patchDepartment(form.editingKey, { label_en: labelEn, label_ar: labelAr });
      } else {
        const key = subDepartmentKey(form.parentKey, labelEn);
        if (!key) throw new Error('The English name needs at least one Latin letter or number.');
        if (data.departments.some((d) => d.key === key)) throw new Error('This sub-department already exists.');

        const department: Department = {
          key,
          label_en: labelEn,
          label_ar: labelAr,
          parent_key: form.parentKey,
          sort_order: Math.max(0, ...data.departments.map((d) => d.sort_order)) + 1,
          is_active: true,
        };
        await insertDepartment(department);
        setData((current) => ({ ...current, departments: [...current.departments, department] }));
      }
      setForm(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className={cn(CARD_CLASS, 'overflow-hidden')}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-[14px] font-medium text-foreground">Departments</h2>
            <p className="mt-0.5 text-[12.5px] text-black/45">
              Inactive departments can't be picked for staff. Current members keep their pages.
            </p>
          </div>
          <Button
            size="lg"
            className="!h-11 px-3 lg:h-9"
            disabled={parentOptions.length === 0}
            onClick={() =>
              setForm({ editingKey: null, labelEn: '', labelAr: '', parentKey: parentOptions[0]?.value ?? '' })
            }
          >
            <Plus size={14} /> Add sub-department
          </Button>
        </div>
        <ul>
          {departments.map((department) => (
            <li
              key={department.key}
              className="flex min-h-[52px] items-center gap-3 border-b border-subtle px-4 last:border-b-0 sm:px-5"
            >
              <div className={cn('min-w-0 flex-1', department.parent_key && 'pl-4')}>
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-medium text-foreground">{department.label_en}</span>
                  <span dir="rtl" className="truncate text-[13px] text-black/45">{department.label_ar}</span>
                </div>
              </div>
              <span className="hidden text-[12px] tabular-nums text-black/45 sm:inline">
                {data.staff.filter((s) => s.department_key === department.key).length} staff
              </span>
              {!department.is_active && <SmallBadge>Inactive</SmallBadge>}
              <Button
                variant="ghost"
                size="icon"
                className="!h-11 w-11 text-black/50 lg:h-8 lg:w-8"
                aria-label={`Rename ${department.label_en}`}
                onClick={() =>
                  setForm({
                    editingKey: department.key,
                    labelEn: department.label_en,
                    labelAr: department.label_ar,
                    parentKey: department.parent_key ?? '',
                  })
                }
              >
                <Pencil size={14} />
              </Button>
              <Switch
                checked={department.is_active}
                onChange={(next) => toggleActive(department, next)}
                ariaLabel={`${department.label_en} active`}
                activeClass="bg-primary"
                className={SWITCH_HIT_AREA}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className={cn(CARD_CLASS, 'overflow-hidden')}>
        <div className="border-b border-subtle px-4 py-3 sm:px-5">
          <h2 className="text-[14px] font-medium text-foreground">Pages by department</h2>
          <p className="mt-0.5 text-[12.5px] text-black/45">Sub-departments also get every page of their parent.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-subtle">
                <th scope="col" className="sticky left-0 z-[1] min-w-[170px] bg-surface px-4 py-3 text-left text-[12px] font-medium text-black/45 sm:px-5">
                  Page
                </th>
                {departments.map((department) => (
                  <th key={department.key} scope="col" className="min-w-[104px] px-2 py-3 text-center align-bottom">
                    {department.parent_key && (
                      <span className="block text-[10.5px] font-normal text-black/40">
                        {data.departments.find((d) => d.key === department.parent_key)?.label_en}
                      </span>
                    )}
                    <span className={cn('text-[12.5px] font-medium', department.is_active ? 'text-foreground' : 'text-black/35')}>
                      {department.label_en}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.key}>
                <tr className="border-b border-subtle">
                  <th
                    scope="colgroup"
                    colSpan={departments.length + 1}
                    className="bg-surface px-4 pb-1.5 pt-4 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-black/40 sm:px-5"
                  >
                    {group.label}
                  </th>
                </tr>
                {group.pages.map((page) => (
                  <tr key={page.key} className="border-b border-subtle">
                    <th scope="row" className="sticky left-0 z-[1] bg-surface px-4 text-left font-normal text-foreground sm:px-5">
                      {page.label_en}
                    </th>
                    {departments.map((department) => (
                      <td key={department.key} className="px-2">
                        <PageCheckbox
                          page={page}
                          department={department}
                          parent={data.departments.find((d) => d.key === department.parent_key) ?? null}
                          data={data}
                          pending={pending.has(departmentPageKey(department.key, page.key))}
                          onToggle={(enabled) => togglePage(department.key, page.key, enabled)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      <Sheet
        open={form !== null}
        onClose={() => setForm(null)}
        ariaLabel={form?.editingKey ? 'Rename department' : 'Add sub-department'}
      >
        {form && (
          <form onSubmit={submitForm} className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>{form.editingKey ? 'Rename department' : 'Add sub-department'}</SheetTitle>
              <SheetDescription>
                {form.editingKey ? 'The name staff see in both languages.' : 'It starts with every page of its parent.'}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              {!form.editingKey && (
                <Field label="Parent department">
                  <Select
                    value={form.parentKey}
                    options={parentOptions}
                    size="lg"
                    ariaLabel="Parent department"
                    onChange={(parentKey) => setForm({ ...form, parentKey })}
                  />
                </Field>
              )}
              <Field label="Name in English">
                <Input
                  value={form.labelEn}
                  onChange={(event) => setForm({ ...form, labelEn: event.target.value })}
                  autoFocus
                />
              </Field>
              <Field label="Name in Arabic">
                <Input
                  dir="rtl"
                  value={form.labelAr}
                  onChange={(event) => setForm({ ...form, labelAr: event.target.value })}
                />
              </Field>
            </SheetBody>
            <SheetFooter>
              <Button type="button" variant="outline" size="lg" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" size="lg" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </SheetFooter>
          </form>
        )}
      </Sheet>
    </div>
  );
};
