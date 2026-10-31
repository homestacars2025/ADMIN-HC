import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from '../../components/media/MediaIcons';
import { busyCarIds, groupCars, readRecentCars, type CalendarBlock, type CarChoice } from '../../lib/bookingForm';
import { cn } from '../../lib/media/badgeColor';
import { supabase } from '../../lib/supabase';
import { Field, INPUT, LicensePlate } from './ui';

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

const Availability: React.FC<{ busy: boolean }> = ({ busy }) => (
  <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-black/50">
    {busy && 'Booked'}
    <span className={cn('h-2 w-2 rounded-full', busy ? 'bg-[#DC2626]' : 'bg-[#16A34A]')} />
  </span>
);

/** The one way a car gets chosen in every booking flow. */
export const CarPicker: React.FC<{
  label: string;
  cars: CarChoice[];
  value: string;
  onChange: (id: string) => void;
  busy?: Set<number> | null;
  required?: boolean;
  changed?: boolean;
  error?: string | null;
  hint?: React.ReactNode;
  pinRecent?: boolean;
}> = ({ label, cars, value, onChange, busy, required, changed, error, hint, pinRecent }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = cars.find((car) => String(car.id) === value) ?? null;
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
    onChange(String(car.id));
    setOpen(false);
    setQuery('');
  };

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
    <Field label={label} required={required} changed={changed} span error={error} hint={hint}>
      <div ref={rootRef}>
        <button
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
                          'flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px]',
                          isActive && 'bg-[#6EA4E7]/[0.1]',
                          disabled && 'cursor-not-allowed opacity-55',
                        )}
                      >
                        <LicensePlate plate={car.plate_number} />
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {car.model}{car.inactive ? ' · inactive' : ''}
                        </span>
                        {busy && <Availability busy={Boolean(busy.has(car.id)) && String(car.id) !== value} />}
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
  );
};
