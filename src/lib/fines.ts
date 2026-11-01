import { compressImage } from './imageCompression';
import { istanbulDate } from './customers';
import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FineStatus = 'paid' | 'unpaid';
export type FineSegment = 'all' | 'unpaid' | 'paid' | 'unassigned' | 'month';

export interface Fine {
  id: string;
  status: FineStatus;
  plate_number: string;
  violation_number: string;
  customer_name: string | null;
  resolved_customer_name: string | null;
  notification_date: string | null;
  amount: number;
  location: string | null;
  violation_date: string | null;
  violation_time: string | null;
  article: string | null;
  description: string | null;
  fine_image_url: string | null;
  fine_pdf_url: string | null;
  payment_receipt_url: string | null;
  created_at: string;
  car_id: number | null;
  customer_id: string | null;
  violation_code: string | null;
}

export interface FineCar {
  id: number;
  plate_number: string;
  model: string;
  inactive: boolean;
}

export interface BookingOnCar {
  id: number;
  booking_number: string | null;
  customer_id: string | null;
  customer_name: string;
  is_banned: boolean;
  start_date: string;
  end_date: string;
  status: string;
}

export interface FineFields {
  car_id: number | null;
  plate_number: string;
  customer_id: string | null;
  violation_number: string;
  violation_code: string;
  amount: string;
  violation_date: string;
  violation_time: string;
  notification_date: string;
  location: string;
  article: string;
  description: string;
}

export interface FineFiles {
  fineImage: File | null;
  finePdf: File | null;
  receipt: File | null;
}

export type UploadStep = (label: string, done: number, total: number) => void;

// ─── Reads ────────────────────────────────────────────────────────────────────

const BUCKET = 'cezalar';

export async function fetchFines(): Promise<Fine[]> {
  const { data, error } = await supabase
    .from('traffic_fines')
    .select(`
      id, status, plate_number, violation_number, customer_name,
      notification_date, amount, location, violation_date, violation_time,
      article, description, fine_image_url, fine_pdf_url, payment_receipt_url,
      created_at, car_id, customer_id, violation_code
    `)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Fine[];
  const ids = Array.from(new Set(rows.map((row) => row.customer_id).filter(Boolean))) as string[];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: customers } = await supabase.from('customers').select('id, first_name, last_name').in('id', ids);
    ((customers ?? []) as Array<{ id: string; first_name: string; last_name: string }>).forEach((customer) => {
      names.set(customer.id, `${customer.first_name} ${customer.last_name}`.trim());
    });
  }
  return rows.map((row) => ({
    ...row,
    resolved_customer_name: row.customer_id ? names.get(row.customer_id) ?? row.customer_name : row.customer_name,
  }));
}

export async function fetchFineCars(): Promise<FineCar[]> {
  const { data, error } = await supabase.from('cars').select('id, plate_number, is_active, model_group:model_group_id(name)');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<{ id: number; plate_number: string; is_active: boolean; model_group: { name: string } | { name: string }[] | null }>)
    .map((car) => {
      const group = Array.isArray(car.model_group) ? car.model_group[0] : car.model_group;
      return { id: car.id, plate_number: car.plate_number, model: group?.name ?? '—', inactive: !car.is_active };
    });
}

