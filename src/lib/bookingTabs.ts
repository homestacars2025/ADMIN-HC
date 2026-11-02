import { csvCell } from './money';
import { supabase } from './supabase';
import type { Booking } from '../types';

export const BOOKING_TABS = ['bookings', 'extensions', 'replacements'] as const;
export type BookingTab = typeof BOOKING_TABS[number];

export const TAB_FILTERS = {
  bookings: ['confirmed', 'completed', 'kabis', 'invoice'],
  extensions: ['zero'],
  replacements: ['open', 'month'],
} as const;

export type BookingFilter = typeof TAB_FILTERS.bookings[number];
export type ExtensionFilter = typeof TAB_FILTERS.extensions[number];
export type SheetFilter = typeof TAB_FILTERS.replacements[number];

const DAY_MS = 86400000;
const dayOf = (date: string) => date.slice(0, 10);
const dayNumber = (date: string) => Math.round(Date.parse(`${dayOf(date)}T00:00:00Z`) / DAY_MS);

const squeeze = (text: string | null | undefined) => (text ?? '').toLocaleLowerCase('tr').replace(/\s+/g, '');
const matches = (query: string, fields: Array<string | null | undefined>) => {
  const wanted = squeeze(query);
  return !wanted || fields.some((field) => squeeze(field).includes(wanted));
};

// ─── Bookings ─────────────────────────────────────────────────────────────────

type DatedBooking = Pick<Booking, 'status' | 'start_date' | 'end_date'>;

export const isActiveNow = (row: DatedBooking, today: string): boolean => (
  row.status === 'confirmed' && dayOf(row.start_date) <= today && dayOf(row.end_date) >= today
);

/** A booking that hasn't started has nothing to report yet. */
export const kabisMissing = (row: DatedBooking & Pick<Booking, 'kabis_reported'>, today: string): boolean => (
  (row.status === 'confirmed' || row.status === 'completed') && dayOf(row.start_date) <= today && !row.kabis_reported
);

/** The same rule as the Pending Invoices page. */
export const invoicePending = (row: Pick<Booking, 'status' | 'kabis_reported' | 'invoice_issued'>): boolean => (
  row.status === 'completed' && row.kabis_reported && !row.invoice_issued
);

export function inBookingFilter(row: Booking, filter: BookingFilter | 'all', today: string): boolean {
  switch (filter) {
    case 'confirmed': return row.status === 'confirmed';
    case 'completed': return row.status === 'completed';
    case 'kabis': return kabisMissing(row, today);
    case 'invoice': return invoicePending(row);
    default: return true;
  }
}

export function bookingSummary(rows: Booking[], today: string) {
  return {
    total: rows.length,
    confirmed: rows.filter((row) => row.status === 'confirmed').length,
    activeNow: rows.filter((row) => isActiveNow(row, today)).length,
    completed: rows.filter((row) => row.status === 'completed').length,
    kabis: rows.filter((row) => kabisMissing(row, today)).length,
    invoice: rows.filter(invoicePending).length,
  };
}

export const matchesBookingSearch = (row: Booking, query: string): boolean => matches(query, [row.booking_number, row.customer_name, row.plate_number]);

export const rentalDays = (row: Pick<Booking, 'start_date' | 'end_date'>): number => Math.max(1, dayNumber(row.end_date) - dayNumber(row.start_date));

/** How far through an active rental we are, or null for anything not on the road. */
export function bookingProgress(row: DatedBooking, today: string): number | null {
  if (!isActiveNow(row, today)) return null;
  const elapsed = dayNumber(today) - dayNumber(row.start_date);
  return Math.min(100, Math.max(0, Math.round((elapsed / rentalDays(row)) * 100)));
}

export const BOOKING_SORTS = ['created', 'booking_number', 'start_date', 'end_date'] as const;
export type BookingSort = typeof BOOKING_SORTS[number];

/** `created` keeps the order the list arrived in, newest first. */
export function sortBookings(rows: Booking[], key: BookingSort, direction: 'asc' | 'desc'): Booking[] {
  if (key === 'created') return rows;
  const order = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => a[key].localeCompare(b[key]) * order);
}

