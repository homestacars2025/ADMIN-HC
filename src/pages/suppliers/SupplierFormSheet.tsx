import React, { useRef, useState } from 'react';
import { Button, Select, Switch } from '../../components/media/MediaUI';
import {
  CATEGORY_LABELS,
  saveSupplier,
  SUPPLIER_CATEGORIES,
  type Supplier,
  type SupplierCategory,
} from '../../lib/suppliers';
import { BookingSheet, Field, FOOTER_BUTTON, FormCard, INPUT, Notice, PrimaryButton } from '../bookings/ui';
import { PhoneIcon, WalletIcon } from '../customers/ui';
import { CategoryIcon } from './ui';

const EMPTY = { name: '', contact_person: '', phone: '', whatsapp: '', address: '', district: '', tax_number: '', iban: '', bank_name: '', notes: '' };
type TextField = keyof typeof EMPTY;

const CATEGORY_OPTIONS = SUPPLIER_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));

export const SupplierFormSheet: React.FC<{
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: (saved: Supplier) => void;
}> = ({ supplier, onClose, onSaved }) => {
  const [form, setForm] = useState(() => (supplier
    ? Object.fromEntries((Object.keys(EMPTY) as TextField[]).map((key) => [key, supplier[key] ?? ''])) as typeof EMPTY
    : EMPTY));
  const [category, setCategory] = useState<SupplierCategory>(supplier?.category ?? 'other');
  const [active, setActive] = useState(supplier?.is_active ?? true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savingRef = useRef(false);

  const set = (key: TextField, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };
  const clean = (value: string) => value.trim() || null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!form.name.trim()) { setNameError('Enter the name.'); return; }
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      onSaved(await saveSupplier(supplier?.id ?? null, {
        name: form.name.trim(),
        category,
        contact_person: clean(form.contact_person),
        phone: clean(form.phone),
        whatsapp: clean(form.whatsapp),
        address: clean(form.address),
        district: clean(form.district),
        tax_number: clean(form.tax_number),
        iban: clean(form.iban.replace(/\s/g, '').toUpperCase()),
        bank_name: clean(form.bank_name),
        notes: clean(form.notes),
        is_active: active,
      }));
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : "The supplier wasn't saved. Try again.");
      savingRef.current = false;
      setSaving(false);
    }
  };

  const text = (key: TextField, label: string, extra?: { span?: boolean; inputMode?: 'tel' | 'text' }) => (
    <Field label={label} span={extra?.span}>
      <input className={INPUT} value={form[key]} inputMode={extra?.inputMode} onChange={(event) => set(key, event.target.value)} />
    </Field>
  );

  return (
    <BookingSheet
      narrow
      label={supplier ? 'Edit supplier' : 'New supplier'}
      title={supplier ? 'Edit supplier' : 'New supplier'}
      subtitle={supplier?.name ?? 'Add a workshop, parts shop or service'}
      dirty={dirty}
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
      footer={(requestClose) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={requestClose}>Cancel</Button>
          <PrimaryButton saving={saving}>{supplier ? 'Save changes' : 'Add supplier'}</PrimaryButton>
        </div>
      )}
    >
      <FormCard icon={<CategoryIcon category={category} size={15} />} title="Supplier">
        <Field label="Name" required span error={nameError}>
          <input className={INPUT} value={form.name} onChange={(event) => { set('name', event.target.value); setNameError(null); }} />
        </Field>
        <Field label="Category" span>
          <Select value={category} options={CATEGORY_OPTIONS} size="lg" ariaLabel="Category" onChange={(value) => { setCategory(value as SupplierCategory); setDirty(true); }} />
        </Field>
        {supplier && (
          <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-[10px] border border-subtle px-3 text-[13.5px] text-foreground sm:col-span-2">
            Active
            <Switch checked={active} onChange={(value) => { setActive(value); setDirty(true); }} ariaLabel="Active" activeClass="bg-primary" />
          </label>
        )}
      </FormCard>

      <FormCard icon={<PhoneIcon size={15} />} title="Contact">
        {text('contact_person', 'Contact person', { span: true })}
        {text('phone', 'Phone', { inputMode: 'tel' })}
        {text('whatsapp', 'WhatsApp', { inputMode: 'tel' })}
        {text('district', 'District')}
        {text('address', 'Address')}
      </FormCard>

      <FormCard icon={<WalletIcon size={15} />} title="Payment details">
        {text('tax_number', 'Tax number')}
        {text('bank_name', 'Bank')}
        {text('iban', 'IBAN', { span: true })}
        <Field label="Notes" span>
          <textarea className={`${INPUT} !h-auto py-2`} rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        </Field>
      </FormCard>

      {formError && <Notice tone="red">{formError}</Notice>}
    </BookingSheet>
  );
};
