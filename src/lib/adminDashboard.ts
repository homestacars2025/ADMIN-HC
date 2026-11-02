import { istanbulToday } from './homeData';
import { formatMoney } from './money';
import { supabase } from './supabase';

export interface GmvPoint { month: string; gmv: number; commission: number }
export interface BookingPoint { month: string; new: number; extensions: number }
export interface IdleCar { car_id: number; plate: string; model: string | null }

export interface AdminDashboard {
  month: string;
  investor_gmv: {
    gmv: number;
    prev_gmv: number;
    homesta_commission: number;
    prev_commission: number;
    commission_rate: number | null;
    cars_with_revenue: number;
    ytd_gmv: number;
    ytd_commission: number;
    series: GmvPoint[];
  };
  bookings: {
    new: number;
    extensions: number;
    booked_value: number;
    prev_new: number;
    all_time: number;
    active_now: number;
    pickups_today: number;
    returns_today: number;
    returns_next_7: number;
    series: BookingPoint[];
  };
  utilization: { active_cars: number; rented_now: number; idle_now: number; rate: number | null; idle_cars: IdleCar[] };
  cash: { by_currency: Record<string, number>; envelopes_in_safe: number; envelopes_in_safe_try: number };
  alerts: {
    pending_invoices: number;
    kabis_missing: number;
    unpaid_fines: number;
    unpaid_fines_amount: number;
    open_car_issues: number;
    custody_pending_review: number;
    insurance_30d: number;
    inspection_30d: number;
    customers_owing: number;
    customers_owing_amount: number;
  };
}

export async function fetchAdminDashboard(month: string): Promise<AdminDashboard> {
  const { data, error } = await supabase.rpc('admin_dashboard', { p_month: `${month}-01` });
  if (error) throw new Error(error.message);
  return data as AdminDashboard;
}

/** Null when there's nothing to compare with, which is different from no change. */
export function deltaPercent(now: number, before: number): number | null {
  if (!before) return null;
  return ((now - before) / before) * 100;
}

export type AttentionArt = 'red' | 'amber' | 'fine' | 'maintenance';

export interface AttentionItem {
  key: string;
  title: string;
  detail: string;
  count: number;
  to: string;
  art: AttentionArt;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** Most urgent first: the car can't legally drive, then money and reports that are overdue. */
export function attentionItems(alerts: AdminDashboard['alerts']): AttentionItem[] {
  const items: AttentionItem[] = [
    {
      key: 'insurance', count: alerts.insurance_30d, art: 'red', to: '/dashboard/cars',
      title: 'Insurance expiring', detail: `${plural(alerts.insurance_30d, 'car', 'cars')} within 30 days`,
    },
    {
      key: 'inspection', count: alerts.inspection_30d, art: 'red', to: '/dashboard/cars',
      title: 'Inspection expiring', detail: `${plural(alerts.inspection_30d, 'car', 'cars')} within 30 days`,
    },
    {
      key: 'kabis', count: alerts.kabis_missing, art: 'amber', to: '/dashboard/kabis',
      title: 'KABIS not reported', detail: `${plural(alerts.kabis_missing, 'booking', 'bookings')} in the last 30 days`,
    },
    {
      key: 'fines', count: alerts.unpaid_fines, art: 'fine', to: '/dashboard/fines?filter=unpaid',
      title: 'Unpaid fines', detail: formatMoney(alerts.unpaid_fines_amount),
    },
    {
      key: 'issues', count: alerts.open_car_issues, art: 'maintenance', to: '/dashboard/car-issues?filter=open',
      title: 'Open car issues', detail: `${plural(alerts.open_car_issues, 'issue', 'issues')} still open`,
    },
    {
      key: 'custody', count: alerts.custody_pending_review, art: 'amber', to: '/dashboard/accounting?tab=custody&filter=pending',
      title: 'Custody review', detail: `${plural(alerts.custody_pending_review, 'expense', 'expenses')} to review`,
    },
    {
      key: 'invoices', count: alerts.pending_invoices, art: 'amber', to: '/dashboard/pending-invoices?month=all',
      title: 'Pending invoices', detail: `${plural(alerts.pending_invoices, 'booking', 'bookings')} waiting for an e-Fatura`,
    },
  ];
  return items.filter((item) => item.count > 0);
}

// ─── The lists behind the Today tiles ─────────────────────────────────────────

export const DAY_LISTS = ['active', 'pickups', 'returns', 'next7'] as const;
export type DayList = typeof DAY_LISTS[number];

export const DAY_LIST_TITLES: Record<DayList, string> = {
  active: 'Active now',
  pickups: 'Pickups today',
  returns: 'Returns today',
  next7: 'Returns in the next 7 days',
};

const addDays = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);

export interface DayListRow {
  booking_id: number;
  booking_number: string;
  car_id: number;
  customer_id: string;
  customer_full_name: string | null;
  customer_phone: string | null;
  start_date: string;
  end_date: string;
  plate_number: string;
  car_model: string;
  kabis_reported: boolean;
  invoice_issued: boolean;
}

/**
 * The same rules `admin_dashboard` counts by, so the number on a tile is the list it
 * opens. Each end is a half-open range of days. `statuses` is null for any status
 * except cancelled.
 */
export function dayListRange(list: DayList, today: string = istanbulToday()) {
  switch (list) {
    // The dashboard also names 'active', but the status enum has no such value and the filter would be refused.
    case 'active': return { startFrom: null, startBefore: addDays(today, 1), endFrom: today, endBefore: null, statuses: ['confirmed'] };
    case 'pickups': return { startFrom: today, startBefore: addDays(today, 1), endFrom: null, endBefore: null, statuses: null };
    case 'returns': return { startFrom: null, startBefore: null, endFrom: today, endBefore: addDays(today, 1), statuses: null };
    default: return { startFrom: null, startBefore: null, endFrom: addDays(today, 1), endBefore: addDays(today, 8), statuses: null };
  }
}

type Joined<T> = T | T[] | null;
const one = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

interface DayListRaw {
  id: number;
  booking_number: string;
  car_id: number;
  customer_id: string;
  start_date: string;
  end_date: string;
  kabis_reported: boolean;
  invoice_issued: boolean;
  cars: Joined<{ plate_number: string; model_group: Joined<{ name: string }> }>;
  customers: Joined<{ first_name: string | null; last_name: string | null; phone: string | null }>;
}

export async function fetchDayList(list: DayList): Promise<DayListRow[]> {
  const range = dayListRange(list);
  let query = supabase
    .from('bookings')
    .select('id, booking_number, car_id, customer_id, start_date, end_date, kabis_reported, invoice_issued, cars(plate_number, model_group(name)), customers(first_name, last_name, phone)')
    .order('end_date', { ascending: true });
  if (range.startFrom) query = query.gte('start_date', range.startFrom);
  if (range.startBefore) query = query.lt('start_date', range.startBefore);
  if (range.endFrom) query = query.gte('end_date', range.endFrom);
  if (range.endBefore) query = query.lt('end_date', range.endBefore);
  query = range.statuses ? query.in('status', range.statuses) : query.neq('status', 'cancelled');
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as DayListRaw[]).map(({ id, cars, customers, ...row }) => {
    const car = one(cars);
    const person = one(customers);
    return {
      ...row,
      booking_id: id,
      plate_number: car?.plate_number ?? '',
      car_model: one(car?.model_group ?? null)?.name ?? '',
      customer_full_name: [person?.first_name, person?.last_name].filter(Boolean).join(' ') || null,
      customer_phone: person?.phone ?? null,
    };
  });
}
