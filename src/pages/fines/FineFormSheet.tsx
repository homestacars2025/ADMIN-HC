import React, { useMemo, useRef, useState } from 'react';
import { CalendarDays } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { FileSlot, UploadProgress } from '../../components/shared/FileDrop';
import type { LightboxItem } from '../../components/shared/Lightbox';
import {
  createFine,
  updateFine,
  type Fine,
  type FineCar,
  type FineFields,
  type FineStatus,
} from '../../lib/fines';
import { CarPicker } from '../bookings/CarPicker';
import { DateField, TimeField } from '../bookings/DateRangeField';
import { BookingSheet, FOOTER_BUTTON, Field, FormCard, INPUT, MoneyField, Notice, PrimaryButton, Segmented } from '../bookings/ui';
import { CarIcon, FileIcon, WalletIcon } from '../customers/ui';
import { LinkedCustomerField, type PickedCustomer } from './ui';

type Errors = Partial<Record<'car' | 'violation_number' | 'amount' | 'violation_date', string>>;

const EMPTY: FineFields = {
  car_id: null, plate_number: '', customer_id: null, violation_number: '', violation_code: '',
  amount: '', violation_date: '', violation_time: '', notification_date: '', location: '', article: '', description: '',
};

const fieldsOf = (fine: Fine): FineFields => ({
  car_id: fine.car_id,
  plate_number: fine.plate_number,
  customer_id: fine.customer_id,
  violation_number: fine.violation_number ?? '',
  violation_code: fine.violation_code ?? '',
  amount: String(fine.amount ?? ''),
  violation_date: fine.violation_date ?? '',
  violation_time: fine.violation_time ?? '',
  notification_date: fine.notification_date ?? '',
  location: fine.location ?? '',
  article: fine.article ?? '',
  description: fine.description ?? '',
});

const STATUS_OPTIONS = (locked: boolean): ReadonlyArray<{ value: FineStatus; label: string; disabled?: boolean }> => [
  { value: 'unpaid', label: 'Unpaid', disabled: locked },
  { value: 'paid', label: 'Paid' },
];

