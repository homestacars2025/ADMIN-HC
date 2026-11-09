export const CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
export type Currency = typeof CURRENCIES[number];

export const CURRENCY_SYMBOLS: Record<Currency, string> = { TRY: '₺', USD: '$', EUR: '€' };

/** Always the row's own currency, never converted: this is what was billed or paid. */
export function formatMoney(amount: number, currency: Currency = 'TRY'): string {
  const digits = Math.abs(amount).toLocaleString(currency === 'TRY' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? '−' : ''}${CURRENCY_SYMBOLS[currency]}${digits}`;
}

/**
 * What someone typed: `1250`, `1250.50`, `1250,50` or `1.250,50`. Null unless it's above
 * zero. One separator before exactly three digits is thousands, because `1.250` on a
 * Turkish keyboard means one thousand two hundred and fifty, never 1.25.
 */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim().replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(trimmed)) return null;
  if (/^\d{1,3}[.,]\d{3}$/.test(trimmed)) return Number(trimmed.replace(/[.,]/, '')) || null;
  const comma = trimmed.lastIndexOf(',');
  const dot = trimmed.lastIndexOf('.');
  const decimal = comma > dot ? ',' : '.';
  const [whole, fraction = '', extra] = trimmed.split(decimal);
  if (extra !== undefined) return null;
  const value = Number(`${whole.replace(/[.,]/g, '')}.${fraction || 0}`);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/** A cell for a CSV. Quotes what needs it, and stops a spreadsheet running text as a formula. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// ─── Display in the top-bar currency ─────────────────────────────────────────

/**
 * Amounts are stored in lira (or, for supplier bills, in their own currency) and shown
 * in the currency picked in the top bar, at the latest rate in `exchange_rates`. Only
 * the display changes: nothing is converted on save.
 */
export type DisplayCurrency = 'TRY' | 'USD' | 'EUR' | 'LYD';

export const DISPLAY_SYMBOLS: Record<DisplayCurrency, string> = { TRY: '₺', USD: '$', EUR: '€', LYD: 'LD' };

export interface RateRow {
  currency: string;
  /** Lira for one unit of `currency`. */
  rate_to_try: number;
  updated_at?: string | null;
}

/** Lira for one unit; 1 for lira, null when there's no usable rate. */
export function rateToTry(currency: string, rates: readonly RateRow[]): number | null {
  if (currency === 'TRY') return 1;
  const rate = Number(rates.find((row) => row.currency === currency)?.rate_to_try);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** `amount` in `from` as `to`, through lira. Null when either rate is missing. */
export function convertAmount(amount: number, from: string, to: string, rates: readonly RateRow[]): number | null {
  if (from === to) return amount;
  const fromRate = rateToTry(from, rates);
  const toRate = rateToTry(to, rates);
  return fromRate === null || toRate === null ? null : (amount * fromRate) / toRate;
}

/** The currency amounts are really shown in: the picked one when its rate is known, lira otherwise. */
export const effectiveCurrency = (picked: DisplayCurrency, rates: readonly RateRow[]): DisplayCurrency =>
  rateToTry(picked, rates) === null ? 'TRY' : picked;

/** "₺1.234,50" for lira, "$1,234.50" otherwise; "−" for negatives, "+" when asked. */
export function formatInCurrency(amount: number, currency: DisplayCurrency, options: { signed?: boolean; decimals?: number } = {}): string {
  const decimals = options.decimals ?? 2;
  const digits = Math.abs(amount).toLocaleString(currency === 'TRY' ? 'tr-TR' : 'en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const sign = amount < 0 && Math.abs(amount) >= 0.5 * 10 ** -decimals ? '−' : options.signed && amount > 0 ? '+' : '';
  return `${sign}${DISPLAY_SYMBOLS[currency]}${digits}`;
}

const rateDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' });

/** "Converted at 1 USD = 50,00 ₺ (9 Nov 2026)", or null when amounts are shown in lira. */
export function rateNote(currency: DisplayCurrency, rates: readonly RateRow[]): string | null {
  if (currency === 'TRY') return null;
  const row = rates.find((item) => item.currency === currency);
  const rate = rateToTry(currency, rates);
  if (!row || rate === null) return null;
  const lira = rate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const stamp = row.updated_at ? Date.parse(row.updated_at.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(row.updated_at) ? row.updated_at : `${row.updated_at}Z`) : Number.NaN;
  // The rate is isolated left to right, so it reads the same inside right-to-left text.
  return `Converted at \u20661 ${currency} = ${lira} ₺\u2069${Number.isNaN(stamp) ? '' : ` (${rateDay.format(stamp)})`}`;
}