export function bookingsCsv(rows: Booking[]): string {
  const header = ['Booking #', 'Status', 'Car', 'Plate', 'Customer', 'Start date', 'End date', 'KABIS', 'Invoice'].join(',');
  const lines = rows.map((row) => [
    row.booking_number, row.status, row.car_model, row.plate_number, row.customer_name, dayOf(row.start_date), dayOf(row.end_date),
    row.kabis_reported ? 'Yes' : 'No', row.invoice_issued ? 'Yes' : 'No',
  ].map(csvCell).join(','));
  return ['﻿' + header, ...lines].join('\r\n');
}

// ─── Extensions ───────────────────────────────────────────────────────────────

export interface BookingExtension {
  event_id: number;
  booking_id: number;
  booking_number: string;
  event_no: number;
  period_start: string | null;
  period_end: string | null;
  days: number | null;
  rental_amount: number;
  created_at: string;
  created_by_name: string | null;
  plate: string | null;
  car_model: string | null;
  customer_id: string | null;
  customer_name: string | null;
  booking_start: string;
  booking_end: string;
  booking_status: string;
  is_legacy: boolean;
}

export async function fetchExtensions(month: string): Promise<BookingExtension[]> {
  const { data, error } = await supabase.rpc('list_booking_extensions', { p_month: `${month}-01` });
  if (error) throw new Error(error.message);
  return ((data ?? []) as BookingExtension[]).map((row) => ({
    ...row,
    rental_amount: Number(row.rental_amount),
    days: row.days === null ? null : Number(row.days),
  }));
}

export const inExtensionFilter = (row: BookingExtension, filter: ExtensionFilter | 'all'): boolean => filter !== 'zero' || row.rental_amount === 0;

/** Some old extensions have no dates, so they can't count towards the average. */
export function extensionSummary(rows: BookingExtension[]) {
  const dated = rows.filter((row) => row.days !== null);
  return {
    count: rows.length,
    value: rows.reduce((total, row) => total + row.rental_amount, 0),
    avgDays: dated.length === 0 ? null : dated.reduce((total, row) => total + (row.days as number), 0) / dated.length,
    undated: rows.length - dated.length,
    zero: rows.filter((row) => row.rental_amount === 0).length,
  };
}

export const matchesExtensionSearch = (row: BookingExtension, query: string): boolean => matches(query, [row.booking_number, row.customer_name, row.plate]);

export function extensionsCsv(rows: BookingExtension[]): string {
  const header = ['Extension', 'Booking #', 'Plate', 'Car', 'Customer', 'From', 'To', 'Days', 'Amount TRY', 'Entered by', 'Entered on', 'Legacy'].join(',');
  const lines = rows.map((row) => [
    row.event_no, row.booking_number, row.plate, row.car_model, row.customer_name, row.period_start, row.period_end, row.days, row.rental_amount,
    row.created_by_name, dayOf(row.created_at), row.is_legacy ? 'Yes' : 'No',
  ].map(csvCell).join(','));
  return ['﻿' + header, ...lines].join('\r\n');
}

// ─── Replacement sheets ───────────────────────────────────────────────────────

