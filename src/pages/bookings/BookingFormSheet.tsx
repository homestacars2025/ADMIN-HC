import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Tag } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { FuelRangeInput } from '../../components/shared/FuelRangeInput';
import { useCurrency } from '../../lib/CurrencyContext';
import {
  envelopeReceipt,
  inLira,
  isRecordedPayment,
  NEW_PAYMENT,
  paymentProblem,
  recordCustomerPayment,
  showEnvelopes,
  type EnvelopeReceipt,
  type PaymentChoice,
} from '../../lib/payments';
import {
  EMPTY_FORM,
  LOCATION_PRESETS,
  OTHER_PRESET,
  PRESET_LABELS,
  additionalServicesValue,
  changedFields,
  editFormData,
  extrasLabel,
  formatDays,
  formatShortRange,
  friendlyBookingError,
  insuranceValue,
  parseAmount,
  rangeDays,
  rememberCar,
  toTry,
  type BookingCurrency,
  type BookingFormData,
  type CarChoice,
} from '../../lib/bookingForm';
import { COUNTRIES, parseStoredPhone } from '../../lib/countries';
import {
  LANGUAGE_OPTIONS,
  customerBanMatch,
  customersWithPhone,
  friendlyCustomerError,
  formatDate,
  formatLira,
  idNumberChange,
  isValidIdNumber,
  moveBookingToCustomer,
  normalizeLanguage,
  prefillFromQuery,
  searchCustomers,
  type BanMatch,
} from '../../lib/customers';
import { FUEL_RANGE_LABEL, formatFuelRange } from '../../lib/fuelRange';
import { cn } from '../../lib/media/badgeColor';
import { supabase } from '../../lib/supabase';
import type { Booking, BookingStatus } from '../../types';
import { DialCodePicker } from '../customers/CustomerEditSheet';
import { CustomerPicker } from '../customers/CustomerPicker';
import { BanAlert, CarIcon, FileIcon, UsersIcon, WalletIcon } from '../customers/ui';
import { CarPicker, useBusyCars, useCarCompliance } from './CarPicker';
import { CoverSection } from './CoverSection';
import { DateRangeField } from './DateRangeField';
import { DocUploadField } from './DocUploadField';
import {
  BookingSheet,
  FOOTER_BUTTON,
  Field,
  FooterTotal,
  FormCard,
  INPUT,
  LicensePlate,
  MoneyField,
  Notice,
  PrimaryButton,
  Segmented,
  SelectedRow,
  Stepper,
  SummaryBar,
} from './ui';
import { CurrencyField, PaymentAmount, PaymentMethod, usePaymentAccounts } from './PaymentFields';

const STEPS = [
  { key: 'customer', label: 'Customer' },
  { key: 'car', label: 'Car and dates' },
  { key: 'cover', label: 'Insurance' },
  { key: 'condition', label: 'Condition' },
  { key: 'review', label: 'Review' },
] as const;

const REVIEW_STEP = STEPS.length - 1;

