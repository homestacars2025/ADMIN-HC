/**
 * Local date helpers — the handful of date-fns functions this section needs,
 * without the dependency. All calendar maths is Monday-first so the visual weeks
 * line up with the ISO week numbers Postgres computes.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Parses a `yyyy-MM-dd` (or longer) string as a LOCAL date, never UTC. */
export function parseISODate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** The canonical `yyyy-MM-dd` key used for every bucket and comparison. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

/** Monday-first week start. */
export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const shift = (d.getDay() + 6) % 7; // Mon → 0 … Sun → 6
  d.setDate(d.getDate() - shift);
  return d;
}

/** Monday-first week end (Sunday). */
export function endOfWeekMonday(date: Date): Date {
  const start = startOfWeekMonday(date);
  start.setDate(start.getDate() + 6);
  return start;
}

export function eachDayOfInterval(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isSameDay(a: Date, b: Date): boolean {
  return isSameMonth(a, b) && a.getDate() === b.getDate();
}

/** `MMMM yyyy` → "September 2026". */
export function formatMonthYear(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `MMMM` → "September". */
export function formatMonthName(date: Date): string {
  return MONTHS[date.getMonth()];
}

/** `EEEE` → "Wednesday". */
export function formatWeekday(date: Date): string {
  return DAYS[date.getDay()];
}

/** `d MMM` → "3 Sep". */
export function formatDayShortMonth(date: Date): string {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** `d MMMM yyyy` → "3 September 2026". */
export function formatDayMonthYear(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `EEEE, d MMMM yyyy` → "Wednesday, 3 September 2026". */
export function formatFullDate(date: Date): string {
  return `${formatWeekday(date)}, ${formatDayMonthYear(date)}`;
}

/**
 * Today in Istanbul (UTC+3) as `yyyy-MM-dd` — the company's operating timezone.
 * A fixed +3 offset, matching Turkey's year-round UTC+3.
 */
export function istanbulToday(): string {
  const now = new Date();
  const istanbul = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return istanbul.toISOString().slice(0, 10);
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
