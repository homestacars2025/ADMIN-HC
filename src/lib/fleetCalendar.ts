import { supabase } from './supabase';
import { bookingStatusKey, CAR_STATUSES, type CarStatus, type FleetStatus } from './fleetStatus';

/**
 * The Fleet Calendar's data: one row per active car, and on it one bar per booking
 * or block across its days. Bookings come from `bookings`, since a completed booking
 * has no `car_calendar` row; maintenance, selling and replacement blocks come from
 * `car_calendar`. The same rules as Team's calendar.
 */

type Joined<T> = T | T[] | null;
const one = <T,>(value: Joined<T> | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export type BlockType = 'maintenance' | 'selling' | 'replacement';
export const BLOCK_TYPES: readonly BlockType[] = ['maintenance', 'selling', 'replacement'];

export interface CalendarCar {
  id: number;
  plate: string;
  model: string;
  status: CarStatus;
}

export interface CalendarBar {
  key: string;
  carId: number;
  status: FleetStatus;
  /** YYYY-MM-DD, both inclusive. */
  start: string;
  end: string;
  booking: { id: number; number: string; customer: string | null; customerId: string | null; status: string | null } | null;
  block: { id: number; type: BlockType; notes: string | null } | null;
}

export interface FleetMonth {
  cars: CalendarCar[];
  bars: CalendarBar[];
}

// ─── Dates ────────────────────────────────────────────────────────────────────

const DAY_MS = 86400000;
const dayNumber = (date: string) => Math.round(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);

export const monthStart = (month: string) => `${month}-01`;
export const daysInMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
export const monthEnd = (month: string) => `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;

export function shiftCalendarMonth(month: string, by: number): string {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

/** Days on the road: a same-day booking still counts as one. */
export const barDays = (bar: Pick<CalendarBar, 'start' | 'end'>): number => Math.max(1, dayNumber(bar.end) - dayNumber(bar.start));

/**
 * Where a bar sits in the month, in day units from 0 to the month's length. It runs
 * from the middle of its first day to the middle of its last, so a return and the next
 * pickup on the same day meet without overlapping. A same-day bar fills its day.
 * `cutStart` / `cutEnd` say it carries on beyond the month.
 */
export function barSpan(bar: Pick<CalendarBar, 'start' | 'end'>, month: string): { from: number; to: number; cutStart: boolean; cutEnd: boolean } | null {
  const first = dayNumber(monthStart(month));
  const days = daysInMonth(month);
  const start = dayNumber(bar.start) - first;
  const end = dayNumber(bar.end) - first;
  if (end < 0 || start >= days) return null;
  const sameDay = start === end;
  const cutStart = start < 0;
  const cutEnd = end >= days;
  const from = cutStart ? 0 : sameDay ? start + 0.08 : start + 0.5;
  const to = cutEnd ? days : sameDay ? end + 0.92 : end + 0.5;
  return { from, to, cutStart, cutEnd };
}

export interface PlacedBar {
  bar: CalendarBar;
  from: number;
  to: number;
  cutStart: boolean;
  cutEnd: boolean;
  /** 0 for the first line of the row; a bar that overlaps another goes on the next. */
  lane: number;
}

/** A car's bars in lanes, so two that overlap (a double booking) are both seen. */
export function placeBars(bars: CalendarBar[], month: string): { placed: PlacedBar[]; lanes: number } {
  const spans = bars
    .map((bar) => ({ bar, span: barSpan(bar, month) }))
    .filter((item): item is { bar: CalendarBar; span: NonNullable<ReturnType<typeof barSpan>> } => item.span !== null)
    .sort((a, b) => a.span.from - b.span.from || a.span.to - b.span.to);
  const laneEnds: number[] = [];
  const placed = spans.map(({ bar, span }) => {
    let lane = laneEnds.findIndex((end) => end <= span.from + 1e-9);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(span.to); } else laneEnds[lane] = span.to;
    return { bar, ...span, lane };
  });
  return { placed, lanes: Math.max(1, laneEnds.length) };
}

// ─── Reading ──────────────────────────────────────────────────────────────────

interface CarRow { id: number; plate_number: string; model_group: Joined<{ name: string }> }
interface BookingRow {
  id: number; booking_number: string | null; car_id: number; start_date: string; end_date: string; status: string | null; customer_id: string | null;
  customers: Joined<{ first_name: string | null; last_name: string | null }>;
}
interface BlockRow { id: number; car_id: number; start_date: string; end_date: string; block_type: string; notes: string | null }

const toCarStatus = (value: string | null | undefined): CarStatus => (CAR_STATUSES as readonly string[]).includes(value ?? '') ? value as CarStatus : 'parking';

export async function fetchFleetMonth(month: string): Promise<FleetMonth> {
  const from = monthStart(month);
  const to = monthEnd(month);
  const [cars, availability, bookings, blocks] = await Promise.all([
    supabase.from('cars').select('id, plate_number, model_group(name)').eq('is_active', true).order('plate_number'),
    supabase.from('car_availability').select('id, status'),
    supabase
      .from('bookings')
      .select('id, booking_number, car_id, start_date, end_date, status, customer_id, customers(first_name, last_name)')
      .neq('status', 'cancelled')
      .lte('start_date', to)
      .gte('end_date', from),
    supabase
      .from('car_calendar')
      .select('id, car_id, start_date, end_date, block_type, notes')
      .in('block_type', BLOCK_TYPES as unknown as string[])
      .lte('start_date', to)
      .gte('end_date', from),
  ]);
  const failure = cars.error ?? availability.error ?? bookings.error ?? blocks.error;
  if (failure) throw new Error(failure.message);

  const statusOf = new Map(((availability.data ?? []) as Array<{ id: number; status: string }>).map((row) => [row.id, toCarStatus(row.status)]));
  const carList: CalendarCar[] = ((cars.data ?? []) as unknown as CarRow[])
    .map((car) => ({ id: car.id, plate: car.plate_number, model: one(car.model_group)?.name ?? '—', status: statusOf.get(car.id) ?? 'parking' }))
    .sort((a, b) => a.model.localeCompare(b.model, 'en') || a.plate.localeCompare(b.plate, 'en', { numeric: true }));

  const bars: CalendarBar[] = [
    ...((bookings.data ?? []) as unknown as BookingRow[]).map((row) => {
      const customer = one(row.customers);
      const name = [customer?.first_name, customer?.last_name].map((part) => part?.trim()).filter(Boolean).join(' ');
      return {
        key: `booking-${row.id}`,
        carId: row.car_id,
        status: bookingStatusKey(row.status),
        start: row.start_date.slice(0, 10),
        end: row.end_date.slice(0, 10),
        booking: { id: row.id, number: row.booking_number ?? `#${row.id}`, customer: name || null, customerId: row.customer_id, status: row.status },
        block: null,
      };
    }),
    ...((blocks.data ?? []) as BlockRow[]).map((row) => ({
      key: `block-${row.id}`,
      carId: row.car_id,
      status: row.block_type as FleetStatus,
      start: row.start_date.slice(0, 10),
      end: row.end_date.slice(0, 10),
      booking: null,
      block: { id: row.id, type: row.block_type as BlockType, notes: row.notes },
    })),
  ];
  return { cars: carList, bars };
}

