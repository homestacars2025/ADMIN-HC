import { supabase } from './supabase';

/**
 * HGS (Turkish motorway toll) reads.
 *
 * The page is read-only — an n8n workflow writes `hgs_transactions` hourly.
 * Everything above the fold comes from a single `hgs_dashboard()` RPC rather
 * than one query per card plus one per car: 41 subscribed cars would otherwise
 * mean 40-odd round trips before the list can paint. Per-car history is the
 * deliberate exception — it is fetched only when a car is expanded, because the
 * transaction table grows every hour and nobody opens all 41 histories.
 */

export interface HgsSummary {
  totalAmount: number;
  transitCount: number;
  carsWithHgs: number;
  carsWithoutHgs: number;
}

export interface HgsCar {
  carId: number;
  plateNumber: string;
  hgsBarcode: string | null;
  /** `model_group.name` — e.g. "Chery Tiggo 7 Pro". Null if the car has no group. */
  modelGroup: string | null;
  transitCount: number;
  totalAmount: number;
  /** ISO timestamp, or null for a subscribed car that has never passed a toll. */
  lastTransit: string | null;
}

export interface HgsDashboard {
  summary: HgsSummary;
  cars: HgsCar[];
}

export interface HgsTransit {
  id: number;
  tollLocation: string | null;
  /** Where the car entered / left the toll road. Either may be absent upstream. */
  entryLocation: string | null;
  exitLocation: string | null;
  direction: string | null;
  transitDatetime: string;
  amount: number;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * `numeric` columns cross the wire as JSON numbers, but a null sum or a stray
 * string would otherwise reach the formatter and render "NaN TL". Every scalar
 * off the RPC is coerced once, here.
 */
function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseCar(raw: Record<string, unknown>): HgsCar {
  return {
    carId: num(raw.car_id),
    plateNumber: text(raw.plate_number) ?? '—',
    hgsBarcode: text(raw.hgs_barcode),
    modelGroup: text(raw.model_group),
    transitCount: num(raw.transit_count),
    totalAmount: num(raw.total_amount),
    lastTransit: text(raw.last_transit),
  };
}

const EMPTY_SUMMARY: HgsSummary = {
  totalAmount: 0,
  transitCount: 0,
  carsWithHgs: 0,
  carsWithoutHgs: 0,
};

// ── Queries ───────────────────────────────────────────────────────────────────

/** Summary figures plus the per-car rollup, already sorted by spend descending. */
export async function getHgsDashboard(): Promise<HgsDashboard> {
  const { data, error } = await supabase.rpc('hgs_dashboard');
  if (error) throw new Error(error.message);

  const payload = (data ?? {}) as Record<string, unknown>;
  const summary = (payload.summary ?? {}) as Record<string, unknown>;
  const cars = Array.isArray(payload.cars) ? payload.cars : [];

  return {
    summary: {
      ...EMPTY_SUMMARY,
      totalAmount: num(summary.total_amount),
      transitCount: num(summary.transit_count),
      carsWithHgs: num(summary.cars_with_hgs),
      carsWithoutHgs: num(summary.cars_without_hgs),
    },
    cars: cars.map((c) => parseCar((c ?? {}) as Record<string, unknown>)),
  };
}

/** One car's transit history, newest first. */
export async function getCarTransits(carId: number): Promise<HgsTransit[]> {
  const { data, error } = await supabase
    .from('hgs_transactions')
    .select('id, toll_location, entry_location, exit_location, direction, transit_datetime, amount')
    .eq('car_id', carId)
    .order('transit_datetime', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const raw = row as Record<string, unknown>;
    return {
      id: num(raw.id),
      tollLocation: text(raw.toll_location),
      entryLocation: text(raw.entry_location),
      exitLocation: text(raw.exit_location),
      direction: text(raw.direction),
      transitDatetime: text(raw.transit_datetime) ?? '',
      amount: num(raw.amount),
    };
  });
}

// ── Formatting ────────────────────────────────────────────────────────────────
//
// Turkish conventions throughout: "." groups thousands, "," is the decimal mark,
// so 1408.5 reads 1.408,50 TL.

const LIRA = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COUNT = new Intl.NumberFormat('tr-TR');

const DATE_TIME = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_ONLY = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function formatLira(amount: number): string {
  return `${LIRA.format(amount)} TL`;
}

export function formatCount(value: number): string {
  return COUNT.format(value);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date);
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE_ONLY.format(date);
}
