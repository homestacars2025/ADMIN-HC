import type { SortDirection } from '../hooks/useUrlSort';
import { istanbulDate } from './customers';
import { supabase } from './supabase';

/** The first day `car_daily_km` holds. Earlier days were never recorded. */
export const HISTORY_START = '2026-11-01';
export const OVER_KM = 500;
export const OIL_SOON_KM = 1000;
/** A full oil bar. Nothing in the fleet is set more than one service ahead. */
export const OIL_INTERVAL_KM = 10_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NO_SIGNAL_MS = 24 * HOUR;
const LATE_SIGNAL_MS = 6 * HOUR;
/** Trio keeps a car's last speed and ignition once it goes quiet, so older readings aren't "now". */
const LIVE_SIGNAL_MS = 30 * MINUTE;

export interface TrackingRow {
  id: number;
  car_id: number | null;
  plate_number: string | null;
  current_km: number | null;
  km_at_midnight: number | null;
  daily_km: number | null;
  next_oil_change: number | null;
  ignition: string | null;
  speed: number | null;
  last_signal_at: string | null;
}

interface ModelGroup {
  name: string;
  image_url: string | null;
}

export interface CarInfo {
  id: number;
  plate_number: string;
  is_active: boolean | null;
  model_group: ModelGroup | ModelGroup[] | null;
}

export interface DailyKmRow {
  car_id: number;
  day: string;
  plate_number: string | null;
  start_km: number | null;
  end_km: number | null;
  km: number | null;
  last_signal_at: string | null;
}

export interface TrackedCar {
  id: number;
  car_id: number;
  /** False for an active car with no tracker row, which has a place in the lists but no readings. */
  tracked: boolean;
  plate: string;
  model: string | null;
  image: string | null;
  current_km: number | null;
  start_km: number | null;
  today_km: number;
  next_oil_change: number | null;
  ignition: boolean;
  speed: number;
  last_signal_at: string | null;
}

export interface UnlinkedTracker {
  id: number;
  device: string;
  current_km: number | null;
  last_signal_at: string | null;
}

export interface Fleet {
  /** Active cars with a tracker. */
  cars: TrackedCar[];
  /** Active cars without one. */
  noGps: TrackedCar[];
  /** Tracker rows with no car. Rows on an inactive car are dropped altogether. */
  unlinked: UnlinkedTracker[];
  carInfo: Record<number, { plate: string; model: string | null; image: string | null; active: boolean }>;
}

