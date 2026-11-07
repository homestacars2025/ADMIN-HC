import { supabase } from './supabase';

/**
 * HGS (Turkish motorway toll) reads, and the one write the page makes: a car's barcode.
 *
 * Transits come from `hgs_portal_transits`: the official HGS portal files, uploaded per
 * car by finance. They cover public motorways and private roads (bridges, private
 * gates), and every row has a real time. The page loads every transit once, light
 * columns only, so the month switcher, the tiles and the rows are all worked out here
 * with no further request. One car's full rows are fetched when it's expanded, with the
 * booking that was on the car that day.
 *
 * Days and months are Istanbul time.
 */

export type HgsPeriod = string | 'all';
export const ALL_TIME = 'all';

/** A run of Istanbul days, YYYY-MM-DD, both ends included. */
export interface DayRange {
  from: string;
  to: string;
}

/** What a row or the page counts over: a month, all time, or a range of days. */
export type HgsWindow = HgsPeriod | DayRange;

export interface HgsCarInfo {
  id: number;
  plate: string;
  model: string | null;
  image: string | null;
  barcode: string | null;
  active: boolean;
}

export type HgsRoad = 'public' | 'private';

export interface HgsTransitLite {
  id: number;
  carId: number | null;
  plate: string | null;
  /** The Istanbul day, YYYY-MM-DD. */
  day: string;
  /** The transit's own timestamp, ISO. */
  at: string | null;
  amount: number;
  road: HgsRoad | null;
}

export interface HgsData {
  cars: HgsCarInfo[];
  transits: HgsTransitLite[];
  /** When a portal file was last uploaded, or null before the first one. */
  lastSync: string | null;
}

