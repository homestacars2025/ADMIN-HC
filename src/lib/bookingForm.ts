import type { Booking, BookingStatus } from '../types';
import { daysBetween, formatDate, friendlyCustomerError, type CustomerLanguage } from './customers';

// ─── Presets ──────────────────────────────────────────────────────────────────

export const LOCATION_PRESETS = [
  'Şişli Branch',
  'Kayaşehir Branch',
  'Istanbul Airport (IST)',
  'Sabiha Gökçen Airport (SAW)',
  'Other',
] as const;

export const INSURANCE_PRESETS = ['Korumasız', 'Kısmi Koruma', 'Orta Koruma', 'Tam Koruma'] as const;
export const ADDITIONAL_SERVICE_PRESETS = ['Çocuk Koltuğu', 'Yedek Sürücü', 'Ek Kilometre'] as const;
export const OTHER_PRESET = 'Diğer';

const CHILD_SEAT = 'Çocuk Koltuğu';
const EXTRA_DRIVER = 'Yedek Sürücü';
const EXTRA_KM = 'Ek Kilometre';

/** Extras that come in a quantity. Extra kilometres is simply on or off. */
export const QUANTITY_SERVICES: readonly string[] = [CHILD_SEAT, EXTRA_DRIVER];
export const MAX_SERVICE_QUANTITY = 9;

/** The values stay Turkish because bookings store them and contracts print them. */
export const PRESET_LABELS: Record<string, string> = {
  'Korumasız': 'No protection',
  'Kısmi Koruma': 'Partial protection',
  'Orta Koruma': 'Medium protection',
  'Tam Koruma': 'Full protection',
  'Çocuk Koltuğu': 'Child seat',
  'Yedek Sürücü': 'Additional driver',
  'Ek Kilometre': 'Extra kilometres',
  [OTHER_PRESET]: 'Other',
};

export const INSURANCE_DESCRIPTIONS: Record<string, string> = {
  'Korumasız': 'The customer is responsible for any damage.',
  'Kısmi Koruma': 'Covers part of the damage.',
  'Orta Koruma': 'Covers most of the damage.',
  'Tam Koruma': 'The highest level of cover.',
  [OTHER_PRESET]: 'Write the cover in your own words.',
};

export const SERVICE_DESCRIPTIONS: Record<string, string> = {
  [CHILD_SEAT]: 'A child seat fitted in the car.',
  [EXTRA_DRIVER]: 'Another person allowed to drive.',
  [EXTRA_KM]: 'More kilometres for this rental.',
  [OTHER_PRESET]: 'Write the extra in your own words.',
};

export function resolveLocationSelect(saved: string | null): { select: string; custom: string } {
  if (!saved) return { select: '', custom: '' };
  if ((LOCATION_PRESETS as readonly string[]).includes(saved) && saved !== 'Other') {
    return { select: saved, custom: '' };
  }
  return { select: 'Other', custom: saved };
}

export function resolveInsuranceSelect(saved: string | null): { select: string; custom: string } {
  if (!saved) return { select: '', custom: '' };
  if ((INSURANCE_PRESETS as readonly string[]).includes(saved)) return { select: saved, custom: '' };
  return { select: OTHER_PRESET, custom: saved };
}

const splitServices = (saved: string | null) => (saved ?? '').split(',').map((part) => part.trim()).filter(Boolean);

/** "Yedek Sürücü x2" is a counted extra. Anything else that looks like one stays free text. */
function countedService(part: string): { service: string; count: number } | null {
  const match = /^(.+) x(\d+)$/.exec(part);
  if (!match || !QUANTITY_SERVICES.includes(match[1])) return null;
  const count = Number(match[2]);
  return count >= 2 && count <= MAX_SERVICE_QUANTITY ? { service: match[1], count } : null;
}

const serviceName = (part: string) => countedService(part)?.service ?? part;
const isPresetService = (part: string) => (ADDITIONAL_SERVICE_PRESETS as readonly string[]).includes(serviceName(part));

