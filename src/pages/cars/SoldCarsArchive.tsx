import React, { useEffect, useState } from 'react';
import { LoadError } from '../../components/shared/PageBits';
import { SoldChip } from '../../components/shared/SoldChip';
import { supabase } from '../../lib/supabase';
import { LicensePlate } from '../bookings/ui';

interface SoldCar {
  id: number;
  plate: string;
  model: string;
  investor: string | null;
  year: number | null;
}

type Joined<T> = T | T[] | null;
const one = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

/** Sold cars (is_active = false) only: the archive, read once when it is opened. */
async function fetchSoldCars(): Promise<SoldCar[]> {
  const { data, error } = await supabase
    .from('cars')
    .select('id, plate_number, model_group:model_group_id(name), investor:investor_id(company_name), registration:cars_registration(manufacture_year)')
    .eq('is_active', false)
    .order('plate_number');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<{
    id: number;
    plate_number: string | null;
    model_group: Joined<{ name: string | null }>;
    investor: Joined<{ company_name: string | null }>;
    registration: Joined<{ manufacture_year: number | null }>;
  }>).map((car) => ({
    id: Number(car.id),
    plate: car.plate_number ?? '—',
    model: one(car.model_group)?.name ?? '—',
    investor: one(car.investor)?.company_name ?? null,
    year: one(car.registration)?.manufacture_year ?? null,
  }));
}

/**
 * The fleet's archive: sold cars, greyed out and read only. They are history, so they
 * sit apart from the fleet table and never count in it. See "Sold / archived cars" in CLAUDE.md.
 */
export const SoldCarsArchive: React.FC<{ search: string }> = ({ search }) => {
  const [cars, setCars] = useState<SoldCar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    fetchSoldCars()
      .then((rows) => { if (active) setCars(rows); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [attempt]);

  const query = search.trim().toLowerCase();
  const shown = (cars ?? []).filter((car) => !query || [car.plate, car.model, car.investor ?? ''].some((text) => text.toLowerCase().includes(query)));

  return (
    <section aria-label="Sold cars (archive)" className="mt-5 overflow-hidden rounded-[14px] border border-dashed border-black/[0.14] bg-black/[0.015]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/[0.06] px-4 py-3">
        <h2 className="text-[13.5px] font-semibold text-black/60">
          Sold cars (archive){cars ? <span className="ms-1.5 font-normal tabular-nums text-black/40">{shown.length}</span> : null}
        </h2>
        <p className="text-[12px] text-black/40">History only: not part of the fleet, counts or pickers.</p>
      </header>
      {error ? (
        <div className="p-4"><LoadError message={`Couldn't load the sold cars: ${error}`} onRetry={() => setAttempt((value) => value + 1)} /></div>
      ) : cars === null ? (
        <ul aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="flex items-center gap-3 border-b border-black/[0.05] px-4 py-3 last:border-b-0">
              <span className="h-5 w-24 animate-pulse rounded bg-black/[0.06]" />
              <span className="h-4 flex-1 animate-pulse rounded bg-black/[0.05]" />
            </li>
          ))}
        </ul>
      ) : shown.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-black/45">{cars.length === 0 ? 'No sold cars yet.' : 'No sold car matches your search.'}</p>
      ) : (
        <ul className="opacity-70 grayscale">
          {shown.map((car) => (
            <li key={car.id} aria-readonly="true" className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-1 border-b border-black/[0.05] px-4 py-2.5 last:border-b-0">
              <LicensePlate plate={car.plate} />
              <SoldChip />
              <span className="min-w-0 flex-1 truncate text-[13px] text-black/60">{car.model}</span>
              <span className="text-[12.5px] tabular-nums text-black/45">{[car.investor, car.year].filter(Boolean).join(' · ') || '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
