import { supabase } from './supabase';

export type SearchGroup = 'Pages' | 'Cars' | 'Bookings' | 'Customers';

export interface SearchResult {
  id: string;
  group: SearchGroup;
  title: string;
  subtitle: string;
  to: string;
}

const LIMIT = 5;

type Joined<T> = T | T[] | null;

interface CarRow {
  id: number;
  plate_number: string;
  model_group: Joined<{ name: string }>;
}

interface CustomerRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
}

interface BookingRow {
  id: number;
  booking_number: string | null;
  start_date: string;
  cars: Joined<{ plate_number: string }>;
  customers: Joined<{ first_name: string; last_name: string }>;
}

const one = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

/** Strips the characters that carry meaning inside a PostgREST `or` filter. */
export function cleanTerm(query: string): string {
  return query.replace(/[,()"\\:*%_]/g, ' ').trim().replace(/\s+/g, ' ');
}

const fullName = (first?: string | null, last?: string | null) => `${first ?? ''} ${last ?? ''}`.trim();

export async function searchRecords(query: string): Promise<SearchResult[]> {
  const term = cleanTerm(query);
  if (term.length < 2) return [];

  // A plate is stored as "34 ABC 123"; someone may well type "34abc".
  const platePattern = `*${term.replace(/\s/g, '*')}*`;
  const firstWord = term.split(' ')[0];
  const wordPattern = `*${firstWord}*`;

  const [models, customers] = await Promise.all([
    supabase
      .from('model_group')
      .select('id')
      .or(`name.ilike.*${term}*,brand.ilike.*${term}*,model.ilike.*${term}*`)
      .limit(20),
    supabase
      .from('customers')
      .select('id, first_name, last_name, phone')
      .or(`first_name.ilike.${wordPattern},last_name.ilike.${wordPattern},phone.ilike.${wordPattern}`)
      .limit(40),
  ]);
  if (models.error) throw new Error(models.error.message);
  if (customers.error) throw new Error(customers.error.message);

  // The filter matched one word, so check the whole phrase against the full name.
  const lowered = term.toLowerCase();
  const matchedCustomers = ((customers.data ?? []) as CustomerRow[]).filter(
    (c) => fullName(c.first_name, c.last_name).toLowerCase().includes(lowered) || (c.phone ?? '').includes(term),
  );

  const modelIds = (models.data ?? []).map((m) => m.id);
  const customerIds = matchedCustomers.map((c) => c.id).slice(0, 20);

  const [cars, bookings] = await Promise.all([
    supabase
      .from('cars')
      .select('id, plate_number, model_group(name)')
      .or([`plate_number.ilike.${platePattern}`, modelIds.length ? `model_group_id.in.(${modelIds.join(',')})` : null].filter(Boolean).join(','))
      .limit(LIMIT),
    supabase
      .from('bookings')
      .select('id, booking_number, start_date, cars(plate_number), customers(first_name, last_name)')
      .or([`booking_number.ilike.*${term}*`, customerIds.length ? `customer_id.in.(${customerIds.join(',')})` : null].filter(Boolean).join(','))
      .order('start_date', { ascending: false })
      .limit(LIMIT),
  ]);
  if (cars.error) throw new Error(cars.error.message);
  if (bookings.error) throw new Error(bookings.error.message);

  return [
    ...((cars.data ?? []) as CarRow[]).map((car): SearchResult => ({
      id: `car-${car.id}`,
      group: 'Cars',
      title: car.plate_number,
      subtitle: one(car.model_group)?.name ?? '',
      to: `/dashboard/cars?q=${encodeURIComponent(car.plate_number)}`,
    })),
    ...((bookings.data ?? []) as BookingRow[]).map((booking): SearchResult => {
      const customer = one(booking.customers);
      return {
        id: `booking-${booking.id}`,
        group: 'Bookings',
        title: booking.booking_number ?? `#${booking.id}`,
        subtitle: [fullName(customer?.first_name, customer?.last_name), one(booking.cars)?.plate_number].filter(Boolean).join(' · '),
        to: `/dashboard/bookings?q=${encodeURIComponent(booking.booking_number ?? '')}&month=${booking.start_date.slice(0, 7)}`,
      };
    }),
    ...matchedCustomers.slice(0, LIMIT).map((customer): SearchResult => {
      const name = fullName(customer.first_name, customer.last_name);
      return {
        id: `customer-${customer.id}`,
        group: 'Customers',
        title: name,
        subtitle: customer.phone ?? '',
        to: `/dashboard/customers?q=${encodeURIComponent(name)}`,
      };
    }),
  ];
}
