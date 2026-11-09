import { useCallback, useMemo } from 'react';
import { useCurrency } from '../lib/CurrencyContext';
import { convertAmount, effectiveCurrency, formatInCurrency, rateNote, type DisplayCurrency } from '../lib/money';

export interface MoneyOptions {
  /** The stored amount's currency: lira unless the row says otherwise (supplier bills). */
  from?: string;
  /** A "+" in front of amounts above zero. */
  signed?: boolean;
  decimals?: number;
}

/**
 * Every Accounting amount on screen goes through here: stored in lira (or its own
 * currency), shown in the top-bar currency at the latest rate. Cash & Envelopes and the
 * staff Wallet and Custody pages don't use it, as they hold real lira, dollars and euros.
 */
export function useMoney() {
  const context = useCurrency();
  const picked: DisplayCurrency = context.currency ?? 'TRY';
  const rates = useMemo(() => context.rates ?? [], [context.rates]);
  const currency: DisplayCurrency = effectiveCurrency(picked, rates);

  const convert = useCallback((amount: number, from = 'TRY'): number => convertAmount(amount, from, currency, rates) ?? amount, [currency, rates]);

  const format = useCallback((amount: number, options: MoneyOptions = {}): string => {
    const from = options.from ?? 'TRY';
    const converted = convertAmount(amount, from, currency, rates);
    // A row whose own currency has no rate stays as it is rather than be mislabelled.
    if (converted === null) return formatInCurrency(amount, (['TRY', 'USD', 'EUR', 'LYD'].includes(from) ? from : 'TRY') as DisplayCurrency, options);
    return formatInCurrency(converted, currency, options);
  }, [currency, rates]);

  const note = useMemo(() => rateNote(currency, rates), [currency, rates]);

  return { currency, format, convert, rateNote: note };
}