type Joined<T> = T | T[] | null;
const firstOf = <T,>(value: Joined<T> | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

interface SheetCar { plate_number: string; model_group: Joined<{ name: string }> }

/** Raw replacement_sheets row with its four embedded relations. */
interface ReplacementSheetJoin {
  id: number;
  sheet_number: string | null;
  created_at: string;
  start_date: string;
  end_date: string;
  km_at_handover: number | string | null;
  fuel_at_handover: string | null;
  notes: string | null;
  customer_id: string | null;
  customers: Joined<{ first_name: string; last_name: string }>;
  bookings: Joined<{ booking_number: string }>;
  original_car: Joined<SheetCar>;
  replacement_car: Joined<SheetCar>;
}

/** Flattened replacement sheet, ready for the list and for reprinting. */
export interface ReplacementSheetRow {
  id: number;
  sheet_number: string;
  created_at: string;
  start_date: string;
  end_date: string;
  km_at_handover: number | null;
  fuel_at_handover: string | null;
  notes: string | null;
  customer_id: string | null;
  customer_name: string;
  original_booking_number: string | null;
  original_plate: string | null;
  original_model: string | null;
  replacement_plate: string;
  replacement_model: string | null;
}

const SHEET_SELECT = `
  id, sheet_number, created_at, start_date, end_date,
  km_at_handover, fuel_at_handover, notes,
  customer_id, original_booking_id, original_car_id, replacement_car_id, calendar_block_id,
  customers!replacement_sheets_customer_id_fkey(first_name, last_name),
  bookings!replacement_sheets_original_booking_id_fkey(booking_number),
  original_car:cars!replacement_sheets_original_car_id_fkey(plate_number, model_group(name)),
  replacement_car:cars!replacement_sheets_replacement_car_id_fkey(plate_number, model_group(name))
`;

const modelOf = (car: SheetCar | null) => (car ? firstOf(car.model_group)?.name ?? '—' : null);

function resolveSheet(row: ReplacementSheetJoin): ReplacementSheetRow {
  const customer = firstOf(row.customers);
  const original = firstOf(row.original_car);
  const replacement = firstOf(row.replacement_car);
  return {
    id: row.id,
    sheet_number: row.sheet_number ?? '—',
    created_at: row.created_at,
    start_date: row.start_date,
    end_date: row.end_date,
    // numeric columns can arrive as a string from PostgREST.
    km_at_handover: row.km_at_handover == null ? null : Number(row.km_at_handover),
    fuel_at_handover: row.fuel_at_handover,
    notes: row.notes,
    customer_id: row.customer_id,
    customer_name: customer ? `${customer.first_name} ${customer.last_name}`.trim() : '—',
    original_booking_number: firstOf(row.bookings)?.booking_number ?? null,
    original_plate: original?.plate_number ?? null,
    original_model: modelOf(original),
    replacement_plate: replacement?.plate_number ?? '—',
    replacement_model: modelOf(replacement),
  };
}

export async function fetchReplacementSheets(): Promise<ReplacementSheetRow[]> {
  const { data, error } = await supabase
    .from('replacement_sheets')
    .select(SHEET_SELECT)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ReplacementSheetJoin[]).map(resolveSheet);
}

export const sheetIsOpen = (row: Pick<ReplacementSheetRow, 'end_date'>, today: string): boolean => dayOf(row.end_date) >= today;
export const sheetInMonth = (row: Pick<ReplacementSheetRow, 'start_date'>, month: string): boolean => row.start_date.slice(0, 7) === month;

export function inSheetFilter(row: ReplacementSheetRow, filter: SheetFilter | 'all', today: string, month: string): boolean {
  if (filter === 'open') return sheetIsOpen(row, today);
  if (filter === 'month') return sheetInMonth(row, month);
  return true;
}

export function sheetSummary(rows: ReplacementSheetRow[], today: string, month: string) {
  return {
    total: rows.length,
    open: rows.filter((row) => sheetIsOpen(row, today)).length,
    month: rows.filter((row) => sheetInMonth(row, month)).length,
  };
}

export const matchesSheetSearch = (row: ReplacementSheetRow, query: string): boolean => matches(query, [
  row.sheet_number, row.customer_name, row.original_booking_number, row.original_plate, row.replacement_plate,
]);

export function sheetsCsv(rows: ReplacementSheetRow[]): string {
  const header = ['Sheet', 'Customer', 'Booking #', 'Original plate', 'Original car', 'Replacement plate', 'Replacement car', 'Start', 'End', 'Notes'].join(',');
  const lines = rows.map((row) => [
    row.sheet_number, row.customer_name, row.original_booking_number, row.original_plate, row.original_model,
    row.replacement_plate, row.replacement_model, dayOf(row.start_date), dayOf(row.end_date), row.notes,
  ].map(csvCell).join(','));
  return ['﻿' + header, ...lines].join('\r\n');
}
