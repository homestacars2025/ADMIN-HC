import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from '../../components/media/MediaIcons';
import { Button, Select } from '../../components/media/MediaUI';
import { FileSlot } from '../../components/shared/FileDrop';
import { fetchCashAccounts, type CashAccount } from '../../lib/cashAccounts';
import { istanbulDate } from '../../lib/customers';
import { fetchFineCars, type FineCar } from '../../lib/fines';
import { CURRENCIES, CURRENCY_SYMBOLS, formatMoney, parseAmount, type Currency } from '../../lib/money';
import { addSupplierTx, uploadSupplierReceipt, type Supplier, type SupplierTx } from '../../lib/suppliers';
import { CarPicker } from '../bookings/CarPicker';
import { DateField } from '../bookings/DateRangeField';
import { BookingSheet, Field, FOOTER_BUTTON, FormCard, INPUT, Notice, PrimaryButton, Segmented } from '../bookings/ui';
import { CarIcon, FileIcon, WalletIcon } from '../customers/ui';

type Errors = Partial<Record<'date' | 'amount' | 'account', string>>;

const KIND_OPTIONS = [{ value: 'bill', label: 'Bill' }, { value: 'payment', label: 'Payment' }] as const;
const CURRENCY_OPTIONS = CURRENCIES.map((value) => ({ value, label: `${CURRENCY_SYMBOLS[value]} ${value}` }));

export const SupplierTxSheet: React.FC<{
  supplier: Supplier;
  kind: SupplierTx['kind'];
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ supplier, kind: startKind, onClose, onSaved }) => {
  const [kind, setKind] = useState<SupplierTx['kind']>(startKind);
  const [date, setDate] = useState(istanbulDate());
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [carId, setCarId] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [cars, setCars] = useState<FineCar[]>([]);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchFineCars(), fetchCashAccounts()])
      .then(([carRows, accountRows]) => {
        if (cancelled) return;
        setCars(carRows.filter((car) => !car.inactive));
        setAccounts(accountRows);
      })
      .catch((failure: unknown) => { if (!cancelled) setFormError(failure instanceof Error ? failure.message : "Couldn't load the form."); });
    return () => { cancelled = true; };
  }, []);

  const usable = useMemo(
    () => accounts.filter((account) => account.is_active && account.currencies.includes(currency)),
    [accounts, currency],
  );

  // A safe that doesn't hold this currency can't be the one it was paid from.
  useEffect(() => {
    if (accountId && !usable.some((account) => String(account.id) === accountId)) setAccountId('');
  }, [usable, accountId]);

  const touch = () => setDirty(true);
  const parsed = parseAmount(amount);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const next: Errors = {};
    if (!date) next.date = 'Choose the date.';
    else if (date > istanbulDate()) next.date = "This can't be in the future.";
    if (parsed === null) next.amount = 'Enter an amount above zero.';
    if (kind === 'payment' && !accountId) next.account = 'Choose where it was paid from.';
    setErrors(next);
    if (Object.keys(next).length > 0 || parsed === null) return;

    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const receiptUrl = receipt ? await uploadSupplierReceipt(supplier.id, receipt) : null;
      await addSupplierTx({
        supplier_id: supplier.id,
        kind,
        tx_date: date,
        amount: parsed,
        currency,
        car_id: carId ? Number(carId) : null,
        description: description.trim() || null,
        receipt_url: receiptUrl,
        paid_from_account_id: kind === 'payment' ? Number(accountId) : null,
      });
      onSaved(kind === 'bill' ? 'Bill added.' : 'Payment added.');
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : "This wasn't saved. Try again.");
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <BookingSheet
      narrow
      label={kind === 'bill' ? 'Add bill' : 'Add payment'}
      title={kind === 'bill' ? 'Add bill' : 'Add payment'}
      subtitle={supplier.name}
      dirty={dirty}
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
      footer={(requestClose) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={requestClose}>Cancel</Button>
          <PrimaryButton saving={saving}>
            {kind === 'bill' ? 'Add bill' : 'Add payment'}{parsed !== null ? ` · ${formatMoney(parsed, currency)}` : ''}
          </PrimaryButton>
        </div>
      )}
    >
      <FormCard icon={<WalletIcon size={15} />} title="Amount">
        <Field label="Type" span>
          <Segmented ariaLabel="Type" value={kind} options={KIND_OPTIONS} onChange={(value) => { setKind(value); touch(); }} />
        </Field>
        <Field label="Amount" required error={errors.amount}>
          <input className={`${INPUT} tabular-nums`} inputMode="decimal" value={amount} placeholder="0" onChange={(event) => { setAmount(event.target.value); touch(); }} />
        </Field>
        <Field label="Currency">
          <Segmented ariaLabel="Currency" value={currency} options={CURRENCY_OPTIONS} onChange={(value) => { setCurrency(value); touch(); }} />
        </Field>
        {kind === 'payment' && (
          <Field label="Paid from" required span error={errors.account}>
            <Select
              value={accountId}
              options={[{ value: '', label: 'Choose an account' }, ...usable.map((account) => ({ value: String(account.id), label: account.name }))]}
              placeholderMuted
              size="lg"
              ariaLabel="Paid from"
              onChange={(value) => { setAccountId(value); touch(); }}
            />
          </Field>
        )}
      </FormCard>

      <FormCard icon={<CalendarDays size={15} />} title="Details">
        <DateField label="Date" required span value={date} error={errors.date} onChange={(day) => { setDate(day); touch(); }} />
        <Field label="Description" span>
          <input className={INPUT} value={description} onChange={(event) => { setDescription(event.target.value); touch(); }} />
        </Field>
      </FormCard>

      <FormCard icon={<CarIcon size={15} />} title="Car">
        <CarPicker label="Car" cars={cars} value={carId} hint="Optional" onChange={(id) => { setCarId(id); touch(); }} />
      </FormCard>

      <FormCard icon={<FileIcon size={15} />} title="Receipt">
        <FileSlot label="Receipt" accept="image/*,.pdf,application/pdf" file={receipt} onChange={(file) => { setReceipt(file); touch(); }} disabled={saving} />
      </FormCard>

      {formError && <Notice tone="red">{formError}</Notice>}
    </BookingSheet>
  );
};
