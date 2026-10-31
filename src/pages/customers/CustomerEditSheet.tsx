import React, { useEffect, useRef, useState } from 'react';
import { CustomerAvatar } from '../../components/shared/PersonAvatar';
import { ChevronDown } from '../../components/media/MediaIcons';
import {
  Button,
  Field,
  Input,
  Select,
  Sheet,
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  Textarea,
} from '../../components/media/MediaUI';
import { COUNTRIES, parseStoredPhone } from '../../lib/countries';
import {
  LANGUAGE_OPTIONS,
  customerName,
  istanbulDate,
  normalizeLanguage,
  updateCustomer,
  type Customer,
  type CustomerLanguage,
} from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';

const ID_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'national_id', label: 'National ID' },
];

const FIELD = '!h-11 md:!h-10';
const SELECT_FIELD = `${FIELD} text-[13px]`;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_DIGITS = /^\d{6,15}$/;

interface EditForm {
  first_name: string;
  last_name: string;
  nationality: string;
  language: CustomerLanguage;
  birth_date: string;
  phone_dial: string;
  phone_local: string;
  email: string;
  address: string;
  id_type: string;
  id_number: string;
  driving_license_number: string;
  license_issue_date: string;
  notes: string;
}

type FieldErrors = Partial<Record<keyof EditForm, string>>;

function formFrom(customer: Customer): EditForm {
  const phone = parseStoredPhone(customer.phone);
  return {
    first_name: customer.first_name ?? '',
    last_name: customer.last_name ?? '',
    nationality: customer.nationality ?? '',
    language: normalizeLanguage(customer.language),
    birth_date: customer.birth_date ?? '',
    phone_dial: phone.dial,
    phone_local: phone.local,
    email: customer.email ?? '',
    address: customer.address ?? '',
    // Older rows hold NATIONAL_ID and PASSPORT.
    id_type: (customer.id_type ?? '').toLowerCase(),
    id_number: customer.id_number ?? '',
    driving_license_number: customer.driving_license_number ?? '',
    license_issue_date: customer.license_issue_date ?? '',
    notes: customer.notes ?? '',
  };
}

function validateCustomerForm(form: EditForm, today: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.first_name.trim()) errors.first_name = 'First name is required.';
  const digits = form.phone_local.replace(/\D/g, '');
  if (form.phone_local.trim() && !PHONE_DIGITS.test(digits)) errors.phone_local = 'Enter 6 to 15 digits.';
  if (form.email.trim() && !EMAIL.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if (form.birth_date && form.birth_date > today) errors.birth_date = "Birth date can't be in the future.";
  if (form.license_issue_date && form.license_issue_date > today) {
    errors.license_issue_date = "Issue date can't be in the future.";
  } else if (form.license_issue_date && form.birth_date && form.license_issue_date <= form.birth_date) {
    errors.license_issue_date = 'Issue date must be after the birth date.';
  }
  return errors;
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-black/40">{children}</h3>
);

const FieldError: React.FC<{ message?: string }> = ({ message }) => (
  message ? <p role="alert" className="text-[12px] text-[#B91C1C]">{message}</p> : null
);

