import React, { useEffect, useRef, useState } from 'react';
import DateRangePicker, { ALL_DATES, type DateRange } from '../../components/DateRangePicker';
import { ChevronDown, Search, X } from '../../components/media/MediaIcons';
import { Input } from '../../components/media/MediaUI';
import { cn } from '../../lib/media/badgeColor';
import type { TaskFilters } from '../../lib/tasks';
import { staffName, type DepartmentOption, type StaffOption } from './shared';

interface FilterOption {
  value: string;
  label: string;
}

const PILL = 'inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] transition-colors md:h-9';

/** A filter that names its value once chosen, and clears from its own ×. */
const FilterPill: React.FC<{
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {selected ? (
        <span className={cn(PILL, 'border-brand-strong/30 bg-brand-strong/[0.07] pe-1 text-brand-strong')}>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-medium">
            {label}: {selected.label}
          </button>
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={`Clear ${label}`}
            className="grid h-7 w-7 place-items-center rounded-full hover:bg-brand-strong/10"
          >
            <X size={12} strokeWidth={2.2} />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(PILL, 'border-subtle text-black/60 hover:bg-black/[0.03]')}
        >
          {label}
          <ChevronDown size={13} className="opacity-50" />
        </button>
      )}

      {open && (
        <ul role="listbox" aria-label={label} className="fixed inset-x-4 top-1/4 z-30 max-h-[280px] overflow-y-auto rounded-xl border border-subtle bg-surface p-1 shadow-[0_12px_32px_rgba(0,0,0,0.12)] sm:absolute sm:inset-x-auto sm:start-0 sm:top-[calc(100%+6px)] sm:w-[220px]">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => { onChange(option.value); setOpen(false); }}
                className={cn(
                  'flex min-h-[40px] w-full items-center rounded-lg px-2.5 text-left text-[13px] transition-colors hover:bg-black/[0.04]',
                  option.value === value ? 'font-medium text-brand-strong' : 'text-foreground',
                )}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const FilterBar: React.FC<{
  filters: TaskFilters;
  search: string;
  staff: StaffOption[];
  departments: DepartmentOption[];
  onSearch: (value: string) => void;
  onChange: (patch: Partial<TaskFilters>) => void;
  onClear: () => void;
}> = ({ filters, search, staff, departments, onSearch, onChange, onClear }) => {
  const dates: DateRange = { from: filters.from, to: filters.to };
  const anyFilter = Boolean(
    search || filters.staffId || filters.departmentKey || filters.status || filters.kind ||
    filters.overdueOnly || filters.from || filters.to,
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-subtle bg-surface p-2">
      <div className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
        <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-black/35" />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search tasks"
          aria-label="Search tasks"
          className="!h-11 rounded-full border-transparent ps-8 shadow-none md:!h-9"
        />
      </div>

      <FilterPill
        label="Staff"
        value={filters.staffId}
        options={staff.map((person) => ({ value: person.id, label: staffName(person) }))}
        onChange={(staffId) => onChange({ staffId })}
      />
      <FilterPill
        label="Department"
        value={filters.departmentKey}
        options={departments.map((department) => ({ value: department.key, label: department.label_en }))}
        onChange={(departmentKey) => onChange({ departmentKey })}
      />
      <FilterPill
        label="Status"
        value={filters.status}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'done', label: 'Done' },
          { value: 'missed', label: 'Missed' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
        onChange={(status) => onChange({ status: status as TaskFilters['status'] })}
      />
      <FilterPill
        label="Kind"
        value={filters.kind}
        options={[{ value: 'one_off', label: 'One-off' }, { value: 'recurring', label: 'Recurring' }]}
        onChange={(kind) => onChange({ kind: kind as TaskFilters['kind'] })}
      />
      <button
        type="button"
        aria-pressed={filters.overdueOnly}
        onClick={() => onChange({ overdueOnly: !filters.overdueOnly })}
        className={cn(
          PILL,
          filters.overdueOnly ? 'border-red-500/30 bg-red-500/[0.07] font-medium text-red-600' : 'border-subtle text-black/60 hover:bg-black/[0.03]',
        )}
      >
        Overdue
      </button>
      <DateRangePicker
        value={dates}
        onApply={(range) => onChange({ from: range.from, to: range.to })}
        className="w-auto"
      />
      {(filters.from || filters.to) && (
        <button
          type="button"
          onClick={() => onChange({ from: ALL_DATES.from, to: ALL_DATES.to })}
          aria-label="Clear dates"
          className="grid h-9 w-9 place-items-center rounded-full text-black/40 hover:bg-black/[0.04]"
        >
          <X size={13} strokeWidth={2.2} />
        </button>
      )}

      {anyFilter && (
        <button type="button" onClick={onClear} className="ms-auto min-h-[36px] px-2 text-[12.5px] font-medium text-brand-strong">
          Clear all
        </button>
      )}
    </div>
  );
};