/** One car on one day, from the live row today and from the history before that. */
export interface DayRow {
  key: string;
  car_id: number;
  tracked: boolean;
  plate: string;
  model: string | null;
  image: string | null;
  start_km: number | null;
  end_km: number | null;
  km: number;
  /** Today's oil position, also on a past day: it's what to act on now. */
  remaining: number | null;
  last_signal_at: string | null;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

export function addDays(day: string, by: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

/** The moment that day ended in Istanbul, which never changes its clocks. */
export const dayEnd = (day: string): number => Date.parse(`${addDays(day, 1)}T00:00:00+03:00`);

export function validDay(value: string | null, today: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return today;
  if (value > today) return today;
  return value < addDays(HISTORY_START, -1) ? addDays(HISTORY_START, -1) : value;
}

const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const SIGNAL_TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Istanbul' });

const LONG_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const shortDay = (day: string): string => SHORT_DAY.format(new Date(`${day}T00:00:00Z`));

export const HISTORY_START_LABEL = LONG_DAY.format(new Date(`${HISTORY_START}T00:00:00Z`));

export function dayLabel(day: string, today: string): string {
  const name = day === today ? 'Today' : WEEKDAY.format(new Date(`${day}T00:00:00Z`));
  return `${name}, ${shortDay(day)}`;
}

export const signalTime = (at: string | null): string => (at ? SIGNAL_TIME.format(new Date(at)) : 'never');

export const km = (value: number | null | undefined): string => (value === null || value === undefined ? '—' : value.toLocaleString('en-US'));

// ─── Signal ───────────────────────────────────────────────────────────────────

export type SignalTone = 'ok' | 'amber' | 'red';

const signalAge = (at: string | null, now: number) => (at ? now - Date.parse(at) : Infinity);

export const noSignal = (at: string | null, now: number): boolean => signalAge(at, now) > NO_SIGNAL_MS;

export const hasLiveSignal = (at: string | null, now: number): boolean => signalAge(at, now) <= LIVE_SIGNAL_MS;

export function signalTone(at: string | null, now: number): SignalTone {
  const age = signalAge(at, now);
  if (age > NO_SIGNAL_MS) return 'red';
  return age > LATE_SIGNAL_MS ? 'amber' : 'ok';
}

export function signalAgo(at: string | null, now: number): string {
  if (!at) return 'No signal';
  const minutes = Math.floor(Math.max(0, now - Date.parse(at)) / MINUTE);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

// ─── Reading the fleet ────────────────────────────────────────────────────────

const modelOf = (car: CarInfo | undefined): ModelGroup | null => {
  const group = Array.isArray(car?.model_group) ? car?.model_group[0] : car?.model_group;
  return group ?? null;
};

/** Newest row first, so a second tracker on one car loses. */
export function buildFleet(tracking: TrackingRow[], carRows: CarInfo[]): Fleet {
  const carInfo: Fleet['carInfo'] = {};
  for (const car of carRows) {
    const group = modelOf(car);
    carInfo[car.id] = { plate: car.plate_number, model: group?.name ?? null, image: group?.image_url ?? null, active: car.is_active === true };
  }

  const seen = new Set<number>();
  const cars: TrackedCar[] = [];
  const unlinked: UnlinkedTracker[] = [];

  for (const row of tracking) {
    if (row.car_id === null) {
      unlinked.push({ id: row.id, device: row.plate_number ?? '—', current_km: row.current_km, last_signal_at: row.last_signal_at });
      continue;
    }
    const info = carInfo[row.car_id];
    if (!info?.active || seen.has(row.car_id)) continue;
    seen.add(row.car_id);
    cars.push({
      id: row.id,
      car_id: row.car_id,
      tracked: true,
      plate: info.plate,
      model: info.model,
      image: info.image,
      current_km: row.current_km,
      start_km: row.km_at_midnight,
      today_km: Math.max(0, row.daily_km ?? 0),
      next_oil_change: row.next_oil_change,
      ignition: row.ignition === 'ON',
      speed: row.speed ?? 0,
      last_signal_at: row.last_signal_at,
    });
  }

  const noGps = carRows
    .filter((car) => car.is_active === true && !seen.has(car.id))
    .sort((a, b) => a.plate_number.localeCompare(b.plate_number))
    .map((car): TrackedCar => ({
      id: -car.id,
      car_id: car.id,
      tracked: false,
      plate: car.plate_number,
      model: carInfo[car.id].model,
      image: carInfo[car.id].image,
      current_km: null,
      start_km: null,
      today_km: 0,
      next_oil_change: null,
      ignition: false,
      speed: 0,
      last_signal_at: null,
    }));

  return { cars, noGps, unlinked, carInfo };
}

export async function fetchFleet(): Promise<Fleet> {
  const [tracking, carRows] = await Promise.all([
    supabase
      .from('car_tracking')
      .select('id, car_id, plate_number, current_km, km_at_midnight, daily_km, next_oil_change, ignition, speed, last_signal_at')
      .order('last_signal_at', { ascending: false, nullsFirst: false }),
    supabase.from('cars').select('id, plate_number, is_active, model_group:model_group_id(name, image_url)'),
  ]);
  if (tracking.error) throw new Error(tracking.error.message);
  if (carRows.error) throw new Error(carRows.error.message);
  return buildFleet((tracking.data ?? []) as TrackingRow[], (carRows.data ?? []) as unknown as CarInfo[]);
}

export async function fetchDailyKm(from: string, to: string, carId?: number): Promise<DailyKmRow[]> {
  let request = supabase
    .from('car_daily_km')
    .select('car_id, day, plate_number, start_km, end_km, km, last_signal_at')
    .gte('day', from)
    .lte('day', to);
  if (carId !== undefined) request = request.eq('car_id', carId);
  const { data, error } = await request.order('day');
  if (error) throw new Error(error.message);
  return (data ?? []) as DailyKmRow[];
}

/** RLS rejects an update by matching no rows, so the row has to come back. */
export async function saveNextOil(id: number, value: number | null): Promise<void> {
  const { data, error } = await supabase.from('car_tracking').update({ next_oil_change: value }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('This car can\'t be changed.');
}

/** Empty clears it. Anything but a whole number of km is refused. */
export function parseNextOil(text: string): { value: number | null } | null {
  const trimmed = text.trim();
  if (!trimmed) return { value: null };
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= 0 ? { value } : null;
}

// ─── Daily report ─────────────────────────────────────────────────────────────

export const DAILY_FILTERS = ['moved', 'idle', 'no_signal', 'over_500', 'no_gps'] as const;
export type DailyFilter = typeof DAILY_FILTERS[number];

const rowOf = (car: TrackedCar): DayRow => ({
  key: `t${car.car_id}`,
  car_id: car.car_id,
  tracked: car.tracked,
  plate: car.plate,
  model: car.model,
  image: car.image,
  start_km: car.start_km,
  end_km: car.current_km,
  km: car.today_km,
  remaining: kmRemaining(car),
  last_signal_at: car.last_signal_at,
});

export const todayRows = (fleet: Fleet): DayRow[] => fleet.cars.map(rowOf);

export const noGpsRows = (fleet: Fleet): DayRow[] => fleet.noGps.map(rowOf);

/** A car that has since left the fleet stays on the days it really drove. */
export function pastRows(history: DailyKmRow[], day: string, fleet: Fleet): DayRow[] {
  const current = new Map(fleet.cars.map((car) => [car.car_id, car]));
  return history
    .filter((row) => row.day === day && (fleet.carInfo[row.car_id]?.active || (row.km ?? 0) > 0))
    .map((row) => {
      const info = fleet.carInfo[row.car_id];
      const car = current.get(row.car_id);
      return {
        key: `d${row.car_id}`,
        car_id: row.car_id,
        tracked: true,
        plate: row.plate_number ?? info?.plate ?? '—',
        model: info?.model ?? null,
        image: info?.image ?? null,
        start_km: row.start_km,
        end_km: row.end_km,
        km: Math.max(0, row.km ?? 0),
        remaining: car ? kmRemaining(car) : null,
        last_signal_at: row.last_signal_at,
      };
    });
}

export function dayStats(rows: DayRow[], at: number) {
  return {
    cars: rows.length,
    total: rows.reduce((sum, row) => sum + row.km, 0),
    moved: rows.filter((row) => row.km > 0).length,
    idle: rows.filter((row) => row.km === 0).length,
    noSignal: rows.filter((row) => noSignal(row.last_signal_at, at)).length,
    over: rows.filter((row) => row.km > OVER_KM).length,
  };
}

const matches = (text: string, query: string) => text.toLowerCase().replace(/\s/g, '').includes(query);

/** A car without a tracker only appears when the No GPS tile asks for it. */
export function visibleDayRows(rows: DayRow[], filter: DailyFilter | 'all', at: number, search: string): DayRow[] {
  const query = search.toLowerCase().replace(/\s/g, '');
  return rows.filter((row) => {
    if (filter === 'no_gps' && row.tracked) return false;
    if (filter !== 'no_gps' && !row.tracked) return false;
    if (filter === 'moved' && row.km === 0) return false;
    if (filter === 'idle' && row.km > 0) return false;
    if (filter === 'no_signal' && !noSignal(row.last_signal_at, at)) return false;
    if (filter === 'over_500' && row.km <= OVER_KM) return false;
    return !query || matches(`${row.plate} ${row.model ?? ''}`, query);
  });
}

export interface SeriesDay {
  day: string;
  start_km: number | null;
  end_km: number | null;
  /** Null where nothing was recorded, which isn't the same as 0 km. */
  km: number | null;
}

/** Every day from `from` to `to`, with today's live row standing in for the one not saved yet. */
export function daySeries(history: DailyKmRow[], carId: number, from: string, to: string, live?: DayRow | null): SeriesDay[] {
  const saved = new Map(history.filter((row) => row.car_id === carId).map((row) => [row.day, row]));
  const days: SeriesDay[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const row = saved.get(day);
    days.push({ day, start_km: row?.start_km ?? null, end_km: row?.end_km ?? null, km: row ? Math.max(0, row.km ?? 0) : null });
  }
  const last = days[days.length - 1];
  if (live && last) Object.assign(last, { start_km: live.start_km, end_km: live.end_km, km: live.km });
  return days;
}

export function historyCsv(days: SeriesDay[]): string {
  const rows = days.filter((day) => day.km !== null).map((day) => [day.day, day.start_km ?? '', day.end_km ?? '', day.km].join(','));
  return ['﻿day,start_km,end_km,km', ...rows].join('\r\n');
}

/** A round top for a chart's scale. */
export function niceMax(value: number): number {
  if (value <= 0) return 100;
  const step = 10 ** Math.floor(Math.log10(value));
  const top = [1, 2, 5, 10].map((multiple) => multiple * step).find((candidate) => candidate >= value);
  return top ?? 10 * step;
}

// ─── Live fleet ───────────────────────────────────────────────────────────────

export const LIVE_FILTERS = ['moving', 'ignition', 'oil_due', 'oil_over', 'no_signal', 'no_gps'] as const;
export type LiveFilter = typeof LIVE_FILTERS[number];

export type OilState = 'ok' | 'due' | 'over' | 'unknown';

export function kmRemaining(car: Pick<TrackedCar, 'current_km' | 'next_oil_change'>): number | null {
  return car.current_km === null || car.next_oil_change === null ? null : car.next_oil_change - car.current_km;
}

export function oilState(remaining: number | null): OilState {
  if (remaining === null) return 'unknown';
  if (remaining <= 0) return 'over';
  return remaining <= OIL_SOON_KM ? 'due' : 'ok';
}

export const oilBarPercent = (remaining: number | null): number => {
  if (remaining === null) return 0;
  return remaining <= 0 ? 100 : Math.min(100, (remaining / OIL_INTERVAL_KM) * 100);
};

export const isMoving = (car: TrackedCar, now: number): boolean => car.speed > 0 && hasLiveSignal(car.last_signal_at, now);

export const isIgnitionOn = (car: TrackedCar, now: number): boolean => car.ignition && hasLiveSignal(car.last_signal_at, now);

export function liveStats(cars: TrackedCar[], now: number) {
  return {
    cars: cars.length,
    moving: cars.filter((car) => isMoving(car, now)).length,
    ignition: cars.filter((car) => isIgnitionOn(car, now)).length,
    oilDue: cars.filter((car) => oilState(kmRemaining(car)) === 'due').length,
    oilOver: cars.filter((car) => oilState(kmRemaining(car)) === 'over').length,
    noSignal: cars.filter((car) => noSignal(car.last_signal_at, now)).length,
  };
}

export function visibleLiveCars(cars: TrackedCar[], filter: LiveFilter | 'all', now: number, search: string): TrackedCar[] {
  const query = search.toLowerCase().replace(/\s/g, '');
  return cars.filter((car) => {
    if (filter === 'no_gps' && car.tracked) return false;
    if (filter !== 'no_gps' && filter !== 'all' && !car.tracked) return false;
    if (filter === 'moving' && !isMoving(car, now)) return false;
    if (filter === 'ignition' && !isIgnitionOn(car, now)) return false;
    if (filter === 'oil_due' && oilState(kmRemaining(car)) !== 'due') return false;
    if (filter === 'oil_over' && oilState(kmRemaining(car)) !== 'over') return false;
    if (filter === 'no_signal' && !noSignal(car.last_signal_at, now)) return false;
    return !query || matches(`${car.plate} ${car.model ?? ''}`, query);
  });
}

/** The newest signal in the fleet when more than half of it has gone quiet, otherwise null. */
export function trackingOutage(cars: TrackedCar[], now: number): { lastSignal: string | null } | null {
  if (cars.length === 0) return null;
  const silent = cars.filter((car) => noSignal(car.last_signal_at, now)).length;
  if (silent * 2 <= cars.length) return null;
  const newest = cars.reduce<string | null>((latest, car) => {
    if (!car.last_signal_at) return latest;
    return !latest || Date.parse(car.last_signal_at) > Date.parse(latest) ? car.last_signal_at : latest;
  }, null);
  return { lastSignal: newest };
}

export const silentCars = (cars: TrackedCar[], now: number): TrackedCar[] => cars.filter((car) => noSignal(car.last_signal_at, now));

// ─── Sorting ──────────────────────────────────────────────────────────────────

export const DAILY_SORTS = ['plate', 'model', 'end_km', 'km', 'remaining', 'signal'] as const;
export type DailySort = typeof DAILY_SORTS[number];

export const LIVE_SORTS = ['plate', 'model', 'current_km', 'today_km', 'speed', 'next_oil_change', 'remaining', 'signal'] as const;
export type LiveSort = typeof LIVE_SORTS[number];

/** Which way a column opens: A to Z, nearest service first, and the biggest number otherwise. */
export const firstDirection = (key: string): SortDirection => (
  ['plate', 'model', 'remaining', 'next_oil_change'].includes(key) ? 'asc' : 'desc'
);

const timeOf = (at: string | null) => (at ? Date.parse(at) : null);

/** Empty cells stay last whichever way it runs, and the plate settles a tie. */
function sortRows<T extends { plate: string }>(rows: T[], value: (row: T) => string | number | null, direction: SortDirection): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const first = value(a);
    const second = value(b);
    if (first === null || second === null) {
      if (first !== second) return first === null ? 1 : -1;
    } else if (first !== second) {
      return typeof first === 'string' ? sign * first.localeCompare(String(second)) : sign * (first - Number(second));
    }
    return a.plate.localeCompare(b.plate);
  });
}

export function sortDayRows(rows: DayRow[], key: DailySort, direction: SortDirection): DayRow[] {
  return sortRows(rows, (row) => {
    if (key === 'plate') return row.plate;
    if (key === 'model') return row.model;
    if (key === 'signal') return timeOf(row.last_signal_at);
    if (key === 'remaining') return row.remaining;
    if (key === 'end_km') return row.end_km;
    return row.tracked ? row.km : null;
  }, direction);
}

export function sortLiveCars(cars: TrackedCar[], key: LiveSort, direction: SortDirection): TrackedCar[] {
  return sortRows(cars, (car) => {
    if (key === 'plate') return car.plate;
    if (key === 'model') return car.model;
    if (key === 'remaining') return kmRemaining(car);
    if (key === 'signal') return timeOf(car.last_signal_at);
    if (key === 'next_oil_change') return car.next_oil_change;
    if (key === 'current_km') return car.current_km;
    if (!car.tracked) return null;
    return key === 'today_km' ? car.today_km : car.speed;
  }, direction);
}

export const todayInIstanbul = (now: number): string => istanbulDate(new Date(now));
