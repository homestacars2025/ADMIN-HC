import { supabase } from './supabase';

/**
 * HGS (Turkish motorway toll) reads, and the one write the page makes: a car's barcode.
 *
 * An n8n workflow writes `hgs_transactions` hourly. The page loads every transit once,
 * light columns only, so the month switcher, the tiles and the rows are all worked out
 * here with no further request. One car's full rows, with the booking and customer, are
 * fetched when it's expanded.
 *
 * Every transit carries a date at 00:00 UTC and no time, which is the same day in
 * Istanbul, so a month is the first seven characters of `transit_datetime`.
 */

export type HgsPeriod = string | 'all';
export const ALL_TIME = 'all';

export interface HgsCarInfo {
  id: number;
  plate: string;
  model: string | null;
  image: string | null;
  barcode: string | null;
  active: boolean;
}

export interface HgsTransitLite {
  id: number;
  carId: number | null;
  plate: string | null;
  /** YYYY-MM-DD */
  day: string;
  amount: number;
  pending: boolean;
}

export interface HgsData {
  cars: HgsCarInfo[];
  transits: HgsTransitLite[];
  /** When the sync last wrote a row, or null before the first one. */
  lastSync: string | null;
}

export interface HgsTransitDetail {
  id: number;
  day: string;
  entry: string | null;
  exit: string | null;
  amount: number;
  pending: boolean;
  bookingId: number | null;
  bookingNumber: string | null;
  bookingMonth: string | null;
  customerId: string | null;
  customerName: string | null;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/** `numeric` arrives as a string from PostgREST; a stray null must not become NaN. */
function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

type Joined<T> = T | T[] | null | undefined;
const one = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

// ── Reads ─────────────────────────────────────────────────────────────────────

const PAGE = 1000;
const LITE = 'id, car_id, plate_number, transit_datetime, amount, record_type';

function parseLite(raw: Record<string, unknown>): HgsTransitLite {
  return {
    id: num(raw.id),
    carId: raw.car_id == null ? null : num(raw.car_id),
    plate: text(raw.plate_number),
    day: (text(raw.transit_datetime) ?? '').slice(0, 10),
    amount: num(raw.amount),
    pending: raw.record_type === 'pending',
  };
}

/** The first page asks for the count, so the rest can all go at once. */
async function fetchAllTransits(): Promise<HgsTransitLite[]> {
  const page = (from: number) => supabase.from('hgs_transactions').select(LITE, { count: from === 0 ? 'exact' : undefined })
    .order('id', { ascending: true }).range(from, from + PAGE - 1);
  const first = await page(0);
  if (first.error) throw new Error(first.error.message);
  const total = first.count ?? (first.data ?? []).length;
  const starts: number[] = [];
  for (let from = PAGE; from < total; from += PAGE) starts.push(from);
  const rest = await Promise.all(starts.map(page));
  const failed = rest.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
  return [first, ...rest].flatMap((result) => (result.data ?? []) as Record<string, unknown>[]).map(parseLite);
}

interface CarRaw {
  id: number;
  plate_number: string | null;
  is_active: boolean | null;
  hgs_barcode: string | null;
  model_group: Joined<{ name: string | null; image_url: string | null }>;
}

export async function fetchHgsData(): Promise<HgsData> {
  const [cars, transits, sync] = await Promise.all([
    supabase.from('cars').select('id, plate_number, is_active, hgs_barcode, model_group:model_group_id(name, image_url)'),
    fetchAllTransits(),
    supabase.from('hgs_transactions').select('created_at').order('created_at', { ascending: false }).limit(1),
  ]);
  if (cars.error) throw new Error(cars.error.message);
  if (sync.error) throw new Error(sync.error.message);
  return {
    cars: ((cars.data ?? []) as unknown as CarRaw[]).map((car) => {
      const group = one(car.model_group);
      return {
        id: car.id,
        plate: text(car.plate_number) ?? '—',
        model: text(group?.name),
        image: text(group?.image_url),
        barcode: text(car.hgs_barcode),
        active: car.is_active === true,
      };
    }),
    transits,
    lastSync: text((sync.data ?? [])[0]?.created_at),
  };
}

const nextMonth = (month: string) => {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index, 1)).toISOString().slice(0, 7);
};