/** The other format this column holds, from bookings made outside the forms. */
function readServicesJson(saved: string | null | undefined): Record<string, unknown> | null {
  if (!saved?.trim().startsWith('{')) return null;
  try {
    const value: unknown = JSON.parse(saved);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const jsonQuantity = (value: unknown) => Math.max(0, Math.floor(Number(value)) || 0);
const jsonOther = (json: Record<string, unknown>) => (typeof json.other === 'string' ? json.other : '');

function jsonServiceCounts(json: Record<string, unknown>): Record<string, number> {
  return { [CHILD_SEAT]: jsonQuantity(json.child_seat), [EXTRA_DRIVER]: jsonQuantity(json.additional_drivers) };
}

export function parseAdditionalServices(saved: string | null): string[] {
  const json = readServicesJson(saved);
  if (json) {
    const counts = jsonServiceCounts(json);
    return [
      ...QUANTITY_SERVICES.filter((service) => counts[service] > 0),
      ...(json.extra_km === true ? [EXTRA_KM] : []),
      ...(jsonOther(json) ? [OTHER_PRESET] : []),
    ];
  }
  const parts = splitServices(saved);
  const selected = parts.filter(isPresetService).map(serviceName);
  return parts.some((part) => !isPresetService(part)) ? [...selected, OTHER_PRESET] : selected;
}

export function parseServiceCounts(saved: string | null): Record<string, number> {
  const counts: Record<string, number> = {};
  const json = readServicesJson(saved);
  if (json) {
    Object.entries(jsonServiceCounts(json)).forEach(([service, count]) => { if (count > 1) counts[service] = count; });
    return counts;
  }
  splitServices(saved).forEach((part) => {
    const counted = countedService(part);
    if (counted) counts[counted.service] = counted.count;
  });
  return counts;
}

export function parseAdditionalServicesCustom(saved: string | null): string {
  const json = readServicesJson(saved);
  if (json) return jsonOther(json);
  return splitServices(saved).filter((part) => !isPresetService(part)).join(', ');
}

// ─── The form ─────────────────────────────────────────────────────────────────

export type BookingCurrency = 'TRY' | 'USD';

export interface BookingFormData {
  booking_number: string;
  status: BookingStatus;
  car_id: string;
  start_date: string;
  end_date: string;
  is_currently_active: boolean;
  pickup_location: string;
  pickup_location_select: string;
  pickup_location_custom: string;
  dropoff_location: string;
  dropoff_location_select: string;
  dropoff_location_custom: string;
  km_at_delivery: string;
  fuel_at_delivery: string;
  insurance_type_select: string;
  insurance_type_custom: string;
  additional_services_selected: string[];
  additional_services_counts: Record<string, number>;
  additional_services_custom: string;
  cust_id_type: 'passport' | 'national_id';
  cust_id_number: string;
  cust_first_name: string;
  cust_last_name: string;
  cust_phone_dial: string;
  cust_phone: string;
  cust_nationality: string;
  cust_language: CustomerLanguage;
  cust_driving_license: string;
  cust_driving_license_number: string;
  cust_address: string;
  cust_birth_date: string;
  cust_license_issue_date: string;
  cust_notes: string;
  fin_currency: BookingCurrency;
  fin_rental_amount: string;
  fin_deposit_amount: string;
  fin_paid_amount: string;
}

export const EMPTY_FORM: BookingFormData = {
  booking_number: '', status: 'pending', car_id: '',
  start_date: '', end_date: '', is_currently_active: false,
  pickup_location: '', pickup_location_select: '', pickup_location_custom: '',
  dropoff_location: '', dropoff_location_select: '', dropoff_location_custom: '',
  km_at_delivery: '', fuel_at_delivery: '',
  insurance_type_select: '', insurance_type_custom: '',
  additional_services_selected: [], additional_services_counts: {}, additional_services_custom: '',
  cust_id_type: 'passport', cust_id_number: '',
  cust_first_name: '', cust_last_name: '',
  cust_phone_dial: '+90', cust_phone: '',
  cust_nationality: '', cust_language: 'ar', cust_driving_license: '',
  cust_driving_license_number: '', cust_address: '',
  cust_birth_date: '', cust_license_issue_date: '', cust_notes: '',
  fin_currency: 'TRY', fin_rental_amount: '', fin_deposit_amount: '', fin_paid_amount: '',
};

/** The booking's own fields. Customer and ledger values arrive from their own queries. */
export function editFormData(booking: Booking): BookingFormData {
  const pickup = resolveLocationSelect(booking.pickup_location);
  const dropoff = resolveLocationSelect(booking.dropoff_location);
  const insurance = resolveInsuranceSelect(booking.insurance_type);
  return {
    ...EMPTY_FORM,
    booking_number: booking.booking_number,
    status: booking.status,
    car_id: String(booking.car_id),
    start_date: booking.start_date,
    end_date: booking.end_date,
    is_currently_active: booking.is_currently_active,
    pickup_location: booking.pickup_location ?? '',
    pickup_location_select: pickup.select,
    pickup_location_custom: pickup.custom,
    dropoff_location: booking.dropoff_location ?? '',
    dropoff_location_select: dropoff.select,
    dropoff_location_custom: dropoff.custom,
    km_at_delivery: booking.km_at_delivery != null ? String(booking.km_at_delivery) : '',
    fuel_at_delivery: booking.fuel_at_delivery ?? '',
    insurance_type_select: insurance.select,
    insurance_type_custom: insurance.custom,
    additional_services_selected: parseAdditionalServices(booking.additional_services),
    additional_services_counts: parseServiceCounts(booking.additional_services),
    additional_services_custom: parseAdditionalServicesCustom(booking.additional_services),
  };
}

export function insuranceValue(form: BookingFormData): string | null {
  return form.insurance_type_select === OTHER_PRESET
    ? form.insurance_type_custom.trim() || null
    : form.insurance_type_select || null;
}

export function serviceQuantity(form: BookingFormData, service: string): number {
  if (!form.additional_services_selected.includes(service)) return 0;
  return form.additional_services_counts[service] ?? 1;
}

/** 0 removes the extra, and anything from 2 up is remembered as its count. */
export function withServiceQuantity(form: BookingFormData, service: string, quantity: number): BookingFormData {
  const selected = form.additional_services_selected;
  const counts = { ...form.additional_services_counts };
  delete counts[service];
  if (quantity >= 2) counts[service] = quantity;
  return {
    ...form,
    additional_services_counts: counts,
    additional_services_selected: quantity === 0
      ? selected.filter((item) => item !== service)
      : selected.includes(service) ? selected : [...selected, service],
  };
}

const chosenServices = (form: BookingFormData) => form.additional_services_selected.filter((service) => service !== OTHER_PRESET);
const customService = (form: BookingFormData) => (form.additional_services_selected.includes(OTHER_PRESET) ? form.additional_services_custom.trim() : '');

function servicesText(form: BookingFormData): string | null {
  const custom = customService(form);
  const chosen = [
    ...chosenServices(form).map((service) => {
      const quantity = serviceQuantity(form, service);
      return quantity > 1 ? `${service} x${quantity}` : service;
    }),
    ...(custom ? [custom] : []),
  ];
  return chosen.length > 0 ? chosen.join(', ') : null;
}

/**
 * The value to save. One of each stays the plain name, so contracts read as they
 * always did, and only a real quantity differs: `Çocuk Koltuğu x2`, the same as
 * Team writes. Unchanged, the stored text goes back exactly as it came, and a
 * JSON booking stays JSON.
 */
export function additionalServicesValue(form: BookingFormData, stored?: string | null): string | null {
  const text = servicesText(form);
  if (!stored) return text;

  const storedForm = {
    ...form,
    additional_services_selected: parseAdditionalServices(stored),
    additional_services_counts: parseServiceCounts(stored),
    additional_services_custom: parseAdditionalServicesCustom(stored),
  };
  if (servicesText(storedForm) === text) return stored;

  const json = readServicesJson(stored);
  if (!json) return text;
  const { other: _dropped, ...rest } = json;
  const other = customService(form);
  return JSON.stringify({
    ...rest,
    child_seat: serviceQuantity(form, CHILD_SEAT),
    additional_drivers: serviceQuantity(form, EXTRA_DRIVER),
    extra_km: form.additional_services_selected.includes(EXTRA_KM),
    ...(other && { other }),
  });
}

/** The same choices, in English, for the summary and review. */
export function extrasLabel(form: BookingFormData): string {
  const custom = customService(form);
  return [
    ...chosenServices(form).map((service) => {
      const quantity = serviceQuantity(form, service);
      return quantity > 1 ? `${PRESET_LABELS[service]} × ${quantity}` : PRESET_LABELS[service];
    }),
    ...(custom ? [custom] : []),
  ].join(', ');
}

// ─── Money ────────────────────────────────────────────────────────────────────

/** Amounts are stored in lira, rounded to kuruş, whichever currency they were typed in. */
export function toTry(amount: number, currency: BookingCurrency, usdRate: number | null | undefined): number {
  return currency === 'USD' ? Math.round(amount * (usdRate ?? 1) * 100) / 100 : amount;
}

const decimal = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatRate = (rate: number) => decimal.format(rate);

/** "($300 × 34,50)", for the ledger description of a USD extension. */
export function usdLedgerNote(amount: number, rate: number): string {
  return `($${amount.toLocaleString('en-US')} × ${formatRate(rate)})`;
}

export const parseAmount = (value: string) => {
  const amount = parseFloat(value);
  return Number.isFinite(amount) ? amount : 0;
};

// ─── Dates and availability ───────────────────────────────────────────────────

/** Rented days, where a same-day rental still counts as one. */
export function rangeDays(start: string, end: string): number {
  if (!start || !end) return 0;
  return Math.max(daysBetween(start, end), 1);
}

export const formatDays = (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`;

/** "10.11 → 15.11.2026", short enough for the summary bar. */
export function formatShortRange(start: string, end: string): string {
  if (!start) return '—';
  return `${formatDate(start).slice(0, 5)} → ${end ? formatDate(end) : '…'}`;
}

export interface CalendarBlock {
  car_id: number;
  booking_id: number | null;
}

/** Cars blocked for the dates, ignoring the booking being edited. */
export function busyCarIds(blocks: CalendarBlock[], excludeBookingId?: number | null): Set<number> {
  return new Set(
    blocks.filter((block) => excludeBookingId == null || block.booking_id !== excludeBookingId).map((block) => block.car_id),
  );
}

// ─── Cars ─────────────────────────────────────────────────────────────────────

export interface CarChoice {
  id: number;
  plate_number: string;
  model: string;
  inactive?: boolean;
}

export interface CarGroup {
  label: string;
  cars: CarChoice[];
}

const compact = (value: string) => value.replace(/\s/g, '').toLowerCase();

export function carMatches(car: CarChoice, query: string): boolean {
  const term = compact(query);
  return !term || compact(car.plate_number).includes(term) || compact(car.model).includes(term);
}

/** Recently used cars first, then one group per model A→Z, plates A→Z inside each. */
export function groupCars(cars: CarChoice[], recentIds: number[] = [], query = ''): CarGroup[] {
  const shown = cars.filter((car) => carMatches(car, query));
  const byPlate = (a: CarChoice, b: CarChoice) => a.plate_number.localeCompare(b.plate_number);

  const models = new Map<string, CarChoice[]>();
  shown.forEach((car) => {
    const label = car.model || 'Other';
    models.set(label, [...(models.get(label) ?? []), car]);
  });
  const groups = Array.from(models, ([label, list]) => ({ label, cars: list.sort(byPlate) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const recent = recentIds
    .map((id) => shown.find((car) => car.id === id))
    .filter((car): car is CarChoice => Boolean(car));
  return recent.length > 0 && !query.trim() ? [{ label: 'Recently used', cars: recent }, ...groups] : groups;
}

const RECENT_KEY = 'bookings:recent-cars';
const RECENT_LIMIT = 4;

export function readRecentCars(): number[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is number => typeof id === 'number') : [];
  } catch {
    return [];
  }
}

export function rememberCar(id: number): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecentCars().filter((other) => other !== id)].slice(0, RECENT_LIMIT)));
  } catch {
    // Only a convenience, so a blocked store is fine.
  }
}

// ─── Changes ──────────────────────────────────────────────────────────────────

const SIMPLE_FIELDS: Array<keyof BookingFormData> = [
  'status', 'car_id', 'start_date', 'end_date', 'is_currently_active', 'pickup_location', 'dropoff_location',
  'km_at_delivery', 'fuel_at_delivery', 'cust_id_type', 'cust_id_number', 'cust_first_name', 'cust_last_name',
  'cust_phone_dial', 'cust_phone', 'cust_nationality', 'cust_language', 'cust_driving_license', 'cust_address',
  'cust_birth_date', 'cust_license_issue_date', 'cust_notes',
];

const MONEY_FIELDS = ['fin_rental_amount', 'fin_deposit_amount', 'fin_paid_amount'] as const;

const sameText = (a: unknown, b: unknown) => String(a ?? '').trim() === String(b ?? '').trim();

/** The fields that differ from what was loaded, comparing money in lira. */
export function changedFields(baseline: BookingFormData, form: BookingFormData, usdRate?: number | null): string[] {
  const changed: string[] = SIMPLE_FIELDS.filter((field) => !sameText(baseline[field], form[field]));
  if (insuranceValue(baseline) !== insuranceValue(form)) changed.push('insurance');
  if (additionalServicesValue(baseline) !== additionalServicesValue(form)) changed.push('extras');
  MONEY_FIELDS.forEach((field) => {
    const before = toTry(parseAmount(baseline[field]), baseline.fin_currency, usdRate);
    const after = toTry(parseAmount(form[field]), form.fin_currency, usdRate);
    if (Math.abs(before - after) >= 0.005) changed.push(field);
  });
  return changed;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/** Adds the calendar's overlap rule to what the customer rules already explain. */
export function friendlyBookingError(message: string): string {
  if (/car_calendar_no_overlap|conflicting key value/i.test(message)) {
    return 'This car is already booked for those dates. Choose other dates or another car.';
  }
  return friendlyCustomerError(message).text;
}