export interface HgsTransitDetail {
  id: number;
  day: string;
  at: string | null;
  entry: string | null;
  exit: string | null;
  /** The motorway or road operator. */
  road: string | null;
  roadType: HgsRoad | null;
  amount: number;
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

/** The portal writes `*` for a station it doesn't know. */
const station = (value: unknown): string | null => {
  const name = text(value);
  return name === '*' ? null : name;
};

const roadType = (value: unknown): HgsRoad | null => (value === 'public' || value === 'private' ? value : null);

const ISTANBUL_DAY = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Istanbul' });

/** The Istanbul day of a timestamp, YYYY-MM-DD, or '' when it can't be read. */
export function istanbulDay(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : ISTANBUL_DAY.format(date);
}

// ── Reads ─────────────────────────────────────────────────────────────────────

const PAGE = 1000;
const TABLE = 'hgs_portal_transits';
const LITE = 'id, car_id, plate_number, transit_datetime, amount, road_type';

function parseLite(raw: Record<string, unknown>): HgsTransitLite {
  const at = text(raw.transit_datetime);
  return {
    id: num(raw.id),
    carId: raw.car_id == null ? null : num(raw.car_id),
    plate: text(raw.plate_number),
    day: istanbulDay(at),
    at,
    amount: num(raw.amount),
    road: roadType(raw.road_type),
  };
}

/** The first page asks for the count, so the rest can all go at once. */
async function fetchAllTransits(): Promise<HgsTransitLite[]> {
  const page = (from: number) => supabase.from(TABLE).select(LITE, { count: from === 0 ? 'exact' : undefined })
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
    supabase.from(TABLE).select('created_at').order('created_at', { ascending: false }).limit(1),
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

// ── Ranges of days ────────────────────────────────────────────────────────────

const isDay = (value: string | null | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function addDays(day: string, by: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

const lastOfMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** A range from the URL or the picker. The ends are swapped when they come the wrong way round. */
export function parseDayRange(from: string | null | undefined, to: string | null | undefined): DayRange | null {
  if (!isDay(from) || !isDay(to)) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

export const isDayRange = (window: HgsWindow): window is DayRange => typeof window !== 'string';

/** The first and last day a window covers, or null for all time. */
export function windowDays(window: HgsWindow): DayRange | null {
  if (isDayRange(window)) return window;
  if (window === ALL_TIME) return null;
  return { from: `${window}-01`, to: lastOfMonth(window) };
}

export const windowKey = (window: HgsWindow): string => (isDayRange(window) ? `${window.from}_${window.to}` : window);

export const RANGE_PRESETS = ['today', 'last7', 'this_month', 'last_month'] as const;
export type RangePreset = typeof RANGE_PRESETS[number];

export function presetRange(preset: RangePreset, today: string): DayRange {
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'last7') return { from: addDays(today, -6), to: today };
  if (preset === 'this_month') return { from: `${today.slice(0, 7)}-01`, to: today };
  const previous = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  return { from: `${previous}-01`, to: lastOfMonth(previous) };
}

export const presetOf = (range: DayRange | null, today: string): RangePreset | null =>
  (range && RANGE_PRESETS.find((preset) => {
    const candidate = presetRange(preset, today);
    return candidate.from === range.from && candidate.to === range.to;
  })) || null;

/** "01.11 → 06.11", with two-digit years when the range isn't all in this year: "01.11.25 → 06.01.26". */
export function rangeChip(range: DayRange, today: string): string {
  const withYear = range.from.slice(0, 4) !== today.slice(0, 4) || range.to.slice(0, 4) !== today.slice(0, 4);
  const day = (value: string) => `${value.slice(8, 10)}.${value.slice(5, 7)}${withYear ? `.${value.slice(2, 4)}` : ''}`;
  return range.from === range.to ? day(range.from) : `${day(range.from)} → ${day(range.to)}`;
}

/** Follows "no transits": "on 06.11" or "from 01.11 to 06.11". */
export function rangeSentence(range: DayRange, today: string): string {
  const [from, to] = rangeChip(range, today).split(' → ');
  return to ? `from ${from} to ${to}` : `on ${from}`;
}

/** Midnight in Istanbul at the start of a day. Turkey has kept UTC+3 all year since 2016. */
const dayStart = (day: string) => `${day}T00:00:00+03:00`;

export interface BookingOnCar {
  id: number;
  number: string | null;
  start: string;
  end: string;
  customerId: string | null;
  customerName: string | null;
  customerLanguage: string | null;
}

/** The booking that had the car that day. On a handover day the one that started it wins. */
export function bookingOnDay<T extends Pick<BookingOnCar, 'start' | 'end'>>(bookings: T[], day: string): T | null {
  if (!day) return null;
  return bookings
    .filter((booking) => booking.start <= day && day <= booking.end)
    .sort((a, b) => b.start.localeCompare(a.start))[0] ?? null;
}

async function fetchCarBookings(carId: number, period: HgsWindow): Promise<BookingOnCar[]> {
  let query = supabase
    .from('bookings')
    .select('id, booking_number, start_date, end_date, customer_id, customer:customer_id(first_name, last_name, language)')
    .eq('car_id', carId)
    .neq('status', 'cancelled')
    .not('start_date', 'is', null)
    .not('end_date', 'is', null);
  const days = windowDays(period);
  if (days) query = query.lte('start_date', days.to).gte('end_date', days.from);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((raw) => {
    const customer = one(raw.customer as Joined<{ first_name: string | null; last_name: string | null; language: string | null }>);
    return {
      id: num(raw.id),
      number: text(raw.booking_number),
      start: (text(raw.start_date) ?? '').slice(0, 10),
      end: (text(raw.end_date) ?? '').slice(0, 10),
      customerId: text(raw.customer_id),
      customerName: [customer?.first_name, customer?.last_name].map(text).filter(Boolean).join(' ') || null,
      customerLanguage: text(customer?.language),
    };
  });
}

/** The car's bookings that meet the range, newest first, for a toll statement. */
export async function fetchStatementBookings(carId: number, range: DayRange): Promise<BookingOnCar[]> {
  const bookings = await fetchCarBookings(carId, range);
  return bookings.filter((booking) => booking.start && booking.end).sort((a, b) => b.start.localeCompare(a.start));
}

/** One car's transits in the period, newest first, each with the booking on the car that day. */
export async function fetchCarTransits(car: { carId: number | null; plate: string }, period: HgsWindow): Promise<HgsTransitDetail[]> {
  const days = windowDays(period);
  // A busy car passes a few hundred gates a month, so a car's all-time list can run past one page.
  const page = (from: number) => {
    let query = supabase
      .from(TABLE)
      .select('id, transit_datetime, entry_location, exit_location, otoyol, road_type, amount')
      .order('transit_datetime', { ascending: false })
      .order('id', { ascending: false });
    query = car.carId !== null ? query.eq('car_id', car.carId) : query.is('car_id', null).eq('plate_number', car.plate);
    if (days) query = query.gte('transit_datetime', dayStart(days.from)).lt('transit_datetime', dayStart(addDays(days.to, 1)));
    return query.range(from, from + PAGE - 1);
  };
  const [transits, bookings] = await Promise.all([
    (async () => {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await page(from);
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as Record<string, unknown>[]));
        if ((data ?? []).length < PAGE) return rows;
      }
    })(),
    car.carId !== null ? fetchCarBookings(car.carId, period) : Promise.resolve([]),
  ]);
  return transits.map((raw) => {
    const at = text(raw.transit_datetime);
    const day = istanbulDay(at);
    const booking = bookingOnDay(bookings, day);
    const entry = station(raw.entry_location);
    const exit = station(raw.exit_location);
    return {
      id: num(raw.id),
      day,
      at,
      // A single gate is written as both entry and exit.
      entry: entry && entry !== exit ? entry : null,
      exit: exit ?? entry,
      road: text(raw.otoyol),
      roadType: roadType(raw.road_type),
      amount: num(raw.amount),
      bookingId: booking?.id ?? null,
      bookingNumber: booking?.number ?? null,
      bookingMonth: booking?.start.slice(0, 7) ?? null,
      customerId: booking?.customerId ?? null,
      customerName: booking?.customerName ?? null,
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

export function inPeriod(transit: Pick<HgsTransitLite, 'day'>, period: HgsWindow): boolean {
  if (isDayRange(period)) return Boolean(transit.day) && period.from <= transit.day && transit.day <= period.to;
  return period === ALL_TIME || transit.day.slice(0, 7) === period;
}

/** Null when last month had nothing, which is no comparison rather than +100%. */
export function monthChange(now: number, before: number): number | null {
  if (!before) return null;
  return ((now - before) / before) * 100;
}

const previousMonth = (month: string) => {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 2, 1)).toISOString().slice(0, 7);
};

/**
 * Active cars with no HGS data in the period: no transit and nothing spent, barcode or
 * not. The banner, the Cars on HGS tile and its filter all use this one list.
 */
export function carsWithoutTransits(data: Pick<HgsData, 'cars' | 'transits'>, period: HgsWindow): HgsCarInfo[] {
  const used = new Set<number>();
  data.transits.forEach((transit) => { if (transit.carId !== null && inPeriod(transit, period)) used.add(transit.carId); });
  return data.cars
    .filter((car) => car.active && !used.has(car.id))
    .sort((a, b) => a.plate.localeCompare(b.plate, 'tr'));
}

export interface HgsSummary {
  spend: number;
  transits: number;
  /** Every active car, barcode or not. */
  carsOnHgs: number;
  /** Of those, the ones with no HGS data in the period. */
  idle: number;
  thisMonth: { month: string; previous: string; spend: number; previousSpend: number; change: number | null };
}

export function hgsSummary(data: Pick<HgsData, 'cars' | 'transits'>, period: HgsWindow, currentMonth: string): HgsSummary {
  const periodTransits = data.transits.filter((transit) => inPeriod(transit, period));
  const previous = previousMonth(currentMonth);
  const spendIn = (month: string) => data.transits.reduce((total, transit) => total + (inPeriod(transit, month) ? transit.amount : 0), 0);
  const spend = spendIn(currentMonth);
  const previousSpend = spendIn(previous);
  return {
    spend: periodTransits.reduce((total, transit) => total + transit.amount, 0),
    transits: periodTransits.length,
    carsOnHgs: data.cars.filter((car) => car.active).length,
    idle: carsWithoutTransits(data, period).length,
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
  /** Of those, on private roads: bridges and private gates. */
  privateRoad: number;
  amount: number;
  /** The last transit's timestamp, ISO. */
  last: string | null;
  /** Of the period's spend, 0 to 1. */
  share: number;
}

/** How a row goes in the URL's `car=`: its id, or its plate without spaces when it has no car. */
export const carParam = (row: Pick<HgsRow, 'carId' | 'plate'>): string => (row.carId !== null ? String(row.carId) : row.plate.replace(/\s+/g, ''));

/** One car's own range, from `?car=&cfrom=&cto=`. */
export interface CarRange {
  car: string;
  range: DayRange;
}

/**
 * Every active car, plus any other car that passed a toll in the period. A car with its
 * own range is counted over that range instead, its share of the whole fleet's spend in it.
 */
export function hgsRows(data: Pick<HgsData, 'cars' | 'transits'>, period: HgsWindow, carRange: CarRange | null = null): HgsRow[] {
  const rows = rowsIn(data, period);
  if (!carRange) return rows;
  const own = rowsIn(data, carRange.range).find((row) => carParam(row) === carRange.car);
  const index = rows.findIndex((row) => carParam(row) === carRange.car);
  if (index === -1) return own ? [...rows, own] : rows;
  const next = [...rows];
  next[index] = own ?? { ...rows[index], transits: 0, privateRoad: 0, amount: 0, last: null, share: 0 };
  return next;
}

function rowsIn(data: Pick<HgsData, 'cars' | 'transits'>, period: HgsWindow): HgsRow[] {
  const carsById = new Map(data.cars.map((car) => [car.id, car]));
  const rows = new Map<string, HgsRow>();
  const blank = (key: string, car: HgsCarInfo | null, plate: string, carId: number | null): HgsRow => ({
    key, carId, plate: car?.plate ?? plate, model: car?.model ?? null, image: car?.image ?? null, barcode: car?.barcode ?? null,
    transits: 0, privateRoad: 0, amount: 0, last: null, share: 0,
  });
  data.cars.filter((car) => car.active).forEach((car) => rows.set(`car:${car.id}`, blank(`car:${car.id}`, car, car.plate, car.id)));

  let total = 0;
  data.transits.forEach((transit) => {
    if (!inPeriod(transit, period)) return;
    const car = transit.carId === null ? null : carsById.get(transit.carId) ?? null;
    const key = transit.carId !== null ? `car:${transit.carId}` : `plate:${transit.plate ?? '—'}`;
    const row = rows.get(key) ?? blank(key, car, transit.plate ?? '—', transit.carId);
    row.transits += 1;
    if (transit.road === 'private') row.privateRoad += 1;
    row.amount += transit.amount;
    if (transit.at && (!row.last || Date.parse(transit.at) > Date.parse(row.last))) row.last = transit.at;
    rows.set(key, row);
    total += transit.amount;
  });

  return Array.from(rows.values()).map((row) => ({ ...row, share: total > 0 ? Math.max(0, row.amount) / total : 0 }));
}

export const HGS_SORTS = ['amount', 'transits', 'last'] as const;
export type HgsSort = typeof HGS_SORTS[number];

/** Biggest first for every key; the plate breaks a tie, so the order never jumps. */
export function sortHgsRows(rows: HgsRow[], key: HgsSort): HgsRow[] {
  const value = (row: HgsRow) => (key === 'amount' ? row.amount : key === 'transits' ? row.transits : row.last ? Date.parse(row.last) || 0 : 0);
  return [...rows].sort((a, b) => {
    const order = value(b) - value(a);
    return order || a.plate.localeCompare(b.plate, 'tr');
  });
}

const squeeze = (value: string | null | undefined) => (value ?? '').toLocaleLowerCase('tr').replace(/\s+/g, '');

export function matchesHgsSearch(row: Pick<HgsRow, 'plate' | 'barcode' | 'model'>, query: string): boolean {
  const wanted = squeeze(query);
  return !wanted || [row.plate, row.barcode, row.model].some((field) => squeeze(field).includes(wanted));
}

export const HGS_FILTERS = ['used', 'idle'] as const;
export type HgsFilter = typeof HGS_FILTERS[number];

/** A row with no transit is always an active car, so `idle` is the banner's list. */
export function inHgsFilter(row: HgsRow, filter: HgsFilter | 'all'): boolean {
  if (filter === 'used') return row.transits > 0;
  if (filter === 'idle') return row.transits === 0;
  return true;
}

// ── Formatting ────────────────────────────────────────────────────────────────

const COUNT = new Intl.NumberFormat('tr-TR');
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Istanbul' });

export const formatCount = (value: number): string => COUNT.format(value);

/** The Istanbul date of a timestamp, e.g. "4 Nov 2026". */
export function formatDay(iso: string | null): string {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? DAY.format(date) : '—';
}

/** The Istanbul time of a timestamp, e.g. "14:04". */
export function formatTime(iso: string | null): string {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? TIME.format(date) : '';
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