export async function fetchBookingsOnCar(carId: number): Promise<BookingOnCar[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_number, customer_id, start_date, end_date, status, customers(first_name, last_name, is_banned)')
    .eq('car_id', carId)
    .order('start_date', { ascending: false });
  if (error) throw new Error(error.message);
  type Person = { first_name: string; last_name: string; is_banned: boolean | null };
  return ((data ?? []) as unknown as Array<Omit<BookingOnCar, 'customer_name' | 'is_banned'> & { customers: Person | Person[] | null }>)
    .map(({ customers, ...booking }) => {
      const person = Array.isArray(customers) ? customers[0] : customers;
      return {
        ...booking,
        customer_name: person ? `${person.first_name} ${person.last_name}`.trim() : '—',
        is_banned: Boolean(person?.is_banned),
      };
    });
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const inMonth = (day: string | null, month: string) => Boolean(day && day.startsWith(month));

export const thisMonth = () => istanbulDate().slice(0, 7);

/**
 * Who had the car on the day of a fine. Bookings have dates but no times, so two
 * customers can match on a handover day, and both are offered rather than a guess.
 */
export function bookingsCovering(bookings: BookingOnCar[], day: string): BookingOnCar[] {
  if (!day) return [];
  const seen = new Set<string>();
  return bookings.filter((booking) => {
    if (!booking.customer_id || booking.status === 'cancelled') return false;
    if (booking.start_date > day || booking.end_date < day || seen.has(booking.customer_id)) return false;
    seen.add(booking.customer_id);
    return true;
  });
}

export function fineStats(fines: Fine[], month: string = thisMonth()) {
  const sum = (rows: Fine[]) => rows.reduce((total, fine) => total + Number(fine.amount || 0), 0);
  const unpaid = fines.filter((fine) => fine.status === 'unpaid');
  const paid = fines.filter((fine) => fine.status === 'paid');
  const current = fines.filter((fine) => inMonth(fine.violation_date, month));
  const unassigned = fines.filter((fine) => !fine.customer_id);
  return {
    unpaid: { count: unpaid.length, amount: sum(unpaid) },
    paid: { count: paid.length, amount: sum(paid) },
    month: { count: current.length, amount: sum(current) },
    linked: fines.length - unassigned.length,
    unassigned: unassigned.length,
  };
}

export function filterFines(fines: Fine[], segment: FineSegment, search: string, month: string = thisMonth()): Fine[] {
  const query = search.trim().toLowerCase();
  return fines.filter((fine) => {
    if (segment === 'unpaid' && fine.status !== 'unpaid') return false;
    if (segment === 'paid' && fine.status !== 'paid') return false;
    if (segment === 'unassigned' && fine.customer_id) return false;
    if (segment === 'month' && !inMonth(fine.violation_date, month)) return false;
    if (!query) return true;
    return [fine.plate_number, fine.violation_number, fine.resolved_customer_name, fine.customer_name, fine.location]
      .some((field) => (field ?? '').toLowerCase().includes(query));
  });
}

export interface FineDocument {
  key: 'image' | 'pdf' | 'receipt';
  label: string;
  url: string;
}

export function fineDocuments(fine: Pick<Fine, 'fine_image_url' | 'fine_pdf_url' | 'payment_receipt_url'>): FineDocument[] {
  const documents: Array<FineDocument | null> = [
    fine.fine_image_url ? { key: 'image', label: 'Fine image', url: fine.fine_image_url } : null,
    fine.fine_pdf_url ? { key: 'pdf', label: 'Fine PDF', url: fine.fine_pdf_url } : null,
    fine.payment_receipt_url ? { key: 'receipt', label: 'Payment receipt', url: fine.payment_receipt_url } : null,
  ];
  return documents.filter((document): document is FineDocument => document !== null);
}

// ─── Writes ───────────────────────────────────────────────────────────────────

const extensionOf = (file: File) => file.name.split('.').pop();

async function uploadSequence(plate: string): Promise<number> {
  const { count } = await supabase.from('traffic_fines').select('id', { count: 'exact', head: true }).eq('plate_number', plate);
  return (count ?? 0) + 1;
}

async function uploadDocument(folder: string, name: string, file: File): Promise<string> {
  const path = `${folder}/${name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw new Error(`${file.name} didn't upload: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function uploadFineDocuments(plate: string, files: FineFiles, step: UploadStep): Promise<{ fine_image_url?: string; fine_pdf_url?: string }> {
  const total = (files.fineImage ? 1 : 0) + (files.finePdf ? 1 : 0);
  if (total === 0) return {};
  const urls: { fine_image_url?: string; fine_pdf_url?: string } = {};
  const sequence = await uploadSequence(plate);
  let done = 0;
  if (files.fineImage) {
    step('Uploading the fine image…', done, total);
    const image = await compressImage(files.fineImage);
    urls.fine_image_url = await uploadDocument('CZ-R', `CZ-R-${plate}-${sequence}.${extensionOf(image)}`, image);
    done += 1;
  }
  if (files.finePdf) {
    step('Uploading the PDF…', done, total);
    urls.fine_pdf_url = await uploadDocument('CZ-D', `CZ-D-${plate}-${sequence}.${extensionOf(files.finePdf)}`, files.finePdf);
    done += 1;
  }
  return urls;
}

async function uploadReceipt(plate: string, original: File): Promise<string> {
  const { data: existing, error: listError } = await supabase.storage
    .from(BUCKET)
    .list('CZ-F', { limit: 1000, search: `CZ-F-${plate}-` });
  if (listError) throw new Error(`Couldn't check existing receipts: ${listError.message}`);

  const file = await compressImage(original);
  const sequence = (existing?.length ?? 0) + 1;
  const path = `CZ-F/CZ-F-${plate}-${sequence}.${extensionOf(file)?.toLowerCase() ?? 'pdf'}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw new Error(`The receipt didn't upload: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

const editableColumns = (fields: FineFields) => ({
  car_id: fields.car_id,
  plate_number: fields.plate_number,
  violation_number: fields.violation_number.trim(),
  violation_code: fields.violation_code.trim() || null,
  customer_id: fields.customer_id || null,
  amount: parseFloat(fields.amount),
  violation_date: fields.violation_date || null,
  violation_time: fields.violation_time || null,
  notification_date: fields.notification_date || null,
  location: fields.location || null,
  article: fields.article || null,
  description: fields.description || null,
});

/**
 * Marking paid always has to be an update of an unpaid fine: that change is what
 * makes `sync_fine_to_wallet` post the customer's payment and what sends the "paid"
 * message. Nothing is posted for a fine inserted as already paid.
 */
export async function markFinePaid(fine: Pick<Fine, 'id' | 'plate_number' | 'payment_receipt_url'>, receipt: File | null, step?: UploadStep): Promise<void> {
  let payment_receipt_url = fine.payment_receipt_url;
  if (receipt) {
    step?.('Uploading the receipt…', 0, 1);
    payment_receipt_url = await uploadReceipt(fine.plate_number, receipt);
  }
  const { error } = await supabase.from('traffic_fines').update({ status: 'paid', payment_receipt_url }).eq('id', fine.id);
  if (error) throw new Error(error.message);
}

/** Saved as unpaid first even when it's already paid, for the reason above. */
export async function createFine(fields: FineFields, files: FineFiles, status: FineStatus, step: UploadStep): Promise<void> {
  const documents = await uploadFineDocuments(fields.plate_number, files, step);
  step('Saving the fine…', 0, 0);
  const { data, error } = await supabase
    .from('traffic_fines')
    .insert({
      ...editableColumns(fields),
      status: 'unpaid' as FineStatus,
      fine_image_url: documents.fine_image_url ?? null,
      fine_pdf_url: documents.fine_pdf_url ?? null,
      payment_receipt_url: null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  if (status === 'paid') {
    try {
      await markFinePaid({ id: (data as { id: string }).id, plate_number: fields.plate_number, payment_receipt_url: null }, files.receipt, step);
    } catch (paidError) {
      const reason = paidError instanceof Error ? paidError.message : 'Unknown error';
      throw new Error(`The fine was saved as unpaid, but marking it paid failed: ${reason}`);
    }
  }
}

export async function updateFine(fine: Fine, fields: FineFields, files: FineFiles, status: FineStatus, step: UploadStep): Promise<void> {
  const documents = await uploadFineDocuments(fields.plate_number, files, step);
  const receiptOnPaidFine = fine.status === 'paid' && files.receipt
    ? { payment_receipt_url: await uploadReceipt(fields.plate_number, files.receipt) }
    : {};
  step('Saving the fine…', 0, 0);
  const { error } = await supabase
    .from('traffic_fines')
    .update({ ...editableColumns(fields), ...documents, ...receiptOnPaidFine })
    .eq('id', fine.id);
  if (error) throw new Error(error.message);
  if (fine.status === 'unpaid' && status === 'paid') {
    await markFinePaid({ id: fine.id, plate_number: fields.plate_number, payment_receipt_url: fine.payment_receipt_url }, files.receipt, step);
  }
}

export async function linkFineCustomer(fineId: string, customerId: string): Promise<void> {
  const { error } = await supabase.from('traffic_fines').update({ customer_id: customerId }).eq('id', fineId);
  if (error) throw new Error(error.message);
}

export async function deleteFine(fineId: string): Promise<void> {
  const { error } = await supabase.from('traffic_fines').delete().eq('id', fineId);
  if (error) throw new Error(error.message);
}
