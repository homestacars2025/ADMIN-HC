import { csvCell, formatMoney, type Currency } from './money';
import { PAY_METHODS, type PayMethod } from './payments';
import { supabase } from './supabase';

/** Rows only exist from here on. Older months are reviewed by hand. */
export const CLOSE_STARTS = '2026-11';

export type MoneyPlace = 'in_safe' | 'with_employee' | 'with_admin' | 'pending_bank' | 'in_account' | 'cancelled' | 'unknown';

export const PLACE_LABELS: Record<MoneyPlace, string> = {
  in_safe: 'In safe',
  with_employee: 'With staff',
  with_admin: 'With admin ✓',
  pending_bank: 'Pending bank',
  in_account: 'In account',
  cancelled: 'Cancelled',
  unknown: 'Unknown',
};

export interface EventPayment {
  type: 'payment' | 'deposit';
  method: PayMethod | null;
  amount: number;
  currency: Currency;
  amount_try: number;
  date: string;
  ref: string | null;
  first_account: string | null;
  now: MoneyPlace;
  now_account: string | null;
}

export interface MonthEvent {
  event_id: number;
  booking_id: number;
  booking_number: string | null;
  event_no: number;
  kind: 'new' | 'extension';
  created_at: string;
  period_start: string | null;
  period_end: string | null;
  days: number | null;
  customer_id: string | null;
  customer_name: string | null;
  car_id: number | null;
  plate: string | null;
  rental_amount: number;
  paid: number;
  deposit: number;
  remaining: number;
  payments: EventPayment[];
  checked_by: string | null;
  checked_at: string | null;
}

export interface MonthClosing {
  closed_by: string | null;
  closed_at: string;
  note: string | null;
}

const PLACES = Object.keys(PLACE_LABELS) as MoneyPlace[];

type Raw<T> = { [K in keyof T]: unknown };

function toPayment(raw: Raw<EventPayment>): EventPayment {
  return {
    ...raw as EventPayment,
    amount: Number(raw.amount),
    amount_try: Number(raw.amount_try),
    now: PLACES.includes(raw.now as MoneyPlace) ? raw.now as MoneyPlace : 'unknown',
  };
}

export async function fetchMonthEvents(month: string): Promise<MonthEvent[]> {
  const { data, error } = await supabase.rpc('admin_month_close', { p_month: `${month}-01` });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Raw<MonthEvent>>).map((row) => ({
    ...row as MonthEvent,
    days: row.days === null ? null : Number(row.days),
    rental_amount: Number(row.rental_amount),
    paid: Number(row.paid),
    deposit: Number(row.deposit),
    remaining: Number(row.remaining),
    payments: ((row.payments ?? []) as Array<Raw<EventPayment>>).map(toPayment),
  }));
}

export async function fetchMonthClosing(month: string): Promise<MonthClosing | null> {
  const { data, error } = await supabase.from('month_closings').select('closed_by, closed_at, note').eq('month', `${month}-01`).maybeSingle();
  if (error) throw new Error(error.message);
  return data as MonthClosing | null;
}

export async function checkEvent(id: number, checked: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_check_booking_event', { p_event_id: id, p_checked: checked });
  if (error) throw new Error(error.message);
}

export async function closeMonth(month: string, close: boolean, note: string | null): Promise<void> {
  const { error } = await supabase.rpc('admin_close_month', { p_month: `${month}-01`, p_close: close, p_note: note });
  if (error) throw new Error(error.message);
}

// ─── Working it out ───────────────────────────────────────────────────────────

const sum = <T,>(rows: T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);

/** Worked out from the payments, because a row is only done when every one of them has arrived. */
export const allWithAdmin = (row: Pick<MonthEvent, 'payments'>): boolean => (
  row.payments.length > 0 && row.payments.every((payment) => payment.now === 'with_admin')
);

/** The row's pill. Whatever hasn't arrived shows first, so a tick never hides money still on its way. */
export function rowPlace(row: Pick<MonthEvent, 'payments'>): MoneyPlace | null {
  if (row.payments.length === 0) return null;
  return row.payments.find((payment) => payment.now !== 'with_admin')?.now ?? 'with_admin';
}

