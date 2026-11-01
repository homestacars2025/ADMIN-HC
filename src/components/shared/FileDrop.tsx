import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/media/badgeColor';
import { isPdfUrl } from './Lightbox';
import { ChevronLeft, X } from '../media/MediaIcons';

const ZONE = 'rounded-xl border-[1.5px] border-dashed transition-colors';
const SMALL_BUTTON = 'inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] border border-subtle bg-surface px-3 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 disabled:cursor-not-allowed disabled:opacity-50 md:h-9';

const CameraIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8.5A2.5 2.5 0 015.5 6h1.2a1.5 1.5 0 001.3-.7l.6-1a1.5 1.5 0 011.3-.8h4.2a1.5 1.5 0 011.3.8l.6 1a1.5 1.5 0 001.3.7h1.2A2.5 2.5 0 0121 8.5v8a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 16.5v-8z" />
    <circle cx="12" cy="12.5" r="3.4" />
  </svg>
);

const UploadGlyph: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

export const PdfGlyph: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
    <path d="M14 2v6h6M8 13h8M8 17h5" />
  </svg>
);

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function usePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setUrl(null); return undefined; }
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [file]);
  return url;
}

const accepted = (file: File, accept: string) => accept.split(',').some((rule) => {
  const kind = rule.trim();
  if (kind.endsWith('/*')) return file.type.startsWith(kind.slice(0, -1));
  if (kind.startsWith('.')) return file.name.toLowerCase().endsWith(kind);
  return file.type === kind;
});

function useDropZone(onFiles: (files: File[]) => void, disabled: boolean | undefined) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (event: React.DragEvent) => { event.preventDefault(); if (!disabled) setOver(true); },
      onDragLeave: () => setOver(false),
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        setOver(false);
        if (!disabled) onFiles(Array.from(event.dataTransfer.files));
      },
    },
  };
}