const STATUS_OPTIONS: ReadonlyArray<{ value: BookingStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EMPTY_DOCS = {
  id_photo_url: null,
  id_photo_back_url: null,
  driving_license_photo_url: null,
  driving_license_back_url: null,
  entry_stamp_photo_url: null,
} as Record<string, string | null>;

type CustomerFieldErrors = Partial<Record<
  'cust_id_number' | 'cust_first_name' | 'cust_last_name' | 'cust_nationality' | 'cust_phone' | 'cust_license_issue_date',
  string
>>;

const RECORDED_HINT = 'Already recorded. To change it, reverse it in Cash & Envelopes.';

interface LedgerRow { id: number; amount: number; pay_method?: string | null }

interface CustomerRow {
  id: string;
  first_name: string; last_name: string; phone: string | null;
  nationality: string | null; language: string | null;
  id_type: string | null; id_number: string | null;
  driving_license_number: string | null;
  address: string | null; birth_date: string | null; license_issue_date: string | null;
  notes: string | null;
  id_photo_url: string | null; id_photo_back_url: string | null;
  driving_license_photo_url: string | null; driving_license_back_url: string | null;
  entry_stamp_photo_url: string | null;
}

/** The customer-side form fields for a stored record. */
function customerFormFields(c: CustomerRow): Partial<BookingFormData> {
  const phone = parseStoredPhone(c.phone);
  return {
    cust_first_name: c.first_name,
    cust_last_name: c.last_name,
    cust_phone_dial: phone.dial,
    cust_phone: phone.local,
    cust_nationality: c.nationality ?? '',
    cust_language: normalizeLanguage(c.language),
    cust_id_type: c.id_type === 'national_id' ? 'national_id' : 'passport',
    cust_id_number: c.id_number ?? '',
    cust_driving_license: c.driving_license_number ?? '',
    cust_driving_license_number: '',
    cust_address: c.address ?? '',
    cust_birth_date: c.birth_date ?? '',
    cust_license_issue_date: c.license_issue_date ?? '',
    cust_notes: c.notes ?? '',
  };
}

interface BookingFormSheetProps {
  mode: 'add' | 'edit';
  booking?: Booking;
  /** Add a booking for this customer rather than creating a new customer record. */
  existingCustomerId?: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

export const BookingFormSheet: React.FC<BookingFormSheetProps> = ({ mode, booking, existingCustomerId, onClose, onSaved, showToast }) => {
  const { rates } = useCurrency();
  const usdRate = rates.find((rate) => rate.currency === 'USD')?.rate_to_try ?? null;
  const editId = booking?.id;
  const originalCustomerId = booking ? String(booking.customer_id) : undefined;

  const initial = useMemo(() => (booking ? editFormData(booking) : EMPTY_FORM), [booking]);
  const [form, setForm] = useState<BookingFormData>(initial);
  const [baseline, setBaseline] = useState<BookingFormData>(initial);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [customerErrors, setCustomerErrors] = useState<CustomerFieldErrors>({});
  const [carError, setCarError] = useState<string | null>(null);
  const [datesError, setDatesError] = useState<string | null>(null);
  const [cars, setCars] = useState<CarChoice[]>([]);
  const compliance = useCarCompliance();
  const [bookingNumLoading, setBookingNumLoading] = useState(mode === 'add');

  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);

  // Find the customer first, or start a new one. Editing can swap the customer too.
  const [customerStep, setCustomerStep] = useState<'search' | 'selected' | 'new'>(
    mode === 'add' && !existingCustomerId ? 'search' : 'selected',
  );
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | undefined>(originalCustomerId ?? existingCustomerId);
  const [idOwner, setIdOwner] = useState<{ id: string; name: string; banned: boolean; reason: string | null } | null>(null);
  const [phoneSharers, setPhoneSharers] = useState<string[]>([]);
  const [banMatch, setBanMatch] = useState<BanMatch | null>(null);
  const savedIdNumber = useRef<string | null>(null);
  // A new customer created by a submit whose booking then failed. Retrying has to
  // reuse them, or the second attempt would trip the duplicate-ID rule on itself.
  const createdCustomerId = useRef<string | null>(null);

  const [docIdPhoto, setDocIdPhoto] = useState<File | null>(null);
  const [docIdPhotoBack, setDocIdPhotoBack] = useState<File | null>(null);
  const [docDrivingLicense, setDocDrivingLicense] = useState<File | null>(null);
  const [docDrivingLicenseBack, setDocDrivingLicenseBack] = useState<File | null>(null);
  const [docEntryStamp, setDocEntryStamp] = useState<File | null>(null);
  const [existingDocUrls, setExistingDocUrls] = useState(EMPTY_DOCS);

  const [existingLedger, setExistingLedger] = useState<{ rental: LedgerRow | null; deposit: LedgerRow | null; payment: LedgerRow | null }>({
    rental: null, deposit: null, payment: null,
  });

  // An extension adds its own rental and payment rows. The form edits only the first
  // of each, as it always has, so the summary adds the rest to stay truthful.
  const [otherLedger, setOtherLedger] = useState({ rental: 0, paid: 0 });
  const [payment, setPayment] = useState<PaymentChoice>(NEW_PAYMENT);
  const paymentAccounts = usePaymentAccounts();

  const busyCars = useBusyCars(form.start_date, form.end_date, editId);
  const selectedCar = cars.find((car) => String(car.id) === form.car_id) ?? null;
  const carIsBusy = Boolean(form.car_id && busyCars?.has(Number(form.car_id)));

  /** Values loaded from the database are the starting point, not edits. */
  const applyLoaded = useCallback((patch: Partial<BookingFormData>) => {
    setForm((current) => ({ ...current, ...patch }));
    setBaseline((current) => ({ ...current, ...patch }));
  }, []);

  // Every customer document goes through this one uploader. The key is keyed on
  // the customer id — never the name — because Supabase Storage rejects
  // non-ASCII object keys (Turkish/Arabic names) and same-name customers would
  // otherwise overwrite each other.
  const uploadDocById = async (file: File, customerId: number | string, fieldName: string): Promise<string | null> => {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
    const path = `${customerId}/${fieldName}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('customers_doc').upload(path, file, { upsert: true });
    if (error) {
      showToast(`Couldn't upload ${fieldName.replace(/-/g, ' ')}`, 'error');
      return null;
    }
    return supabase.storage.from('customers_doc').getPublicUrl(path).data.publicUrl;
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: carsData } = await supabase
        .from('cars').select('id, plate_number, model_group(name)').eq('is_active', true);
      if (!active) return;
      setCars(((carsData ?? []) as Array<{
        id: number;
        plate_number: string;
        model_group: { name: string } | { name: string }[] | null;
      }>).map((car) => {
        const group = car.model_group;
        return {
          id: car.id,
          plate_number: car.plate_number,
          model: Array.isArray(group) ? (group[0]?.name ?? '') : group?.name ?? '',
        };
      }));

      if (mode === 'add') {
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        const prefix = `HOM-${mm}-${yy}-`;
        const { count } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .like('booking_number', `${prefix}%`);
        if (!active) return;
        const seq = String((count ?? 0) + 1).padStart(3, '0');
        applyLoaded({ booking_number: `${prefix}${seq}` });
        setBookingNumLoading(false);
      }
    })();
    return () => { active = false; };
  }, [mode, applyLoaded]);

  // The customer this booking belongs to
  useEffect(() => {
    if (!linkedCustomerId) return undefined;
    let active = true;
    supabase
      .from('customers')
      .select('*')
      .eq('id', linkedCustomerId)
      .single()
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        const customer = data as CustomerRow;
        applyLoaded(customerFormFields(customer));
        setExistingDocUrls({
          id_photo_url: customer.id_photo_url ?? null,
          id_photo_back_url: customer.id_photo_back_url ?? null,
          driving_license_photo_url: customer.driving_license_photo_url ?? null,
          driving_license_back_url: customer.driving_license_back_url ?? null,
          entry_stamp_photo_url: customer.entry_stamp_photo_url ?? null,
        });
        savedIdNumber.current = customer.id_number;
        if (mode === 'add' || linkedCustomerId !== originalCustomerId) {
          customerBanMatch(customer.id, customer.id_number, customer.phone)
            .then((match) => { if (active) setBanMatch(match); })
            .catch(() => { /* Submit checks again, and reports a failure there. */ });
        }
      });
    return () => { active = false; };
  }, [mode, linkedCustomerId, originalCustomerId, applyLoaded]);

  const set = <K extends keyof BookingFormData>(key: K, value: BookingFormData[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (mode !== 'edit' || !editId) return undefined;
    let active = true;
    supabase
      .from('customer_accounting_ledger')
      .select('id, type, amount, pay_method')
      .eq('booking_id', editId)
      .in('type', ['rental', 'deposit', 'payment'])
      .then(({ data }) => {
        if (!active || !data) return;
        const rows = data as Array<LedgerRow & { type: string }>;
        const rental = rows.find((row) => row.type === 'rental') ?? null;
        const deposit = rows.find((row) => row.type === 'deposit') ?? null;
        const payment = rows.find((row) => row.type === 'payment') ?? null;
        const sumOthers = (type: string, first: LedgerRow | null) => rows
          .filter((row) => row.type === type && row.id !== first?.id)
          .reduce((sum, row) => sum + Number(row.amount), 0);
        setOtherLedger({ rental: sumOthers('rental', rental), paid: sumOthers('payment', payment) });
        setExistingLedger({
          rental: rental && { id: rental.id, amount: rental.amount },
          deposit: deposit && { id: deposit.id, amount: deposit.amount, pay_method: deposit.pay_method },
          payment: payment && { id: payment.id, amount: payment.amount, pay_method: payment.pay_method },
        });
        // Amounts are stored in TRY. Rental's fin_currency starts on TRY, and rows
        // that already exist always show in lira.
        applyLoaded({
          fin_rental_amount: rental ? String(rental.amount) : '',
          fin_deposit_amount: deposit ? String(deposit.amount) : '',
          fin_paid_amount: payment ? String(payment.amount) : '',
        });
      });
    return () => { active = false; };
  }, [mode, editId, applyLoaded]);

  const handleFinCurrencyChange = (next: BookingCurrency) => {
    if (next === form.fin_currency) return;
    if (!usdRate) { set('fin_currency', next); return; }
    const toTRYFactor = form.fin_currency === 'USD' ? usdRate : 1;
    const fromTRYFactor = next === 'USD' ? 1 / usdRate : 1;
    const convert = (value: string) => {
      const amount = parseFloat(value);
      if (!value || Number.isNaN(amount) || amount === 0) return value;
      return String(Math.round(amount * toTRYFactor * fromTRYFactor * 100) / 100);
    };
    setForm((current) => ({
      ...current,
      fin_currency: next,
      fin_rental_amount: convert(current.fin_rental_amount),
    }));
  };

  // ── Choosing the customer ────────────────────────────────────────────────
  const clearCustomerChecks = () => {
    setIdOwner(null);
    setPhoneSharers([]);
    setBanMatch(null);
    setFormError(null);
    setCustomerErrors({});
  };

  const pickCustomer = (id: string) => {
    clearCustomerChecks();
    setLinkedCustomerId(id);
    setCustomerStep('selected');
  };

  const startNewCustomer = (query: string) => {
    clearCustomerChecks();
    const typed = prefillFromQuery(query);
    const phone = typed.phone ? parseStoredPhone(typed.phone) : null;
    setForm((current) => ({
      ...current,
      cust_first_name: typed.first_name ?? '',
      cust_last_name: typed.last_name ?? '',
      cust_id_number: typed.id_number ?? '',
      ...(phone && { cust_phone_dial: phone.dial, cust_phone: phone.local.replace(/^0/, '') }),
    }));
    setCustomerStep('new');
  };

  const changeCustomer = () => {
    clearCustomerChecks();
    setLinkedCustomerId(undefined);
    createdCustomerId.current = null;
    savedIdNumber.current = null;
    setExistingDocUrls(EMPTY_DOCS);
    setForm((current) => {
      const blank = Object.fromEntries(Object.entries(EMPTY_FORM).filter(([key]) => key.startsWith('cust_')));
      return { ...current, ...blank };
    });
    setCustomerStep('search');
  };

  const currentCustomerId = () => linkedCustomerId ?? createdCustomerId.current;
  const fullPhone = () => (form.cust_phone ? `${form.cust_phone_dial}${form.cust_phone}` : null);

  /** No duplicate is allowed, so an ID that's already on file has to become that customer. */
  const checkIdOwner = async () => {
    if (customerStep !== 'new') return;
    const idNumber = form.cust_id_number.trim();
    if (!isValidIdNumber(idNumber)) { setIdOwner(null); return; }
    try {
      const matches = await searchCustomers(idNumber, 5);
      const owner = matches.find((row) => row.match_type === 'id_number' && row.id !== createdCustomerId.current);
      setIdOwner(owner ? { id: owner.id, name: owner.full_name, banned: owner.is_banned, reason: owner.ban_reason } : null);
    } catch {
      // Only the hint is lost. The database still refuses a duplicate at save.
    }
  };

  const checkPhoneSharers = async () => {
    if (mode !== 'add') return;
    const phone = fullPhone();
    if (!phone) { setPhoneSharers([]); return; }
    try {
      const others = await customersWithPhone(phone, currentCustomerId());
      setPhoneSharers(others.map((other) => other.full_name));
    } catch {
      // A warning only, so a failed lookup shouldn't get in the way.
    }
  };

  // ── Validation ───────────────────────────────────────────────────────────
  const showFirstError = () => {
    requestAnimationFrame(() => {
      document.querySelector('[data-field-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const validateCustomer = (): boolean => {
    if (customerStep === 'search') {
      setFormError('Search for the customer, or add a new one.');
      return false;
    }
    const errors: CustomerFieldErrors = {
      ...(!form.cust_id_number.trim() && { cust_id_number: 'ID number is required' }),
      ...(!form.cust_first_name.trim() && { cust_first_name: 'First name is required' }),
      ...(!form.cust_last_name.trim() && { cust_last_name: 'Last name is required' }),
      ...(!form.cust_nationality && { cust_nationality: 'Nationality is required' }),
      ...(!form.cust_phone.trim() && { cust_phone: 'Phone number is required' }),
      ...(!form.cust_license_issue_date.trim() && { cust_license_issue_date: 'License issue date is required' }),
    };
    setCustomerErrors(errors);
    if (Object.keys(errors).length > 0) { showFirstError(); return false; }
    if (mode === 'add' && idOwner) {
      setFormError(`This ID belongs to ${idOwner.name}. Use that customer instead.`);
      return false;
    }
    return true;
  };

  const validateCarAndDates = (): boolean => {
    const dates = !form.start_date || !form.end_date ? 'Pick the start and end dates' : null;
    const car = !form.car_id ? 'Select a car'
      : carIsBusy ? 'This car is already booked for those dates. Choose other dates or another car.' : null;
    setDatesError(dates);
    setCarError(car);
    if (dates || car) showFirstError();
    return !dates && !car;
  };

  /** The database has the final say, but a clear stop here saves creating a customer who can't book. */
  const passesBanCheck = async (): Promise<boolean> => {
    try {
      const ban = await customerBanMatch(currentCustomerId(), form.cust_id_number, fullPhone());
      setBanMatch(ban);
      return !ban;
    } catch {
      setFormError("Couldn't check whether this customer is banned. Try again.");
      return false;
    }
  };

  const goToStep = (index: number) => {
    setFormError(null);
    setStep(index);
    setReached((current) => Math.max(current, index));
  };

  const goNext = async () => {
    setFormError(null);
    if (step === 0) {
      if (!validateCustomer() || !(await passesBanCheck())) return;
    }
    if (step === 1 && !validateCarAndDates()) return;
    goToStep(step + 1);
  };

  // ── Saving ───────────────────────────────────────────────────────────────
  const finishSaving = () => {
    savingRef.current = false;
    setSaving(false);
  };

  const failSaving = (message: string) => {
    finishSaving();
    setFormError(message);
  };

  const createBooking = async () => {
    const phone = fullPhone();
    const knownCustomerId = currentCustomerId();

    if (!(await passesBanCheck())) { finishSaving(); return false; }

    // Step 1: create the customer, or update the one this booking belongs to
    const customerFields = {
      id_type: form.cust_id_type,
      first_name: form.cust_first_name,
      last_name: form.cust_last_name,
      phone,
      nationality: form.cust_nationality || null,
      language: normalizeLanguage(form.cust_language),
      driving_license_number: form.cust_driving_license || null,
      address: form.cust_address || null,
      birth_date: form.cust_birth_date || null,
      license_issue_date: form.cust_license_issue_date || null,
      notes: form.cust_notes || null,
    };
    const { data: custData, error: custError } = knownCustomerId
      ? await supabase
          .from('customers')
          .update({ ...customerFields, ...idNumberChange(savedIdNumber.current, form.cust_id_number) })
          .eq('id', knownCustomerId)
          .select('id')
          .single()
      : await supabase
          .from('customers')
          .insert({ ...customerFields, id_number: form.cust_id_number || null })
          .select('id')
          .single();

    if (custError) {
      const friendly = friendlyCustomerError(custError.message);
      if (friendly.kind === 'duplicate_id') {
        setIdOwner({ id: friendly.customerId, name: friendly.name, banned: false, reason: null });
      }
      failSaving(friendly.text);
      return false;
    }

    // Step 2: upload documents and patch customer
    const customerId = (custData as { id: string }).id;
    if (!linkedCustomerId) createdCustomerId.current = String(customerId);
    savedIdNumber.current = form.cust_id_number || null;
    const docUpdates: Record<string, string> = {};

    const [idUrl, idBackUrl, dlUrl, dlBackUrl, esUrl] = await Promise.all([
      docIdPhoto ? uploadDocById(docIdPhoto, customerId, 'id-photo') : Promise.resolve(null),
      docIdPhotoBack ? uploadDocById(docIdPhotoBack, customerId, 'id-photo-back') : Promise.resolve(null),
      docDrivingLicense ? uploadDocById(docDrivingLicense, customerId, 'driving-license') : Promise.resolve(null),
      docDrivingLicenseBack ? uploadDocById(docDrivingLicenseBack, customerId, 'driving-license-back') : Promise.resolve(null),
      docEntryStamp ? uploadDocById(docEntryStamp, customerId, 'entry-stamp') : Promise.resolve(null),
    ]);
    if (idUrl) docUpdates.id_photo_url = idUrl;
    if (idBackUrl) docUpdates.id_photo_back_url = idBackUrl;
    if (dlUrl) docUpdates.driving_license_photo_url = dlUrl;
    if (dlBackUrl) docUpdates.driving_license_back_url = dlBackUrl;
    if (esUrl) docUpdates.entry_stamp_photo_url = esUrl;
    if (Object.keys(docUpdates).length > 0) {
      const { error: docError } = await supabase.from('customers').update(docUpdates).eq('id', customerId);
      if (docError) showToast("The documents uploaded, but couldn't be saved to the customer", 'error');
    }

    // Step 3: create booking with the customer id. Without a choice, the column's
    // own default still applies for insurance.
    const carId = Number(form.car_id);
    const insurance = insuranceValue(form);
    const services = additionalServicesValue(form);
    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        booking_number: form.booking_number,
        status: form.status,
        car_id: carId,
        customer_id: customerId,
        start_date: form.start_date,
        end_date: form.end_date,
        kabis_reported: false,
        invoice_issued: false,
        pickup_location: form.pickup_location || null,
        dropoff_location: form.dropoff_location || null,
        km_at_delivery: form.km_at_delivery ? Number(form.km_at_delivery) : null,
        fuel_at_delivery: form.fuel_at_delivery || null,
        ...(insurance && { insurance_type: insurance }),
        ...(services && { additional_services: services }),
      })
      .select('id')
      .single();

    if (bookingError) { failSaving(friendlyBookingError(bookingError.message)); return false; }

    // Step 4: insert ledger rows (skip if amount is 0 or empty)
    const bookingId = (bookingData as { id: number }).id;
    const rental = parseFloat(form.fin_rental_amount);
    if (rental > 0) {
      const { error: ledgerError } = await supabase.from('customer_accounting_ledger').insert({
        booking_id: bookingId, customer_id: customerId, car_id: carId, type: 'rental',
        amount: toTry(rental, form.fin_currency, usdRate), direction: 'OUT', description: 'Rental fee',
      });
      if (ledgerError) showToast('Booking saved, but the rental charge failed', 'error');
    }
    await takePayments(bookingId, newPayments());

    rememberCar(carId);
    finishSaving();
    return true;
  };

  /** New money only: a row that already exists is edited, or locked if it's recorded. */
  const newPayments = () => [
    ...(!existingLedger.deposit && parseAmount(form.fin_deposit_amount) > 0 ? [{ type: 'deposit' as const, amount: parseAmount(form.fin_deposit_amount) }] : []),
    ...(!existingLedger.payment && parseAmount(form.fin_paid_amount) > 0 ? [{ type: 'payment' as const, amount: parseAmount(form.fin_paid_amount) }] : []),
  ];

  /** One at a time. A failure doesn't undo the booking, which is already saved. */
  const takePayments = async (bookingId: number, items: Array<{ type: 'deposit' | 'payment'; amount: number }>) => {
    const receipts: EnvelopeReceipt[] = [];
    for (const item of items) {
      try {
        const result = await recordCustomerPayment({ bookingId, type: item.type, amount: item.amount, choice: payment });
        receipts.push(...envelopeReceipt(result));
      } catch (failure) {
        showToast(`Booking saved, but the ${item.type} wasn't recorded: ${failure instanceof Error ? failure.message : 'try again'}`, 'error');
      }
    }
    showEnvelopes(receipts);
  };

  const updateBooking = async () => {
    const customerId = linkedCustomerId as string;
    const customerChanged = customerId !== originalCustomerId;
    if (customerChanged && !(await passesBanCheck())) { finishSaving(); return false; }

    const { error: bookingError } = await supabase
      .from('bookings')
      .update({
        booking_number: form.booking_number,
        status: form.status,
        car_id: Number(form.car_id),
        start_date: form.start_date,
        end_date: form.end_date,
        is_currently_active: form.is_currently_active,
        pickup_location: form.pickup_location || null,
        dropoff_location: form.dropoff_location || null,
        km_at_delivery: form.km_at_delivery ? Number(form.km_at_delivery) : null,
        fuel_at_delivery: form.fuel_at_delivery || null,
        insurance_type: insuranceValue(form),
        additional_services: additionalServicesValue(form, booking?.additional_services),
        ...(customerChanged && { customer_id: customerId }),
      })
      .eq('id', editId as number);

    if (bookingError) { failSaving(friendlyBookingError(bookingError.message)); return false; }

    if (customerChanged) {
      try {
        await moveBookingToCustomer(editId as number, customerId);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Some of this booking's records didn't move to the new customer", 'error');
      }
    }

    const [idUrl, idBackUrl, dlUrl, dlBackUrl, esUrl] = await Promise.all([
      docIdPhoto ? uploadDocById(docIdPhoto, customerId, 'id-photo') : Promise.resolve(null),
      docIdPhotoBack ? uploadDocById(docIdPhotoBack, customerId, 'id-photo-back') : Promise.resolve(null),
      docDrivingLicense ? uploadDocById(docDrivingLicense, customerId, 'driving-license') : Promise.resolve(null),
      docDrivingLicenseBack ? uploadDocById(docDrivingLicenseBack, customerId, 'driving-license-back') : Promise.resolve(null),
      docEntryStamp ? uploadDocById(docEntryStamp, customerId, 'entry-stamp') : Promise.resolve(null),
    ]);

    const { error: custError } = await supabase
      .from('customers')
      .update({
        first_name: form.cust_first_name,
        last_name: form.cust_last_name,
        phone: fullPhone(),
        nationality: form.cust_nationality || null,
        language: normalizeLanguage(form.cust_language),
        id_type: form.cust_id_type,
        ...idNumberChange(savedIdNumber.current, form.cust_id_number),
        driving_license_number: form.cust_driving_license || null,
        address: form.cust_address || null,
        birth_date: form.cust_birth_date || null,
        license_issue_date: form.cust_license_issue_date || null,
        notes: form.cust_notes || null,
        ...(idUrl && { id_photo_url: idUrl }),
        ...(idBackUrl && { id_photo_back_url: idBackUrl }),
        ...(dlUrl && { driving_license_photo_url: dlUrl }),
        ...(dlBackUrl && { driving_license_back_url: dlBackUrl }),
        ...(esUrl && { entry_stamp_photo_url: esUrl }),
      })
      .eq('id', customerId);

    if (custError) showToast(`Booking saved, but the customer wasn't: ${friendlyCustomerError(custError.message).text}`, 'error');

    const ledgerOps: Array<PromiseLike<{ error: unknown }>> = [];
    const processLedgerRow = (type: string, fieldValue: string, existing: LedgerRow | null, currency: BookingCurrency) => {
      const amount = parseFloat(fieldValue);
      const hasAmount = !Number.isNaN(amount) && amount > 0;
      if (existing) {
        ledgerOps.push(hasAmount
          ? supabase.from('customer_accounting_ledger').update({ amount: toTry(amount, currency, usdRate) }).eq('id', existing.id)
          : supabase.from('customer_accounting_ledger').delete().eq('id', existing.id));
      } else if (hasAmount && type === 'rental') {
        ledgerOps.push(supabase.from('customer_accounting_ledger').insert({
          booking_id: editId,
          customer_id: customerId,
          car_id: Number(form.car_id),
          type,
          amount: toTry(amount, currency, usdRate),
          direction: 'OUT',
          description: 'Rental fee',
        }));
      }
    };

    processLedgerRow('rental', form.fin_rental_amount, existingLedger.rental, form.fin_currency);
    // Older rows can still be corrected here. New money goes through takePayments.
    if (!isRecordedPayment(existingLedger.deposit ?? {})) processLedgerRow('deposit', form.fin_deposit_amount, existingLedger.deposit, 'TRY');
    if (!isRecordedPayment(existingLedger.payment ?? {})) processLedgerRow('payment', form.fin_paid_amount, existingLedger.payment, 'TRY');

    if (ledgerOps.length > 0) {
      const results = await Promise.all(ledgerOps);
      if (results.some((result) => result.error)) showToast('Ledger update failed', 'error');
    }
    await takePayments(editId as number, newPayments());

    finishSaving();
    return true;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    setFormError(null);

    if (mode === 'add' && step < REVIEW_STEP) { await goNext(); return; }

    if (!validateCustomer()) { if (mode === 'add') setStep(0); return; }
    if (!validateCarAndDates()) { if (mode === 'add') setStep(1); return; }
    if (form.fin_currency === 'USD' && !usdRate && parseAmount(form.fin_rental_amount) > 0) {
      setFormError("Today's USD rate hasn't loaded. Reload, or enter the amounts in TRY.");
      return;
    }
    if (paymentIssue) { setFormError(paymentIssue); return; }

    savingRef.current = true;
    setSaving(true);
    const saved = mode === 'add' ? await createBooking() : await updateBooking();
    if (!saved) return;
    onSaved();
    onClose();
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const customerChanged = mode === 'edit' && linkedCustomerId !== originalCustomerId;
  const changed = useMemo(() => changedFields(baseline, form, usdRate), [baseline, form, usdRate]);
  const documentCount = [docIdPhoto, docIdPhotoBack, docDrivingLicense, docDrivingLicenseBack, docEntryStamp].filter(Boolean).length;
  const changeCount = changed.length + documentCount + (customerChanged ? 1 : 0);
  const isChanged = (field: string) => mode === 'edit' && changed.includes(field);

  const days = rangeDays(form.start_date, form.end_date);
  const total = toTry(parseAmount(form.fin_rental_amount), form.fin_currency, usdRate) + otherLedger.rental;
  const paidField = parseAmount(form.fin_paid_amount);
  const paid = (existingLedger.payment ? paidField : inLira(paidField, payment.currency, rates)) + otherLedger.paid;
  const insuranceLabel = PRESET_LABELS[form.insurance_type_select] && form.insurance_type_select !== OTHER_PRESET
    ? PRESET_LABELS[form.insurance_type_select]
    : insuranceValue(form);
  const extras = extrasLabel(form);
  const customerName = `${form.cust_first_name} ${form.cust_last_name}`.trim();

  // The money is entered on Review, so before that the footer carries the running total.
  const footerTotal = mode === 'add' && step > 0 && step < REVIEW_STEP;
  const paymentIssue = newPayments().length > 0 ? paymentProblem(payment, paymentAccounts.list, rates) : null;

  const summaryItems = [
    { label: 'Car', value: selectedCar ? <LicensePlate plate={selectedCar.plate_number} /> : '—' },
    { label: 'Dates', value: formatShortRange(form.start_date, form.end_date) },
    { label: 'Days', value: days || '—' },
    { label: 'Insurance', value: insuranceLabel || '—' },
    { label: 'Extras', value: extras || '—' },
    ...(footerTotal ? [] : [{ label: 'Total', value: formatLira(total), strong: true }]),
    { label: 'Paid', value: formatLira(paid) },
    { label: 'Remaining', value: formatLira(total - paid), strong: true },
  ];

  // ── Sections ─────────────────────────────────────────────────────────────
  const customerSection = (
    <FormCard icon={<UsersIcon size={15} />} title="Customer">
      {banMatch && <div className="sm:col-span-2"><BanAlert match={banMatch} /></div>}

      {customerStep === 'search' && (
        <div className="grid grid-cols-1 gap-2 sm:col-span-2">
          <CustomerPicker
            onSelect={(row) => pickCustomer(row.id)}
            onNew={mode === 'add' ? startNewCustomer : undefined}
          />
          {mode === 'edit' && originalCustomerId && (
            <button type="button" onClick={() => pickCustomer(originalCustomerId)} className="h-11 justify-self-start text-[12.5px] font-medium text-brand-strong md:h-8">
              Keep the current customer
            </button>
          )}
        </div>
      )}

      {customerStep !== 'search' && (
        <SelectedRow
          action={customerStep === 'selected' ? 'Change customer' : 'Back to search'}
          onAction={changeCustomer}
        >
          <span className="font-medium">{customerStep === 'new' ? 'New customer' : customerName || 'Loading…'}</span>
          {customerStep === 'selected' && <span className="text-black/50"> · changes here update their record</span>}
        </SelectedRow>
      )}

      {customerChanged && customerStep === 'selected' && (
        <Notice tone="blue" span>On save, this booking moves to the new customer, along with its ledger entries, HGS passes and replacement sheets.</Notice>
      )}

      {customerStep !== 'search' && (
        <>
          <Field label="ID number" required changed={isChanged('cust_id_number')} error={customerErrors.cust_id_number}>
            <input
              value={form.cust_id_number}
              onChange={(event) => {
                set('cust_id_number', event.target.value);
                setIdOwner(null);
                setBanMatch(null);
                setCustomerErrors((errors) => ({ ...errors, cust_id_number: undefined }));
              }}
              onBlur={checkIdOwner}
              placeholder="Passport / national ID number"
              aria-label="ID number"
              className={cn(INPUT, idOwner && 'border-[#DC2626]')}
            />
          </Field>
          <Field label="ID type" required changed={isChanged('cust_id_type')}>
            <select value={form.cust_id_type} aria-label="ID type" onChange={(event) => set('cust_id_type', event.target.value as 'passport' | 'national_id')} className={INPUT}>
              <option value="passport">Passport</option>
              <option value="national_id">National ID</option>
            </select>
          </Field>

          {idOwner && !idOwner.banned && (
            <Notice tone="red" span>
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>This ID belongs to {idOwner.name}</span>
                <button type="button" onClick={() => pickCustomer(idOwner.id)} className="min-h-[32px] font-semibold text-brand-strong">Use this customer</button>
              </span>
            </Notice>
          )}
          {idOwner?.banned && (
            <div className="sm:col-span-2">
              <BanAlert match={{ customer_id: idOwner.id, full_name: idOwner.name, ban_reason: idOwner.reason, matched_on: 'id_number' }} />
            </div>
          )}

          <Field label="First name" required changed={isChanged('cust_first_name')} error={customerErrors.cust_first_name}>
            <input value={form.cust_first_name} aria-label="First name" onChange={(event) => set('cust_first_name', event.target.value)} placeholder="First name" className={INPUT} />
          </Field>
          <Field label="Last name" required changed={isChanged('cust_last_name')} error={customerErrors.cust_last_name}>
            <input value={form.cust_last_name} aria-label="Last name" onChange={(event) => set('cust_last_name', event.target.value)} placeholder="Last name" className={INPUT} />
          </Field>

          <Field label="Driving license" changed={isChanged('cust_driving_license')}>
            <input value={form.cust_driving_license} aria-label="Driving license" onChange={(event) => set('cust_driving_license', event.target.value)} placeholder="License number" className={INPUT} />
          </Field>
          <Field label="License issue date" required changed={isChanged('cust_license_issue_date')} error={customerErrors.cust_license_issue_date}>
            <input type="date" aria-label="License issue date" value={form.cust_license_issue_date} onChange={(event) => set('cust_license_issue_date', event.target.value)} className={INPUT} />
          </Field>
          {form.cust_license_issue_date && (Date.now() - new Date(form.cust_license_issue_date).getTime()) / 86400000 < 365 && (
            <Notice tone="amber" span>Driver's license was issued less than 1 year ago. This booking may require additional review.</Notice>
          )}

          <Field label="Phone" required changed={isChanged('cust_phone') || isChanged('cust_phone_dial')} error={customerErrors.cust_phone}>
            <div className="flex gap-2">
              <DialCodePicker value={form.cust_phone_dial} onChange={(dial) => set('cust_phone_dial', dial)} />
              <input
                type="tel"
                aria-label="Phone number"
                value={form.cust_phone}
                onChange={(event) => { set('cust_phone', event.target.value); setPhoneSharers([]); setBanMatch(null); }}
                onBlur={checkPhoneSharers}
                placeholder="Phone number"
                className={cn(INPUT, 'min-w-0 flex-1')}
              />
            </div>
          </Field>
          <Field label="Nationality" required changed={isChanged('cust_nationality')} error={customerErrors.cust_nationality}>
            <select value={form.cust_nationality} aria-label="Nationality" onChange={(event) => set('cust_nationality', event.target.value)} className={INPUT}>
              <option value="">Select country…</option>
              {form.cust_nationality && !COUNTRIES.some((country) => country.name === form.cust_nationality) && (
                <option value={form.cust_nationality}>{form.cust_nationality}</option>
              )}
              {COUNTRIES.map((country) => <option key={country.code} value={country.name}>{country.flag} {country.name}</option>)}
            </select>
          </Field>
          {phoneSharers.length > 0 && (
            <Notice tone="amber" span>This phone is also used by {phoneSharers.join(', ')}</Notice>
          )}

          <Field label="Language" changed={isChanged('cust_language')}>
            <select value={form.cust_language} aria-label="Language" onChange={(event) => set('cust_language', normalizeLanguage(event.target.value))} className={INPUT}>
              {LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Birth date" changed={isChanged('cust_birth_date')}>
            <input type="date" aria-label="Birth date" value={form.cust_birth_date} onChange={(event) => set('cust_birth_date', event.target.value)} className={INPUT} />
          </Field>
          {form.cust_birth_date && (Date.now() - new Date(form.cust_birth_date).getTime()) / (86400000 * 365.25) < 22 && (
            <Notice tone="amber" span>Customer is under 22 years old. Young driver surcharge may apply.</Notice>
          )}

          <Field label="Address" span changed={isChanged('cust_address')}>
            <input value={form.cust_address} aria-label="Address" onChange={(event) => set('cust_address', event.target.value)} placeholder="Customer address" className={INPUT} />
          </Field>
        </>
      )}
    </FormCard>
  );

  const documentsSection = customerStep !== 'search' && (
    <FormCard icon={<FileIcon size={15} />} title="Customer documents">
      <DocUploadField label="ID photo" existingUrl={existingDocUrls.id_photo_url} file={docIdPhoto} onChange={setDocIdPhoto} />
      <DocUploadField label="ID photo (back)" existingUrl={existingDocUrls.id_photo_back_url} file={docIdPhotoBack} onChange={setDocIdPhotoBack} />
      <DocUploadField label="Driving license" existingUrl={existingDocUrls.driving_license_photo_url} file={docDrivingLicense} onChange={setDocDrivingLicense} />
      <DocUploadField label="Driving license (back)" existingUrl={existingDocUrls.driving_license_back_url} file={docDrivingLicenseBack} onChange={setDocDrivingLicenseBack} />
      <DocUploadField label="Entry stamp" existingUrl={existingDocUrls.entry_stamp_photo_url} file={docEntryStamp} onChange={setDocEntryStamp} />
    </FormCard>
  );

  const locationField = (label: string, select: 'pickup_location_select' | 'dropoff_location_select', custom: 'pickup_location_custom' | 'dropoff_location_custom', value: 'pickup_location' | 'dropoff_location') => (
    <Field label={label} changed={isChanged(value)}>
      <select
        aria-label={label}
        value={form[select]}
        onChange={(event) => {
          const next = event.target.value;
          setForm((current) => ({ ...current, [select]: next, [custom]: '', [value]: next === 'Other' ? '' : next }));
        }}
        className={INPUT}
      >
        <option value="">Select location…</option>
        {LOCATION_PRESETS.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
      </select>
      {form[select] === 'Other' && (
        <input
          aria-label={`${label}, custom`}
          value={form[custom]}
          onChange={(event) => setForm((current) => ({ ...current, [custom]: event.target.value, [value]: event.target.value }))}
          placeholder="Enter custom location"
          className={cn(INPUT, 'mt-1.5')}
        />
      )}
    </Field>
  );

  const carSection = (
    <FormCard icon={<CarIcon size={15} />} title="Car and dates">
      <DateRangeField
        label="Rental dates"
        required
        start={form.start_date}
        end={form.end_date}
        changed={isChanged('start_date') || isChanged('end_date')}
        error={datesError}
        onChange={(start, end) => {
          setForm((current) => ({ ...current, start_date: start, end_date: end }));
          setDatesError(null);
          setCarError(null);
        }}
      />
      <CarPicker
        label="Car"
        required
        pinRecent
        cars={cars}
        value={form.car_id}
        busy={busyCars}
        compliance={compliance}
        changed={isChanged('car_id')}
        error={carError}
        hint={busyCars ? undefined : 'Pick the dates to see which cars are free.'}
        onChange={(id) => { set('car_id', id); setCarError(null); }}
      />
      {carIsBusy && !carError && <Notice tone="red" span>This car is already booked for those dates. Choose other dates or another car.</Notice>}
      {locationField('Pickup location', 'pickup_location_select', 'pickup_location_custom', 'pickup_location')}
      {locationField('Drop-off location', 'dropoff_location_select', 'dropoff_location_custom', 'dropoff_location')}
      {mode === 'edit' && (
        <Field label="Status" span changed={isChanged('status')}>
          <StatusControl value={form.status} onChange={(value) => set('status', value)} />
        </Field>
      )}
      {mode === 'edit' && (
        <Field label="Currently active" span changed={isChanged('is_currently_active')} hint="Manual override">
          <Segmented
            ariaLabel="Currently active"
            value={form.is_currently_active ? 'yes' : 'no'}
            options={[{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Inactive' }]}
            onChange={(value) => set('is_currently_active', value === 'yes')}
          />
        </Field>
      )}
    </FormCard>
  );

  const coverSection = (
    <CoverSection form={form} setForm={setForm} insuranceChanged={isChanged('insurance')} extrasChanged={isChanged('extras')} />
  );

  const conditionSection = (
    <FormCard icon={<Tag size={15} />} title="Vehicle condition at delivery">
      <Field label="KM at delivery" changed={isChanged('km_at_delivery')}>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          aria-label="KM at delivery"
          value={form.km_at_delivery}
          onChange={(event) => set('km_at_delivery', event.target.value)}
          placeholder="e.g. 45230"
          className={INPUT}
        />
      </Field>
      <Field label={FUEL_RANGE_LABEL} changed={isChanged('fuel_at_delivery')}>
        <FuelRangeInput value={form.fuel_at_delivery} onChange={(value) => set('fuel_at_delivery', value)} className={INPUT} />
      </Field>
    </FormCard>
  );

  const takesMoney = newPayments().length > 0;
  const skipPayment = () => {
    if (!existingLedger.deposit) set('fin_deposit_amount', '');
    if (!existingLedger.payment) set('fin_paid_amount', '');
  };

  const paymentSection = (
    <FormCard
      icon={<WalletIcon size={15} />}
      title="Payment"
    >
      <MoneyField label="Rental amount" span value={form.fin_rental_amount} currency={form.fin_currency} rate={usdRate} changed={isChanged('fin_rental_amount')} onChange={(value) => set('fin_rental_amount', value)} onCurrency={handleFinCurrencyChange} />
      <PaymentAmount
        label="Deposit"
        value={form.fin_deposit_amount}
        currency={existingLedger.deposit ? 'TRY' : payment.currency}
        disabled={isRecordedPayment(existingLedger.deposit ?? {})}
        hint={isRecordedPayment(existingLedger.deposit ?? {}) ? RECORDED_HINT : undefined}
        onChange={(value) => set('fin_deposit_amount', value)}
      />
      <PaymentAmount
        label="Paid amount"
        value={form.fin_paid_amount}
        currency={existingLedger.payment ? 'TRY' : payment.currency}
        disabled={isRecordedPayment(existingLedger.payment ?? {})}
        hint={isRecordedPayment(existingLedger.payment ?? {}) ? RECORDED_HINT : undefined}
        onChange={(value) => set('fin_paid_amount', value)}
      />
      {(!existingLedger.deposit || !existingLedger.payment) && (
        <Field label="Received in" span>
          <CurrencyField value={payment.currency} onChange={(currency) => setPayment({ ...payment, currency })} />
        </Field>
      )}
      {takesMoney && <PaymentMethod choice={payment} accounts={paymentAccounts} onChange={setPayment} onSkip={skipPayment} />}
      {(otherLedger.rental > 0 || otherLedger.paid > 0) && (
        <Notice tone="blue" span>
          This booking also has {formatLira(otherLedger.rental)} in other rental charges and {formatLira(otherLedger.paid)} in other payments, from extensions. The summary includes them. Change those in Accounting.
        </Notice>
      )}
      {form.fin_currency === 'USD' && !usdRate && (
        <Notice tone="amber" span>Today's USD rate hasn't loaded yet.</Notice>
      )}
    </FormCard>
  );

  const notesField = (
    <Field label="Customer notes" span changed={isChanged('cust_notes')}>
      <textarea
        value={form.cust_notes}
        aria-label="Customer notes"
        onChange={(event) => set('cust_notes', event.target.value)}
        placeholder="Any notes about this customer…"
        rows={2}
        className={cn(INPUT, '!h-auto resize-y py-2.5')}
      />
    </Field>
  );

  const reviewRows = [
    ['Customer', customerName || '—'],
    ['Car', selectedCar ? <span className="inline-flex items-center gap-2"><LicensePlate plate={selectedCar.plate_number} /> {selectedCar.model}</span> : '—'],
    ['Dates', `${formatDate(form.start_date)} → ${formatDate(form.end_date)}${days ? ` · ${formatDays(days)}` : ''}`],
    ['Pickup', form.pickup_location || '—'],
    ['Drop-off', form.dropoff_location || '—'],
    ['Insurance', insuranceLabel || '—'],
    ['Extras', extras || '—'],
    ['KM at delivery', form.km_at_delivery || '—'],
    ['Fuel range', formatFuelRange(form.fuel_at_delivery)],
  ] as const;

  const reviewSection = (
    <>
      <FormCard icon={<CalendarDays size={15} />} title="Review">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px] sm:col-span-2">
          {reviewRows.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="text-black/50">{label}</dt>
              <dd className="min-w-0 break-words text-foreground">{value}</dd>
            </React.Fragment>
          ))}
        </dl>
        <Field label="Status" span>
          <StatusControl value={form.status} onChange={(value) => set('status', value)} />
        </Field>
        {notesField}
      </FormCard>
      {paymentSection}
    </>
  );

  const errors = (
    <>
      {banMatch && step > 0 && <BanAlert match={banMatch} />}
      {formError && <Notice tone="red">{formError}</Notice>}
    </>
  );

  const addSteps = [
    <>{customerSection}{documentsSection}</>,
    carSection,
    coverSection,
    conditionSection,
    reviewSection,
  ];

  const dirty = changeCount > 0 || (mode === 'add' && (customerStep !== 'search' || step > 0));

  return (
    <BookingSheet
      label={mode === 'add' ? 'New booking' : 'Edit booking'}
      title={mode === 'add' ? 'New booking' : 'Edit booking'}
      subtitle={mode === 'add' ? STEPS[step].label : customerName || undefined}
      badge={(
        <span className="rounded-md bg-black/[0.05] px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums text-black/60">
          {bookingNumLoading ? 'Generating…' : form.booking_number}
        </span>
      )}
      stepper={mode === 'add' ? <Stepper steps={STEPS} current={step} reached={reached} onJump={goToStep} /> : undefined}
      summary={mode === 'add' && step === 0 ? undefined : <SummaryBar
        headline={<>
          {selectedCar && <LicensePlate plate={selectedCar.plate_number} />}
          <span className="truncate">{days ? `${formatDays(days)} · ` : ''}Remaining <strong className="font-semibold">{formatLira(total - paid)}</strong></span>
        </>}
        items={summaryItems}
      />}
      dirty={dirty}
      saving={saving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(requestClose) => (
        <div className="flex items-center gap-2">
          {footerTotal ? <FooterTotal amount={total} /> : (
            <>
              <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={requestClose}>Cancel</Button>
              <span className="flex-1 max-sm:hidden" />
            </>
          )}
          {mode === 'add' && step > 0 && (
            <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={() => goToStep(step - 1)}>Back</Button>
          )}
          <PrimaryButton saving={saving} disabled={(mode === 'edit' || step === REVIEW_STEP) && Boolean(paymentIssue)}>
            {mode === 'edit'
              ? `Save changes${changeCount > 0 ? ` (${changeCount})` : ''}`
              : step < REVIEW_STEP ? 'Continue' : 'Create booking'}
          </PrimaryButton>
        </div>
      )}
    >
      {mode === 'add' ? addSteps[step] : (
        <>
          {customerSection}
          {documentsSection}
          {carSection}
          {coverSection}
          {conditionSection}
          {paymentSection}
          <FormCard icon={<FileIcon size={15} />} title="Notes">{notesField}</FormCard>
        </>
      )}
      {errors}
    </BookingSheet>
  );
};

/** `completed` isn't offered as a choice, but a completed booking has to keep showing it. */
const StatusControl: React.FC<{ value: BookingStatus; onChange: (value: BookingStatus) => void }> = ({ value, onChange }) => (
  <Segmented
    ariaLabel="Status"
    value={value}
    onChange={onChange}
    options={value === 'completed' ? [...STATUS_OPTIONS, { value: 'completed', label: 'Completed' }] : STATUS_OPTIONS}
  />
);