export function monthSummary(rows: MonthEvent[]) {
  const checked = rows.filter((row) => row.checked_at).length;
  return {
    revenue: sum(rows, (row) => row.rental_amount),
    newRevenue: sum(rows.filter((row) => row.kind === 'new'), (row) => row.rental_amount),
    extensionRevenue: sum(rows.filter((row) => row.kind === 'extension'), (row) => row.rental_amount),
    collected: sum(rows, (row) => row.paid),
    // Net on purpose: a late payment lands on the newest event, so one row can go below zero for another.
    outstanding: sum(rows, (row) => row.remaining),
    deposits: sum(rows, (row) => row.deposit),
    notWithAdmin: sum(rows.flatMap((row) => row.payments).filter((payment) => payment.now !== 'with_admin'), (payment) => payment.amount_try),
    notWithAdminCount: rows.flatMap((row) => row.payments).filter((payment) => payment.now !== 'with_admin').length,
    checked,
    total: rows.length,
    left: rows.length - checked,
  };
}

export const CLOSE_FILTERS = ['revenue', 'collected', 'outstanding', 'deposits', 'not_with_admin', 'unchecked'] as const;
export type CloseFilter = typeof CLOSE_FILTERS[number];

export function inCloseFilter(row: MonthEvent, filter: CloseFilter | 'all'): boolean {
  switch (filter) {
    case 'revenue': return row.rental_amount > 0;
    case 'collected': return row.paid > 0;
    case 'outstanding': return row.remaining > 0;
    case 'deposits': return row.deposit > 0;
    case 'not_with_admin': return row.payments.some((payment) => payment.now !== 'with_admin');
    case 'unchecked': return !row.checked_at;
    default: return true;
  }
}

const squeeze = (text: string | null) => (text ?? '').toLocaleLowerCase('tr').replace(/\s+/g, '');

export function matchesCloseSearch(row: MonthEvent, query: string): boolean {
  const wanted = squeeze(query);
  return !wanted || [row.booking_number, row.customer_name, row.plate].some((text) => squeeze(text).includes(wanted));
}

export const CLOSE_SORTS = ['created', 'booking', 'type', 'customer', 'plate', 'rental', 'paid', 'deposit', 'remaining', 'first', 'now', 'checked'] as const;
export type CloseSort = typeof CLOSE_SORTS[number];

const NUMERIC: readonly CloseSort[] = ['rental', 'paid', 'deposit', 'remaining'];

export const closeSortFirstDirection = (key: CloseSort): 'asc' | 'desc' => (NUMERIC.includes(key) ? 'desc' : 'asc');

function sortValue(row: MonthEvent, key: CloseSort): string | number {
  switch (key) {
    case 'booking': return row.booking_number ?? '';
    case 'type': return row.kind;
    case 'customer': return row.customer_name ?? '';
    case 'plate': return row.plate ?? '';
    case 'rental': return row.rental_amount;
    case 'paid': return row.paid;
    case 'deposit': return row.deposit;
    case 'remaining': return row.remaining;
    case 'first': return row.payments[0]?.first_account ?? '';
    case 'now': { const place = rowPlace(row); return place ? PLACE_LABELS[place] : ''; }
    case 'checked': return row.checked_at ?? '';
    default: return row.created_at;
  }
}

export function sortCloseRows(rows: MonthEvent[], key: CloseSort, direction: 'asc' | 'desc'): MonthEvent[] {
  const order = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, key);
    const right = sortValue(b, key);
    const compared = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'tr');
    return compared !== 0 ? compared * order : a.created_at.localeCompare(b.created_at);
  });
}

// ─── Words ────────────────────────────────────────────────────────────────────

const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const LONG_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' });
const STAMP = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Istanbul' });

const shortDay = (day: string) => SHORT_DAY.format(new Date(`${day}T00:00:00Z`));

/** "1 Dec → 6 Dec · 5 days" */
export function periodLabel(row: Pick<MonthEvent, 'period_start' | 'period_end' | 'days'>): string {
  const dates = [row.period_start, row.period_end].map((day) => (day ? shortDay(day) : '…'));
  if (!row.period_start && !row.period_end) return '—';
  const days = row.days === null ? '' : ` · ${row.days === 1 ? '1 day' : `${row.days} days`}`;
  return `${dates.join(' → ')}${days}`;
}

export const closedOnLabel = (at: string): string => LONG_DAY.format(new Date(at));
export const stampLabel = (at: string): string => STAMP.format(new Date(at)).replace(',', '');

export const bookingLabel = (row: Pick<MonthEvent, 'booking_number' | 'booking_id'>): string => row.booking_number ?? `#${row.booking_id}`;

export const methodIcon = (method: PayMethod | null): string => PAY_METHODS.find((item) => item.value === method)?.icon ?? '';
export const methodLabel = (method: PayMethod | null): string => PAY_METHODS.find((item) => item.value === method)?.label ?? 'Unknown';

