import { supabase } from './supabase';

const TIME_ZONE = 'Europe/Istanbul';

export type ScheduleKind = 'delivery' | 'pickup';

export interface ScheduleItem {
  id: string;
  kind: ScheduleKind;
  /** When it was actually done. Bookings hold dates only, so a planned time doesn't exist. */
  time: string | null;
  plate: string;
  customer: string;
  location: string | null;
  bookingNumber: string | null;
  done: boolean;
}

export interface AdminHomeData {
  openTasks: number;
  schedule: ScheduleItem[];
}

type Joined<T> = T | T[] | null;

interface BookingRow {
  id: number;
  booking_number: string | null;
  start_date: string;
  end_date: string;
  pickup_location: string | null;
  dropoff_location: string | null;
  cars: Joined<{ plate_number: string }>;
  customers: Joined<{ first_name: string; last_name: string }>;
}

interface OperationRow {
  booking_id: number | null;
  type: string;
  operation_time: string | null;
}

const one = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

/** Today's date in Istanbul as YYYY-MM-DD, whatever the browser's own time zone is. */
export function istanbulToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now);
}

export function istanbulDateLabel(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(now);
}

export function greetingFor(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: 'numeric', hour12: false }).format(now));
  if (hour < 12) return 'Good morning';
  return hour < 18 ? 'Good afternoon' : 'Good evening';
}

export function buildSchedule(today: string, bookings: BookingRow[], operations: OperationRow[]): ScheduleItem[] {
  const done = new Map(operations.map((op) => [`${op.booking_id}|${op.type}`, op.operation_time]));

  const item = (booking: BookingRow, kind: ScheduleKind): ScheduleItem => {
    const key = `${booking.id}|${kind === 'delivery' ? 'DELIVERY' : 'PICKUP'}`;
    const customer = one(booking.customers);
    return {
      id: `${booking.id}-${kind}`,
      kind,
      time: done.get(key)?.slice(0, 5) ?? null,
      plate: one(booking.cars)?.plate_number ?? '—',
      customer: customer ? `${customer.first_name} ${customer.last_name}`.trim() : '—',
      location: (kind === 'delivery' ? booking.pickup_location : booking.dropoff_location) ?? null,
      bookingNumber: booking.booking_number,
      done: done.has(key),
    };
  };

  return bookings.flatMap((booking) => [
    ...(booking.start_date === today ? [item(booking, 'delivery')] : []),
    ...(booking.end_date === today ? [item(booking, 'pickup')] : []),
  ]);
}

function failIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function fetchAdminHome(): Promise<AdminHomeData> {
  const today = istanbulToday();

  const [bookings, operations, tasks] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, booking_number, start_date, end_date, pickup_location, dropoff_location, cars(plate_number), customers(first_name, last_name)')
      .or(`start_date.eq.${today},end_date.eq.${today}`)
      .neq('status', 'cancelled'),
    supabase
      .from('operations')
      .select('booking_id, type, operation_time')
      .eq('operation_date', today)
      .in('type', ['DELIVERY', 'PICKUP'])
      .is('deleted_at', null),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', ['open', 'claimed']),
  ]);

  [bookings, operations, tasks].forEach((r) => failIf(r.error));

  return {
    openTasks: tasks.count ?? 0,
    schedule: buildSchedule(today, (bookings.data ?? []) as BookingRow[], (operations.data ?? []) as OperationRow[]),
  };
}