const DialCodePicker: React.FC<{ value: string; onChange: (dial: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find((country) => country.dial === value);

  const term = search.trim().toLowerCase();
  const matches = term
    ? COUNTRIES.filter((country) => country.name.toLowerCase().includes(term) || country.dial.includes(term.replace(/^\+/, '')))
    : COUNTRIES;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => { setOpen((current) => !current); setSearch(''); }}
        aria-expanded={open}
        aria-label={`Country code ${value}`}
        className={cn(FIELD, 'flex items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-[13px] text-foreground outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20')}
      >
        <span className="text-[15px] leading-none">{selected?.flag ?? '🌐'}</span>
        <span className="tabular-nums">{value}</span>
        <ChevronDown size={12} className="opacity-50" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(272px,calc(100vw-48px))] overflow-hidden rounded-xl border border-subtle bg-surface shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
          <div className="p-2">
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search country or code…"
              aria-label="Search country or code"
              className={FIELD}
            />
          </div>
          <ul className="max-h-[220px] overflow-y-auto px-1 pb-1">
            {matches.map((country) => (
              <li key={country.code}>
                <button
                  type="button"
                  onClick={() => { onChange(country.dial); setOpen(false); }}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-foreground hover:bg-black/[0.04] md:min-h-[36px]"
                >
                  <span className="text-[15px] leading-none">{country.flag}</span>
                  <span className="min-w-0 flex-1 truncate">{country.name}</span>
                  <span className="text-[12px] tabular-nums text-black/40">{country.dial}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="p-3 text-center text-[13px] text-black/45">No results</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

/** Right-side sheet for a customer's details. Documents live on the profile's Documents tab. */
export const CustomerEditSheet: React.FC<{
  customer: Customer;
  onClose: () => void;
  onSaved: (updated: Customer) => void;
}> = ({ customer, onClose, onSaved }) => {
  const [form, setForm] = useState<EditForm>(() => formFrom(customer));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = validateCustomerForm(form, istanbulDate());
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    setSaveError(null);
    const local = form.phone_local.replace(/\D/g, '');
    try {
      const updated = await updateCustomer(customer.id, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        nationality: form.nationality.trim() || null,
        language: form.language,
        birth_date: form.birth_date || null,
        phone: local ? `${form.phone_dial}${local}` : null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        id_type: form.id_type || null,
        id_number: form.id_number.trim() || null,
        driving_license_number: form.driving_license_number.trim() || null,
        license_issue_date: form.license_issue_date || null,
        notes: form.notes.trim() || null,
      });
      onSaved(updated);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the customer.');
      setSaving(false);
    }
  };

  const invalid = Object.values(errors).some(Boolean);

  return (
    <Sheet open onClose={onClose} ariaLabel="Edit customer" maxWidthClass="sm:max-w-[520px]">
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <SheetHeader className="flex items-center gap-3 pe-14">
          <CustomerAvatar alt="" size={40} />
          <div className="min-w-0">
            <SheetTitle>Edit customer</SheetTitle>
            <SheetDescription>{customerName(customer)}</SheetDescription>
          </div>
        </SheetHeader>

        <SheetBody>
          <SectionTitle>Personal</SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="First name">
              <Input value={form.first_name} onChange={(event) => set('first_name', event.target.value)} aria-invalid={Boolean(errors.first_name)} className={FIELD} />
              <FieldError message={errors.first_name} />
            </Field>
            <Field label="Last name">
              <Input value={form.last_name} onChange={(event) => set('last_name', event.target.value)} className={FIELD} />
            </Field>
            <Field label="Nationality">
              <Input value={form.nationality} onChange={(event) => set('nationality', event.target.value)} list="customer-nationalities" className={FIELD} />
              <datalist id="customer-nationalities">
                {COUNTRIES.map((country) => <option key={country.code} value={country.name} />)}
              </datalist>
            </Field>
            <Field label="Language">
              <Select
                value={form.language}
                options={LANGUAGE_OPTIONS}
                onChange={(value) => set('language', normalizeLanguage(value))}
                ariaLabel="Language"
                className={SELECT_FIELD}
              />
            </Field>
            <Field label="Birth date">
              <Input type="date" value={form.birth_date} onChange={(event) => set('birth_date', event.target.value)} aria-invalid={Boolean(errors.birth_date)} className={FIELD} />
              <FieldError message={errors.birth_date} />
            </Field>
          </div>

          <SectionTitle>Contact</SectionTitle>
          <div className="grid grid-cols-1 gap-4">
            <Field label="Phone">
              <div className="flex gap-2">
                <DialCodePicker value={form.phone_dial} onChange={(dial) => set('phone_dial', dial)} />
                <Input
                  type="tel"
                  value={form.phone_local}
                  onChange={(event) => set('phone_local', event.target.value.replace(/[^\d\s\-()]/g, ''))}
                  placeholder="5XX XXX XX XX"
                  aria-invalid={Boolean(errors.phone_local)}
                  className={FIELD}
                />
              </div>
              <FieldError message={errors.phone_local} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(event) => set('email', event.target.value)} aria-invalid={Boolean(errors.email)} className={FIELD} />
              <FieldError message={errors.email} />
            </Field>
            <Field label="Address">
              <Input value={form.address} onChange={(event) => set('address', event.target.value)} className={FIELD} />
            </Field>
          </div>

          <SectionTitle>ID &amp; license</SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="ID type">
              <Select
                value={form.id_type}
                options={ID_TYPES}
                onChange={(value) => set('id_type', value)}
                ariaLabel="ID type"
                className={SELECT_FIELD}
              />
            </Field>
            <Field label="ID number">
              <Input value={form.id_number} onChange={(event) => set('id_number', event.target.value)} className={FIELD} />
            </Field>
            <Field label="Driving license number">
              <Input value={form.driving_license_number} onChange={(event) => set('driving_license_number', event.target.value)} className={FIELD} />
            </Field>
            <Field label="License issue date">
              <Input type="date" value={form.license_issue_date} onChange={(event) => set('license_issue_date', event.target.value)} aria-invalid={Boolean(errors.license_issue_date)} className={FIELD} />
              <FieldError message={errors.license_issue_date} />
            </Field>
          </div>

          <SectionTitle>Notes</SectionTitle>
          <Field label="Internal notes">
            <Textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} rows={3} />
          </Field>

          {saveError && <p role="alert" className="rounded-lg bg-[#DC2626]/[0.07] px-3 py-2 text-[12.5px] text-[#B91C1C]">{saveError}</p>}
          {invalid && !saveError && <p role="alert" className="text-[12.5px] text-[#B91C1C]">Check the highlighted fields.</p>}
        </SheetBody>

        <SheetFooter>
          <Button variant="secondary" size="lg" className="!h-11 md:!h-10" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="lg" className="!h-11 md:!h-10" disabled={saving}>
            {saving && <Spinner size={13} />} Save changes
          </Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
};
