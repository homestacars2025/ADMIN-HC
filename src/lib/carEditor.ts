import { daysBetween } from './customers';
import { compressImage } from './imageCompression';
import { ensureFreshSession } from './session';
import { supabase } from './supabase';

/**
 * The Edit Car sheet, shared in spirit with Team: fields save with the Save
 * button, while documents and photos save the moment they're added, replaced,
 * removed or moved.
 *
 * Photos live in `car_photos`, and `cars.car_photo_urls` is kept as a mirror
 * (primary first) for the readers that still use it. Documents keep the paths
 * they've always had in the `doc` bucket: `<prefix>-<PLATE>`.
 */

// ── Expiry ───────────────────────────────────────────────────────────────────

export type ExpiryTone = 'green' | 'amber' | 'red' | 'grey';

export interface ExpiryChip {
  tone: ExpiryTone;
  label: string;
  /** Whole days from today to the date. Null when no date is set. */
  days: number | null;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Green past 60 days, amber from 15 to 60, red under 15 and once it has passed. */
export function expiryChip(date: string | null | undefined, today: string): ExpiryChip {
  if (!date) return { tone: 'grey', label: 'Not set', days: null };
  const days = daysBetween(today, date.slice(0, 10));
  if (days < 0) return { tone: 'red', label: `Expired ${plural(-days, 'day')} ago`, days };
  if (days === 0) return { tone: 'red', label: 'Expires today', days };
  const label = `${plural(days, 'day')} left`;
  if (days < 15) return { tone: 'red', label, days };
  if (days <= 60) return { tone: 'amber', label, days };
  return { tone: 'green', label, days };
}

// ── Documents ────────────────────────────────────────────────────────────────

export type DocColumn = 'ruhsat_url' | 'kasko' | 'insurance_file_url' | 'purchase_contract_url' | 'purchase_invoice_url';

export interface DocSlot {
  column: DocColumn;
  label: string;
  /** The first letter of the object name in the `doc` bucket. */
  prefix: 'R' | 'K' | 'T' | 'S' | 'F';
}

export const DOC_SLOTS: readonly DocSlot[] = [
  { column: 'ruhsat_url', label: 'Ruhsat', prefix: 'R' },
  { column: 'kasko', label: 'Kasko', prefix: 'K' },
  { column: 'insurance_file_url', label: 'Insurance file', prefix: 'T' },
  { column: 'purchase_contract_url', label: 'Purchase contract', prefix: 'S' },
  { column: 'purchase_invoice_url', label: 'Purchase invoice', prefix: 'F' },
];

export const DOC_ACCEPT = 'application/pdf,image/*';

export const normalizePlate = (plate: string) => plate.trim().toUpperCase();

export const docObjectPath = (slot: DocSlot, plate: string) => `${slot.prefix}-${normalizePlate(plate)}`;

/** The same object is overwritten on replace, so the stored link carries a version to skip stale caches. */
export const versionedUrl = (url: string, version: number) => `${url.split('?')[0]}?v=${version}`;

/** The object path inside a public bucket, or null when the link points somewhere else. */
export function storagePathOf(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length).split(/[?#]/)[0];
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export const acceptsDocFile = (file: Pick<File, 'type'>) => file.type === 'application/pdf' || file.type.startsWith('image/');

// ── Photos ───────────────────────────────────────────────────────────────────

export const PHOTO_BUCKET = 'cars-photos';
export const DOC_BUCKET = 'doc';
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_QUALITY = 0.85;

export interface PhotoRow {
  id: number;
  car_id: number;
  file_path: string;
  is_primary: boolean | null;
  sort_order: number | null;
  created_at: string | null;
}

export interface MirrorEntry {
  url: string;
  name: string;
  uploaded_at: string;
}

export interface CarPhoto {
  /** Null until a photo that only exists in the mirror is written to `car_photos`. */
  id: number | null;
  url: string;
  name: string;
  uploadedAt: string;
  /** In a bucket that no longer exists: shown so it can be removed, never used. */
  dead: boolean;
}

/** The old dashboard's bucket. Its links all answer 400 now. */
export const isDeadPhotoUrl = (url: string) => url.includes('/storage/v1/object/public/car_photos/');

export function photoNameOf(url: string): string {
  const last = url.split(/[?#]/)[0].split('/').pop() ?? '';
  let name = last;
  try { name = decodeURIComponent(last); } catch { /* keep it encoded */ }
  return name.replace(/^\d{10,}_/, '') || 'Photo';
}

const rowOrder = (a: PhotoRow, b: PhotoRow) =>
  Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary))
  || (a.sort_order ?? 0) - (b.sort_order ?? 0)
  || a.id - b.id;

/**
 * What the grid shows: the usable rows (primary first, then by sort order), or
 * the mirror's photos when there are none, then the dead rows at the end.
 */
export function buildPhotoList(rows: PhotoRow[], mirror: MirrorEntry[] | null | undefined): CarPhoto[] {
  const sorted = [...rows].sort(rowOrder);
  const toPhoto = (row: PhotoRow): CarPhoto => ({
    id: row.id,
    url: row.file_path,
    name: photoNameOf(row.file_path),
    uploadedAt: row.created_at ?? '',
    dead: isDeadPhotoUrl(row.file_path),
  });
  const usable = sorted.filter((row) => !isDeadPhotoUrl(row.file_path)).map(toPhoto);
  const dead = sorted.filter((row) => isDeadPhotoUrl(row.file_path)).map(toPhoto);
  if (usable.length > 0) return [...usable, ...dead];
  const seeded = (mirror ?? [])
    .filter((entry) => entry && typeof entry.url === 'string' && entry.url)
    .map((entry): CarPhoto => ({ id: null, url: entry.url, name: entry.name || photoNameOf(entry.url), uploadedAt: entry.uploaded_at ?? '', dead: false }));
  return [...seeded, ...dead];
}

/** Usable photos keep their order ahead of dead ones, so the primary is always the first usable photo. */
export const orderPhotos = (photos: CarPhoto[]): CarPhoto[] => [...photos.filter((p) => !p.dead), ...photos.filter((p) => p.dead)];

export const primaryOf = (photos: CarPhoto[]): CarPhoto | null => photos.find((photo) => !photo.dead) ?? null;

export const mirrorOf = (photos: CarPhoto[]): MirrorEntry[] =>
  photos.filter((photo) => !photo.dead).map((photo) => ({ url: photo.url, name: photo.name, uploaded_at: photo.uploadedAt }));

export function movePhoto(photos: CarPhoto[], from: number, to: number): CarPhoto[] {
  if (from === to || from < 0 || to < 0 || from >= photos.length || to >= photos.length) return photos;
  const next = [...photos];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return orderPhotos(next);
}

export function makePrimary(photos: CarPhoto[], url: string): CarPhoto[] {
  const index = photos.findIndex((photo) => photo.url === url);
  if (index <= 0 || photos[index].dead) return photos;
  return movePhoto(photos, index, 0);
}

const sanitizeName = (name: string) => name.replace(/[^\w.-]/g, '_').replace(/_+/g, '_');

export const photoObjectPath = (carId: number, fileName: string, now: number) => `car_${carId}/${now}_${sanitizeName(fileName)}`;

const throwIf = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

/**
 * Writes the grid's order to `car_photos` and the mirror. Primaries are cleared
 * before the new one is set, because only one row per car may be primary.
 * Returns the list with every photo's row id filled in.
 */
export async function persistPhotos(carId: number, photos: CarPhoto[]): Promise<CarPhoto[]> {
  const ordered = orderPhotos(photos);
  throwIf((await supabase.from('car_photos').update({ is_primary: false }).eq('car_id', carId).eq('is_primary', true)).error);

  const saved = await Promise.all(ordered.map(async (photo, index): Promise<CarPhoto> => {
    if (photo.id !== null) {
      throwIf((await supabase.from('car_photos').update({ sort_order: index }).eq('id', photo.id)).error);
      return photo;
    }
    const { data, error } = await supabase
      .from('car_photos')
      .insert({ car_id: carId, file_path: photo.url, sort_order: index, is_primary: false })
      .select('id')
      .single();
    throwIf(error);
    return { ...photo, id: (data as { id: number }).id };
  }));

  const primary = primaryOf(saved);
  if (primary?.id != null) throwIf((await supabase.from('car_photos').update({ is_primary: true }).eq('id', primary.id)).error);
  throwIf((await supabase.from('cars').update({ car_photo_urls: mirrorOf(saved) }).eq('id', carId)).error);
  return saved;
}

/** Removes the row and, for a photo in the live bucket, its file; then writes the new order. */
export async function deletePhoto(carId: number, photos: CarPhoto[], target: CarPhoto): Promise<CarPhoto[]> {
  const rest = photos.filter((photo) => photo !== target);
  if (target.id !== null) throwIf((await supabase.from('car_photos').delete().eq('id', target.id)).error);
  const saved = await persistPhotos(carId, rest);
  const path = storagePathOf(target.url, PHOTO_BUCKET);
  // The row is gone either way; a file left behind costs nothing the user sees.
  if (path) await supabase.storage.from(PHOTO_BUCKET).remove([path]).catch(() => undefined);
  return saved;
}

// ── Uploads ──────────────────────────────────────────────────────────────────

export type ProgressHandler = (fraction: number) => void;

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/**
 * The storage client has no progress events, so this posts the file itself.
 * Same endpoint and headers the client uses.
 */
export async function uploadWithProgress(bucket: string, path: string, file: Blob, options: { upsert: boolean; onProgress?: ProgressHandler }): Promise<string> {
  const token = await ensureFreshSession();
  const base = process.env.REACT_APP_SUPABASE_URL ?? '';
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY ?? '';
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${base}/storage/v1/object/${bucket}/${encodePath(path)}`);
    request.setRequestHeader('Authorization', `Bearer ${token ?? key}`);
    request.setRequestHeader('apikey', key);
    request.setRequestHeader('x-upsert', options.upsert ? 'true' : 'false');
    request.setRequestHeader('cache-control', 'max-age=3600');
    if (file.type) request.setRequestHeader('Content-Type', file.type);
    request.upload.onprogress = (event) => { if (event.lengthComputable) options.onProgress?.(event.loaded / event.total); };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) { options.onProgress?.(1); resolve(); return; }
      let message = `Upload failed (${request.status})`;
      try {
        const body = JSON.parse(request.responseText) as { message?: string; error?: string };
        message = body.message || body.error || message;
      } catch { /* not JSON */ }
      reject(new Error(message));
    };
    request.onerror = () => reject(new Error('Upload failed. Check the connection and try again.'));
    request.onabort = () => reject(new Error('Upload cancelled.'));
    request.send(file);
  });
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function uploadPhoto(carId: number, original: File, onProgress?: ProgressHandler, now: number = Date.now()): Promise<CarPhoto> {
  const file = await compressImage(original, { maxSide: PHOTO_MAX_SIDE, quality: PHOTO_QUALITY, skipBelowBytes: 0 });
  const url = await uploadWithProgress(PHOTO_BUCKET, photoObjectPath(carId, file.name, now), file, { upsert: false, onProgress });
  return { id: null, url, name: original.name, uploadedAt: new Date(now).toISOString(), dead: false };
}

/**
 * Some cars have no registration row yet, so the first write creates it. The
 * sheet runs its writes one at a time, so two uploads can't both create one.
 */
async function setRegistrationColumns(carId: number, values: Record<string, string | number | boolean | null>): Promise<void> {
  const existing = await supabase.from('cars_registration').select('id').eq('car_id', carId).limit(1);
  throwIf(existing.error);
  const { error } = (existing.data ?? []).length > 0
    ? await supabase.from('cars_registration').update(values).eq('car_id', carId)
    : await supabase.from('cars_registration').insert({ car_id: carId, ...values });
  throwIf(error);
}

export async function uploadDoc(
  carId: number,
  slot: DocSlot,
  plate: string,
  original: File,
  onProgress?: ProgressHandler,
  now: number = Date.now(),
): Promise<string> {
  const file = original.type.startsWith('image/') ? await compressImage(original) : original;
  const url = versionedUrl(await uploadWithProgress(DOC_BUCKET, docObjectPath(slot, plate), file, { upsert: true, onProgress }), now);
  await setRegistrationColumns(carId, { [slot.column]: url });
  return url;
}

export async function removeDoc(carId: number, slot: DocSlot, url: string): Promise<void> {
  await setRegistrationColumns(carId, { [slot.column]: null });
  const path = storagePathOf(url, DOC_BUCKET);
  if (path) await supabase.storage.from(DOC_BUCKET).remove([path]).catch(() => undefined);
}

// ── Fields ───────────────────────────────────────────────────────────────────

export interface CarFields {
  plate: string;
  modelGroupId: string;
  investorId: string;
  manufactureYear: string;
  carPackage: string;
  insuranceExpiry: string;
  inspectionExpiry: string;
  purchaseDate: string;
  /** 'true' or 'false', so every field compares the same way. */
  hasSpareKey: string;
}

export type FieldKey = keyof CarFields;

export const CAR_COLUMNS: Partial<Record<FieldKey, string>> = { plate: 'plate_number', modelGroupId: 'model_group_id', investorId: 'investor_id' };

export const REGISTRATION_COLUMNS: Partial<Record<FieldKey, string>> = {
  manufactureYear: 'manufacture_year',
  carPackage: 'car_package',
  insuranceExpiry: 'insurance_expiry',
  inspectionExpiry: 'inspection_expiry',
  purchaseDate: 'purchase_date',
  hasSpareKey: 'has_spare_key',
};

export const changedFields = (current: CarFields, baseline: CarFields): FieldKey[] =>
  (Object.keys(current) as FieldKey[]).filter((key) => current[key].trim() !== baseline[key].trim());

export function validateFields(fields: CarFields, thisYear: number): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  if (!fields.plate.trim()) errors.plate = 'Plate number is required.';
  const year = fields.manufactureYear.trim();
  if (year && (!/^\d{4}$/.test(year) || Number(year) < 1980 || Number(year) > thisYear + 1)) {
    errors.manufactureYear = `Enter a year between 1980 and ${thisYear + 1}.`;
  }
  return errors;
}

type ColumnValue = string | number | boolean | null;

function columnValue(key: FieldKey, value: string): ColumnValue {
  const text = value.trim();
  if (key === 'hasSpareKey') return text === 'true';
  if (!text) return null;
  if (key === 'plate') return normalizePlate(text);
  if (key === 'modelGroupId' || key === 'manufactureYear') return Number(text);
  return text;
}

/** Only the changed columns, so a save never overwrites a document saved a moment ago. */
export function fieldUpdates(current: CarFields, baseline: CarFields): { car: Record<string, ColumnValue>; registration: Record<string, ColumnValue> } {
  const car: Record<string, ColumnValue> = {};
  const registration: Record<string, ColumnValue> = {};
  for (const key of changedFields(current, baseline)) {
    if (CAR_COLUMNS[key]) car[CAR_COLUMNS[key] as string] = columnValue(key, current[key]);
    if (REGISTRATION_COLUMNS[key]) registration[REGISTRATION_COLUMNS[key] as string] = columnValue(key, current[key]);
  }
  return { car, registration };
}

export async function saveFields(carId: number, current: CarFields, baseline: CarFields): Promise<void> {
  const { car, registration } = fieldUpdates(current, baseline);
  if (Object.keys(car).length > 0) {
    const { data, error } = await supabase.from('cars').update(car).eq('id', carId).select('id');
    throwIf(error);
    if (!data || data.length === 0) throw new Error("This car couldn't be found. Refresh and try again.");
  }
  if (Object.keys(registration).length > 0) await setRegistrationColumns(carId, registration);
}

// ── Spare key filter ─────────────────────────────────────────────────────────

export type SpareKeyFilter = 'yes' | 'no';

export const SPARE_KEY_PARAM = 'spare_key';

export const parseSpareKeyFilter = (value: string | null): SpareKeyFilter | null => (value === 'yes' || value === 'no' ? value : null);

/** A car with no registration row has no spare key on record. */
export const matchesSpareKey = (hasSpareKey: boolean | null | undefined, filter: SpareKeyFilter | null) =>
  filter === null || (filter === 'yes') === Boolean(hasSpareKey);
