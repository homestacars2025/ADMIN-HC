import React, { useRef, useState } from 'react';
import { Pencil, Trash2 } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { FileSlot, UploadProgress, PdfGlyph } from '../../components/shared/FileDrop';
import { isPdfUrl, type LightboxItem } from '../../components/shared/Lightbox';
import { CustomerAvatar } from '../../components/shared/PersonAvatar';
import { DetailRow, Timeline } from '../../components/shared/PageBits';
import { useCurrency } from '../../lib/CurrencyContext';
import { formatDate } from '../../lib/customers';
import { fineDocuments, linkFineCustomer, markFinePaid, type Fine, type FineCar } from '../../lib/fines';
import { cn } from '../../lib/media/badgeColor';
import { BookingSheet, FOOTER_BUTTON, FormCard, LicensePlate, Notice, PrimaryButton } from '../bookings/ui';
import { FileIcon, ReceiptIcon, WalletIcon } from '../customers/ui';
import { FineStatusPill, LinkedCustomerField, UnassignedChip, type PickedCustomer } from './ui';

const noSubmit = (event: React.FormEvent) => event.preventDefault();

const Preview: React.FC<{ item: LightboxItem; onOpen: () => void }> = ({ item, onOpen }) => (
  isPdfUrl(item.url) ? (
    <div className="overflow-hidden rounded-xl border border-subtle bg-white">
      <iframe src={item.url} title={item.label} className="hidden h-[340px] w-full sm:block" />
      <button type="button" onClick={onOpen} className="flex min-h-[44px] w-full items-center justify-center gap-2 border-t border-subtle px-3 py-2.5 text-[13px] font-semibold text-brand-strong max-sm:border-t-0 max-sm:py-8">
        <PdfGlyph size={18} /> Open the PDF
      </button>
    </div>
  ) : (
    <button type="button" onClick={onOpen} aria-label={`Open ${item.label}`} className="block w-full overflow-hidden rounded-xl border border-subtle bg-black/[0.03]">
      <img src={item.url} alt={item.label} className="mx-auto max-h-[340px] w-full object-contain" />
    </button>
  )
);

