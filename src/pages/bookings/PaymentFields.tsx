import React, { useEffect, useId, useMemo, useState } from 'react';
import { Select } from '../../components/media/MediaUI';
import { fetchCashAccounts, type CashAccount } from '../../lib/cashAccounts';
import { useCurrency } from '../../lib/CurrencyContext';
import { cn } from '../../lib/media/badgeColor';
import { CURRENCIES, CURRENCY_SYMBOLS, type Currency } from '../../lib/money';
import { accountsForMethod, equivalentLabel, PAY_METHODS, paymentProblem, type PaymentChoice, type PayMethod } from '../../lib/payments';
import { parseAmount } from '../../lib/bookingForm';
import { Field, INPUT, Notice, Segmented } from './ui';

const CURRENCY_OPTIONS = CURRENCIES.map((value) => ({ value, label: CURRENCY_SYMBOLS[value] }));

const NO_ACCOUNT: Record<PayMethod, string> = {
  cash: 'No safe takes this currency yet. Add one in Accounting, under Cash & Envelopes.',
  bank_transfer: 'No bank or gateway account takes this currency yet. Add one in Accounting, under Cash & Envelopes.',
  card: 'No POS takes this currency yet. Add one in Accounting, under Cash & Envelopes.',
  online: 'No bank or gateway account takes this currency yet. Add one in Accounting, under Cash & Envelopes.',
};

const ACCOUNT_PROMPT: Record<PayMethod, string> = {
  cash: 'Choose a safe',
  bank_transfer: 'Choose an account',
  card: 'Choose a POS',
  online: 'Choose an account',
};

export interface PaymentAccounts {
  list: CashAccount[];
  loading: boolean;
  failed: boolean;
}

/** The accounts money can land in. No payment can be saved without one, so a failed read has to show. */
export function usePaymentAccounts(): PaymentAccounts {
  const [accounts, setAccounts] = useState<PaymentAccounts>({ list: [], loading: true, failed: false });
  useEffect(() => {
    let cancelled = false;
    fetchCashAccounts()
      .then((rows) => { if (!cancelled) setAccounts({ list: rows, loading: false, failed: false }); })
      .catch(() => { if (!cancelled) setAccounts({ list: [], loading: false, failed: true }); });
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

/** How the money came in, then where it went. Forms keep Save disabled until both are answered. */
export const PaymentMethod: React.FC<{
  choice: PaymentChoice;
  accounts: PaymentAccounts;
  onChange: (choice: PaymentChoice) => void;
  onSkip?: () => void;
}> = ({ choice, accounts, onChange, onSkip }) => {
  const { rates } = useCurrency();
  const headingId = useId();
  const options = useMemo(
    () => (choice.method ? accountsForMethod(accounts.list, choice.method, choice.currency) : []),
    [accounts.list, choice.method, choice.currency],
  );

  // One place to land means nothing to choose, and a stale pick can't survive a change.
  useEffect(() => {
    if (!choice.method || accounts.loading) return;
    if (options.some((account) => account.id === choice.accountId)) return;
    const only = options.length === 1 ? options[0].id : null;
    if (only !== choice.accountId) onChange({ ...choice, accountId: only });
  }, [options, choice, accounts.loading, onChange]);

  const nowhereToPut = Boolean(choice.method) && !accounts.loading && options.length === 0;
  const problem = accounts.loading || nowhereToPut ? null : paymentProblem(choice, accounts.list, rates);

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div>
        <div className="mb-1.5 flex min-h-[20px] items-center justify-between gap-2">
          <span id={headingId} className="text-[12.5px] font-medium text-black/65">How did you receive the money?<span className="ms-0.5 text-[#DC2626]">*</span></span>
          {onSkip && <button type="button" onClick={onSkip} className="-my-3 min-h-[44px] whitespace-nowrap text-[12.5px] font-medium text-primary hover:underline">Not paid yet</button>}
        </div>
        <div role="group" aria-labelledby={headingId} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PAY_METHODS.map((method) => (
            <button
              key={method.value}
              type="button"
              aria-pressed={choice.method === method.value}
              onClick={() => { if (choice.method !== method.value) onChange({ ...choice, method: method.value, accountId: null }); }}
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
      </div>

      {choice.method && (accounts.loading ? (
        <p className="text-[12.5px] text-black/45">Loading accounts…</p>
      ) : accounts.failed ? (
        <Notice tone="red">Couldn't load the accounts. Reload and try again.</Notice>
      ) : nowhereToPut ? (
        <Notice tone="amber">{NO_ACCOUNT[choice.method]}</Notice>
      ) : (
        <Field label="Where did you put it?" required>
          <Select
            value={choice.accountId ? String(choice.accountId) : ''}
            options={[{ value: '', label: ACCOUNT_PROMPT[choice.method] }, ...options.map((account) => ({ value: String(account.id), label: account.name }))]}
            placeholderMuted
            size="lg"
            className="!h-11"
            ariaLabel="Where did you put it?"
            onChange={(value) => onChange({ ...choice, accountId: value ? Number(value) : null })}
          />
        </Field>
      ))}

      {problem && !accounts.failed && <p className="text-[12.5px] text-black/50">{problem}</p>}
    </div>
  );
};
