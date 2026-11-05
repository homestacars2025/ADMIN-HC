import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog, type ConfirmState } from '../../components/media/ConfirmDialog';
import { Check, ExternalLink, Trash2, X } from '../../components/media/MediaIcons';
import { Button, Spinner } from '../../components/media/MediaUI';
import { CarIcon3D, type CarIcon3DName } from '../../components/shared/Icon3D';
import { Lightbox } from '../../components/shared/Lightbox';
import {
  acceptsDocFile,
  changedFields,
  buildPhotoList,
  deletePhoto,
  DOC_ACCEPT,
  DOC_SLOTS,
  expiryChip,
  makePrimary,
  movePhoto,
  orderPhotos,
  persistPhotos,
  primaryOf,
  removeDoc,
  saveFields,
  uploadDoc,
  uploadPhoto,
  validateFields,
  type CarFields,
  type CarPhoto,
  type DocColumn,
  type DocSlot,
  type ExpiryTone,
  type FieldKey,
  type MirrorEntry,
  type PhotoRow,
} from '../../lib/carEditor';
import type { ComplianceDoc } from '../../lib/carCompliance';
import { istanbulDate } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import { supabase } from '../../lib/supabase';
import { BookingSheet, Field, FOOTER_BUTTON, INPUT, LicensePlate, Notice, PrimaryButton } from '../bookings/ui';

// ── Data ─────────────────────────────────────────────────────────────────────

interface Option { id: string; name: string }

interface Loaded {
  fields: CarFields;
  docs: Record<DocColumn, string | null>;
  photos: CarPhoto[];
  models: Option[];
  investors: Option[];
}

const EMPTY_DOCS: Record<DocColumn, string | null> = {
  ruhsat_url: null, kasko: null, insurance_file_url: null, purchase_contract_url: null, purchase_invoice_url: null,
};

const text = (value: unknown) => (value == null ? '' : String(value));

async function loadCar(carId: number): Promise<Loaded> {
  const [carRes, regRes, photoRes, modelRes, investorRes] = await Promise.all([
    supabase.from('cars').select('id, plate_number, investor_id, model_group_id, car_photo_urls').eq('id', carId).single(),
    supabase.from('cars_registration').select('*').eq('car_id', carId).limit(1),
    supabase.from('car_photos').select('id, car_id, file_path, is_primary, sort_order, created_at').eq('car_id', carId),
    supabase.from('model_group').select('id, name').order('name'),
    supabase.from('investors').select('id, profiles!fk_investor_profile(full_name)'),
  ]);
  const failed = carRes.error ?? regRes.error ?? photoRes.error ?? modelRes.error ?? investorRes.error;
  if (failed) throw new Error(failed.message);

  const car = carRes.data as { plate_number: string | null; investor_id: string | null; model_group_id: number | null; car_photo_urls: MirrorEntry[] | null };
  const reg = ((regRes.data ?? [])[0] ?? {}) as Record<string, unknown>;
  const investors = ((investorRes.data ?? []) as unknown as { id: string; profiles: { full_name: string | null } | null }[])
    .map((row) => ({ id: String(row.id), name: row.profiles?.full_name || '—' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    fields: {
      plate: text(car.plate_number),
      modelGroupId: text(car.model_group_id),
      investorId: text(car.investor_id),
      manufactureYear: text(reg.manufacture_year),
      carPackage: text(reg.car_package),
      insuranceExpiry: text(reg.insurance_expiry).slice(0, 10),
      inspectionExpiry: text(reg.inspection_expiry).slice(0, 10),
      purchaseDate: text(reg.purchase_date).slice(0, 10),
      hasSpareKey: reg.has_spare_key === true ? 'true' : 'false',
    },
    docs: Object.fromEntries(DOC_SLOTS.map((slot) => [slot.column, (reg[slot.column] as string | null) || null])) as Record<DocColumn, string | null>,
    photos: buildPhotoList((photoRes.data ?? []) as PhotoRow[], Array.isArray(car.car_photo_urls) ? car.car_photo_urls : []),
    models: ((modelRes.data ?? []) as { id: number; name: string }[]).map((row) => ({ id: String(row.id), name: row.name })),
    investors,
  };
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.');

/** One write at a time: two uploads must not both create the registration row. */
function useWriteQueue() {
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  return useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = tail.current.then(job, job);
    tail.current = run.catch(() => undefined);
    return run;
  }, []);
}

// ── Small parts ──────────────────────────────────────────────────────────────

const SMALL_BUTTON =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] border border-subtle bg-surface px-3 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 disabled:cursor-not-allowed disabled:opacity-50 md:h-8 md:px-2.5';

const Section: React.FC<{ icon: CarIcon3DName; title: string; hint?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }> = ({ icon, title, hint, action, children }) => (
  <section className="surface-depth rounded-2xl border border-subtle bg-surface p-4 sm:p-5" aria-label={title}>
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <CarIcon3D name={icon} size={44} className="-my-1" />
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
          {hint && <p className="truncate text-[12px] text-black/50">{hint}</p>}
        </div>
      </div>
      {action}
    </div>
    {children}
  </section>
);