export const FineDetailSheet: React.FC<{
  fine: Fine;
  car: FineCar | undefined;
  onClose: () => void;
  onEdit: () => void;
  onPay: () => void;
  onLink: () => void;
  onDelete: () => void;
  onOpenDocument: (items: LightboxItem[], start: number) => void;
}> = ({ fine, car, onClose, onEdit, onPay, onLink, onDelete, onOpenDocument }) => {
  const { fmt } = useCurrency();
  const documents = fineDocuments(fine);
  const [shown, setShown] = useState(0);
  const current = documents[Math.min(shown, documents.length - 1)];

  return (
    <BookingSheet
      narrow
      label="Fine details"
      title={fine.violation_number || 'Fine'}
      subtitle={car?.model}
      badge={<FineStatusPill status={fine.status} />}
      dirty={false}
      saving={false}
      onClose={onClose}
      onSubmit={noSubmit}
      footer={() => (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} onClick={onDelete}><Trash2 size={14} /> Delete</Button>
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} onClick={onEdit}><Pencil size={14} /> Edit</Button>
          {!fine.customer_id && <Button variant="secondary" size="lg" className={cn(FOOTER_BUTTON, fine.status === 'paid' && 'col-span-2')} onClick={onLink}>Link customer</Button>}
          {fine.status === 'unpaid' && <Button size="lg" className={cn(FOOTER_BUTTON, fine.customer_id && 'col-span-2')} onClick={onPay}>Mark as paid</Button>}
        </div>
      )}
    >
      <FormCard icon={<FileIcon size={15} />} title="Documents">
        <div className="sm:col-span-2">
          {current ? (
            <>
              <Preview item={current} onOpen={() => onOpenDocument(documents, documents.indexOf(current))} />
              {documents.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {documents.map((document, index) => (
                    <button
                      key={document.key}
                      type="button"
                      aria-pressed={document === current}
                      onClick={() => setShown(index)}
                      className={cn('h-11 rounded-full border px-3.5 text-[12.5px] font-medium md:h-9', document === current ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.1] text-brand-strong' : 'border-subtle text-black/60')}
                    >
                      {document.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-[13px] text-black/45">No documents on this fine yet.</p>
          )}
        </div>
      </FormCard>

      <FormCard icon={<ReceiptIcon size={15} />} title="Details">
        <dl className="grid grid-cols-1 gap-3.5 sm:col-span-2 sm:grid-cols-2">
          <DetailRow label="Car"><span className="inline-flex flex-wrap items-center gap-2"><LicensePlate plate={fine.plate_number} />{car?.model}</span></DetailRow>
          <DetailRow label="Customer">
            {fine.customer_id || fine.resolved_customer_name
              ? <span className="inline-flex items-center gap-2"><CustomerAvatar size={24} />{fine.resolved_customer_name}</span>
              : <UnassignedChip />}
          </DetailRow>
          <DetailRow label="Amount"><span className="text-[15px] font-semibold tabular-nums">{fmt(fine.amount)}</span></DetailRow>
          <DetailRow label="Violation number">{fine.violation_number || '—'}</DetailRow>
          <DetailRow label="Violation code">{fine.violation_code || '—'}</DetailRow>
          <DetailRow label="Article">{fine.article || '—'}</DetailRow>
          <DetailRow label="Location" span>{fine.location || '—'}</DetailRow>
          {fine.description && <DetailRow label="Description" span>{fine.description}</DetailRow>}
        </dl>
      </FormCard>

      <FormCard icon={<WalletIcon size={15} />} title="Timeline">
        <div className="sm:col-span-2">
          <Timeline steps={[
            { label: 'Violation', detail: `${formatDate(fine.violation_date)}${fine.violation_time ? ` · ${fine.violation_time}` : ''}`, done: Boolean(fine.violation_date) },
            { label: 'Notified', detail: fine.notification_date ? formatDate(fine.notification_date) : 'No date recorded', done: Boolean(fine.notification_date) },
            { label: 'Paid', detail: fine.status === 'paid' ? (fine.payment_receipt_url ? 'Receipt on file' : 'No receipt on file') : 'Not paid yet', done: fine.status === 'paid' },
          ]} />
        </div>
      </FormCard>
    </BookingSheet>
  );
};

export const PaymentSheet: React.FC<{ fine: Fine; onClose: () => void; onDone: (message: string) => void }> = ({ fine, onClose, onDone }) => {
  const { fmt } = useCurrency();
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await markFinePaid(fine, receipt, (label, done, total) => setProgress({ label, done, total }));
      onDone('Payment confirmed.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The payment wasn't confirmed. Try again.");
      savingRef.current = false;
      setSaving(false);
      setProgress(null);
    }
  };

  return (
    <BookingSheet
      narrow
      label="Mark as paid"
      title="Mark as paid"
      subtitle={fine.violation_number}
      summary={progress ? <UploadProgress {...progress} /> : undefined}
      dirty={Boolean(receipt)}
      saving={saving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(requestClose) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={requestClose}>Cancel</Button>
          <PrimaryButton saving={saving}>Confirm payment</PrimaryButton>
        </div>
      )}
    >
      <FormCard icon={<WalletIcon size={15} />} title="Payment">
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <LicensePlate plate={fine.plate_number} />
          <span className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-[#B91C1C]">{fmt(fine.amount)}</span>
        </div>
        <div className="sm:col-span-2">
          <FileSlot label="Payment receipt (optional)" accept="image/*,.pdf,application/pdf" file={receipt} onChange={setReceipt} disabled={saving} />
        </div>
      </FormCard>
      {error && <Notice tone="red">{error}</Notice>}
    </BookingSheet>
  );
};

export const LinkCustomerSheet: React.FC<{ fine: Fine; onClose: () => void; onDone: (message: string) => void }> = ({ fine, onClose, onDone }) => {
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!customer) { setError('Choose a customer first.'); return; }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await linkFineCustomer(fine.id, customer.id);
      onDone('Customer linked.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The customer wasn't linked. Try again.");
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <BookingSheet
      narrow
      label="Link customer"
      title="Link customer"
      subtitle={`${fine.plate_number} · ${fine.violation_number}`}
      dirty={Boolean(customer)}
      saving={saving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(requestClose) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={requestClose}>Cancel</Button>
          <PrimaryButton saving={saving}>Link customer</PrimaryButton>
        </div>
      )}
    >
      <FormCard icon={<WalletIcon size={15} />} title="Customer">
        <LinkedCustomerField carId={fine.car_id} day={fine.violation_date ?? ''} value={customer} onChange={setCustomer} />
      </FormCard>
      {error && <Notice tone="red">{error}</Notice>}
    </BookingSheet>
  );
};