// ─── Tiles and search ─────────────────────────────────────────────────────────

export type CalendarFilter = CarStatus;

export function statusCounts(cars: CalendarCar[]): Record<CarStatus, number> {
  const counts = Object.fromEntries(CAR_STATUSES.map((status) => [status, 0])) as Record<CarStatus, number>;
  cars.forEach((car) => { counts[car.status] += 1; });
  return counts;
}

const squeeze = (value: string | null | undefined) => (value ?? '').toLocaleLowerCase('tr').replace(/\s+/g, '');

/** Plate without spaces, model, or the name on any of the car's bars this month. */
export function matchesCalendarSearch(car: CalendarCar, bars: CalendarBar[], query: string): boolean {
  const wanted = squeeze(query);
  if (!wanted) return true;
  if (squeeze(car.plate).includes(wanted) || squeeze(car.model).includes(wanted)) return true;
  return bars.some((bar) => squeeze(bar.booking?.customer).includes(wanted) || squeeze(bar.booking?.number).includes(wanted));
}

// ─── Conflicts ────────────────────────────────────────────────────────────────

export type ConflictKind = 'double_booking' | 'blocked_period' | 'missing_delivery' | 'missing_pickup' | 'not_closed';
export type Severity = 'high' | 'medium' | 'low';

export interface CalendarConflict {
  kind: ConflictKind | string;
  severity: Severity;
  carId: number;
  plate: string;
  bookingId: number | null;
  bookingNumber: string | null;
  otherRef: string | null;
  from: string | null;
  to: string | null;
  message: string;
}

export const CONFLICT_LABELS: Record<ConflictKind, string> = {
  double_booking: 'Double booking',
  blocked_period: 'Booked over a block',
  missing_delivery: 'No delivery recorded',
  missing_pickup: 'No pickup recorded',
  not_closed: 'Not closed',
};

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export async function fetchConflicts(month: string): Promise<CalendarConflict[]> {
  const { data, error } = await supabase.rpc('calendar_conflicts', { p_month: monthStart(month) });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      kind: String(row.kind),
      severity: (['high', 'medium', 'low'].includes(String(row.severity)) ? row.severity : 'low') as Severity,
      carId: Number(row.car_id),
      plate: String(row.plate ?? ''),
      bookingId: row.booking_id == null ? null : Number(row.booking_id),
      bookingNumber: (row.booking_number as string | null) ?? null,
      otherRef: (row.other_ref as string | null) ?? null,
      from: (row.date_from as string | null) ?? null,
      to: (row.date_to as string | null) ?? null,
      message: String(row.message ?? ''),
    }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.plate.localeCompare(b.plate, 'en', { numeric: true }));
}

