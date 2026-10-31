import {
  customerName,
  daysBetween,
  formatDate,
  istanbulDate,
  languageLabel,
  type Customer,
  type CustomerDirectory,
  type CustomerSummary,
} from './customers';

// ─── Months ───────────────────────────────────────────────────────────────────

/** `YYYY-MM` for the last `count` months, oldest first, ending with today's. */
export function monthKeys(today: string, count: number): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    return date.toISOString().slice(0, 7);
  });
}

function lastDayOf(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
}

/** The same day last month, or that month's last day when it's shorter. */
export function sameDayLastMonth(today: string): string {
  const [previous] = monthKeys(today, 2);
  const lastDay = lastDayOf(previous);
  const day = today.slice(8, 10);
  return day > lastDay.slice(8, 10) ? lastDay : `${previous}-${day}`;
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const LONG_MONTH_LABEL = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const monthLabel = (month: string) => MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`));
export const longMonthLabel = (month: string) => LONG_MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`));

/** Whole-number change, or null when last month was zero and a percent means nothing. */
export function percentChange(now: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((now - previous) / previous) * 100);
}

// ─── Stat tiles ───────────────────────────────────────────────────────────────

export const TREND_MONTHS = 6;

export interface Trend {
  series: number[];
  change: number | null;
}

export interface CustomerTrends {
  total: Trend & { addedThisMonth: number };
  active: Trend & { rentals: number; carsOut: number };
  owed: Trend;
  newCustomers: Trend & { previous: number };
}

export function customerTrends(directory: CustomerDirectory, today: string): CustomerTrends {
  const { customers, bookings, ledger } = directory;
  const months = monthKeys(today, TREND_MONTHS);
  const currentMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];
  const ends = months.map((month) => (month === currentMonth ? today : lastDayOf(month)));
  const lastMonthDay = sameDayLastMonth(today);

  const created = customers
    .filter((customer) => customer.created_at)
    .map((customer) => istanbulDate(customer.created_at as string));

  const live = bookings.filter((booking) => booking.is_currently_active);
  const activeOn = (day: string) => bookings.filter((booking) => (
    booking.status !== 'cancelled' && booking.start_date <= day && booking.end_date >= day
  )).length;

  const dated = ledger
    .filter((entry) => entry.created_at)
    .map((entry) => ({ ...entry, day: istanbulDate(entry.created_at as string) }));

  /** Total owed by everyone in debt on that day. Credit doesn't offset another customer's debt. */
  const owedOn = (day: string) => {
    const balances = new Map<string, number>();
    dated.filter((entry) => entry.day <= day).forEach((entry) => {
      const sign = entry.direction === 'OUT' ? 1 : -1;
      balances.set(entry.customer_id, (balances.get(entry.customer_id) ?? 0) + sign * Number(entry.amount));
    });
    return Array.from(balances.values()).reduce((sum, balance) => (balance > 0 ? sum + balance : sum), 0);
  };

  const totalSeries = ends.map((end) => created.filter((day) => day <= end).length);
  const newSeries = months.map((month) => created.filter((day) => day.startsWith(month)).length);
  const activeSeries = ends.map((end, index) => (index === ends.length - 1 ? live.length : activeOn(end)));
  const owedSeries = ends.map(owedOn);
  const last = TREND_MONTHS - 1;
  const newPrevious = created.filter((day) => day.startsWith(previousMonth) && day <= lastMonthDay).length;

  return {
    total: {
      series: totalSeries,
      change: percentChange(totalSeries[last], totalSeries[last - 1]),
      addedThisMonth: newSeries[last],
    },
    active: {
      series: activeSeries,
      change: percentChange(live.length, activeOn(lastMonthDay)),
      rentals: live.length,
      carsOut: new Set(live.map((booking) => booking.car_id)).size,
    },
    owed: {
      series: owedSeries,
      change: percentChange(owedSeries[last], owedSeries[last - 1]),
    },
    newCustomers: {
      series: newSeries,
      // Part of a month against all of the last one would always look like a fall.
      change: percentChange(newSeries[last], newPrevious),
      previous: newPrevious,
    },
  };
}

// ─── Nationalities ────────────────────────────────────────────────────────────

