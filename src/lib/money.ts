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