const CHIP_TONE: Record<ExpiryTone, string> = {
  green: 'bg-[#16A34A]/[0.1] text-[#15803D]',
  amber: 'bg-[#F59E0B]/[0.14] text-[#B45309]',
  red: 'bg-[#DC2626]/[0.1] text-[#B91C1C]',
  grey: 'bg-black/[0.05] text-black/50',
};

const ExpiryCard: React.FC<{
  label: string;
  value: string;
  today: string;
  highlight: boolean;
  changed: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}> = ({ label, value, today, highlight, changed, inputRef, onChange }) => {
  const chip = expiryChip(value, today);
  return (
    <div className={cn('min-w-0 rounded-xl border p-3', highlight ? 'border-[#F59E0B]/60 bg-[#F59E0B]/[0.06]' : 'border-subtle bg-black/[0.015]')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-black/65">
          {label}
          {changed && <span title="Changed" aria-label="Changed" className="h-1.5 w-1.5 rounded-full bg-[#6EA4E7]" />}
        </span>
        <span data-tone={chip.tone} className={cn('inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11.5px] font-semibold tabular-nums', CHIP_TONE[chip.tone])}>
          {chip.label}
        </span>
      </div>
      <input ref={inputRef} type="date" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={INPUT} />
    </div>
  );
};

const FileGlyph: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
    <path d="M14 2v6h6M8 13h8M8 17h5" />
  </svg>
);

const UploadGlyph: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

const StarGlyph: React.FC<{ filled: boolean }> = ({ filled }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1 6L12 17l-5.35 2.85 1-6L3.3 9.6l6-.9L12 3.2z" />
  </svg>
);

const GripGlyph: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {[6, 12, 18].map((y) => <React.Fragment key={y}><circle cx="9" cy={y} r="1.6" /><circle cx="15" cy={y} r="1.6" /></React.Fragment>)}
  </svg>
);

const ProgressBar: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.07]">
    <div className="h-full rounded-full bg-[#6EA4E7] transition-[width] duration-200" style={{ width: `${Math.max(4, value * 100)}%` }} />
  </div>
);

function useFileDrop(onFiles: (files: File[]) => void, disabled: boolean) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (event: React.DragEvent) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        if (!disabled) setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: React.DragEvent) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setOver(false);
        if (!disabled) onFiles(Array.from(event.dataTransfer.files));
      },
    },
  };
}

/** Apple's switch: 51×31, green when on, the thumb sliding across (mirrored right to left). */
export const IosSwitch: React.FC<{ id?: string; checked: boolean; labelledBy?: string; describedBy?: string; onChange: (checked: boolean) => void }> = ({ id, checked, labelledBy, describedBy, onChange }) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    onClick={() => onChange(!checked)}
    className="ios-switch relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-[2px] outline-none transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/50"
    style={{ background: checked ? '#34C759' : '#E9E9EB' }}
  >
    <span
      aria-hidden="true"
      className="block h-[27px] w-[27px] rounded-full bg-white transition-transform duration-200 [transition-timing-function:cubic-bezier(.4,0,.2,1)] rtl:[--ios-dir:-1]"
      style={{
        boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)',
        transform: `translateX(calc(${checked ? 20 : 0}px * var(--ios-dir, 1)))`,
      }}
    />
  </button>
);

const SpareKeyRow: React.FC<{ checked: boolean; changed: boolean; onChange: (checked: boolean) => void }> = ({ checked, changed, onChange }) => (
  // The whole row is a 44px+ target; the switch itself carries the state.
  <div
    className="mt-3.5 flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border border-subtle bg-black/[0.015] px-3 py-2"
    onClick={(event) => { if (!(event.target as HTMLElement).closest('[role="switch"]')) onChange(!checked); }}
  >
    <CarIcon3D name="key" size={40} />
    <div className="min-w-0 flex-1">
      <div id="spare-key-label" className="flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
        Spare key
        {changed && <span title="Changed" aria-label="Changed" className="h-1.5 w-1.5 rounded-full bg-[#6EA4E7]" />}
      </div>
      <div id="spare-key-caption" className="text-[12px] text-black/50">Is there a spare key for this car?</div>
    </div>
    <IosSwitch checked={checked} labelledBy="spare-key-label" describedBy="spare-key-caption" onChange={onChange} />
  </div>
);

// ── Documents ────────────────────────────────────────────────────────────────

const DocThumb: React.FC<{ url: string }> = ({ url }) => {
  // The stored names have no extension, so an image is whatever loads as one.
  const [isImage, setIsImage] = useState(true);
  if (!isImage) return <span className="text-brand-strong"><FileGlyph /></span>;
  return <img src={url} alt="" loading="lazy" onError={() => setIsImage(false)} className="h-full w-full object-cover" />;
};