export const OTHERS = 'Others';

export interface NationalityRow {
  nationality: string;
  customers: number;
  revenue: number;
  /** Spend across the customers who've spent anything. */
  averageSpend: number;
  spenders: number;
}

export function nationalityRows(summaries: CustomerSummary[]): NationalityRow[] {
  const rows = new Map<string, NationalityRow>();
  summaries.forEach(({ customer, spent }) => {
    const nationality = customer.nationality?.trim() || 'Unknown';
    const row = rows.get(nationality)
      ?? { nationality, customers: 0, revenue: 0, averageSpend: 0, spenders: 0 };
    row.customers += 1;
    row.revenue += spent;
    if (spent > 0) row.spenders += 1;
    rows.set(nationality, row);
  });
  return Array.from(rows.values()).map(withAverage);
}

const withAverage = (row: NationalityRow): NationalityRow => ({
  ...row,
  averageSpend: row.spenders > 0 ? row.revenue / row.spenders : 0,
});

/** The top `limit` by `metric`, with everything else folded into one Others row. */
export function topNationalities(
  rows: NationalityRow[],
  metric: 'customers' | 'revenue',
  limit: number,
): NationalityRow[] {
  const ranked = rows
    .filter((row) => row[metric] > 0)
    .sort((a, b) => b[metric] - a[metric]);
  const rest = ranked.slice(limit);
  if (rest.length === 0) return ranked;
  const others = rest.reduce<NationalityRow>((sum, row) => ({
    ...sum,
    customers: sum.customers + row.customers,
    revenue: sum.revenue + row.revenue,
    spenders: sum.spenders + row.spenders,
  }), { nationality: OTHERS, customers: 0, revenue: 0, averageSpend: 0, spenders: 0 });
  return [...ranked.slice(0, limit), withAverage(others)];
}

// ─── Languages ────────────────────────────────────────────────────────────────

export interface LanguageRow {
  label: string;
  count: number;
}

