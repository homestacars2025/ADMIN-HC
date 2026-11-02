import {
  bookingProgress,
  bookingsCsv,
  bookingSummary,
  extensionSummary,
  inBookingFilter,
  inExtensionFilter,
  inSheetFilter,
  invoicePending,
  isActiveNow,
  kabisMissing,
  matchesBookingSearch,
  matchesExtensionSearch,
  matchesSheetSearch,
  rentalDays,
  sheetSummary,
  sortBookings,
  type BookingExtension,
  type ReplacementSheetRow,
} from './bookingTabs';
import type { Booking } from '../types';

jest.mock('./supabase', () => ({ supabase: {} }));

const today = '2026-11-10';
const booking = (over: Partial<Booking>): Booking => ({
  id: 1, created_at: '', car_id: 1, start_date: '2026-11-05', end_date: '2026-11-15', insurance_type: null, notes: null, pickup_location: null, dropoff_location: null,
  booking_number: 'HOM-11-26-001', additional_driver: null, customer_id: 1, kabis_reported: true, invoice_issued: false, is_currently_active: true, status: 'confirmed',
  additional_services: null, km_at_delivery: null, fuel_at_delivery: null, plate_number: '34 ABC 101', car_model: 'Fiat Egea', customer_name: 'Ali Veli', ...over,
});
const extension = (over: Partial<BookingExtension>): BookingExtension => ({
  event_id: 1, booking_id: 1, booking_number: 'HOM-10-26-027', event_no: 1, period_start: '2026-10-31', period_end: '2026-11-02', days: 2, rental_amount: 1000,
  created_at: '2026-10-29T15:45:20Z', created_by_name: 'Ahmed', plate: '34 DK 6500', car_model: 'Chery', customer_id: 'c', customer_name: 'Ali Veli',
  booking_start: '2026-10-26', booking_end: '2026-11-03', booking_status: 'confirmed', is_legacy: true, ...over,
});
const sheet = (over: Partial<ReplacementSheetRow>): ReplacementSheetRow => ({
  id: 1, sheet_number: 'RS-001', created_at: '', start_date: '2026-11-01', end_date: '2026-11-20', km_at_handover: null, fuel_at_handover: null, notes: null, customer_id: null,
  customer_name: 'Ali Veli', original_booking_number: 'HOM-1', original_plate: '34 AAA 1', original_model: null, replacement_plate: '34 BBB 2', replacement_model: null, ...over,
});

describe('booking tiles', () => {
  it('is active only while confirmed and between its dates', () => {
    expect(isActiveNow(booking({}), today)).toBe(true);
    expect(isActiveNow(booking({ start_date: today, end_date: today }), today)).toBe(true);
    expect(isActiveNow(booking({ status: 'completed' }), today)).toBe(false);
    expect(isActiveNow(booking({ end_date: '2026-11-09' }), today)).toBe(false);
  });

  it('does not call a future or a cancelled booking missing from KABIS', () => {
    expect(kabisMissing(booking({ kabis_reported: false }), today)).toBe(true);
    expect(kabisMissing(booking({ kabis_reported: false, status: 'completed' }), today)).toBe(true);
    expect(kabisMissing(booking({ kabis_reported: false, start_date: '2026-11-20' }), today)).toBe(false);
    expect(kabisMissing(booking({ kabis_reported: false, status: 'cancelled' }), today)).toBe(false);
    expect(kabisMissing(booking({ kabis_reported: false, status: 'pending' }), today)).toBe(false);
  });

  it('follows the Pending Invoices rule', () => {
    expect(invoicePending(booking({ status: 'completed' }))).toBe(true);
    expect(invoicePending(booking({ status: 'confirmed' }))).toBe(false);
    expect(invoicePending(booking({ status: 'completed', kabis_reported: false }))).toBe(false);
    expect(invoicePending(booking({ status: 'completed', invoice_issued: true }))).toBe(false);
  });

  it('adds them up', () => {
    const rows = [booking({}), booking({ status: 'completed' }), booking({ status: 'cancelled', kabis_reported: false }), booking({ start_date: '2026-11-20', end_date: '2026-11-25' })];
    expect(bookingSummary(rows, today)).toEqual({ total: 4, confirmed: 2, activeNow: 1, completed: 1, kabis: 0, invoice: 1 });
  });

  it('filters by tile', () => {
    expect(inBookingFilter(booking({}), 'all', today)).toBe(true);
    expect(inBookingFilter(booking({}), 'completed', today)).toBe(false);
    expect(inBookingFilter(booking({ kabis_reported: false }), 'kabis', today)).toBe(true);
    expect(inBookingFilter(booking({ status: 'completed' }), 'invoice', today)).toBe(true);
  });
});