/** One car's transits in the period, newest first, with what they were billed to. */
export async function fetchCarTransits(car: { carId: number | null; plate: string }, period: HgsPeriod): Promise<HgsTransitDetail[]> {
  let query = supabase
    .from('hgs_transactions')
    .select('id, transit_datetime, toll_location, entry_location, exit_location, amount, record_type, booking_id, customer_id, booking:booking_id(booking_number, start_date), customer:customer_id(first_name, last_name)')
    .order('transit_datetime', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE);
  query = car.carId !== null ? query.eq('car_id', car.carId) : query.is('car_id', null).eq('plate_number', car.plate);
  if (period !== ALL_TIME) query = query.gte('transit_datetime', `${period}-01`).lt('transit_datetime', `${nextMonth(period)}-01`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((raw) => {
    const booking = one(raw.booking as Joined<{ booking_number: string | null; start_date: string | null }>);
    const customer = one(raw.customer as Joined<{ first_name: string | null; last_name: string | null }>);
    return {
      id: num(raw.id),
      day: (text(raw.transit_datetime) ?? '').slice(0, 10),
      entry: text(raw.entry_location),
      exit: text(raw.exit_location) ?? text(raw.toll_location),
      amount: num(raw.amount),
      pending: raw.record_type === 'pending',
      bookingId: raw.booking_id == null ? null : num(raw.booking_id),
      bookingNumber: text(booking?.booking_number),
      bookingMonth: text(booking?.start_date)?.slice(0, 7) ?? null,
      customerId: text(raw.customer_id),
      customerName: [customer?.first_name, customer?.last_name].map(text).filter(Boolean).join(' ') || null,
    };
  });
}

// ── The barcode ───────────────────────────────────────────────────────────────

/** Every barcode on file is ten digits. Spaces from a copied sticker are dropped. */
export function normalizeBarcode(input: string): string | null {
  const digits = input.replace(/\s+/g, '');
  return /^\d{10}$/.test(digits) ? digits : null;
}

export async function saveHgsBarcode(carId: number, input: string): Promise<string> {
  const barcode = normalizeBarcode(input);
  if (!barcode) throw new Error('An HGS barcode is 10 digits.');
  const taken = await supabase.from('cars').select('plate_number').eq('hgs_barcode', barcode).neq('id', carId).limit(1);
  if (taken.error) throw new Error(taken.error.message);
  const other = (taken.data ?? [])[0] as { plate_number: string } | undefined;
  if (other) throw new Error(`That barcode is already on ${other.plate_number}.`);
  const { data, error } = await supabase.from('cars').update({ hgs_barcode: barcode }).eq('id', carId).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("The car wasn't updated. Reload and try again.");
  return barcode;
}

// ── Working it out ────────────────────────────────────────────────────────────

export const hasBarcode = (car: Pick<HgsCarInfo, 'barcode'>): boolean => Boolean(car.barcode?.trim());

/** Active cars the sync can't see: no barcode, so no tolls tracked. */
export const carsWithoutHgs = (cars: HgsCarInfo[]): HgsCarInfo[] => cars
  .filter((car) => car.active && !hasBarcode(car))
  .sort((a, b) => a.plate.localeCompare(b.plate, 'tr'));

const onHgs = (car: HgsCarInfo) => car.active && hasBarcode(car);

export const inPeriod = (transit: Pick<HgsTransitLite, 'day'>, period: HgsPeriod): boolean => period === ALL_TIME || transit.day.slice(0, 7) === period;

/** Null when last month had nothing, which is no comparison rather than +100%. */
export function monthChange(now: number, before: number): number | null {
  if (!before) return null;
  return ((now - before) / before) * 100;
}

const previousMonth = (month: string) => {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 2, 1)).toISOString().slice(0, 7);
};

export interface HgsSummary {
  spend: number;
  transits: number;
  carsOnHgs: number;
  /** Cars on HGS that didn't pass a toll in the period. */
  idle: number;
  thisMonth: { month: string; previous: string; spend: number; previousSpend: number; change: number | null };
}

export function hgsSummary(data: Pick<HgsData, 'cars' | 'transits'>, period: HgsPeriod, currentMonth: string): HgsSummary {
  const periodTransits = data.transits.filter((transit) => inPeriod(transit, period));
  const used = new Set(periodTransits.map((transit) => transit.carId));
  const hgsCars = data.cars.filter(onHgs);
  const previous = previousMonth(currentMonth);
  const spendIn = (month: string) => data.transits.reduce((total, transit) => total + (inPeriod(transit, month) ? transit.amount : 0), 0);
  const spend = spendIn(currentMonth);
  const previousSpend = spendIn(previous);
  return {
    spend: periodTransits.reduce((total, transit) => total + transit.amount, 0),
    transits: periodTransits.length,
    carsOnHgs: hgsCars.length,
    idle: hgsCars.filter((car) => !used.has(car.id)).length,
    thisMonth: { month: currentMonth, previous, spend, previousSpend, change: monthChange(spend, previousSpend) },
  };
}

