import React, { useEffect, useRef, useState } from 'react';
import { Button, Select, Switch } from '../../components/media/MediaUI';
import { fetchStaffOptions } from '../../lib/carIssues';
import {
  ACCOUNT_KINDS,
  cleanIban,
  KIND_LABELS,
  saveCashAccount,
  validIban,
  type AccountKind,
  type CashAccount,
} from '../../lib/cashAccounts';
import { cn } from '../../lib/media/badgeColor';
import { CURRENCIES, CURRENCY_SYMBOLS, type Currency } from '../../lib/money';
import { BookingSheet, Field, FOOTER_BUTTON, FormCard, INPUT, Notice, PrimaryButton } from '../bookings/ui';
import { WalletIcon } from '../customers/ui';

type Errors = Partial<Record<'code' | 'name' | 'currencies' | 'iban' | 'days', string>>;

const KIND_OPTIONS = ACCOUNT_KINDS.map((value) => ({ value, label: KIND_LABELS[value] }));
const NOBODY = 'none';

export const AccountFormSheet: React.FC<{
  account: CashAccount | null;
  accounts: CashAccount[];
  onClose: () => void;
  onSaved: (saved: CashAccount) => void;
}> = ({ account, accounts, onClose, onSaved }) => {
  const [code, setCode] = useState(account?.code ?? '');
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'safe');
  const [branch, setBranch] = useState(account?.branch ?? '');
  const [currencies, setCurrencies] = useState<Currency[]>(account?.currencies ?? ['TRY']);
  const [bankName, setBankName] = useState(account?.bank_name ?? '');
  const [iban, setIban] = useState(account?.iban ?? '');
  const [holder, setHolder] = useState(account?.holder_profile_id ?? NOBODY);
  const [active, setActive] = useState(account?.is_active ?? true);
  const [notes, setNotes] = useState(account?.notes ?? '');
  const [settleDays, setSettleDays] = useState(account?.settlement_days ? String(account.settlement_days) : '');
  const [settlesTo, setSettlesTo] = useState(account?.settles_to_account_id ? String(account.settles_to_account_id) : NOBODY);
  const [staff, setStaff] = useState<Array<{ id: string; full_name: string }>>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savingRef = useRef(false);

  const showsBank = kind === 'bank' || kind === 'pos' || kind === 'gateway';
  const settles = kind === 'pos' || kind === 'gateway';
  const banks = accounts.filter((option) => option.kind === 'bank' && option.id !== account?.id);

  useEffect(() => {
    let cancelled = false;
    fetchStaffOptions()
      .then((rows) => { if (!cancelled) setStaff(rows); })
      .catch((failure: unknown) => { if (!cancelled) setFormError(failure instanceof Error ? failure.message : "Couldn't load the staff list."); });
    return () => { cancelled = true; };
  }, []);

  const touch = () => setDirty(true);
  const toggleCurrency = (currency: Currency) => {
    setCurrencies((current) => (current.includes(currency)
      ? current.filter((value) => value !== currency)
      : CURRENCIES.filter((value) => value === currency || current.includes(value))));
    touch();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const cleaned = cleanIban(iban);
    const next: Errors = {};
    if (!code.trim()) next.code = 'Enter a code.';
    if (!name.trim()) next.name = 'Enter a name.';
    if (currencies.length === 0) next.currencies = 'Choose at least one currency.';
    if (showsBank && !validIban(cleaned)) next.iban = "This doesn't look like an IBAN.";
    if (settles && settleDays.trim() && !/^\d+$/.test(settleDays.trim())) next.days = 'Enter whole days.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      onSaved(await saveCashAccount(account?.id ?? null, {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        kind,
        branch: branch.trim() || null,
        currencies,
        bank_name: showsBank ? bankName.trim() || null : null,
        iban: showsBank ? cleaned || null : null,
        holder_profile_id: kind === 'custody' && holder !== NOBODY ? holder : null,
        is_active: active,
        notes: notes.trim() || null,
        settlement_days: settles && settleDays.trim() ? Number(settleDays) : null,
        settles_to_account_id: settles && settlesTo !== NOBODY ? Number(settlesTo) : null,
      }));
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : "The account wasn't saved. Try again.");
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <BookingSheet
      narrow
      label={account ? 'Edit account' : 'New account'}
      title={account ? 'Edit account' : 'New account'}
      subtitle={account?.name ?? 'A safe, bank account, POS or custody holder'}
      dirty={dirty}
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
      footer={(requestClose) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={requestClose}>Cancel</Button>
          <PrimaryButton saving={saving}>{account ? 'Save changes' : 'Add account'}</PrimaryButton>
        </div>
      )}
    >
      <FormCard icon={<WalletIcon size={15} />} title="Account">
        <Field label="Name" required error={errors.name}>
          <input className={INPUT} value={name} onChange={(event) => { setName(event.target.value); touch(); }} />
        </Field>
        <Field label="Code" required error={errors.code}>
          <input className={INPUT} value={code} placeholder="SAF-SIS-02" onChange={(event) => { setCode(event.target.value); touch(); }} />
        </Field>
        <Field label="Kind">
          <Select value={kind} options={KIND_OPTIONS} size="lg" ariaLabel="Kind" onChange={(value) => { setKind(value as AccountKind); touch(); }} />
        </Field>
        <Field label="Branch">
          <input className={INPUT} value={branch} onChange={(event) => { setBranch(event.target.value); touch(); }} />
        </Field>
        <Field label="Currencies" span required error={errors.currencies}>
          <div className="flex flex-wrap gap-2">
            {CURRENCIES.map((currency) => (
              <button
                key={currency}
                type="button"
                aria-pressed={currencies.includes(currency)}
                onClick={() => toggleCurrency(currency)}
                className={cn('h-11 min-w-[76px] rounded-[10px] border px-3 text-[13.5px] font-medium transition-colors md:h-10', currencies.includes(currency) ? 'border-primary bg-primary/10 text-primary' : 'border-[#E5E7EB] bg-white text-black/55')}
              >
                {CURRENCY_SYMBOLS[currency]} {currency}
              </button>
            ))}
          </div>
        </Field>
        {account && (
          <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-[10px] border border-subtle px-3 text-[13.5px] text-foreground sm:col-span-2">
            Active
            <Switch checked={active} onChange={(value) => { setActive(value); touch(); }} ariaLabel="Active" activeClass="bg-primary" />
          </label>
        )}
      </FormCard>

      {showsBank && (
        <FormCard icon={<WalletIcon size={15} />} title="Bank">
          <Field label="Bank name" span>
            <input className={INPUT} value={bankName} onChange={(event) => { setBankName(event.target.value); touch(); }} />
          </Field>
          <Field label="IBAN" span error={errors.iban}>
            <input className={INPUT} value={iban} onChange={(event) => { setIban(event.target.value); touch(); }} />
          </Field>
        </FormCard>
      )}

      {settles && (
        <FormCard icon={<WalletIcon size={15} />} title="Settlement">
          <Field label="Pays out to" span hint={banks.length === 0 ? 'Add a bank account first. Until this is set, nothing shows as pending settlement.' : undefined}>
            <Select
              value={settlesTo}
              options={[{ value: NOBODY, label: 'No bank linked' }, ...banks.map((bank) => ({ value: String(bank.id), label: bank.name }))]}
              size="lg"
              ariaLabel="Pays out to"
              onChange={(value) => { setSettlesTo(value); touch(); }}
            />
          </Field>
          <Field label="Settlement days" span error={errors.days}>
            <input className={INPUT} inputMode="numeric" value={settleDays} onChange={(event) => { setSettleDays(event.target.value); touch(); }} />
          </Field>
        </FormCard>
      )}

      {kind === 'custody' && !account?.is_final && (
        <FormCard icon={<WalletIcon size={15} />} title="Holder">
          <Field label="Staff member" span>
            <Select
              value={holder}
              options={[{ value: NOBODY, label: 'Nobody yet' }, ...staff.map((person) => ({ value: person.id, label: person.full_name }))]}
              size="lg"
              ariaLabel="Staff member"
              onChange={(value) => { setHolder(value); touch(); }}
            />
          </Field>
        </FormCard>
      )}

      <FormCard icon={<WalletIcon size={15} />} title="Notes">
        <Field label="Notes" span>
          <textarea className={`${INPUT} !h-auto py-2`} rows={3} value={notes} onChange={(event) => { setNotes(event.target.value); touch(); }} />
        </Field>
      </FormCard>

      {formError && <Notice tone="red">{formError}</Notice>}
    </BookingSheet>
  );
};