export const FineFormSheet: React.FC<{
  fine?: Fine;
  cars: FineCar[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onOpenDocument: (items: LightboxItem[]) => void;
}> = ({ fine, cars, onClose, onSaved, onOpenDocument }) => {
  const initial = useMemo(() => (fine ? fieldsOf(fine) : EMPTY), [fine]);
  const [form, setForm] = useState<FineFields>(initial);
  const [status, setStatus] = useState<FineStatus>(fine?.status ?? 'unpaid');
  const [customer, setCustomer] = useState<PickedCustomer | null>(
    fine?.customer_id ? { id: fine.customer_id, name: fine.resolved_customer_name ?? 'Customer', banned: false } : null,
  );
  const [fineImage, setFineImage] = useState<File | null>(null);
  const [finePdf, setFinePdf] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const savingRef = useRef(false);

  const editing = Boolean(fine);
  const paidAlready = fine?.status === 'paid';

  // Only cars in service can be chosen, but a fine on a retired car still shows it.
  const choices = useMemo(() => cars.filter((car) => !car.inactive || car.id === fine?.car_id), [cars, fine?.car_id]);

  const set = <K extends keyof FineFields>(key: K, value: FineFields[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const pickCar = (id: string) => {
    const car = cars.find((item) => String(item.id) === id);
    setForm((current) => ({ ...current, car_id: car?.id ?? null, plate_number: car?.plate_number ?? '', customer_id: null }));
    setCustomer(null);
    setErrors((current) => ({ ...current, car: undefined }));
  };

  const pickCustomer = (next: PickedCustomer | null) => {
    setCustomer(next);
    setForm((current) => ({ ...current, customer_id: next?.id ?? null }));
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
    || status !== (fine?.status ?? 'unpaid')
    || Boolean(fineImage || finePdf || receipt);

  const validate = (): boolean => {
    const next: Errors = {
      car: !editing && !form.car_id ? 'Choose the car.' : undefined,
      violation_number: form.violation_number.trim() ? undefined : 'Enter the violation number.',
      amount: form.amount ? undefined : 'Enter the amount.',
      violation_date: form.violation_date ? undefined : 'Pick the violation date.',
    };
    setErrors(next);
    const failed = Object.values(next).some(Boolean);
    if (failed) requestAnimationFrame(() => document.querySelector('[role=dialog] [data-field-error]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return !failed;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current || !validate()) return;
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    const step = (label: string, done: number, total: number) => setProgress({ label, done, total });
    try {
      const files = { fineImage, finePdf, receipt: status === 'paid' ? receipt : null };
      if (fine) await updateFine(fine, form, files, status, step);
      else await createFine(form, files, status, step);
      onSaved(editing ? 'Fine updated.' : 'Fine added.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The fine wasn't saved. Try again.");
      savingRef.current = false;
      setSaving(false);
      setProgress(null);
    }
  };

  const viewExisting = (url: string, label: string) => onOpenDocument([{ url, label }]);

  return (
    <BookingSheet
      narrow
      label={editing ? 'Edit fine' : 'Add fine'}
      title={editing ? 'Edit fine' : 'Add fine'}
      subtitle={editing ? `${fine?.plate_number} · ${fine?.violation_number}` : 'Record a traffic fine'}
      summary={progress ? <UploadProgress {...progress} /> : undefined}
      dirty={dirty}
      saving={saving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(requestClose) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={requestClose}>Cancel</Button>
          <PrimaryButton saving={saving}>{editing ? 'Save changes' : 'Add fine'}</PrimaryButton>
        </div>
      )}
    >
      <FormCard icon={<CalendarDays size={15} />} title="Violation">
        <Field label="Violation number" required error={errors.violation_number}>
          <input aria-label="Violation number" value={form.violation_number} onChange={(event) => set('violation_number', event.target.value)} placeholder="e.g. MB-94271641" className={INPUT} />
        </Field>
        <Field label="Violation code">
          <input aria-label="Violation code" value={form.violation_code} onChange={(event) => set('violation_code', event.target.value)} placeholder="Optional" className={INPUT} />
        </Field>
        <Field label="Article">
          <input aria-label="Article" value={form.article} onChange={(event) => set('article', event.target.value)} placeholder="e.g. Art. 51" className={INPUT} />
        </Field>
        <Field label="Location">
          <input aria-label="Location" value={form.location} onChange={(event) => set('location', event.target.value)} placeholder="e.g. Şişli, Istanbul" className={INPUT} />
        </Field>
        <DateField label="Violation date" required value={form.violation_date} error={errors.violation_date} onChange={(day) => set('violation_date', day)} />
        <TimeField label="Violation time" value={form.violation_time} onChange={(time) => set('violation_time', time)} />
        <DateField label="Notification date" clearable value={form.notification_date} onChange={(day) => set('notification_date', day)} />
        <Field label="Description" span>
          <textarea aria-label="Description" rows={3} value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="Optional notes about the violation…" className={`${INPUT} !h-auto resize-y py-2.5`} />
        </Field>
      </FormCard>

      <FormCard icon={<CarIcon size={15} />} title="Car and customer">
        <CarPicker
          label="Car"
          required={!editing}
          cars={choices}
          value={form.car_id ? String(form.car_id) : ''}
          error={errors.car}
          hint={!form.car_id && form.plate_number ? `Plate on this fine: ${form.plate_number}` : undefined}
          onChange={pickCar}
        />
        <LinkedCustomerField carId={form.car_id} day={form.violation_date} value={customer} onChange={pickCustomer} />
      </FormCard>

      <FormCard icon={<WalletIcon size={15} />} title="Amount and status">
        <MoneyField label="Amount" required span value={form.amount} currency="TRY" rate={null} error={errors.amount} onChange={(value) => set('amount', value)} />
        <Field
          label="Status"
          span
          hint={paidAlready ? "A paid fine can't go back to unpaid here, because its payment is already on the customer's ledger." : undefined}
        >
          <Segmented ariaLabel="Status" value={status} options={STATUS_OPTIONS(paidAlready)} onChange={setStatus} />
        </Field>
      </FormCard>

      <FormCard icon={<FileIcon size={15} />} title="Documents">
        <FileSlot
          label="Fine image"
          accept="image/*"
          file={fineImage}
          onChange={setFineImage}
          disabled={saving}
          existingUrl={fine?.fine_image_url}
          onViewExisting={() => fine?.fine_image_url && viewExisting(fine.fine_image_url, 'Fine image')}
        />
        <FileSlot
          label="Fine PDF"
          accept=".pdf,application/pdf"
          file={finePdf}
          onChange={setFinePdf}
          disabled={saving}
          existingUrl={fine?.fine_pdf_url}
          onViewExisting={() => fine?.fine_pdf_url && viewExisting(fine.fine_pdf_url, 'Fine PDF')}
        />
        {status === 'paid' && (
          <FileSlot
            label="Payment receipt"
            accept="image/*,.pdf,application/pdf"
            file={receipt}
            onChange={setReceipt}
            disabled={saving}
            existingUrl={fine?.payment_receipt_url}
            onViewExisting={() => fine?.payment_receipt_url && viewExisting(fine.payment_receipt_url, 'Payment receipt')}
          />
        )}
      </FormCard>

      {formError && <Notice tone="red">{formError}</Notice>}
    </BookingSheet>
  );
};