/** "Sisli - 01 · ENV-2611-0003", without the icon. */
export const firstPlaceLabel = (payment: EventPayment): string => [payment.first_account ?? 'Unknown', payment.ref].filter(Boolean).join(' · ');

export const nowLabel = (payment: EventPayment): string => (
  payment.now === 'with_admin' || !payment.now_account ? PLACE_LABELS[payment.now] : `${PLACE_LABELS[payment.now]} · ${payment.now_account}`
);

const paymentLine = (payment: EventPayment): string => [
  formatMoney(payment.amount, payment.currency),
  methodLabel(payment.method),
  firstPlaceLabel(payment),
  `now ${nowLabel(payment)}`,
].join(' / ');

// ─── Export ───────────────────────────────────────────────────────────────────

type Names = (id: string | null) => string;

const typeLabel = (row: MonthEvent) => (row.kind === 'new' ? 'New' : `Extension #${row.event_no}`);

export function monthCloseCsv(rows: MonthEvent[], names: Names): string {
  const header = ['Booking', 'Type', 'Period', 'Customer', 'Plate', 'Rental TRY', 'Paid TRY', 'Deposit TRY', 'Remaining TRY', 'Where it is now', 'Payments', 'Checked by', 'Checked at'].join(',');
  const lines = rows.map((row) => {
    const place = rowPlace(row);
    return [
      bookingLabel(row), typeLabel(row), periodLabel(row), row.customer_name, row.plate,
      row.rental_amount, row.paid, row.deposit, row.remaining,
      place ? PLACE_LABELS[place] : null,
      row.payments.map(paymentLine).join(' | '),
      names(row.checked_by) || null,
      row.checked_at ? stampLabel(row.checked_at) : null,
    ].map(csvCell).join(',');
  });
  const totals = monthSummary(rows);
  const footer = ['Total', null, null, null, null, totals.revenue, totals.collected, totals.deposits, totals.outstanding, null, null, null, null].map(csvCell).join(',');
  return ['﻿' + header, ...lines, footer].join('\r\n');
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

/** Its own page, so print has no sidebar or filters to hide. Everything typed by people is escaped. */
export function monthClosePrintHtml(rows: MonthEvent[], title: string, status: string, names: Names): string {
  const totals = monthSummary(rows);
  const cell = (text: string, end = false) => `<td${end ? ' class="n"' : ''}>${escapeHtml(text)}</td>`;
  const body = rows.map((row) => {
    const place = rowPlace(row);
    return `<tr>${[
      cell(row.kind === 'new' ? bookingLabel(row) : `${bookingLabel(row)} · Ext #${row.event_no}`),
      cell(`${row.kind === 'new' ? 'New' : 'Extension'} ${periodLabel(row)}`),
      cell(row.customer_name ?? '—'),
      cell(row.plate ?? '—'),
      cell(formatMoney(row.rental_amount), true),
      cell(formatMoney(row.paid), true),
      cell(formatMoney(row.deposit), true),
      cell(formatMoney(row.remaining), true),
      cell(row.payments.map((payment) => firstPlaceLabel(payment)).join('; ') || '—'),
      cell(place ? PLACE_LABELS[place] : '—'),
      cell(row.checked_at ? `${names(row.checked_by)} ${stampLabel(row.checked_at)}`.trim() : '—'),
    ].join('')}</tr>`;
  }).join('');
  const head = ['Booking', 'Type', 'Customer', 'Plate', 'Rental', 'Paid', 'Deposit', 'Remaining', 'Where it went first', 'Where it is now', 'Checked']
    .map((label, index) => `<th${index >= 4 && index <= 7 ? ' class="n"' : ''}>${label}</th>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
@page{size:A4 landscape;margin:12mm}
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f1117;font-size:10px;margin:0}
h1{font-size:16px;margin:0 0 2px}p{margin:0 0 12px;color:#6b7280;font-size:11px}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-weight:600;color:#6b7280;border-bottom:1.5px solid #d1d5db;padding:5px 6px}
th.n{text-align:right}
td{padding:5px 6px;border-bottom:1px solid #eef0f3;vertical-align:top}
.n{text-align:right;white-space:nowrap}
tfoot td{font-weight:700;border-top:1.5px solid #d1d5db;border-bottom:none}
</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(status)} · ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="4">Total</td>${[totals.revenue, totals.collected, totals.deposits, totals.outstanding].map((value) => cell(formatMoney(value), true)).join('')}<td colspan="3"></td></tr></tfoot></table></body></html>`;
}
