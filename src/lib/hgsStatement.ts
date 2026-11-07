import type { DayRange, HgsRoad, HgsTransitDetail } from './hgs';

/**
 * The HGS toll statement: one car's transits over a period, as a branded PDF for the
 * customer. Everything here is worked out before the PDF library loads, so it's tested
 * on its own and the page only fetches react-pdf when a statement is downloaded.
 *
 * Days are Istanbul days, YYYY-MM-DD. Team builds the same statement.
 */

export const STATEMENT_LANGS = ['ar', 'tr', 'en', 'fr'] as const;
export type StatementLang = typeof STATEMENT_LANGS[number];

export const isStatementLang = (value: unknown): value is StatementLang => STATEMENT_LANGS.includes(value as StatementLang);

/** The customer's language when a booking is linked and it's one we write, else Arabic. */
export const statementLanguage = (customerLanguage: string | null | undefined): StatementLang => {
  const code = (customerLanguage ?? '').trim().toLowerCase().slice(0, 2);
  return isStatementLang(code) ? code : 'ar';
};

const squeezePlate = (plate: string) => plate.replace(/\s+/g, '').toUpperCase();

/** HGS-YYMMDD-PLATE, from the issue day. */
export const statementNumber = (plate: string, issueDay: string): string =>
  `HGS-${issueDay.slice(2, 4)}${issueDay.slice(5, 7)}${issueDay.slice(8, 10)}-${squeezePlate(plate)}`;

export const statementFileName = (plate: string, period: DayRange, lang: StatementLang): string =>
  `HGS-${squeezePlate(plate)}-${period.from}_${period.to}-${lang}.pdf`;

/** A booking that can be put on the statement. */
export interface StatementBooking {
  id: number;
  number: string | null;
  start: string;
  end: string;
  customerName: string | null;
  customerLanguage: string | null;
}

/** The days both share, or null when they don't meet. */
export function overlap(range: DayRange, other: Pick<DayRange, 'from' | 'to'>): DayRange | null {
  const from = range.from > other.from ? range.from : other.from;
  const to = range.to < other.to ? range.to : other.to;
  return from <= to ? { from, to } : null;
}

/** With a booking linked, the statement covers only the days of the range the car was on it. */
export const statementPeriod = (range: DayRange, booking: Pick<StatementBooking, 'start' | 'end'> | null): DayRange | null =>
  (booking ? overlap(range, { from: booking.start, to: booking.end }) : range);

export interface StatementLine {
  id: number;
  day: string;
  time: string;
  entry: string | null;
  exit: string | null;
  road: string | null;
  roadType: HgsRoad | null;
  amount: number;
}

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Istanbul' });

/** The Istanbul time of a transit, 14:04, or '' when it has none. */
function istanbulTime(iso: string | null): string {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? TIME.format(date) : '';
}

/** The period's transits, oldest first, private roads left out when asked. */
export function statementLines(transits: HgsTransitDetail[], period: DayRange, includePrivate: boolean): StatementLine[] {
  const stamp = (transit: HgsTransitDetail) => (transit.at ? Date.parse(transit.at) || 0 : 0);
  return transits
    .filter((transit) => transit.day >= period.from && transit.day <= period.to && (includePrivate || transit.roadType !== 'private'))
    .sort((a, b) => a.day.localeCompare(b.day) || stamp(a) - stamp(b) || a.id - b.id)
    .map((transit) => ({
      id: transit.id,
      day: transit.day,
      time: istanbulTime(transit.at),
      entry: transit.entry,
      exit: transit.exit,
      road: transit.road,
      roadType: transit.roadType,
      amount: transit.amount,
    }));
}

export interface StatementTotals {
  amount: number;
  passes: number;
  /** Distinct Istanbul days with at least one pass. */
  days: number;
}

export function statementTotals(lines: StatementLine[]): StatementTotals {
  return {
    amount: Math.round(lines.reduce((total, line) => total + line.amount, 0) * 100) / 100,
    passes: lines.length,
    days: new Set(lines.map((line) => line.day)).size,
  };
}

/** Everything the PDF prints. */
export interface StatementInput {
  lang: StatementLang;
  number: string;
  issueDay: string;
  plate: string;
  model: string | null;
  period: DayRange;
  customer: string | null;
  booking: string | null;
  includePrivate: boolean;
  lines: StatementLine[];
  totals: StatementTotals;
}

// ── Formatting, the same in every language ───────────────────────────────────

/** 06.11.2026 */
export const statementDay = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

const MONEY = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₺1.355,00, as Turkish receipts write lira. */
export const statementMoney = (amount: number): string => `${amount < 0 ? '−' : ''}₺${MONEY.format(Math.abs(amount))}`;

export const statementCount = (value: number): string => new Intl.NumberFormat('tr-TR').format(value);