const SAVED_FOR_MS = 4000;
const SAVED_FADE_MS = 400;

type SavedState = 'on' | 'fading';

/** "Saved ✓" on the tile that just saved, for about four seconds. */
const SavedBadge: React.FC<{ state: SavedState; className?: string }> = ({ state, className }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full border border-[#067647]/20 bg-[#ECFDF3] px-2 py-0.5 text-[11.5px] font-semibold text-[#067647] transition-opacity duration-[400ms]',
      state === 'fading' ? 'opacity-0' : 'opacity-100',
      className,
    )}
  >
    Saved <Check size={11} strokeWidth={3} />
  </span>
);

const DocCard: React.FC<{
  slot: DocSlot;
  url: string | null;
  progress: number | null;
  error: string | null;
  saved: SavedState | null;
  disabled: boolean;
  onUpload: (file: File) => void;
  onRemove: () => Promise<void>;
}> = ({ slot, url, progress, error, saved, disabled, onUpload, onRemove }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [rejected, setRejected] = useState(false);
  const busy = progress !== null || removing;

  const pick = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const ok = acceptsDocFile(file);
    setRejected(!ok);
    if (ok) onUpload(file);
  };
  const { over, handlers } = useFileDrop(pick, disabled || busy);
  const browse = () => inputRef.current?.click();

  const remove = async () => {
    setRemoving(true);
    try { await onRemove(); setConfirming(false); } finally { setRemoving(false); }
  };

  return (
    <div
      {...handlers}
      role="group"
      aria-label={slot.label}
      data-doc={slot.column}
      className={cn(
        'flex min-w-0 flex-col rounded-xl border p-3 transition-colors',
        over ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.08]' : url ? 'border-subtle bg-surface' : 'border-dashed border-[#F59E0B]/45 bg-[#F59E0B]/[0.04]',
      )}
    >
      <input ref={inputRef} type="file" accept={DOC_ACCEPT} aria-label={`Upload ${slot.label}`} className="hidden" onChange={(event) => { pick(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          onClick={url ? () => window.open(url, '_blank', 'noopener') : browse}
          disabled={disabled || busy}
          aria-label={url ? `View ${slot.label}` : `Upload ${slot.label}`}
          className={cn('grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg', url ? 'bg-black/[0.04]' : 'bg-white text-black/35')}
        >
          {url ? <DocThumb url={url} /> : <UploadGlyph />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-foreground">{slot.label}</div>
          {url ? (
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#16A34A]/[0.1] px-2 py-0.5 text-[11.5px] font-semibold text-[#15803D]">
                <Check size={11} strokeWidth={3} /> Uploaded
              </span>
              {saved && <SavedBadge state={saved} />}
            </span>
          ) : (
            <span className="mt-1 inline-flex items-center rounded-full bg-[#F59E0B]/[0.14] px-2 py-0.5 text-[11.5px] font-semibold text-[#B45309]">Missing</span>
          )}
        </div>
      </div>

      <div className="mt-auto pt-3">
        {progress !== null ? (
          <div className="flex items-center gap-2 text-[12px] text-black/55">
            <ProgressBar value={progress} label={`Uploading ${slot.label}`} />
            <span className="w-9 shrink-0 text-right tabular-nums">{Math.round(progress * 100)}%</span>
          </div>
        ) : confirming ? (
          <div role="group" aria-label={`Remove ${slot.label}?`} className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-medium text-[#B91C1C]">Remove {slot.label}?</span>
            <span className="ms-auto flex gap-1.5">
              <button type="button" className={SMALL_BUTTON} disabled={removing} onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" className={cn(SMALL_BUTTON, 'border-[#DC2626]/30 text-[#B91C1C] hover:bg-[#DC2626]/[0.06]')} disabled={removing} onClick={remove}>
                {removing && <Spinner size={12} />} Remove
              </button>
            </span>
          </div>
        ) : url ? (
          <div className="flex flex-wrap gap-1.5">
            <a href={url} target="_blank" rel="noreferrer" className={SMALL_BUTTON}><ExternalLink size={12} /> View</a>
            <button type="button" className={SMALL_BUTTON} disabled={disabled} onClick={browse}>Replace</button>
            <button type="button" className={cn(SMALL_BUTTON, 'text-[#B91C1C]')} disabled={disabled} onClick={() => setConfirming(true)}>Remove</button>
          </div>
        ) : (
          <button type="button" className={cn(SMALL_BUTTON, 'w-full')} disabled={disabled} onClick={browse}>
            <span className="md:hidden">Tap to upload</span>
            <span className="hidden md:inline">Upload or drop a file</span>
          </button>
        )}
        {(error || rejected) && <p role="alert" className="mt-1.5 text-[12px] text-[#B91C1C]">{error ?? 'Use a PDF or an image.'}</p>}
      </div>
    </div>
  );
};

// ── Photos ───────────────────────────────────────────────────────────────────

interface PendingUpload { key: string; name: string; progress: number; preview: string | null; error: string | null }

const PhotoTile: React.FC<{
  photo: CarPhoto;
  index: number;
  count: number;
  isPrimary: boolean;
  saved: SavedState | null;
  dragging: boolean;
  target: boolean;
  disabled: boolean;
  onView: () => void;
  onPrimary: () => void;
  onDelete: () => void;
  onGrab: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onNudge: (by: number) => void;
}> = ({ photo, index, count, isPrimary, saved, dragging, target, disabled, onView, onPrimary, onDelete, onGrab, onNudge }) => {
  const [broken, setBroken] = useState(false);
  const unavailable = photo.dead || broken;
  return (
    <div
      data-photo-index={index}
      className={cn(
        'group relative aspect-[4/3] overflow-hidden rounded-xl border bg-black/[0.04] transition-[opacity,box-shadow]',
        dragging && 'opacity-40',
        target ? 'border-[#6EA4E7] ring-[3px] ring-[#6EA4E7]/35' : 'border-subtle',
      )}
    >
      {unavailable ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-[12px] text-black/45">
          <FileGlyph size={20} />
          Image unavailable
        </div>
      ) : (
        <button type="button" onClick={onView} aria-label={`View photo ${index + 1}`} className="block h-full w-full">
          <img src={photo.url} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} className="h-full w-full object-cover" />
        </button>
      )}

      {isPrimary && (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
          <StarGlyph filled /> Primary
        </span>
      )}
      {saved && <SavedBadge state={saved} className="pointer-events-none absolute bottom-1.5 right-1.5 shadow-sm" />}

      <div className="absolute inset-x-0 top-0 flex justify-between">
        {!photo.dead ? (
          <button
            type="button"
            aria-label={`Move photo ${index + 1}. Drag, or use the arrow keys.`}
            disabled={disabled || count < 2}
            onPointerDown={onGrab}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); onNudge(-1); }
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); onNudge(1); }
            }}
            className="grid h-11 w-11 cursor-grab touch-none place-items-center text-white active:cursor-grabbing disabled:cursor-default disabled:opacity-0"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-black/55"><GripGlyph /></span>
          </button>
        ) : <span />}
        <span className="flex">
          {!unavailable && !isPrimary && (
            <button type="button" aria-label={`Set photo ${index + 1} as primary`} title="Set as primary" disabled={disabled} onClick={onPrimary} className="grid h-11 w-11 place-items-center text-white">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-black/55 hover:bg-[#F59E0B]"><StarGlyph filled={false} /></span>
            </button>
          )}
          <button type="button" aria-label={`Delete photo ${index + 1}`} title="Delete" disabled={disabled} onClick={onDelete} className="grid h-11 w-11 place-items-center text-white">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-black/55 hover:bg-[#DC2626]"><Trash2 size={13} /></span>
          </button>
        </span>
      </div>
    </div>
  );
};

