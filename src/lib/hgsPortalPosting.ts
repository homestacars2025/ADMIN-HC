/**
 * "Add HGS from portal" in the customer wallet: the booking's car's portal transits
 * (`hgs_portal_transits`) on the days the car was this booking's, charged to the
 * customer as one ledger line each. The database does the posting in one transaction
 * and marks each transit with the booking, so nothing is ever charged twice; this
 * module only reads, suggests the dates and the rate, and calls it.
 */

import { supabase } from './supabase';

export interface PortalTransit {
  id: number;
  /** Istanbul, "YYYY-MM-DDTHH:mm". */
  at: string;
  amount: number;
  roadType: string | null;
  entry: string | null;
  exit: string | null;
  otoyol: string | null;
}

export interface PortalPreview {
  transits: PortalTransit[];
  /** When finance last uploaded a portal file for the car. */
  lastUpload: string | null;
  /** The newest transit on record for the car, Istanbul date. */
  lastTransit: string | null;
}

export interface PostResult {
  posted: number;
  totalTl: number;
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

/** The range asked for, kept inside the booking: a transit outside it is never the customer's. */
export function bookingRange(booking: { startDate: string; endDate: string }, from: string, to: string): { from: string; to: string } {
  const start = clamp(from || booking.startDate, booking.startDate, booking.endDate);
  const end = clamp(to || booking.endDate, booking.startDate, booking.endDate);
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

// ─── Rate and totals ─────────────────────────────────────────────────────────

/** The booking's own latest rate when it has one, else today's. */
export function defaultRate(bookingRates: Array<number | null | undefined>, todaysRate: number | null): number | null {
  const own = bookingRates.filter((rate): rate is number => typeof rate === 'number' && rate > 0);
  return own.length ? own[own.length - 1] : todaysRate && todaysRate > 0 ? todaysRate : null;
}

export function previewTotals(transits: PortalTransit[], rate: number | null): { count: number; tl: number; usd: number | null } {
  const tl = Math.round(transits.reduce((sum, transit) => sum + transit.amount, 0) * 100) / 100;
  return { count: transits.length, tl, usd: rate && rate > 0 ? Math.round((tl / rate) * 100) / 100 : null };
}

export const routeLabel = (transit: Pick<PortalTransit, 'entry' | 'exit' | 'otoyol'>): string =>
  `${transit.entry?.trim() || '?'} → ${transit.exit?.trim() || transit.otoyol?.trim() || '?'}`;

// ─── The database ────────────────────────────────────────────────────────────

/**
 * Written once for both apps (Team's migration `customer_portal_hgs`). The preview only
 * reads; the post locks the booking's unposted transits in the range, adds one ledger
 * line each and marks them with the booking, all in one transaction, so a second call
 * finds nothing. Both keep the range inside the booking.
 */
export const PREVIEW_RPC = 'booking_portal_hgs_preview';
export const POST_RPC = 'post_booking_portal_hgs';

const num = (value: unknown): number => Number(value) || 0;
const text = (value: unknown): string | null => (value === null || value === undefined || value === '' ? null : String(value));

export interface PortalPreviewResult extends PortalPreview {
  /** The range the database used, clamped to the booking. */
  from: string;
  to: string;
  /** The newest rate on the booking's own lines. */
  rateHint: number | null;
  /** Transits in the range already on the investor's sheet: never charged here. */
  investorCount: number;
  investorTotal: number;
}

export function toPreview(raw: Record<string, unknown>, from: string, to: string): PortalPreviewResult {
  const transits = ((raw.transits ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: num(row.id),
    // "YYYY-MM-DD HH:MI" in Istanbul.
    at: String(row.at ?? '').replace(' ', 'T'),
    amount: num(row.amount),
    roadType: text(row.road_type),
    entry: text(row.entry_location),
    exit: text(row.exit_location),
    otoyol: text(row.otoyol),
  }));
  return {
    transits,
    lastUpload: text(raw.last_upload),
    lastTransit: text(raw.last_transit),
    from: text(raw.from) ?? from,
    to: text(raw.to) ?? to,
    rateHint: raw.rate_hint === null || raw.rate_hint === undefined ? null : num(raw.rate_hint) || null,
    investorCount: num(raw.investor_count),
    investorTotal: num(raw.investor_total),
  };
}

export async function fetchPortalPreview(bookingId: number, from: string, to: string): Promise<PortalPreviewResult> {
  const { data, error } = await supabase.rpc(PREVIEW_RPC, { p_booking_id: bookingId, p_from: from, p_to: to });
  if (error) throw new Error(friendlyHgsError(error.message, error.code));
  return toPreview((data ?? {}) as Record<string, unknown>, from, to);
}

export async function postPortalTransits(bookingId: number, from: string, to: string, rate: number): Promise<PostResult> {
  const { data, error } = await supabase.rpc(POST_RPC, { p_booking_id: bookingId, p_from: from, p_to: to, p_rate: rate });
  if (error) throw new Error(friendlyHgsError(error.message, error.code));
  const raw = (data ?? {}) as Record<string, unknown>;
  return { posted: num(raw.posted), totalTl: num(raw.total) };
}

export function friendlyHgsError(message: string, code?: string): string {
  if (code === '42501') return "You don't have permission to add HGS to customer wallets.";
  if (/could not find the function|does not exist/i.test(message)) return 'Adding HGS from the portal is not set up in the database yet.';
  return message;
}
