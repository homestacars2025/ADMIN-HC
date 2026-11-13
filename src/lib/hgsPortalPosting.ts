/**
 * "Add HGS from portal" in the customer wallet: the booking's car's portal transits
 * (`hgs_portal_transits`), charged to the customer as one ledger line each, in lira.
 * The database reads and writes them: `preview_customer_hgs` lists what would be
 * charged and `apply_customer_hgs` charges it and marks each transit with the booking,
 * so a second run finds nothing. From and To are free: whatever falls in the range is
 * charged, and each row says if it is outside this booking or on another booking's days,
 * so the sheet can warn before charging. No exchange rate is read, asked or stored.
 */

import { supabase } from './supabase';

export interface PortalTransit {
  id: number;
  /** Istanbul day, YYYY-MM-DD. */
  day: string;
  /** Lira. */
  amount: number;
  roadType: string | null;
  /** "DD-MM-YYYY ENTRY → EXIT", as the ledger line will read. */
  note: string;
  /** The day is not one of this booking's days. */
  outsideBooking: boolean;
  /** The number of the car's other booking that day falls in, if any. */
  otherBooking: string | null;
}

export interface PortalFreshness {
  /** When finance last uploaded a portal file for the car. */
  lastUpload: string | null;
  /** The newest transit on record for the car, Istanbul day. */
  lastTransit: string | null;
}

export interface ApplyResult {
  count: number;
  /** Lira. */
  total: number;
  /** The `event_no` the batch's lines share: the wallet shows it as its own HGS line. */
  eventNo: number | null;
}

// ─── Dates ───────────────────────────────────────────────────────────────────

const pad = (value: number) => String(value).padStart(2, '0');
const isoDay = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const clamp = (day: string, from: string, to: string) => (day < from ? from : day > to ? to : day);

/**
 * The last day a typed HGS line says it covers: "HGS to 31/09/2026", "TO 3.11",
 * "FROM 02/10 TO 01/11", "hgs to 05.11.2026". A day past the month's end, as in
 * 31/09, is read as that month's last day; a missing year is the booking's.
 */
export function coveredUntil(description: string | null, fallbackYear: number): string | null {
  const match = (description ?? '').match(/\bto\s*[-–]?\s*(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{2,4}))?/i);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : fallbackYear;
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return isoDay(year, month, Math.min(day, lastDay));
}

/**
 * Where charging starts: the day after the latest date the booking's typed HGS lines
 * already cover, or the booking's first day. Always inside the booking.
 */
export function suggestedFrom(booking: { startDate: string; endDate: string }, typedHgs: Array<{ description: string | null }>): string {
  const year = Number(booking.startDate.slice(0, 4));
  const covered = typedHgs
    .map((line) => coveredUntil(line.description, year))
    .filter((day): day is string => day !== null && day >= booking.startDate)
    .sort();
  const last = covered[covered.length - 1];
  return last ? clamp(addDays(last, 1), booking.startDate, booking.endDate) : booking.startDate;
}

// ─── Totals ──────────────────────────────────────────────────────────────────

export function previewTotals(transits: PortalTransit[]): { count: number; total: number } {
  return { count: transits.length, total: Math.round(transits.reduce((sum, transit) => sum + transit.amount, 0) * 100) / 100 };
}

/** The rows outside the booking, which the sheet asks about before charging. */
export function outsideTotals(transits: PortalTransit[]): { count: number; total: number } {
  return previewTotals(transits.filter((transit) => transit.outsideBooking));
}

// ─── The database ────────────────────────────────────────────────────────────

const num = (value: unknown): number => Number(value) || 0;

/** Null From is the booking's start and null To its end. Both are always sent. */
const args = (bookingId: number, from: string | null, to: string | null) => ({ p_booking_id: bookingId, p_from_date: from || null, p_to_date: to || null });

export async function previewCustomerHgs(bookingId: number, from: string | null, to: string | null): Promise<PortalTransit[]> {
  const { data, error } = await supabase.rpc('preview_customer_hgs', args(bookingId, from, to));
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: num(row.portal_id),
    day: String(row.tdate ?? '').slice(0, 10),
    amount: num(row.amount),
    roadType: row.road_type ? String(row.road_type) : null,
    note: String(row.note ?? ''),
    outsideBooking: row.outside_booking === true,
    otherBooking: row.other_booking ? String(row.other_booking) : null,
  }));
}

export async function applyCustomerHgs(bookingId: number, from: string | null, to: string | null): Promise<ApplyResult> {
  const { data, error } = await supabase.rpc('apply_customer_hgs', args(bookingId, from, to));
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return { count: num(row?.inserted_count), total: num(row?.inserted_total), eventNo: row?.batch_event_no == null ? null : num(row.batch_event_no) };
}

/** The newest upload and transit for the car, test files left out. */
export async function fetchPortalFreshness(carId: number): Promise<PortalFreshness> {
  const base = () => supabase.from('hgs_portal_transits').select('created_at, transit_datetime').eq('car_id', carId).not('source_file', 'like', '%test%');
  const [upload, transit] = await Promise.all([
    base().order('created_at', { ascending: false }).limit(1),
    base().order('transit_datetime', { ascending: false }).limit(1),
  ]);
  if (upload.error) throw new Error(upload.error.message);
  if (transit.error) throw new Error(transit.error.message);
  const lastUpload = (upload.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
  const lastTransitAt = (transit.data?.[0] as { transit_datetime?: string } | undefined)?.transit_datetime ?? null;
  return { lastUpload, lastTransit: lastTransitAt ? istanbulDay(lastTransitAt) : null };
}

const ISTANBUL_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' });
const istanbulDay = (iso: string) => ISTANBUL_DAY.format(new Date(iso));