describe('booking rows', () => {
  it('counts days and how far through it is', () => {
    expect(rentalDays(booking({}))).toBe(10);
    expect(rentalDays(booking({ start_date: today, end_date: today }))).toBe(1);
    expect(bookingProgress(booking({}), today)).toBe(50);
    expect(bookingProgress(booking({ status: 'completed' }), today)).toBeNull();
  });

  it('searches number, customer and plate, ignoring spaces and case', () => {
    expect(matchesBookingSearch(booking({}), 'hom-11')).toBe(true);
    expect(matchesBookingSearch(booking({}), '34abc')).toBe(true);
    expect(matchesBookingSearch(booking({}), 'zzz')).toBe(false);
  });

  it('sorts when asked and leaves the arrival order alone otherwise', () => {
    const rows = [booking({ id: 1, start_date: '2026-11-09' }), booking({ id: 2, start_date: '2026-11-01' })];
    expect(sortBookings(rows, 'created', 'desc').map((row) => row.id)).toEqual([1, 2]);
    expect(sortBookings(rows, 'start_date', 'asc').map((row) => row.id)).toEqual([2, 1]);
    expect(sortBookings(rows, 'start_date', 'desc').map((row) => row.id)).toEqual([1, 2]);
  });

  it('keeps a formula out of the export', () => {
    expect(bookingsCsv([booking({ customer_name: '=SUM(A1)' })])).toContain("'=SUM(A1)");
  });
});

describe('extensions', () => {
  it('leaves rows without dates out of the average, but not out of the value', () => {
    const summary = extensionSummary([extension({ days: 2 }), extension({ days: 4, rental_amount: 500 }), extension({ days: null, rental_amount: 0 })]);
    expect(summary).toEqual({ count: 3, value: 1500, avgDays: 3, undated: 1, zero: 1 });
  });

  it('has no average with nothing to average', () => {
    expect(extensionSummary([]).avgDays).toBeNull();
    expect(extensionSummary([extension({ days: null })]).avgDays).toBeNull();
  });

  it('filters zero amounts', () => {
    expect(inExtensionFilter(extension({ rental_amount: 0 }), 'zero')).toBe(true);
    expect(inExtensionFilter(extension({}), 'zero')).toBe(false);
    expect(inExtensionFilter(extension({}), 'all')).toBe(true);
  });

  it('searches booking, customer and plate', () => {
    expect(matchesExtensionSearch(extension({}), '34dk')).toBe(true);
    expect(matchesExtensionSearch(extension({ plate: null, customer_name: null }), 'zzz')).toBe(false);
  });
});

describe('replacement sheets', () => {
  const rows = [sheet({ id: 1 }), sheet({ id: 2, end_date: '2026-11-09', start_date: '2026-10-01' })];

  it('counts total, open and the chosen month', () => {
    expect(sheetSummary(rows, today, '2026-11')).toEqual({ total: 2, open: 1, month: 1 });
  });

  it('treats a sheet ending today as open', () => {
    expect(inSheetFilter(sheet({ end_date: today }), 'open', today, '2026-11')).toBe(true);
  });

  it('filters by tile', () => {
    expect(inSheetFilter(rows[1], 'open', today, '2026-11')).toBe(false);
    expect(inSheetFilter(rows[1], 'month', today, '2026-10')).toBe(true);
    expect(inSheetFilter(rows[1], 'all', today, '2026-11')).toBe(true);
  });

  it('searches both plates', () => {
    expect(matchesSheetSearch(sheet({}), '34bbb')).toBe(true);
    expect(matchesSheetSearch(sheet({}), '34aaa')).toBe(true);
    expect(matchesSheetSearch(sheet({}), 'rs-001')).toBe(true);
  });
});