export interface HgsRow {
  key: string;
  carId: number | null;
  plate: string;
  model: string | null;
  image: string | null;
  barcode: string | null;
  transits: number;
  pending: number;
  amount: number;
  last: string | null;
  /** Of the period's spend, 0 to 1. */
  share: number;
}

/** Every car on HGS, plus any other car that passed a toll in the period. */
export function hgsRows(data: Pick<HgsData, 'cars' | 'transits'>, period: HgsPeriod): HgsRow[] {
  const carsById = new Map(data.cars.map((car) => [car.id, car]));
  const rows = new Map<string, HgsRow>();
  const blank = (key: string, car: HgsCarInfo | null, plate: string, carId: number | null): HgsRow => ({
    key, carId, plate: car?.plate ?? plate, model: car?.model ?? null, image: car?.image ?? null, barcode: car?.barcode ?? null,
    transits: 0, pending: 0, amount: 0, last: null, share: 0,
  });
  data.cars.filter(onHgs).forEach((car) => rows.set(`car:${car.id}`, blank(`car:${car.id}`, car, car.plate, car.id)));

  let total = 0;
  data.transits.forEach((transit) => {
    if (!inPeriod(transit, period)) return;
    const car = transit.carId === null ? null : carsById.get(transit.carId) ?? null;
    const key = transit.carId !== null ? `car:${transit.carId}` : `plate:${transit.plate ?? '—'}`;
    const row = rows.get(key) ?? blank(key, car, transit.plate ?? '—', transit.carId);
    row.transits += 1;
    if (transit.pending) row.pending += 1;
    row.amount += transit.amount;
    if (!row.last || transit.day > row.last) row.last = transit.day;
    rows.set(key, row);
    total += transit.amount;
  });

  return Array.from(rows.values()).map((row) => ({ ...row, share: total > 0 ? Math.max(0, row.amount) / total : 0 }));
}

export const HGS_SORTS = ['amount', 'transits', 'last'] as const;
export type HgsSort = typeof HGS_SORTS[number];

/** Biggest first for every key; the plate breaks a tie, so the order never jumps. */
export function sortHgsRows(rows: HgsRow[], key: HgsSort): HgsRow[] {
  const value = (row: HgsRow) => (key === 'amount' ? row.amount : key === 'transits' ? row.transits : row.last ?? '');
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const order = typeof va === 'number' && typeof vb === 'number' ? vb - va : String(vb).localeCompare(String(va));
    return order || a.plate.localeCompare(b.plate, 'tr');
  });
}

const squeeze = (value: string | null | undefined) => (value ?? '').toLocaleLowerCase('tr').replace(/\s+/g, '');

export function matchesHgsSearch(row: Pick<HgsRow, 'plate' | 'barcode' | 'model'>, query: string): boolean {
  const wanted = squeeze(query);
  return !wanted || [row.plate, row.barcode, row.model].some((field) => squeeze(field).includes(wanted));
}

export const HGS_FILTERS = ['used'] as const;
export type HgsFilter = typeof HGS_FILTERS[number];

export const inHgsFilter = (row: HgsRow, filter: HgsFilter | 'all'): boolean => filter === 'all' || row.transits > 0;

// ── Formatting ────────────────────────────────────────────────────────────────

const COUNT = new Intl.NumberFormat('tr-TR');
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const formatCount = (value: number): string => COUNT.format(value);

/** A transit has a date and no time, so it's shown as the date alone. */
export function formatDay(day: string | null): string {
  if (!day) return '—';
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? '—' : DAY.format(date);
}

export function formatChange(change: number | null, previousLabel: string): string {
  if (change === null) return `nothing in ${previousLabel}`;
  const rounded = Math.round(change);
  if (rounded === 0) return `same as ${previousLabel}`;
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}% vs ${previousLabel}`;
}

export function syncedAgo(iso: string | null, now: number): string {
  if (!iso) return 'never';
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return 'never';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