const UploadTile: React.FC<{ upload: PendingUpload; onDismiss: () => void }> = ({ upload, onDismiss }) => (
  <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-subtle bg-black/[0.04]">
    {upload.preview && <img src={upload.preview} alt="" className={cn('h-full w-full object-cover', !upload.error && 'opacity-60')} />}
    <div className="absolute inset-x-2 bottom-2">
      {upload.error ? (
        <p role="alert" className="rounded-md bg-white/95 px-2 py-1 text-[11.5px] leading-snug text-[#B91C1C]">{upload.name}: {upload.error}</p>
      ) : (
        <ProgressBar value={upload.progress} label={`Uploading ${upload.name}`} />
      )}
    </div>
    {upload.error && (
      <button type="button" aria-label={`Dismiss ${upload.name}`} onClick={onDismiss} className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-white">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-black/55"><X size={13} /></span>
      </button>
    )}
  </div>
);

/** Says out loud that files and photos don't wait for Save. */
const SaveHint: React.FC<{ uploading: boolean; unsaved: number; className?: string }> = ({ uploading, unsaved, className }) => (
  unsaved > 0 && !uploading ? (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#F59E0B]/[0.14] px-2.5 py-1 text-[12.5px] font-medium text-[#B45309]', className)}>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#F59E0B]" />
      {unsaved} unsaved {unsaved === 1 ? 'change' : 'changes'}
    </span>
  ) : (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#ECFDF3] px-2.5 py-1 text-[12.5px] font-medium text-[#067647]', className)}>
      {uploading ? <Spinner size={12} /> : <Check size={13} strokeWidth={3} className="shrink-0" />}
      <span className="truncate">{uploading ? 'Saving photos & files…' : 'Photos & files save automatically'}</span>
    </span>
  )
);

// ── Sheet ────────────────────────────────────────────────────────────────────

const deleteState = (photo: CarPhoto): ConfirmState => ({
  title: 'Delete this photo?',
  description: photo.dead ? 'Its file no longer exists, so this only removes the empty tile.' : 'The photo is removed from this car and its file is deleted.',
  confirmLabel: 'Delete',
  onConfirm: async () => undefined,
});