/** Bars to outline in red: both sides of a double booking, and a booking over a block. */
export function highSeverityBars(conflicts: CalendarConflict[], bars: CalendarBar[]): Set<string> {
  const byNumber = new Map(bars.filter((bar) => bar.booking).map((bar) => [bar.booking!.number, bar.key]));
  const keys = new Set<string>();
  conflicts.filter((conflict) => conflict.severity === 'high').forEach((conflict) => {
    if (conflict.bookingId !== null) keys.add(`booking-${conflict.bookingId}`);
    if (conflict.kind === 'double_booking' && conflict.otherRef) {
      const other = byNumber.get(conflict.otherRef);
      if (other) keys.add(other);
    }
  });
  return keys;
}

// ─── Car history ──────────────────────────────────────────────────────────────

export type HistoryKind = 'booking' | 'extension' | 'operation' | 'replacement' | 'maintenance' | 'selling' | 'issue' | 'fine' | 'car_change';

export interface HistoryItem {
  kind: HistoryKind | string;
  /** The ISO time or date it happened, as the RPC gives it. */
  at: string;
  end: string | null;
  title: string | null;
  status: string | null;
  customer: string | null;
  customerId: string | null;
  amount: number | null;
  km: number | null;
  fuel: number | null;
  by: string | null;
  note: string | null;
  fromCar: string | null;
  toCar: string | null;
  refId: number | null;
  bookingId: number | null;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Postgres writes `2026-11-05 12:37:26+00`, which the browser only reads as `…T12:37:26+00:00`. */
export const parseStamp = (iso: string): string => (iso.length <= 10 ? `${iso}T00:00:00Z` : iso.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));

const timeOf = (iso: string) => {
  const value = Date.parse(parseStamp(iso));
  return Number.isFinite(value) ? value : 0;
};

export function parseHistory(raw: unknown): HistoryItem[] {
  return (Array.isArray(raw) ? raw : [])
    .map((row: Record<string, unknown>) => ({
      kind: String(row.kind),
      at: String(row.at ?? ''),
      end: text(row.end),
      title: text(row.title),
      status: text(row.status),
      customer: text(row.customer),
      customerId: text(row.customer_id),
      amount: num(row.amount),
      km: num(row.km),
      fuel: num(row.fuel),
      by: text(row.by),
      note: text(row.note),
      fromCar: text(row.from_car),
      toCar: text(row.to_car),
      refId: num(row.ref_id),
      bookingId: num(row.booking_id),
    }))
    .filter((item) => item.at)
    .sort((a, b) => timeOf(b.at) - timeOf(a.at));
}

export async function fetchCarHistory(carId: number): Promise<HistoryItem[]> {
  const { data, error } = await supabase.rpc('car_history', { p_car_id: carId });
  if (error) throw new Error(error.message);
  return parseHistory(data);
}

export const HISTORY_FILTERS = ['bookings', 'operations', 'issues', 'fines'] as const;
export type HistoryFilter = typeof HISTORY_FILTERS[number];

const FILTER_KINDS: Record<HistoryFilter, readonly string[]> = {
  bookings: ['booking', 'extension', 'car_change', 'replacement'],
  operations: ['operation', 'maintenance', 'selling'],
  issues: ['issue'],
  fines: ['fine'],
};

export const inHistoryFilter = (item: HistoryItem, filter: HistoryFilter | 'all'): boolean => filter === 'all' || FILTER_KINDS[filter].includes(item.kind);

export interface HistorySummary {
  bookings: number;
  daysThisYear: number;
  km: number | null;
}

/** Non-cancelled bookings; their days inside `year`; the km of the latest operation that has one. */
export function historySummary(items: HistoryItem[], year: number): HistorySummary {
  const bookings = items.filter((item) => item.kind === 'booking' && item.status !== 'cancelled');
  const yearStart = dayNumber(`${year}-01-01`);
  const yearEnd = dayNumber(`${year + 1}-01-01`);
  const daysThisYear = bookings.reduce((total, item) => {
    const start = Math.max(dayNumber(item.at), yearStart);
    const end = Math.min(dayNumber(item.end ?? item.at), yearEnd);
    return total + Math.max(0, end - start);
  }, 0);
  const latestKm = items.find((item) => item.kind === 'operation' && item.km !== null);
  return { bookings: bookings.length, daysThisYear, km: latestKm?.km ?? null };
}
