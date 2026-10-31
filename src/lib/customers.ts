import { supabase } from './supabase';

// ─── Language ─────────────────────────────────────────────────────────────────
// Drives which WhatsApp template language the customer receives in automations.
// Must stay within the customers.language CHECK constraint (ar | tr | en).

export type CustomerLanguage = 'ar' | 'tr' | 'en';

export const LANGUAGE_OPTIONS: Array<{ value: CustomerLanguage; label: string }> = [
  { value: 'ar', label: 'Arabic' },
  { value: 'tr', label: 'Turkish' },
  { value: 'en', label: 'English' },
];

/** Coerce any stored/unknown value to a valid language, defaulting to 'ar'. */
export function normalizeLanguage(value: unknown): CustomerLanguage {
  return value === 'tr' || value === 'en' ? value : 'ar';
}

export function languageLabel(value: string | null | undefined): string {
  return LANGUAGE_OPTIONS.find((option) => option.value === value)?.label ?? 'Arabic';
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  language: string;
  id_type: string | null;
  id_number: string | null;
  birth_date: string | null;
  address: string | null;
  driving_license_number: string | null;
  license_issue_date: string | null;
  notes: string | null;
  created_at: string | null;
  id_photo_url: string | null;
  id_photo_back_url: string | null;
  driving_license_photo_url: string | null;
  driving_license_back_url: string | null;
  entry_stamp_photo_url: string | null;
}

type Joined<T> = T | T[] | null;

const one = <T,>(value: Joined<T> | undefined): T | null =>
  (Array.isArray(value) ? value[0] ?? null : value ?? null);

export interface DirectoryBooking {
  id: number;
  customer_id: string;
  car_id: number;
  start_date: string;
  end_date: string;
  status: string | null;
  total_amount: number | null;
  is_currently_active: boolean | null;
  cars: Joined<{ plate_number: string }>;
}

export interface LedgerRow {
  booking_id: number;
  customer_id: string;
  type: string;
  amount: number;
  direction: 'IN' | 'OUT';
}

export interface DatedLedgerRow extends LedgerRow {
  created_at: string | null;
}

export interface LedgerEntry extends DatedLedgerRow {
  id: string;
  car_id: number;
  description: string | null;
}

interface DirectoryReview {
  customer_id: string;
  our_rating: number | null;
}

export interface CustomerDirectory {
  customers: Customer[];
  bookings: DirectoryBooking[];
  ledger: DatedLedgerRow[];
  reviews: DirectoryReview[];
}

export interface ProfileCar {
  plate_number: string;
  car_photo_urls: Array<{ url: string }> | null;
  model_group: Joined<{ name: string; image_url: string | null; min_age: number | null }>;
}

export interface ProfileBooking {
  id: number;
  booking_number: string | null;
  car_id: number;
  start_date: string;
  end_date: string;
  status: string | null;
  insurance_type: string | null;
  total_amount: number | null;
  is_currently_active: boolean | null;
  cars: Joined<ProfileCar>;
}

export interface CustomerFine {
  id: string;
  status: string | null;
  plate_number: string;
  violation_number: string | null;
  amount: number | null;
  location: string | null;
  violation_date: string | null;
  description: string | null;
  fine_image_url: string | null;
  fine_pdf_url: string | null;
}

export interface CustomerHgs {
  id: number;
  plate_number: string;
  transit_datetime: string;
  toll_location: string | null;
  entry_location: string | null;
  exit_location: string | null;
  amount: number;
  record_type: string | null;
}

export type ReviewStatus = 'pending_review' | 'awaiting_send' | 'sent' | 'rejected';

export interface CustomerReview {
  id: number;
  our_rating: number | null;
  status: ReviewStatus;
  rated_at: string | null;
  rated_by: string | null;
  review_sent_at: string | null;
}

export interface CustomerProfile {
  customer: Customer;
  bookings: ProfileBooking[];
  ledger: LedgerEntry[];
  fines: CustomerFine[];
  hgs: CustomerHgs[];
  review: CustomerReview | null;
  raterName: string | null;
}