/** One document: drag it in, browse for it, or take a photo of it on a phone. */
export const FileSlot: React.FC<{
  label: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  existingUrl?: string | null;
  onViewExisting?: () => void;
  disabled?: boolean;
  error?: string | null;
}> = ({ label, accept, file, onChange, existingUrl, onViewExisting, disabled, error }) => {
  const browseRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const preview = usePreview(file);
  const isPhone = useMediaQuery('(max-width: 767px)');
  const canPhoto = accept.includes('image');
  const [rejected, setRejected] = useState(false);

  const pick = (files: File[]) => {
    const next = files[0];
    if (!next) return;
    const ok = accepted(next, accept);
    setRejected(!ok);
    if (ok) onChange(next);
  };
  const { over, handlers } = useDropZone(pick, disabled);
  const existingPdf = existingUrl ? isPdfUrl(existingUrl) : false;

  const replace = (
    <button type="button" className={SMALL_BUTTON} disabled={disabled} onClick={() => browseRef.current?.click()}>Replace</button>
  );

  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[12.5px] font-medium text-black/65">{label}</div>
      <input ref={browseRef} type="file" accept={accept} aria-label={label} className="hidden" onChange={(event) => { pick(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      {canPhoto && <input ref={cameraRef} type="file" accept="image/*" capture="environment" aria-label={`${label}, camera`} className="hidden" onChange={(event) => { pick(Array.from(event.target.files ?? [])); event.target.value = ''; }} />}

      {file ? (
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[#6EA4E7]/40 bg-[#6EA4E7]/[0.06] p-2">
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-white text-brand-strong">
            {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <PdfGlyph />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-foreground">{file.name}</span>
            <span className="block text-[12px] tabular-nums text-black/50">{formatSize(file.size)}</span>
          </span>
          <button type="button" aria-label={`Remove ${label}`} disabled={disabled} onClick={() => onChange(null)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-black/45 hover:bg-black/[0.05] md:h-9 md:w-9">
            <X size={15} />
          </button>
        </div>
      ) : existingUrl ? (
        <div {...handlers} className={cn('flex min-w-0 items-center gap-2.5 rounded-xl border p-2', over ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.06]' : 'border-subtle bg-surface')}>
          <button type="button" onClick={onViewExisting} aria-label={`View ${label}`} className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/[0.04] text-brand-strong">
            {existingPdf ? <PdfGlyph /> : <img src={existingUrl} alt="" className="h-full w-full object-cover" />}
          </button>
          <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">On file</span>
          {replace}
        </div>
      ) : (
        <div
          {...handlers}
          className={cn(ZONE, 'flex flex-col items-center gap-2 px-3 py-3.5 text-center', over ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.08]' : 'border-black/15 bg-black/[0.015]')}
        >
          <span className="text-black/35"><UploadGlyph /></span>
          <span className="flex flex-wrap items-center justify-center gap-2">
            {isPhone && canPhoto && (
              <button type="button" className={SMALL_BUTTON} disabled={disabled} onClick={() => cameraRef.current?.click()}><CameraIcon /> Take photo</button>
            )}
            <button type="button" className={SMALL_BUTTON} disabled={disabled} onClick={() => browseRef.current?.click()}>{isPhone ? 'Choose file' : 'Browse'}</button>
          </span>
          {!isPhone && <span className="text-[12px] text-black/45">or drop a file here</span>}
        </div>
      )}
      {(error || rejected) && <p role="alert" className="mt-1 text-[12px] text-[#B91C1C]">{error ?? "That file type isn't accepted here."}</p>}
    </div>
  );
};

const Thumb: React.FC<{
  file: File;
  index: number;
  disabled?: boolean;
  onRemove: () => void;
  onEarlier?: () => void;
}> = ({ file, index, disabled, onRemove, onEarlier }) => {
  const preview = usePreview(file);
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-subtle bg-black/[0.04]">
      {preview && <img src={preview} alt={`Selected ${index + 1}`} className="h-full w-full object-cover" />}
      {index === 0 && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold text-white">Cover</span>}
      <button type="button" aria-label={`Remove photo ${index + 1}`} disabled={disabled} onClick={onRemove} className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-white">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-black/60"><X size={12} strokeWidth={2.4} /></span>
      </button>
      {onEarlier && (
        <button type="button" aria-label={`Move photo ${index + 1} earlier`} disabled={disabled} onClick={onEarlier} className="absolute left-0 top-0 grid h-11 w-11 place-items-center text-white">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-black/60"><ChevronLeft size={13} strokeWidth={2.4} /></span>
        </button>
      )}
    </div>
  );
};

/** Several photos in order: camera first on a phone, and the first one is the cover. */
export const PhotoGrid: React.FC<{
  label: string;
  required?: boolean;
  files: File[];
  onChange: (files: File[]) => void;
  max: number;
  disabled?: boolean;
  error?: string | null;
}> = ({ label, required, files, onChange, max, disabled, error }) => {
  const browseRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const isPhone = useMediaQuery('(max-width: 767px)');
  const full = files.length >= max;

  const add = (incoming: File[]) => {
    const images = incoming.filter((file) => file.type.startsWith('image/'));
    if (images.length > 0) onChange([...files, ...images].slice(0, max));
  };
  const { over, handlers } = useDropZone(add, disabled || full);
  const keys = useMemo(() => new WeakMap<File, string>(), []);
  const keyOf = (file: File, index: number) => {
    if (!keys.has(file)) keys.set(file, `${file.name}-${index}-${file.lastModified}`);
    return keys.get(file) as string;
  };

  const moveEarlier = (index: number) => {
    const next = [...files];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const onPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    add(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  return (
    <div className="min-w-0 sm:col-span-2">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[12.5px] font-medium text-black/65">
        <span>{label}{required && <span className="ms-0.5 text-[#DC2626]">*</span>}</span>
        <span className={cn('tabular-nums', files.length > 0 ? 'font-semibold text-brand-strong' : 'text-black/40')}>{files.length} / {max}</span>
      </div>
      <input ref={browseRef} type="file" accept="image/*" multiple aria-label={label} className="hidden" onChange={onPicked} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" aria-label={`${label}, camera`} className="hidden" onChange={onPicked} />

      <div {...handlers} className={cn(ZONE, 'px-3 py-3.5', over ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.08]' : error ? 'border-[#DC2626]/50' : 'border-black/15 bg-black/[0.015]')}>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className={SMALL_BUTTON} disabled={disabled || full} onClick={() => cameraRef.current?.click()}><CameraIcon /> Take photo</button>
          <button type="button" className={SMALL_BUTTON} disabled={disabled || full} onClick={() => browseRef.current?.click()}>Choose photos</button>
          {!isPhone && <span className="text-[12px] text-black/45">or drop them here</span>}
        </div>
      </div>
      {error && <p role="alert" className="mt-1 text-[12px] text-[#B91C1C]">{error}</p>}

      {files.length > 0 && (
        <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {files.map((file, index) => (
            <Thumb
              key={keyOf(file, index)}
              file={file}
              index={index}
              disabled={disabled}
              onRemove={() => onChange(files.filter((item) => item !== file))}
              onEarlier={index > 0 ? () => moveEarlier(index) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/** Counts finished files: the upload call has no byte progress to report. */
export const UploadProgress: React.FC<{ label: string; done: number; total: number }> = ({ label, done, total }) => (
  <div className="shrink-0 border-t border-subtle bg-surface px-4 py-2.5 sm:px-6" role="status">
    <div className="flex items-center justify-between gap-3 text-[12.5px] text-black/60">
      <span className="min-w-0 truncate">{label}</span>
      {total > 0 && <span className="shrink-0 tabular-nums">{done} / {total}</span>}
    </div>
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
      <div className="h-full rounded-full bg-[#6EA4E7] transition-[width] duration-300" style={{ width: `${total > 0 ? Math.max(6, (done / total) * 100) : 100}%` }} />
    </div>
  </div>
);
