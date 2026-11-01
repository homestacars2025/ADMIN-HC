import React, { useEffect, useMemo, useState } from 'react';
import { Select } from '../../components/media/MediaUI';
import { fetchCashAccounts, type CashAccount } from '../../lib/cashAccounts';
import { useCurrency } from '../../lib/CurrencyContext';
import { cn } from '../../lib/media/badgeColor';
import { CURRENCIES, CURRENCY_SYMBOLS, type Currency } from '../../lib/money';
import { accountsForMethod, equivalentLabel, PAY_METHODS, type PaymentChoice, type PayMethod } from '../../lib/payments';
import { parseAmount } from '../../lib/bookingForm';
import { Field, INPUT, Notice, Segmented } from './ui';

const CURRENCY_OPTIONS = CURRENCIES.map((value) => ({ value, label: `${CURRENCY_SYMBOLS[value]} ${value}` }));

const NO_ACCOUNT: Record<Exclude<PayMethod, 'cash'>, string> = {
  bank_transfer: 'No bank account takes this currency yet. Add one in Accounting, under Cash & Envelopes.',
  card: 'No POS takes this currency yet. Add one in Accounting, under Cash & Envelopes.',
  online: 'No gateway or bank account takes this currency yet. Add one in Accounting, under Cash & Envelopes.',
};

/** The accounts money can land in. A failed read only leaves the pickers empty. */
export function usePaymentAccounts(): CashAccount[] {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchCashAccounts()
      .then((rows) => { if (!cancelled) setAccounts(rows); })
      .catch(() => { if (!cancelled) setAccounts([]); });
    return () => { cancelled = true; };
  }, []);
  return accounts;
}

export const CurrencyField: React.FC<{ value: Currency; onChange: (value: Currency) => void }> = ({ value, onChange }) => (
  <Segmented ariaLabel="Currency" value={value} options={CURRENCY_OPTIONS} onChange={onChange} />
);

/** An amount in its own currency, with the lira it comes to underneath. */
export const PaymentAmount: React.FC<{
  label: string;
  value: string;
  currency: Currency;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  span?: boolean;
}> = ({ label, value, currency, onChange, required, disabled, hint, error, span }) => {
  const { rates } = useCurrency();
  return (
    <Field label={label} required={required} span={span} error={error} hint={hint ?? equivalentLabel(parseAmount(value), currency, rates)}>
      <div className="relative">
        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[14px] text-black/40">{CURRENCY_SYMBOLS[currency]}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0.00"
          className={cn(INPUT, 'ps-7 tabular-nums disabled:bg-black/[0.03] disabled:text-black/50')}
        />
      </div>
    </Field>
  );
};

/** Four big cards, then the account for anything that isn't cash. */
export const PaymentMethod: React.FC<{
  choice: PaymentChoice;
  accounts: CashAccount[];
  onChange: (choice: PaymentChoice) => void;
  error?: string | null;
}> = ({ choice, accounts, onChange, error }) => {
  const options = useMemo(() => accountsForMethod(accounts, choice.method, choice.currency), [accounts, choice.method, choice.currency]);

  // One place to land means nothing to choose, and a stale pick can't survive a change.
  useEffect(() => {
    if (choice.method === 'cash') return;
    if (options.some((account) => account.id === choice.accountId)) return;
    const only = options.length === 1 ? options[0].id : null;
    if (only !== choice.accountId) onChange({ ...choice, accountId: only });
  }, [options, choice, onChange]);

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div role="group" aria-label="How it was paid" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PAY_METHODS.map((method) => (
          <button
            key={method.value}
            type="button"
            aria-pressed={choice.method === method.value}
            onClick={() => onChange({ ...choice, method: method.value, accountId: null })}
            className={cn(
              'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-[13px] font-medium transition-colors',
              choice.method === method.value ? 'border-2 border-primary bg-primary/10 text-primary' : 'border-[#E5E7EB] bg-white text-black/60 hover:border-primary/50',
            )}
          >
            <span aria-hidden="true" className="text-[20px] leading-none">{method.icon}</span>
            {method.label}
          </button>
        ))}
      </div>

      {choice.method === 'cash' ? (
        <Notice tone="blue">An envelope will be created in your name.</Notice>
      ) : options.length === 0 ? (
        <Notice tone="amber">{NO_ACCOUNT[choice.method]}</Notice>
      ) : (
        <Field label="Account" required error={error}>
          <Select
            value={choice.accountId ? String(choice.accountId) : ''}
            options={[{ value: '', label: 'Choose an account' }, ...options.map((account) => ({ value: String(account.id), label: account.name }))]}
            placeholderMuted
            size="lg"
            ariaLabel="Account"
            onChange={(value) => onChange({ ...choice, accountId: value ? Number(value) : null })}
          />
        </Field>
      )}
    </div>
  );
};