const FIELD_LABELS: Record<FieldKey, string> = {
  plate: 'Plate number',
  modelGroupId: 'Model group',
  investorId: 'Investor',
  manufactureYear: 'Manufacture year',
  carPackage: 'Car package',
  insuranceExpiry: 'Insurance expiry',
  inspectionExpiry: 'Inspection expiry',
  purchaseDate: 'Purchase date',
  hasSpareKey: 'Spare key',
};

export const EditCarSheet: React.FC<{
  carId: number;
  /** Dates to go straight to, when the sheet was opened to fix them. */
  focusDocs?: ComplianceDoc[];
  /** `changed` is true when anything was written, so the list can refresh. */
  onClose: (changed: boolean) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}> = ({ carId, focusDocs = [], onClose, showToast }) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [fields, setFields] = useState<CarFields | null>(null);
  const [baseline, setBaseline] = useState<CarFields | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [docs, setDocs] = useState<Record<DocColumn, string | null>>(EMPTY_DOCS);
  const [docProgress, setDocProgress] = useState<Partial<Record<DocColumn, number>>>({});
  const [docErrors, setDocErrors] = useState<Partial<Record<DocColumn, string>>>({});

  const [photos, setPhotos] = useState<CarPhoto[]>([]);
  const photosRef = useRef<CarPhoto[]>([]);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CarPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Tiles that just saved: `doc:<column>` or `photo:<url>`.
  const [justSaved, setJustSaved] = useState<Record<string, SavedState>>({});
  const savedTimers = useRef<number[]>([]);
  useEffect(() => () => savedTimers.current.forEach((timer) => window.clearTimeout(timer)), []);
  const flashSaved = useCallback((key: string) => {
    setJustSaved((current) => ({ ...current, [key]: 'on' }));
    savedTimers.current.push(
      window.setTimeout(() => setJustSaved((current) => (current[key] ? { ...current, [key]: 'fading' } : current)), SAVED_FOR_MS - SAVED_FADE_MS),
      window.setTimeout(() => setJustSaved((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      }), SAVED_FOR_MS),
    );
  }, []);
  const [yearTouched, setYearTouched] = useState(false);

  const wrote = useRef(false);
  const enqueue = useWriteQueue();
  const today = useMemo(() => istanbulDate(), []);
  const insuranceRef = useRef<HTMLInputElement>(null);
  const inspectionRef = useRef<HTMLInputElement>(null);
  const firstFocus = focusDocs[0];

  const showPhotos = useCallback((next: CarPhoto[]) => { photosRef.current = next; setPhotos(next); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    loadCar(carId).then(
      (data) => {
        if (cancelled) return;
        setLoaded(data);
        setFields(data.fields);
        setBaseline(data.fields);
        setDocs(data.docs);
        showPhotos(data.photos);
      },
      (error: unknown) => { if (!cancelled) setLoadError(errorText(error)); },
    );
    return () => { cancelled = true; };
  }, [carId, attempt, showPhotos]);

  useEffect(() => {
    if (!loaded || !firstFocus) return;
    const input = firstFocus === 'insurance' ? insuranceRef.current : inspectionRef.current;
    input?.scrollIntoView({ block: 'center' });
    input?.focus({ preventScroll: true });
  }, [loaded, firstFocus]);

  // Revoke upload previews when the sheet goes away.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const changed = fields && baseline ? changedFields(fields, baseline) : [];
  const dirty = changed.length > 0;
  const yearError = fields ? validateFields(fields, Number(today.slice(0, 4))).manufactureYear : undefined;
  // Shown while typing only once all four digits are in, so "20" isn't flagged on the way to "2024".
  const shownYearError = fieldErrors.manufactureYear ?? (yearError && (yearTouched || fields?.manufactureYear.length === 4) ? yearError : undefined);
  const uploading = Object.keys(docProgress).length > 0 || uploads.some((upload) => !upload.error) || photoBusy || deleting;

  const set = (key: FieldKey, value: string) => {
    setFields((current) => (current ? { ...current, [key]: value } : current));
    setFieldErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const close = () => onClose(wrote.current);

  // ── Documents

  const uploadDocFile = (slot: DocSlot, file: File) => {
    if (!fields) return;
    const plate = baseline?.plate || fields.plate;
    setDocErrors((current) => ({ ...current, [slot.column]: undefined }));
    setDocProgress((current) => ({ ...current, [slot.column]: 0 }));
    enqueue(() => uploadDoc(carId, slot, plate, file, (fraction) => setDocProgress((current) => ({ ...current, [slot.column]: fraction }))))
      .then((url) => {
        wrote.current = true;
        setDocs((current) => ({ ...current, [slot.column]: url }));
        flashSaved(`doc:${slot.column}`);
        showToast(`${slot.label} saved`, 'success');
      })
      .catch((error: unknown) => setDocErrors((current) => ({ ...current, [slot.column]: errorText(error) })))
      .finally(() => setDocProgress((current) => {
        const next = { ...current };
        delete next[slot.column];
        return next;
      }));
  };

  const removeDocFile = async (slot: DocSlot) => {
    const url = docs[slot.column];
    if (!url) return;
    setDocErrors((current) => ({ ...current, [slot.column]: undefined }));
    try {
      await enqueue(() => removeDoc(carId, slot, url));
      wrote.current = true;
      setDocs((current) => ({ ...current, [slot.column]: null }));
      showToast(`${slot.label} removed`, 'success');
    } catch (error) {
      setDocErrors((current) => ({ ...current, [slot.column]: errorText(error) }));
    }
  };

  // ── Photos

  const reloadPhotos = useCallback(async () => {
    const [rows, car] = await Promise.all([
      supabase.from('car_photos').select('id, car_id, file_path, is_primary, sort_order, created_at').eq('car_id', carId),
      supabase.from('cars').select('car_photo_urls').eq('id', carId).single(),
    ]);
    if (rows.error || car.error) return;
    const mirror = (car.data as { car_photo_urls: MirrorEntry[] | null }).car_photo_urls;
    showPhotos(buildPhotoList((rows.data ?? []) as PhotoRow[], Array.isArray(mirror) ? mirror : []));
  }, [carId, showPhotos]);

  /** Shows the new order at once, then writes it; a failed write puts back what's really saved. True once saved. */
  const commitPhotos = (next: CarPhoto[], failure: string): Promise<boolean> => {
    showPhotos(next);
    setPhotoBusy(true);
    return enqueue(() => persistPhotos(carId, photosRef.current))
      .then((saved) => { wrote.current = true; showPhotos(saved); return true; })
      .catch(async (error: unknown) => { showToast(`${failure}: ${errorText(error)}`, 'error'); await reloadPhotos(); return false; })
      .finally(() => setPhotoBusy(false));
  };

  const addPhotos = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length < files.length) showToast('Only images can be added as photos.', 'error');
    const batch = images.map((file, index): PendingUpload => {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      return { key: `${Date.now()}-${index}-${file.name}`, name: file.name, progress: 0, preview, error: null };
    });
    if (batch.length === 0) return;
    setUploads((current) => [...current, ...batch]);
    const patch = (key: string, change: Partial<PendingUpload>) =>
      setUploads((current) => current.map((upload) => (upload.key === key ? { ...upload, ...change } : upload)));

    for (let index = 0; index < images.length; index += 1) {
      const { key } = batch[index];
      try {
        const photo = await uploadPhoto(carId, images[index], (fraction) => patch(key, { progress: fraction }));
        setUploads((current) => current.filter((upload) => upload.key !== key));
        if (await commitPhotos(orderPhotos([...photosRef.current, photo]), "The photo uploaded but couldn't be added")) {
          flashSaved(`photo:${photo.url}`);
          showToast('Photo saved', 'success');
        }
      } catch (error) {
        patch(key, { error: errorText(error) });
      }
    }
  };

  const { over: photoOver, handlers: photoDrop } = useFileDrop((files) => { void addPhotos(files); }, saving);

  const reorder = (from: number, to: number) => {
    const next = movePhoto(photosRef.current, from, to);
    if (next !== photosRef.current) void commitPhotos(next, "The new order couldn't be saved");
  };

  const grab = (index: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    let over = index;
    setDrag({ from: index, over });
    const move = (moveEvent: PointerEvent) => {
      const tile = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('[data-photo-index]');
      const at = tile ? Number(tile.getAttribute('data-photo-index')) : over;
      const usable = photosRef.current.filter((photo) => !photo.dead).length;
      if (Number.isFinite(at) && at < usable && at !== over) { over = at; setDrag({ from: index, over }); }
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      setDrag(null);
      reorder(index, over);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const nudge = (index: number, by: number) => {
    const usable = photosRef.current.filter((photo) => !photo.dead).length;
    const to = Math.min(usable - 1, Math.max(0, index + by));
    reorder(index, to);
    // Keep the keyboard on the photo that moved.
    requestAnimationFrame(() => (document.querySelector(`[data-photo-index="${to}"] button[aria-label^="Move photo"]`) as HTMLButtonElement | null)?.focus());
  };

  const confirmPhotoDelete = async () => {
    const target = confirmDelete;
    if (!target) return;
    setDeleting(true);
    try {
      const saved = await enqueue(() => deletePhoto(carId, photosRef.current, target));
      wrote.current = true;
      showPhotos(saved);
      showToast('Photo deleted', 'success');
      setConfirmDelete(null);
    } catch (error) {
      showToast(`The photo couldn't be deleted: ${errorText(error)}`, 'error');
      await reloadPhotos();
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  // ── Save

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fields || !baseline || saving) return;
    setSaveError(null);
    const errors = validateFields(fields, Number(today.slice(0, 4)));
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => document.querySelector('[data-field-error="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    if (!dirty) { close(); return; }
    setSaving(true);
    try {
      await enqueue(() => saveFields(carId, fields, baseline));
      wrote.current = true;
      showToast('Car saved', 'success');
      onClose(true);
    } catch (error) {
      setSaveError(errorText(error));
      setSaving(false);
    }
  };

  const model = loaded?.models.find((option) => option.id === fields?.modelGroupId)?.name;
  const investor = loaded?.investors.find((option) => option.id === fields?.investorId)?.name;
  const usableCount = photos.filter((photo) => !photo.dead).length;
  const primary = primaryOf(photos);
  const lightboxItems = photos.filter((photo) => !photo.dead).map((photo, index) => ({ url: photo.url, label: `Photo ${index + 1}` }));
  const missingDocs = DOC_SLOTS.filter((slot) => !docs[slot.column]).length;

  return (
    <BookingSheet
      label="Edit car"
      title={loaded ? model ?? 'No model group' : 'Edit car'}
      badge={fields?.plate ? <LicensePlate plate={baseline?.plate || fields.plate} className="[&>span:last-child]:text-[13px]" /> : undefined}
      subtitle={loaded ? (investor ? `Investor · ${investor}` : 'No investor') : undefined}
      wide
      paused={confirmDelete !== null}
      dirty={dirty}
      saving={saving || uploading}
      onClose={close}
      onSubmit={submit}
      footer={(requestClose) => (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Its own row on a phone, so it's read in full and the buttons keep their width. */}
          <SaveHint uploading={uploading} unsaved={changed.length} className="w-full justify-center sm:w-auto sm:justify-start" />
          {/* Closing waits for uploads either way: a photo still on its way would be cut off. */}
          <div className="ms-auto flex flex-1 justify-end gap-2 sm:flex-none">
            {dirty && (
              <Button type="button" variant="outline" size="lg" className={cn(FOOTER_BUTTON, 'flex-1 px-4 sm:flex-none')} disabled={saving || uploading} onClick={requestClose}>Cancel</Button>
            )}
            {dirty ? (
              <PrimaryButton saving={saving} disabled={!loaded || uploading || Boolean(yearError)}>{saving ? 'Saving…' : 'Save'}</PrimaryButton>
            ) : (
              <PrimaryButton type="button" saving={false} disabled={uploading} onClick={close}>Done</PrimaryButton>
            )}
          </div>
        </div>
      )}
    >
      {loadError ? (
        <Notice tone="red">
          <span>Couldn't load this car: {loadError}</span>{' '}
          <button type="button" className="font-semibold underline" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </Notice>
      ) : !loaded || !fields || !baseline ? (
        <div className="flex flex-1 items-center justify-center py-16" role="status" aria-label="Loading car"><Spinner size={20} /></div>
      ) : (
        <>
          <Section icon="info" title="Car info" hint="Plate, model and owner">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
              <Field label={FIELD_LABELS.plate} required changed={changed.includes('plate')} error={fieldErrors.plate}>
                <input value={fields.plate} aria-label={FIELD_LABELS.plate} onChange={(event) => set('plate', event.target.value.toUpperCase())} placeholder="34 ABC 123" autoCapitalize="characters" className={cn(INPUT, 'font-mono tracking-[0.04em]')} />
              </Field>
              <Field label={FIELD_LABELS.modelGroupId} changed={changed.includes('modelGroupId')}>
                <select value={fields.modelGroupId} aria-label={FIELD_LABELS.modelGroupId} onChange={(event) => set('modelGroupId', event.target.value)} className={INPUT}>
                  <option value="">Select model group</option>
                  {loaded.models.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </Field>
              <Field label={FIELD_LABELS.investorId} span changed={changed.includes('investorId')}>
                <select value={fields.investorId} aria-label={FIELD_LABELS.investorId} onChange={(event) => set('investorId', event.target.value)} className={INPUT}>
                  <option value="">No investor</option>
                  {loaded.investors.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section icon="registration" title="Registration" hint="Year, package and purchase">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-3">
              <Field label={FIELD_LABELS.manufactureYear} changed={changed.includes('manufactureYear')} error={shownYearError}>
                <input value={fields.manufactureYear} aria-label={FIELD_LABELS.manufactureYear} inputMode="numeric" maxLength={4} placeholder="2024" onBlur={() => setYearTouched(true)} onChange={(event) => set('manufactureYear', event.target.value.replace(/\D/g, ''))} className={cn(INPUT, 'tabular-nums')} />
              </Field>
              <Field label={FIELD_LABELS.carPackage} changed={changed.includes('carPackage')}>
                <input value={fields.carPackage} aria-label={FIELD_LABELS.carPackage} placeholder="e.g. Premium" onChange={(event) => set('carPackage', event.target.value)} className={INPUT} />
              </Field>
              <Field label={FIELD_LABELS.purchaseDate} changed={changed.includes('purchaseDate')}>
                <input type="date" value={fields.purchaseDate} aria-label={FIELD_LABELS.purchaseDate} onChange={(event) => set('purchaseDate', event.target.value)} className={INPUT} />
              </Field>
            </div>
            <SpareKeyRow
              checked={fields.hasSpareKey === 'true'}
              changed={changed.includes('hasSpareKey')}
              onChange={(checked) => set('hasSpareKey', checked ? 'true' : 'false')}
            />
          </Section>

          <Section icon="expiry" title="Expiry dates" hint="Insurance and inspection">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ExpiryCard
                label={FIELD_LABELS.insuranceExpiry}
                value={fields.insuranceExpiry}
                today={today}
                highlight={focusDocs.includes('insurance')}
                changed={changed.includes('insuranceExpiry')}
                inputRef={insuranceRef}
                onChange={(value) => set('insuranceExpiry', value)}
              />
              <ExpiryCard
                label={FIELD_LABELS.inspectionExpiry}
                value={fields.inspectionExpiry}
                today={today}
                highlight={focusDocs.includes('inspection')}
                changed={changed.includes('inspectionExpiry')}
                inputRef={inspectionRef}
                onChange={(value) => set('inspectionExpiry', value)}
              />
            </div>
          </Section>

          <Section
            icon="documents"
            title="Documents"
            hint={missingDocs === 0 ? 'All five on file' : `${missingDocs} of ${DOC_SLOTS.length} missing · PDF or image`}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DOC_SLOTS.map((slot) => (
                <DocCard
                  key={slot.column}
                  slot={slot}
                  url={docs[slot.column]}
                  progress={docProgress[slot.column] ?? null}
                  error={docErrors[slot.column] ?? null}
                  saved={justSaved[`doc:${slot.column}`] ?? null}
                  disabled={saving}
                  onUpload={(file) => uploadDocFile(slot, file)}
                  onRemove={() => removeDocFile(slot)}
                />
              ))}
            </div>
          </Section>

          <Section
            icon="photos"
            title="Photos"
            hint={usableCount === 0 ? 'No photos yet' : `${usableCount} ${usableCount === 1 ? 'photo' : 'photos'}${primary ? ' · the first is the primary' : ''}`}
            action={(
              <button type="button" className={SMALL_BUTTON} disabled={saving} onClick={() => photoInputRef.current?.click()}>
                <UploadGlyph /> Add photos
              </button>
            )}
          >
            <input ref={photoInputRef} type="file" accept="image/*" multiple aria-label="Add photos" className="hidden" onChange={(event) => { void addPhotos(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
            <div {...photoDrop} className={cn('rounded-xl transition-colors', photoOver && 'bg-[#6EA4E7]/[0.08] ring-2 ring-[#6EA4E7]')}>
              {photos.length === 0 && uploads.length === 0 ? (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border-[1.5px] border-dashed border-black/15 bg-black/[0.015] px-3 py-8 text-center text-[13px] text-black/50"
                >
                  <span className="text-black/35"><UploadGlyph /></span>
                  <span className="md:hidden">Tap to add photos</span>
                  <span className="hidden md:inline">Drop photos here, or click to choose</span>
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {photos.map((photo, index) => (
                    <PhotoTile
                      key={photo.id ?? photo.url}
                      photo={photo}
                      index={index}
                      count={usableCount}
                      isPrimary={photo === primary}
                      saved={justSaved[`photo:${photo.url}`] ?? null}
                      dragging={drag?.from === index}
                      target={drag !== null && drag.over === index && drag.from !== index}
                      disabled={saving || deleting}
                      onView={() => setViewing(photos.filter((item) => !item.dead).indexOf(photo))}
                      onPrimary={() => void commitPhotos(makePrimary(photosRef.current, photo.url), "The primary photo couldn't be changed")}
                      onDelete={() => setConfirmDelete(photo)}
                      onGrab={grab(index)}
                      onNudge={(by) => nudge(index, by)}
                    />
                  ))}
                  {uploads.map((upload) => (
                    <UploadTile key={upload.key} upload={upload} onDismiss={() => setUploads((current) => current.filter((item) => item.key !== upload.key))} />
                  ))}
                </div>
              )}
            </div>
            <p className="mt-2.5 text-[12px] text-black/45">Photos are resized to 1600px before upload. Drag the handle to reorder.</p>
          </Section>

          {saveError && <Notice tone="red">{saveError}</Notice>}
        </>
      )}

      {viewing !== null && lightboxItems.length > 0 && (
        <Lightbox items={lightboxItems} start={Math.max(0, viewing)} onClose={() => setViewing(null)} />
      )}
      <ConfirmDialog
        state={confirmDelete ? deleteState(confirmDelete) : null}
        pending={deleting}
        onCancel={() => { if (!deleting) setConfirmDelete(null); }}
        onConfirm={() => { void confirmPhotoDelete(); }}
      />
    </BookingSheet>
  );
};