// ─── Documents ────────────────────────────────────────────────────────────────

export type DocumentKey =
  | 'id_photo_url'
  | 'id_photo_back_url'
  | 'driving_license_photo_url'
  | 'driving_license_back_url'
  | 'entry_stamp_photo_url';

/** `prefix` is the object name BookingsPage already uses in `customers_doc`. */
export const DOCUMENT_SLOTS: Array<{ key: DocumentKey; label: string; prefix: string }> = [
  { key: 'id_photo_url', label: 'ID — front', prefix: 'id-photo' },
  { key: 'id_photo_back_url', label: 'ID — back', prefix: 'id-photo-back' },
  { key: 'driving_license_photo_url', label: 'License — front', prefix: 'driving-license' },
  { key: 'driving_license_back_url', label: 'License — back', prefix: 'driving-license-back' },
  { key: 'entry_stamp_photo_url', label: 'Entry stamp', prefix: 'entry-stamp' },
];

export function documentCount(customer: Pick<Customer, DocumentKey>): number {
  return DOCUMENT_SLOTS.filter((slot) => Boolean(customer[slot.key])).length;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

const istanbulDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` in Istanbul, where every branch is. */
export function istanbulDate(value: Date | string = new Date()): string {
  return istanbulDay.format(typeof value === 'string' ? new Date(value) : value);
}

const dayNumber = (date: string) => Math.round(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / 86400000);

export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const [year, month, day] = date.slice(0, 10).split('-');
  return day ? `${day}.${month}.${year}` : date;
}

/** Whole years from `from` to `today`, or null when there's no date. */
export function yearsSince(from: string | null | undefined, today: string): number | null {
  if (!from) return null;
  const [fromYear, fromMonth, fromDay] = from.slice(0, 10).split('-').map(Number);
  const [year, month, day] = today.split('-').map(Number);
  const hadAnniversary = month > fromMonth || (month === fromMonth && day >= fromDay);
  return year - fromYear - (hadAnniversary ? 0 : 1);
}

// ─── Money ────────────────────────────────────────────────────────────────────

const wholeLira = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

/** Lira without kuruş, for tiles, pills and table cells. */
export function formatLira(amount: number): string {
  return wholeLira.format(amount);
}

/** What the customer owes: OUT − IN. Negative means we're holding their money. */
export function ledgerBalance(entries: Array<Pick<LedgerRow, 'amount' | 'direction'>>): number {
  const balance = entries.reduce(
    (sum, entry) => sum + (entry.direction === 'OUT' ? Number(entry.amount) : -Number(entry.amount)),
    0,
  );
  return Math.round(balance * 100) / 100;
}

export type BalanceState = 'owes' | 'credit' | 'clear';

export function balanceState(balance: number): BalanceState {
  if (balance > 0) return 'owes';
  return balance < 0 ? 'credit' : 'clear';
}

/**
 * An OUT row is a charge unless it hands money back. `type` is free text, which
 * is why refunds appear as refund, REFUND, REF and REFOUND.
 */
export function isCharge(entry: Pick<LedgerRow, 'type' | 'direction'>): boolean {
  if (entry.direction !== 'OUT') return false;
  const type = entry.type.trim().toLowerCase();
  return !type.startsWith('ref') && type !== 'deposit';
}

/**
 * What the customer has spent across their bookings. `bookings.total_amount` is
 * empty on most bookings and half of them have no ledger rows, so neither source
 * is complete: each booking counts as whichever is larger.
 */
export function totalSpent(
  bookings: Array<{ id: number; status: string | null; total_amount: number | null }>,
  ledger: Array<Pick<LedgerRow, 'booking_id' | 'type' | 'direction' | 'amount'>>,
): number {
  const charged = new Map<number, number>();
  ledger.filter(isCharge).forEach((entry) => {
    charged.set(entry.booking_id, (charged.get(entry.booking_id) ?? 0) + Number(entry.amount));
  });
  return bookings
    .filter((booking) => booking.status !== 'cancelled')
    .reduce((sum, booking) => sum + Math.max(charged.get(booking.id) ?? 0, Number(booking.total_amount ?? 0)), 0);
}

// ─── Directory ────────────────────────────────────────────────────────────────

export const VIP_MIN_BOOKINGS = 3;
export const VIP_TOP_SHARE = 0.1;
export const LOW_RATING_MAX = 2;

export interface CustomerSummary {
  customer: Customer;
  name: string;
  bookingCount: number;
  spent: number;
  balance: number;
  documents: number;
  rating: number | null;
  lastBooking: string | null;
  activeNow: boolean;
  currentPlate: string | null;
  isVip: boolean;
  isNew: boolean;
}

export function customerName(customer: Pick<Customer, 'first_name' | 'last_name'>): string {
  return `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || 'Unnamed customer';
}

