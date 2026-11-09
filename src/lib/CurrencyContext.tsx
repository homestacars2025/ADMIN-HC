import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { convertAmount, effectiveCurrency, formatInCurrency } from './money';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Currency = 'TRY' | 'USD' | 'EUR' | 'LYD';

export const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR', 'LYD'];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  LYD: 'LD',
};

interface ExchangeRate {
  currency: string;
  rate_to_try: number;
  updated_at?: string | null;
}

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  rates: ExchangeRate[];
  symbol: string;
  /** Format a TRY-stored amount with the selected currency symbol + conversion */
  fmt: (tryAmount: number) => string;
  /** Convert a TRY-stored amount to the selected currency (number only) */
  convert: (tryAmount: number) => number;
  /** Format a USD-stored base price in the selected currency */
  fmtUSD: (usdAmount: number) => string;
  /** Convert a USD-stored base price to the selected currency (number only) */
  convertFromUSD: (usdAmount: number) => number;
}

// ─── Default context (TRY pass-through) ──────────────────────────────────────

const defaultFmt = (n: number) =>
  '₺' + Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CurrencyContext = createContext<CurrencyContextValue>({
  currency:       'TRY',
  setCurrency:    () => {},
  rates:          [],
  symbol:         '₺',
  fmt:            defaultFmt,
  convert:        (n) => n,
  fmtUSD:         (n) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  convertFromUSD: (n) => n,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    try { return (localStorage.getItem('hc_currency') as Currency) || 'TRY'; }
    catch { return 'TRY'; }
  });
  const [rates, setRates] = useState<ExchangeRate[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase.from('exchange_rates').select('currency, rate_to_try, updated_at').then(({ data }) => {
      if (!cancelled && data) setRates(data as ExchangeRate[]);
    });
    return () => { cancelled = true; };
  }, []);

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    try { localStorage.setItem('hc_currency', c); } catch {}
  };

  // Until the picked currency's rate is in, amounts stay in lira rather than wear the wrong symbol.
  const shown = effectiveCurrency(currency, rates);
  const symbol = CURRENCY_SYMBOLS[shown] ?? '₺';

  const convert = (tryAmount: number): number => convertAmount(tryAmount, 'TRY', shown, rates) ?? tryAmount;

  /** Unsigned, as callers put their own sign in front. */
  const fmt = (tryAmount: number): string => formatInCurrency(Math.abs(convert(tryAmount)), shown);

  // USD-stored price → selected currency
  const convertFromUSD = (usdAmount: number): number => convertAmount(usdAmount, 'USD', shown, rates) ?? usdAmount;

  const fmtUSD = (usdAmount: number): string => {
    const converted = convertAmount(Math.abs(usdAmount), 'USD', shown, rates);
    return converted === null ? formatInCurrency(Math.abs(usdAmount), 'USD') : formatInCurrency(converted, shown);
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rates, symbol, fmt, convert, fmtUSD, convertFromUSD }}>
      {children}
    </CurrencyContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useCurrency = () => useContext(CurrencyContext);
