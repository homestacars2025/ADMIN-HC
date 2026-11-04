import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from '../../components/media/MediaIcons';
import { ComplianceTriangle } from '../../components/shared/ComplianceBits';
import { BLOCK_TYPE_LABELS, busyCarIds, carAvailability, groupCars, readRecentCars, type CalendarBlock, type CalendarBlockDetail, type CarAvailability, type CarChoice } from '../../lib/bookingForm';
import {
  carIssues,
  fetchRegistrationDates,
  issueLabel,
  type ComplianceIssue,
  type RegistrationDates,
} from '../../lib/carCompliance';
import { istanbulDate } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import { supabase } from '../../lib/supabase';
import { ComplianceConfirm } from './ComplianceConfirm';
import { Field, INPUT, LicensePlate, Notice } from './ui';

/**
 * Cars with something on the calendar for these dates. Null until both dates are
 * known, or if the read fails: then nothing is greyed out, and the database's own
 * overlap rule is still there at save.
 */
export function useBusyCars(start: string, end: string, excludeBookingId?: number | null): Set<number> | null {
  const [busy, setBusy] = useState<Set<number> | null>(null);

  useEffect(() => {
    if (!start || !end) { setBusy(null); return undefined; }
    let cancelled = false;
    supabase
      .from('car_calendar')
      .select('car_id, booking_id')
      .lte('start_date', end)
      .gte('end_date', start)
      .then(({ data, error }) => {
        if (cancelled) return;
        setBusy(error ? null : busyCarIds((data ?? []) as CalendarBlock[], excludeBookingId));
      });
    return () => { cancelled = true; };
  }, [start, end, excludeBookingId]);

  return busy;
}

/**
 * The booking form's view of the calendar: which cars are taken, and which only
 * have a replacement or maintenance block. The booking itself, and any
 * replacement car this customer (or this booking) was given, are left out.
 * Null until both dates are known, or if the calendar can't be read.
 */
export function useCarAvailability(
  start: string,
  end: string,
  own: { bookingId?: number | null; customerId?: string | null },
): CarAvailability | null {
  const [availability, setAvailability] = useState<CarAvailability | null>(null);
  const { bookingId, customerId } = own;

  useEffect(() => {
    if (!start || !end) { setAvailability(null); return undefined; }
    let cancelled = false;
    const owners = [customerId && `customer_id.eq.${customerId}`, bookingId != null && `original_booking_id.eq.${bookingId}`].filter(Boolean);
    Promise.all([
      supabase
        .from('car_calendar')
        .select('id, car_id, booking_id, block_type, start_date, end_date, notes')
        .lte('start_date', end)
        .gte('end_date', start),
      owners.length > 0
        ? supabase.from('replacement_sheets').select('calendar_block_id').is('deleted_at', null).or(owners.join(','))
        : Promise.resolve({ data: [], error: null }),
    ]).then(([blocks, sheets]) => {
      if (cancelled) return;
      if (blocks.error) { setAvailability(null); return; }
      // Without the sheets, the customer's own replacement car only shows as a warning.
      const ownBlockIds = new Set(((sheets.data ?? []) as Array<{ calendar_block_id: number | null }>)
        .map((row) => row.calendar_block_id)
        .filter((id): id is number => id !== null));
      setAvailability(carAvailability((blocks.data ?? []) as CalendarBlockDetail[], { bookingId, ownBlockIds }));
    });
    return () => { cancelled = true; };
  }, [start, end, bookingId, customerId]);

  return availability;
}

export interface CarComplianceCheck {
  issuesFor: (carId: number) => ComplianceIssue[];
  failed: boolean;
}