/** The spend a customer needs to be in the top 10% of those who've spent anything. */
export function vipSpendThreshold(spends: number[]): number {
  const ranked = spends.filter((spend) => spend > 0).sort((a, b) => b - a);
  if (ranked.length === 0) return Infinity;
  return ranked[Math.max(Math.ceil(ranked.length * VIP_TOP_SHARE), 1) - 1];
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  rows.forEach((row) => {
    const value = key(row);
    const group = groups.get(value);
    if (group) group.push(row);
    else groups.set(value, [row]);
  });
  return groups;
}

export function summarizeCustomers(directory: CustomerDirectory, today: string): CustomerSummary[] {
  const bookingsByCustomer = groupBy(directory.bookings, (booking) => booking.customer_id);
  const ledgerByCustomer = groupBy(directory.ledger, (entry) => entry.customer_id);
  const ratings = new Map(directory.reviews.map((review) => [review.customer_id, review.our_rating]));
  const month = today.slice(0, 7);

  const summaries = directory.customers.map((customer): CustomerSummary => {
    const bookings = bookingsByCustomer.get(customer.id) ?? [];
    const ledger = ledgerByCustomer.get(customer.id) ?? [];
    const live = bookings.filter((booking) => booking.is_currently_active);
    const kept = bookings.filter((booking) => booking.status !== 'cancelled');
    return {
      customer,
      name: customerName(customer),
      bookingCount: kept.length,
      spent: totalSpent(bookings, ledger),
      balance: ledgerBalance(ledger),
      documents: documentCount(customer),
      rating: ratings.get(customer.id) ?? null,
      lastBooking: kept.reduce<string | null>((latest, booking) => (
        !latest || booking.start_date > latest ? booking.start_date : latest
      ), null),
      activeNow: live.length > 0,
      currentPlate: one(live[0]?.cars)?.plate_number ?? null,
      isVip: false,
      isNew: Boolean(customer.created_at) && istanbulDate(customer.created_at as string).slice(0, 7) === month,
    };
  });

  const threshold = vipSpendThreshold(summaries.map((summary) => summary.spent));
  return summaries.map((summary) => ({
    ...summary,
    isVip: summary.bookingCount >= VIP_MIN_BOOKINGS || summary.spent >= threshold,
  }));
}

export type CustomerSegment = 'all' | 'active' | 'owes' | 'credit' | 'documents' | 'vip' | 'low' | 'new';

export function inSegment(summary: CustomerSummary, segment: CustomerSegment): boolean {
  switch (segment) {
    case 'active': return summary.activeNow;
    case 'owes': return summary.balance > 0;
    case 'credit': return summary.balance < 0;
    case 'documents': return summary.documents < DOCUMENT_SLOTS.length;
    case 'vip': return summary.isVip;
    case 'low': return summary.rating !== null && summary.rating <= LOW_RATING_MAX;
    case 'new': return summary.isNew;
    default: return true;
  }
}

export function customerStats(summaries: CustomerSummary[]) {
  const owing = summaries.filter((summary) => summary.balance > 0);
  return {
    total: summaries.length,
    active: summaries.filter((summary) => summary.activeNow).length,
    owingCount: owing.length,
    owingTotal: owing.reduce((sum, summary) => sum + summary.balance, 0),
    newThisMonth: summaries.filter((summary) => summary.isNew).length,
  };
}