/** `customers.language` only allows ar, tr and en today, so nothing else appears yet. */
export function languageRows(customers: Array<Pick<Customer, 'language'>>): LanguageRow[] {
  const known = new Set(['ar', 'tr', 'en', 'ru']);
  const counts = new Map<string, number>();
  customers.forEach(({ language }) => {
    const label = language === 'ru' ? 'Russian' : known.has(language) ? languageLabel(language) : 'Other';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return Array.from(counts, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

// ─── New customers ────────────────────────────────────────────────────────────

export function newCustomersByMonth(
  customers: Array<Pick<Customer, 'created_at'>>,
  today: string,
  count = 12,
): Array<{ month: string; count: number }> {
  const days = customers.filter((customer) => customer.created_at)
    .map((customer) => istanbulDate(customer.created_at as string));
  return monthKeys(today, count).map((month) => ({
    month,
    count: days.filter((day) => day.startsWith(month)).length,
  }));
}

// ─── People ───────────────────────────────────────────────────────────────────

/** Digits only, without an international 00 and with a Turkish local 0 made +90. */
export function phoneKey(phone: string | null | undefined): string | null {
  let digits = (phone ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (digits.startsWith('0')) digits = `90${digits.slice(1)}`;
  return digits.length >= 7 && !isPlaceholder(digits) ? digits : null;
}

function idKey(id: string | null | undefined): string | null {
  const value = (id ?? '').trim().toLowerCase().replace(/[\s\-.]/g, '');
  return value.length >= 5 && !value.startsWith('000') && !isPlaceholder(value) ? value : null;
}

/** 111111, 000000, 123456: typed to get past a required field. */
function isPlaceholder(value: string): boolean {
  if (/^(.)\1+$/.test(value)) return true;
  return '01234567890'.includes(value) || '09876543210'.includes(value);
}

/** Folds case, Turkish letters and punctuation, so spelling is all that's compared. */
export function nameKey(name: string): string {
  return name
    .toLocaleLowerCase('en')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Edit distance, giving up as soon as it passes `limit`. */
function withinEdits(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    if (Math.min(...next) > limit) return false;
    row = next;
  }
  return row[b.length] <= limit;
}

const SIMILAR_NAME_MIN_LENGTH = 8;
const LONG_NAME_LENGTH = 14;

/** The same words in any order, or one or two slips in a name long enough to trust it. */
export function similarNames(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.split(' ').sort().join(' ') === b.split(' ').sort().join(' ')) return true;
  if (Math.min(a.length, b.length) < SIMILAR_NAME_MIN_LENGTH) return false;
  return withinEdits(a, b, Math.min(a.length, b.length) >= LONG_NAME_LENGTH ? 2 : 1);
}

/** Merge-find, so "A shares a phone with B, B shares an ID with C" lands in one group. */
function grouper(size: number) {
  const parent = Array.from({ length: size }, (_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    parent[index] = root;
    return root;
  };
  return {
    union: (a: number, b: number) => { parent[find(a)] = find(b); },
    groups: () => {
      const groups = new Map<number, number[]>();
      parent.forEach((_, index) => {
        const root = find(index);
        groups.set(root, [...(groups.get(root) ?? []), index]);
      });
      return Array.from(groups.values());
    },
  };
}

function linkByKey(customers: Customer[], key: (customer: Customer) => string | null, onLink: (a: number, b: number) => void) {
  const seen = new Map<string, number>();
  customers.forEach((customer, index) => {
    const value = key(customer);
    if (!value) return;
    const first = seen.get(value);
    if (first === undefined) seen.set(value, index);
    else onLink(first, index);
  });
}

/** Whether two names could be one person: same first word, or a near-identical spelling. */
function namesAgree(a: string, b: string): boolean {
  return a.split(' ')[0] === b.split(' ')[0] || similarNames(a, b);
}

/**
 * Records that are the same person. The booking form used to create a new
 * customer every time, so one person can hold many records.
 *
 * An ID is enough on its own. A phone isn't, because a relative or friend often
 * books for someone else, so the names have to agree as well. A name alone never
 * links anyone: two people can share one.
 */
export function groupPeople(customers: Customer[]): Customer[][] {
  const { union, groups } = grouper(customers.length);
  linkByKey(customers, (customer) => idKey(customer.id_number), union);

  const names = customers.map((customer) => nameKey(customerName(customer)));
  const byPhone = new Map<string, number[]>();
  customers.forEach((customer, index) => {
    const key = phoneKey(customer.phone);
    if (key) byPhone.set(key, [...(byPhone.get(key) ?? []), index]);
  });
  byPhone.forEach((members) => {
    members.forEach((a, position) => {
      members.slice(position + 1).forEach((b) => { if (namesAgree(names[a], names[b])) union(a, b); });
    });
  });

  return groups().map((members) => members.map((index) => customers[index]));
}

// ─── Loyalty ──────────────────────────────────────────────────────────────────

export interface LoyaltyStats {
  people: number;
  repeatRate: number;
  averageBookings: number;
  averageDays: number;
  topSpenders: Array<{ id: string; name: string; spent: number; bookings: number; records: number }>;
  mostFrequent: { id: string; name: string; bookings: number } | null;
  longestRental: { id: string; name: string; days: number } | null;
}

/** Counted per person, not per record: duplicates would otherwise hide most returning customers. */
export function loyaltyStats(directory: CustomerDirectory, summaries: CustomerSummary[]): LoyaltyStats {
  const byId = new Map(summaries.map((summary) => [summary.customer.id, summary]));

  const people = groupPeople(directory.customers)
    .map((records) => {
      const members = records.map((record) => byId.get(record.id)).filter((row): row is CustomerSummary => Boolean(row));
      const lead = [...members].sort((a, b) => b.bookingCount - a.bookingCount || b.spent - a.spent)[0];
      return {
        id: lead.customer.id,
        name: lead.name,
        records: records.length,
        bookings: members.reduce((sum, row) => sum + row.bookingCount, 0),
        spent: members.reduce((sum, row) => sum + row.spent, 0),
      };
    })
    .filter((person) => person.bookings > 0);

  const rentals = directory.bookings
    .filter((booking) => booking.status !== 'cancelled')
    .map((booking) => ({ id: booking.customer_id, days: daysBetween(booking.start_date, booking.end_date) }))
    .filter((rental) => rental.days > 0);
  const longest = rentals.reduce<typeof rentals[number] | null>(
    (best, rental) => (!best || rental.days > best.days ? rental : best),
    null,
  );
  const frequent = people.reduce<typeof people[number] | null>(
    (best, person) => (!best || person.bookings > best.bookings ? person : best),
    null,
  );

  return {
    people: people.length,
    repeatRate: people.length ? (people.filter((person) => person.bookings >= 2).length / people.length) * 100 : 0,
    averageBookings: people.length ? people.reduce((sum, person) => sum + person.bookings, 0) / people.length : 0,
    averageDays: rentals.length ? rentals.reduce((sum, rental) => sum + rental.days, 0) / rentals.length : 0,
    topSpenders: people.filter((person) => person.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 5),
    mostFrequent: frequent && { id: frequent.id, name: frequent.name, bookings: frequent.bookings },
    longestRental: longest && { id: longest.id, name: byId.get(longest.id)?.name ?? 'Unknown', days: longest.days },
  };
}

// ─── Data quality ─────────────────────────────────────────────────────────────

export type DuplicateReason = 'phone' | 'id' | 'name';

export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  phone: 'Same phone',
  id: 'Same ID',
  name: 'Similar name',
};

export interface DuplicateRecord {
  id: string;
  name: string;
  created: string;
}

export interface DuplicateGroup {
  id: string;
  name: string;
  reasons: DuplicateReason[];
  records: DuplicateRecord[];
}

export interface DataIssues {
  duplicates: DuplicateGroup[];
  duplicateRecords: number;
  testRecords: Array<DuplicateRecord & { phone: string | null; why: string }>;
}

const toRecord = (customer: Customer): DuplicateRecord => ({
  id: customer.id,
  name: customerName(customer),
  created: formatDate(customer.created_at ? istanbulDate(customer.created_at) : null),
});

function testReason(customer: Customer): string | null {
  const first = (customer.first_name ?? '').trim();
  const last = (customer.last_name ?? '').trim();
  if ([first, last].some((part) => part && !/\p{L}/u.test(part))) return 'Name has no letters';
  if (/^(test|deneme|asdf|xxx)/i.test(first) || /^(test|deneme|asdf|xxx)/i.test(last)) return 'Test name';
  const digits = (customer.phone ?? '').replace(/\D/g, '');
  if (digits && isPlaceholder(digits)) return 'Placeholder phone';
  return null;
}

export function findDataIssues(customers: Customer[]): DataIssues {
  const testRecords = customers
    .map((customer) => ({ customer, why: testReason(customer) }))
    .filter((row): row is { customer: Customer; why: string } => row.why !== null)
    .map(({ customer, why }) => ({ ...toRecord(customer), phone: customer.phone, why }));

  const { union, groups } = grouper(customers.length);
  const reasons = new Map<number, Set<DuplicateReason>>();
  const link = (reason: DuplicateReason) => (a: number, b: number) => {
    union(a, b);
    [a, b].forEach((index) => {
      reasons.set(index, (reasons.get(index) ?? new Set<DuplicateReason>()).add(reason));
    });
  };

  linkByKey(customers, (customer) => phoneKey(customer.phone), link('phone'));
  linkByKey(customers, (customer) => idKey(customer.id_number), link('id'));

  const names = customers.map((customer) => nameKey(customerName(customer)));
  const linkName = link('name');
  for (let a = 0; a < customers.length; a += 1) {
    for (let b = a + 1; b < customers.length; b += 1) {
      if (similarNames(names[a], names[b])) linkName(a, b);
    }
  }

  const duplicates = groups()
    .filter((members) => members.length > 1)
    .map((members): DuplicateGroup => {
      const records = members.map((index) => toRecord(customers[index]));
      const found = new Set(members.flatMap((index) => Array.from(reasons.get(index) ?? [])));
      return {
        id: records[0].id,
        name: records[0].name,
        reasons: (['phone', 'id', 'name'] as DuplicateReason[]).filter((reason) => found.has(reason)),
        records,
      };
    })
    .sort((a, b) => b.records.length - a.records.length || a.name.localeCompare(b.name));

  return {
    duplicates,
    duplicateRecords: duplicates.reduce((sum, group) => sum + group.records.length, 0),
    testRecords,
  };
}