/** Insurance and inspection for every car, read once when a booking form opens. */
export function useCarCompliance(): CarComplianceCheck {
  const [registrations, setRegistrations] = useState<Map<number, RegistrationDates> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRegistrationDates()
      .then((rows) => { if (!cancelled) setRegistrations(new Map(rows.map((row) => [row.car_id, row]))); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => {
    const today = istanbulDate();
    return {
      failed,
      issuesFor: (carId: number) => (registrations ? carIssues(registrations.get(carId), today) : []),
    };
  }, [failed, registrations]);
}

const Availability: React.FC<{ busy: boolean; warning?: string | null }> = ({ busy, warning }) => (
  <span className={cn('flex shrink-0 items-center gap-1.5 text-[11.5px]', warning && !busy ? 'text-[#92400E]' : 'text-black/50')}>
    {busy ? 'Booked' : warning}
    <span className={cn('h-2 w-2 rounded-full', busy ? 'bg-[#DC2626]' : warning ? 'bg-[#F59E0B]' : 'bg-[#16A34A]')} />
  </span>
);

/** A car with only a replacement or maintenance block: still choosable, with a warning. */
export const softLabels = (availability: CarAvailability | null): Map<number, string> => new Map(
  Array.from(availability?.soft ?? []).map(([carId, blocks]) => [carId, Array.from(new Set(blocks.map((block) => (block.block_type ? BLOCK_TYPE_LABELS[block.block_type] : 'Blocked')))).join(', ')]),
);

/** The one way a car gets chosen in every booking flow. */
export const CarPicker: React.FC<{
  label: string;
  cars: CarChoice[];
  value: string;
  onChange: (id: string) => void;
  busy?: Set<number> | null;
  /** Cars that can be chosen, but with a warning beside them. */
  warnings?: ReadonlyMap<number, string>;
  required?: boolean;
  changed?: boolean;
  error?: string | null;
  hint?: React.ReactNode;
  pinRecent?: boolean;
  /** Leave out for a car that's already out with a customer, like the original car. */
  compliance?: CarComplianceCheck;
}> = ({ label, cars, value, onChange, busy, warnings, required, changed, error, hint, pinRecent, compliance }) => {
  const [open, setOpen] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<CarChoice | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = cars.find((car) => String(car.id) === value) ?? null;
  const selectedIssues = selected && compliance ? compliance.issuesFor(selected.id) : [];
  const groups = useMemo(() => groupCars(cars, pinRecent ? readRecentCars() : [], query), [cars, pinRecent, query]);

  const isBusy = (car: CarChoice) => Boolean(busy?.has(car.id)) && String(car.id) !== value;
  const pickable = groups.flatMap((group) => group.cars).filter((car) => !isBusy(car));

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => setActive(0), [query, open]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (car: CarChoice) => {
    setOpen(false);
    setQuery('');
    if (compliance && String(car.id) !== value && compliance.issuesFor(car.id).length > 0) {
      setUnconfirmed(car);
      return;
    }
    onChange(String(car.id));
  };

  const closeConfirm = useCallback(() => {
    setUnconfirmed(null);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, pickable.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (pickable[active]) choose(pickable[active]);
    }
  };

  return (
    <>
    <Field label={label} required={required} changed={changed} span error={error} hint={hint}>
      <div ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((current) => !current)}
          className={cn(
            'flex h-11 w-full items-center gap-2 rounded-[10px] border bg-white px-3 text-left text-[14px] transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/25 md:h-10',
            open ? 'border-[#6EA4E7]' : error ? 'border-[#DC2626]' : 'border-[#E5E7EB]',
          )}
        >
          {selected ? (
            <>
              <LicensePlate plate={selected.plate_number} />
              <span className="min-w-0 flex-1 truncate text-foreground">{selected.model}</span>
              {selectedIssues.length > 0 && <ComplianceTriangle tone="red" size={18} alt="Insurance or inspection not valid" />}
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-black/40">{value ? `Car #${value}` : 'Select car…'}</span>
          )}
          <ChevronDown size={14} className={cn('shrink-0 text-black/40 transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="mt-2 rounded-xl border border-[#E5E7EB] bg-white p-2" onKeyDown={onKeyDown}>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-black/35" />
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls={`${label}-cars`}
                aria-autocomplete="list"
                aria-label={`Search ${label.toLowerCase()}`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by plate or model…"
                className={cn(INPUT, 'ps-9')}
              />
            </div>
            <div ref={listRef} id={`${label}-cars`} role="listbox" aria-label={label} className="mt-1.5 max-h-[280px] overflow-y-auto">
              {groups.length === 0 && <p className="p-4 text-center text-[13px] text-black/45">No cars match your search.</p>}
              {groups.map((group) => (
                <div key={group.label} role="group" aria-label={group.label}>
                  <div className="sticky top-0 z-10 bg-white px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-black/40">{group.label}</div>
                  {group.cars.map((car) => {
                    const disabled = isBusy(car);
                    const isActive = !disabled && pickable[active]?.id === car.id;
                    const invalid = Boolean(compliance && compliance.issuesFor(car.id).length > 0);
                    return (
                      <button
                        key={`${group.label}-${car.id}`}
                        type="button"
                        role="option"
                        aria-selected={String(car.id) === value}
                        aria-disabled={disabled}
                        disabled={disabled}
                        data-active={isActive}
                        onMouseEnter={() => { if (!disabled) setActive(pickable.indexOf(car)); }}
                        onClick={() => choose(car)}
                        className={cn(
                          'flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left text-[13px]',
                          isActive && 'bg-[#6EA4E7]/[0.1]',
                          disabled && 'cursor-not-allowed opacity-55',
                        )}
                      >
                        <LicensePlate plate={car.plate_number} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-foreground">{car.model}{car.inactive ? ' · inactive' : ''}</span>
                          {invalid && (
                            <span className="mt-0.5 inline-block rounded bg-[#DC2626] px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white">
                              Insurance/inspection invalid
                            </span>
                          )}
                        </span>
                        {busy && <Availability busy={Boolean(busy.has(car.id)) && String(car.id) !== value} warning={warnings?.get(car.id)} />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Field>
    {selectedIssues.length > 0 && (
      <Notice tone="red" span>
        {selectedIssues.map(issueLabel).join(' · ')}. This car must not be rented until this is fixed.
      </Notice>
    )}
    {compliance?.failed && value && (
      <Notice tone="amber" span>Couldn't check this car's insurance and inspection. Check it on the Cars page.</Notice>
    )}
    {unconfirmed && compliance && (
      <ComplianceConfirm
        car={unconfirmed}
        issues={compliance.issuesFor(unconfirmed.id)}
        onCancel={closeConfirm}
        onConfirm={() => { onChange(String(unconfirmed.id)); closeConfirm(); }}
      />
    )}
    </>
  );
};