const compact = (value: string) => value.replace(/[\s\-+()]/g, '').toLowerCase();

/** Name, phone (digits only), ID, nationality, or the plate they're driving now. */
export function matchesSearch(summary: CustomerSummary, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  const { customer, name, currentPlate } = summary;
  const bare = compact(term);
  return (
    name.toLowerCase().includes(term) ||
    (bare !== '' && compact(customer.phone ?? '').includes(bare)) ||
    (customer.id_number ?? '').toLowerCase().includes(term) ||
    (customer.nationality ?? '').toLowerCase().includes(term) ||
    (bare !== '' && compact(currentPlate ?? '').includes(bare))
  );
}

// ─── Reading ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;
const CUSTOMER_COLUMNS = [
  'id', 'first_name', 'last_name', 'phone', 'email', 'nationality', 'language', 'id_type', 'id_number',
  'birth_date', 'address', 'driving_license_number', 'license_issue_date', 'notes', 'created_at',
  'id_photo_url', 'id_photo_back_url', 'driving_license_photo_url', 'driving_license_back_url',
  'entry_stamp_photo_url',
].join(', ');

type PageResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** PostgREST stops at 1000 rows without saying so, and the ledger is already past that. */
async function fetchAll<T>(page: (from: number, to: number) => PageResult): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

