import { csvCell, formatMoney } from './money';
import { supabase } from './supabase';

export interface InvoiceLine {
  type: string;
  description: string | null;
  amount: number;
  date: string;
}

export interface PendingInvoice {
  booking_id: number;
  booking_number: string;
  start_date: string;
  end_date: string;
  days: number;
  plate: string | null;
  car_brand: string | null;
  car_model: string | null;
  customer_id: string | null;
  customer_name: string | null;
  nationality: string | null;
  id_type: string | null;
  id_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  birth_date: string | null;
  rental_total: number;
  extras_total: number;
  invoice_total: number;
  net_amount: number;
  vat_amount: number;
  paid_total: number;
  lines: InvoiceLine[];
  invoice_text: string;
}

type Raw<T> = { [K in keyof T]: unknown };

const toInvoice = (row: Raw<PendingInvoice>): PendingInvoice => ({
  ...row as PendingInvoice,
  days: Number(row.days),
  rental_total: Number(row.rental_total),
  extras_total: Number(row.extras_total),
  invoice_total: Number(row.invoice_total),
  net_amount: Number(row.net_amount),
  vat_amount: Number(row.vat_amount),
  paid_total: Number(row.paid_total),
  lines: ((row.lines ?? []) as Array<Raw<InvoiceLine>>).map((line) => ({ ...line as InvoiceLine, amount: Number(line.amount) })),
});

/** Every month at once: the list is short, and the arrows then answer instantly. */
export async function fetchPendingInvoices(): Promise<PendingInvoice[]> {
  const { data, error } = await supabase.rpc('finance_pending_invoices', { p_month: null });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Raw<PendingInvoice>>).map(toInvoice);
}

export async function markInvoiced(bookingIds: number[], issued: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('finance_mark_invoice_issued', { p_booking_ids: bookingIds, p_issued: issued });
  if (error) throw new Error(error.message);
  return Number(data);
}

// ─── Working it out ───────────────────────────────────────────────────────────

/** A booking belongs to the month it ended in. */
export const invoiceMonth = (row: Pick<PendingInvoice, 'end_date'>): string => row.end_date.slice(0, 7);

const sum = <T,>(rows: T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);

export const INVOICE_FILTERS = ['ready', 'missing'] as const;
export type InvoiceFilter = typeof INVOICE_FILTERS[number];

export function inInvoiceFilter(row: PendingInvoice, filter: InvoiceFilter | 'all'): boolean {
  if (filter === 'ready') return row.invoice_total > 0;
  if (filter === 'missing') return row.invoice_total === 0;
  return true;
}

export function invoiceSummary(rows: PendingInvoice[]) {
  return {
    count: rows.length,
    total: sum(rows, (row) => row.invoice_total),
    net: sum(rows, (row) => row.net_amount),
    vat: sum(rows, (row) => row.vat_amount),
    ready: rows.filter((row) => inInvoiceFilter(row, 'ready')).length,
    missing: rows.filter((row) => inInvoiceFilter(row, 'missing')).length,
  };
}

const squeeze = (text: string | null) => (text ?? '').toLocaleLowerCase('tr').replace(/\s+/g, '');

export function matchesInvoiceSearch(row: PendingInvoice, query: string): boolean {
  const wanted = squeeze(query);
  return !wanted || [row.customer_name, row.plate, row.booking_number, row.id_number].some((text) => squeeze(text).includes(wanted));
}

export const linesTotal = (row: Pick<PendingInvoice, 'lines'>): number => sum(row.lines, (line) => line.amount);

export type InvoiceWarning = { kind: 'lines_differ'; linesTotal: number } | { kind: 'no_rental' };

/**
 * What the total alone doesn't show. An IN row typed as rental cancels the charge, so
 * the total can sit far below the lines, and a booking with only extras would be
 * invoiced for the car wash alone. A total of zero has its own tile.
 */
export function invoiceWarning(row: PendingInvoice): InvoiceWarning | null {
  const lines = linesTotal(row);
  if (Math.abs(lines - row.invoice_total) > 0.01) return { kind: 'lines_differ', linesTotal: lines };
  if (row.rental_total <= 0 && row.invoice_total > 0) return { kind: 'no_rental' };
  return null;
}

