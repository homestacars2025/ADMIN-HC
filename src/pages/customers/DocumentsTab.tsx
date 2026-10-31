import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { AlertTriangle, Check, X } from '../../components/media/MediaIcons';
import { toast } from '../../components/media/MediaToast';
import { Button, Spinner } from '../../components/media/MediaUI';
import {
  DOCUMENT_SLOTS,
  checkAge,
  documentCount,
  formatDate,
  uploadCustomerDocument,
  yearsSince,
  type Customer,
  type DocumentKey,
  type ProfileBooking,
} from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import { Eye } from '../tasks/icons';
import { FileIcon, Panel, UploadIcon } from './ui';

const isImage = (url: string) => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);

const Lightbox: React.FC<{ url: string; label: string; onClose: () => void }> = ({ url, label, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4 sm:p-6"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <X size={16} />
      </button>
      <img
        src={url}
        alt={label}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-xl object-contain"
      />
    </div>,
    document.body,
  );
};

const DocumentCard: React.FC<{
  customerId: string;
  slot: DocumentKey;
  label: string;
  url: string | null;
  onUploaded: (updated: Customer) => void;
}> = ({ customerId, slot, label, url, onUploaded }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [url]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      onUploaded(await uploadCustomerDocument(customerId, slot, file));
      toast.success(`${label} saved`);
    } catch (error) {
      toast.error(error instanceof Error ? `Upload failed: ${error.message}` : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const showImage = url && isImage(url) && !imageFailed;

  return (
    <div className={cn(
      'flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface',
      url ? 'border-subtle' : 'border-dashed border-[#F59E0B]/60 bg-[#F59E0B]/[0.04]',
    )}>
      <div className="relative aspect-[4/3] bg-black/[0.03]">
        {showImage ? (
          <button type="button" onClick={() => setViewing(true)} aria-label={`View ${label}`} className="absolute inset-0 block cursor-zoom-in">
            <img src={url} alt={label} loading="lazy" onError={() => setImageFailed(true)} className="h-full w-full object-cover" />
          </button>
        ) : url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[12.5px] font-medium text-brand-strong">
            <FileIcon size={22} /> View file
          </a>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[12.5px] font-medium text-[#B45309]">
            <AlertTriangle size={18} /> Missing
          </div>
        )}
        {uploading && <div className="absolute inset-0 grid place-items-center bg-white/70"><Spinner size={18} /></div>}
      </div>

      <div className="flex min-h-[52px] items-center justify-between gap-2 border-t border-black/[0.05] px-3 py-1.5">
        <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{label}</span>
        <div className="flex shrink-0 items-center gap-1">
          {showImage && (
            <button type="button" onClick={() => setViewing(true)} aria-label={`View ${label}`} className="grid h-11 w-9 place-items-center rounded-lg text-black/50 hover:bg-black/[0.04] md:h-9">
              <Eye size={15} />
            </button>
          )}
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-11 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-brand-strong hover:bg-brand-strong/[0.07] disabled:opacity-50 md:h-9"
          >
            <UploadIcon size={13} /> {url ? 'Replace' : 'Upload'}
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,.pdf"
        aria-label={`Upload ${label}`}
        className="hidden"
        onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ''; }}
      />

      {viewing && url && <Lightbox url={url} label={label} onClose={() => setViewing(false)} />}
    </div>
  );
};

const CheckRow: React.FC<{ tone: 'ok' | 'bad' | 'muted'; title: string; detail: string }> = ({ tone, title, detail }) => (
  <div className="flex items-start gap-2.5">
    <span className={cn(
      'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full',
      tone === 'ok' && 'bg-[#16A34A]/[0.12] text-[#15803D]',
      tone === 'bad' && 'bg-[#DC2626]/[0.12] text-[#B91C1C]',
      tone === 'muted' && 'bg-[#F59E0B]/15 text-[#B45309]',
    )}>
      {tone === 'ok' ? <Check size={11} strokeWidth={2.5} /> : <AlertTriangle size={11} strokeWidth={2.2} />}
    </span>
    <div className="min-w-0">
      <div className="text-[13.5px] font-medium text-foreground">{title}</div>
      <div className="text-[12.5px] text-black/50">{detail}</div>
    </div>
  </div>
);

export const DocumentsTab: React.FC<{
  customer: Customer;
  bookings: ProfileBooking[];
  today: string;
  onUploaded: (updated: Customer) => void;
  onEdit: () => void;
}> = ({ customer, bookings, today, onUploaded, onEdit }) => {
  const age = checkAge(customer, bookings, today);
  const licenseYears = yearsSince(customer.license_issue_date, today);
  const count = documentCount(customer);

  let ageRow: React.ReactNode;
  if (age.state === 'missing') {
    ageRow = <CheckRow tone="muted" title="Age unknown" detail="No birth date on file." />;
  } else if (age.state === 'no_rule') {
    ageRow = <CheckRow tone="ok" title={`Age ${age.age}`} detail="No minimum age set for their car." />;
  } else if (age.state === 'ok') {
    ageRow = <CheckRow tone="ok" title={`Age ${age.age}`} detail={`Meets the ${age.minAge}+ minimum for ${age.model}.`} />;
  } else {
    ageRow = <CheckRow tone="bad" title={`Age ${age.age}`} detail={`Under the ${age.minAge}+ minimum for ${age.model}.`} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Driver check"
        action={<Button variant="secondary" size="lg" className="!h-11 md:!h-9" onClick={onEdit}>Edit details</Button>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ageRow}
          {customer.license_issue_date ? (
            <CheckRow
              tone="ok"
              title={`License held ${licenseYears} ${licenseYears === 1 ? 'year' : 'years'}`}
              detail={`Issued ${formatDate(customer.license_issue_date)}.`}
            />
          ) : (
            <CheckRow tone="muted" title="License date unknown" detail="No issue date on file." />
          )}
        </div>
      </Panel>

      <div>
        <h2 className="mb-2 text-[14px] font-medium text-foreground">
          Documents <span className="font-normal tabular-nums text-black/45">{count}/{DOCUMENT_SLOTS.length}</span>
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DOCUMENT_SLOTS.map((slot) => (
            <DocumentCard
              key={slot.key}
              customerId={customer.id}
              slot={slot.key}
              label={slot.label}
              url={customer[slot.key]}
              onUploaded={onUploaded}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