export async function fetchCustomerDirectory(): Promise<CustomerDirectory> {
  const [customers, bookings, ledger, reviews] = await Promise.all([
    fetchAll<Customer>((from, to) => supabase
      .from('customers').select(CUSTOMER_COLUMNS).order('first_name').order('id').range(from, to)),
    fetchAll<DirectoryBooking>((from, to) => supabase
      .from('bookings')
      .select('id, customer_id, car_id, start_date, end_date, status, total_amount, is_currently_active, cars(plate_number)')
      .order('id')
      .range(from, to)),
    fetchAll<DatedLedgerRow>((from, to) => supabase
      .from('customer_accounting_ledger')
      .select('booking_id, customer_id, type, amount, direction, created_at')
      .order('id')
      .range(from, to)),
    fetchAll<DirectoryReview>((from, to) => supabase
      .from('customer_reviews')
      .select('customer_id, our_rating')
      .is('deleted_at', null)
      .order('id')
      .range(from, to)),
  ]);
  return { customers, bookings, ledger, reviews };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Null when no such customer exists. */
export async function fetchCustomerProfile(id: string): Promise<CustomerProfile | null> {
  if (!UUID.test(id)) return null;

  const [customer, bookings, ledger, fines, hgs, review] = await Promise.all([
    supabase.from('customers').select(CUSTOMER_COLUMNS).eq('id', id).maybeSingle(),
    supabase
      .from('bookings')
      .select(`id, booking_number, car_id, start_date, end_date, status, insurance_type, total_amount,
        is_currently_active, cars(plate_number, car_photo_urls, model_group(name, image_url, min_age))`)
      .eq('customer_id', id)
      .order('start_date', { ascending: false }),
    supabase
      .from('customer_accounting_ledger')
      .select('id, booking_id, customer_id, car_id, type, description, amount, direction, created_at')
      .eq('customer_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('traffic_fines')
      .select('id, status, plate_number, violation_number, amount, location, violation_date, description, fine_image_url, fine_pdf_url')
      .eq('customer_id', id)
      .order('violation_date', { ascending: false }),
    fetchAll<CustomerHgs>((from, to) => supabase
      .from('hgs_transactions')
      .select('id, plate_number, transit_datetime, toll_location, entry_location, exit_location, amount, record_type')
      .eq('customer_id', id)
      .order('transit_datetime', { ascending: false })
      .order('id')
      .range(from, to)),
    supabase
      .from('customer_reviews')
      .select('id, our_rating, status, rated_at, rated_by, review_sent_at')
      .eq('customer_id', id)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);

  const failure = customer.error ?? bookings.error ?? ledger.error ?? fines.error ?? review.error;
  if (failure) throw new Error(failure.message);
  if (!customer.data) return null;

  const reviewRow = review.data as CustomerReview | null;
  return {
    customer: customer.data as unknown as Customer,
    bookings: (bookings.data ?? []) as unknown as ProfileBooking[],
    ledger: (ledger.data ?? []) as LedgerEntry[],
    fines: (fines.data ?? []) as CustomerFine[],
    hgs,
    review: reviewRow,
    raterName: await fetchRaterName(reviewRow?.rated_by),
  };
}

async function fetchRaterName(profileId: string | null | undefined): Promise<string | null> {
  if (!profileId) return null;
  const { data } = await supabase.from('profiles').select('full_name').eq('id', profileId).maybeSingle();
  return (data as { full_name: string | null } | null)?.full_name ?? null;
}

// ─── Writing ──────────────────────────────────────────────────────────────────

export type CustomerPatch = Partial<Omit<Customer, 'id' | 'created_at'>>;

export async function updateCustomer(id: string, patch: CustomerPatch): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .update(patch)
    .eq('id', id)
    .select(CUSTOMER_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Customer;
}

/** Keyed on the customer id, never the name: Storage rejects non-ASCII object keys. */
export async function uploadCustomerDocument(customerId: string, slot: DocumentKey, file: File): Promise<Customer> {
  const prefix = DOCUMENT_SLOTS.find((item) => item.key === slot)?.prefix ?? 'document';
  const extension = (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${customerId}/${prefix}-${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from('customers_doc').upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('customers_doc').getPublicUrl(path);
  return updateCustomer(customerId, { [slot]: `${data.publicUrl}?v=${Date.now()}` });
}

export type PaymentType = 'payment' | 'deposit';

/** `booking_id` and `car_id` are NOT NULL here, so a payment always belongs to a booking. */
export async function addCustomerPayment(input: {
  customerId: string;
  bookingId: number;
  carId: number;
  type: PaymentType;
  amount: number;
  date: string;
  description: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('customer_accounting_ledger').insert({
    booking_id: input.bookingId,
    customer_id: input.customerId,
    car_id: input.carId,
    type: input.type,
    amount: input.amount,
    direction: 'IN',
    description: input.description || null,
    // A date alone would sort before anything else entered today.
    created_at: input.date === istanbulDate() ? new Date().toISOString() : input.date,
    created_by: user?.id ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Same rule as the Google Reviews page: 5★ is worth asking for a review, anything
 * less isn't. A request that already went out stays sent, so re-rating never
 * queues a second one.
 */
export function reviewStatusFor(rating: number, current: ReviewStatus | null | undefined): ReviewStatus {
  if (current === 'sent') return 'sent';
  return rating === 5 ? 'awaiting_send' : 'rejected';
}

export async function rateCustomer(input: {
  customerId: string;
  rating: number;
  bookingId: number;
  currentStatus: ReviewStatus | null | undefined;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('customer_reviews').upsert({
    customer_id: input.customerId,
    reference_booking_id: input.bookingId,
    our_rating: input.rating,
    status: reviewStatusFor(input.rating, input.currentStatus),
    rated_by: user?.id ?? null,
    rated_at: new Date().toISOString(),
    deleted_at: null,
  }, { onConflict: 'customer_id' });
  if (error) throw new Error(error.message);
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export function bookingCar(booking: ProfileBooking) {
  const car = one(booking.cars);
  const model = one(car?.model_group);
  return {
    plate: car?.plate_number ?? null,
    model: model?.name ?? null,
    minAge: model?.min_age ?? null,
    photo: car?.car_photo_urls?.[0]?.url ?? model?.image_url ?? null,
  };
}

/** The rental happening now, otherwise the next one that's booked. */
export function focusBooking(bookings: ProfileBooking[], today: string): ProfileBooking | null {
  const live = bookings.find((booking) => booking.is_currently_active);
  if (live) return live;
  const upcoming = bookings
    .filter((booking) => booking.start_date >= today && booking.status !== 'cancelled' && booking.status !== 'completed')
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  return upcoming[0] ?? null;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function bookingCountdown(booking: ProfileBooking, today: string): string {
  if (!booking.is_currently_active) {
    const toStart = daysBetween(today, booking.start_date);
    return toStart === 0 ? 'Starts today' : `Starts in ${plural(toStart, 'day')}`;
  }
  const toEnd = daysBetween(today, booking.end_date);
  if (toEnd === 0) return 'Due back today';
  return toEnd > 0 ? `Due back in ${plural(toEnd, 'day')}` : `${plural(-toEnd, 'day')} overdue`;
}

export function rentalDays(bookings: ProfileBooking[]): number {
  return bookings
    .filter((booking) => booking.status !== 'cancelled')
    .reduce((sum, booking) => sum + Math.max(daysBetween(booking.start_date, booking.end_date), 1), 0);
}

export interface LedgerLine extends LedgerEntry {
  running: number;
}

/** Newest first, each row carrying what the customer owed once it was entered. */
export function runningLedger(entries: LedgerEntry[]): LedgerLine[] {
  let running = 0;
  return entries
    .map((entry) => {
      running = Math.round((running + (entry.direction === 'OUT' ? 1 : -1) * Number(entry.amount)) * 100) / 100;
      return { ...entry, running };
    })
    .reverse();
}

const TYPE_LABELS: Record<string, string> = {
  hgs: 'HGS',
  car_wash: 'Car wash',
  extra_km: 'Extra km',
};

export function ledgerTypeLabel(type: string): string {
  const key = type.trim().toLowerCase();
  if (TYPE_LABELS[key]) return TYPE_LABELS[key];
  if (type !== type.toLowerCase()) return type.trim();
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type AgeCheck =
  | { state: 'missing' }
  | { state: 'no_rule'; age: number }
  | { state: 'ok' | 'under'; age: number; minAge: number; model: string };

/** Against the car they're renting now or next, otherwise the one they last rented. */
export function checkAge(customer: Pick<Customer, 'birth_date'>, bookings: ProfileBooking[], today: string): AgeCheck {
  const age = yearsSince(customer.birth_date, today);
  if (age === null) return { state: 'missing' };
  const target = focusBooking(bookings, today) ?? bookings[0];
  const car = target ? bookingCar(target) : null;
  if (!car?.minAge) return { state: 'no_rule', age };
  return { state: age >= car.minAge ? 'ok' : 'under', age, minAge: car.minAge, model: car.model ?? 'this car' };
}

export type ActivityKind = 'booking' | 'payment' | 'fine' | 'review';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  date: string;
  title: string;
  detail: string;
}

export function buildActivity(profile: CustomerProfile, limit = 10): ActivityItem[] {
  const items: ActivityItem[] = [
    ...profile.bookings.map((booking): ActivityItem => {
      const car = bookingCar(booking);
      return {
        id: `booking-${booking.id}`,
        kind: 'booking',
        date: booking.start_date,
        title: `Booking ${booking.booking_number ?? `#${booking.id}`}`,
        detail: [car.plate, car.model].filter(Boolean).join(' · '),
      };
    }),
    ...profile.ledger
      .filter((entry) => entry.direction === 'IN' && entry.created_at)
      .map((entry): ActivityItem => ({
        id: `ledger-${entry.id}`,
        kind: 'payment',
        date: entry.created_at as string,
        title: `${ledgerTypeLabel(entry.type)} received`,
        detail: formatLira(Number(entry.amount)),
      })),
    ...profile.fines
      .filter((fine) => fine.violation_date)
      .map((fine): ActivityItem => ({
        id: `fine-${fine.id}`,
        kind: 'fine',
        date: fine.violation_date as string,
        title: 'Traffic fine',
        detail: [fine.plate_number, fine.amount === null ? null : formatLira(Number(fine.amount))].filter(Boolean).join(' · '),
      })),
  ];

  if (profile.review?.rated_at && profile.review.our_rating) {
    items.push({
      id: `review-${profile.review.id}`,
      kind: 'review',
      date: profile.review.rated_at,
      title: 'Rated by us',
      detail: `${profile.review.our_rating} of 5`,
    });
  }

  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