// ─── Words ────────────────────────────────────────────────────────────────────

export const carLabel = (row: Pick<PendingInvoice, 'car_brand' | 'car_model'>): string => [row.car_brand, row.car_model].filter(Boolean).join(' ');

/** "Car wash ‹op:598›" carries an internal operation number nobody should read. */
export function lineLabel(line: Pick<InvoiceLine, 'type' | 'description'>): string {
  const description = (line.description ?? '').replace(/\s*‹[^›]*›/g, '').trim();
  if (description) return description;
  const words = line.type.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** It's stored as NATIONAL_ID, national_id, PASSPORT or passport. */
export function idTypeLabel(idType: string | null): string | null {
  const key = idType?.trim().toLowerCase();
  if (!key) return null;
  if (key === 'national_id') return 'National ID';
  if (key === 'passport') return 'Passport';
  return idType;
}

const FIELD_LABELS = {
  name: 'Name',
  nationality: 'Nationality',
  id: 'ID',
  birth: 'Birth date',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
} as const;

export function customerFields(row: PendingInvoice, formatDay: (day: string) => string): Array<{ key: keyof typeof FIELD_LABELS; label: string; value: string | null }> {
  const clean = (text: string | null) => text?.trim() || null;
  const id = clean(row.id_number);
  const idType = idTypeLabel(row.id_type);
  return [
    { key: 'name', label: FIELD_LABELS.name, value: clean(row.customer_name) },
    { key: 'nationality', label: FIELD_LABELS.nationality, value: clean(row.nationality) },
    { key: 'id', label: idType ? `${FIELD_LABELS.id} (${idType})` : FIELD_LABELS.id, value: id },
    { key: 'birth', label: FIELD_LABELS.birth, value: row.birth_date ? formatDay(row.birth_date) : null },
    { key: 'phone', label: FIELD_LABELS.phone, value: clean(row.phone) },
    { key: 'email', label: FIELD_LABELS.email, value: clean(row.email) },
    { key: 'address', label: FIELD_LABELS.address, value: clean(row.address) },
  ];
}

/** Tab-separated, so it pastes into a spreadsheet as a table. */
export function invoiceTable(row: PendingInvoice, formatDay: (day: string) => string): string {
  const pairs: Array<[string, string]> = [
    ...customerFields(row, formatDay).map((field): [string, string] => [field.label, field.value ?? '']),
    ['Car', [carLabel(row), row.plate].filter(Boolean).join(' ')],
    ['Period', `${formatDay(row.start_date)} - ${formatDay(row.end_date)}`],
    ['Days', String(row.days)],
    ['Booking', row.booking_number],
    ...row.lines.map((line): [string, string] => [lineLabel(line), formatMoney(line.amount)]),
    ['Net', formatMoney(row.net_amount)],
    ['KDV 20%', formatMoney(row.vat_amount)],
    ['Total', formatMoney(row.invoice_total)],
  ];
  return pairs.map((pair) => pair.join('\t')).join('\n');
}

export function invoicesCsv(rows: PendingInvoice[]): string {
  const header = [
    'Booking', 'Start', 'End', 'Days', 'Plate', 'Brand', 'Model', 'Customer', 'Nationality', 'ID type', 'ID number', 'Phone', 'Email', 'Address', 'Birth date',
    'Rental TRY', 'Extras TRY', 'Total TRY', 'Net TRY', 'KDV TRY', 'Paid TRY', 'Lines', 'Invoice text',
  ].join(',');
  const lines = rows.map((row) => [
    row.booking_number, row.start_date, row.end_date, row.days, row.plate, row.car_brand, row.car_model, row.customer_name, row.nationality,
    row.id_type, row.id_number, row.phone, row.email, row.address, row.birth_date,
    row.rental_total, row.extras_total, row.invoice_total, row.net_amount, row.vat_amount, row.paid_total,
    row.lines.map((line) => `${lineLabel(line)}: ${line.amount}`).join(' | '),
    row.invoice_text,
  ].map(csvCell).join(','));
  return ['﻿' + header, ...lines].join('\r\n');
}
