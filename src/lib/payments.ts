import type { CashAccount } from './cashAccounts';
import { formatMoney, type Currency } from './money';
import { supabase } from './supabase';

export type PayMethod = 'cash' | 'bank_transfer' | 'card' | 'online';

export const PAY_METHODS: ReadonlyArray<{ value: PayMethod; label: string; icon: string }> = [
  { value: 'cash', label: 'Cash', icon: '💵' },
  { value: 'bank_transfer', label: 'Bank transfer', icon: '🏦' },
  { value: 'card', label: 'Card', icon: '💳' },
  { value: 'online', label: 'Online', icon: '🌐' },
];

/** How money arrived. The amount sits beside it, because a booking takes two. */
export interface PaymentChoice {
  currency: Currency;
  method: PayMethod;
  accountId: number | null;
}

export const NEW_PAYMENT: PaymentChoice = { currency: 'TRY', method: 'cash', accountId: null };

interface Rate {
  currency: string;
  rate_to_try: number;
}

export function rateOf(rates: Rate[], currency: Currency): number | null {
  if (currency === 'TRY') return 1;
  return rates.find((rate) => rate.currency === currency)?.rate_to_try ?? null;
}

/** An estimate for the screen. The database converts for real, at its own rate. */
export function inLira(amount: number, currency: Currency, rates: Rate[]): number {
  return amount * (rateOf(rates, currency) ?? 0);
}

/** "= ₺14.700,00 (49,00)", or nothing for lira. */
export function equivalentLabel(amount: number, currency: Currency, rates: Rate[]): string | null {
  const rate = rateOf(rates, currency);
  if (currency === 'TRY' || !rate || amount <= 0) return null;
  return `= ${formatMoney(amount * rate)} (${rate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
}

/** Where each way of paying can land. A card has to be a POS, which the database insists on too. */
export function accountsForMethod(accounts: CashAccount[], method: PayMethod, currency: Currency): CashAccount[] {
  const kinds = method === 'card' ? ['pos'] : method === 'bank_transfer' ? ['bank'] : method === 'online' ? ['gateway', 'bank'] : [];
  return accounts.filter((account) => account.is_active && kinds.includes(account.kind) && account.currencies.includes(currency));
}

export function paymentProblem(choice: PaymentChoice, accounts: CashAccount[], rates: Rate[]): string | null {
  if (rateOf(rates, choice.currency) === null) return `Today's ${choice.currency} rate hasn't loaded. Reload and try again.`;
  if (choice.method === 'cash') return null;
  if (!accountsForMethod(accounts, choice.method, choice.currency).some((account) => account.id === choice.accountId)) {
    return 'Choose the account the money went to.';
  }
  return null;
}

export interface PaymentResult {
  ledger_id: string;
  amount_try: number;
  envelope_ref: string | null;
  movement_ref: string;
}

export async function recordCustomerPayment(input: {
  bookingId: number;
  type: 'payment' | 'deposit';
  amount: number;
  choice: PaymentChoice;
  note?: string | null;
}): Promise<PaymentResult> {
  const { data, error } = await supabase.rpc('record_customer_payment', {
    p_booking_id: input.bookingId,
    p_type: input.type,
    p_amount: input.amount,
    p_currency: input.choice.currency,
    p_method: input.choice.method,
    p_account_id: input.choice.method === 'cash' ? null : input.choice.accountId,
    p_note: input.note || null,
  });
  if (error) throw new Error(error.message);
  return data as PaymentResult;
}

/** A recorded payment has an envelope or an account behind it, so it can't just be typed over. */
export const isRecordedPayment = (row: { pay_method?: string | null }): boolean => Boolean(row.pay_method);

export interface EnvelopeReceipt {
  ref: string;
  amount: number;
  currency: Currency;
  plate: string | null;
  customer: string | null;
}

let receipts: EnvelopeReceipt[] = [];
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

/** Kept outside the form that made them, because that form closes as soon as it saves. */
export function showEnvelopes(next: EnvelopeReceipt[]): void {
  if (next.length === 0) return;
  receipts = [...receipts, ...next];
  notify();
}

export function clearEnvelopes(): void {
  receipts = [];
  notify();
}

export const envelopeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  snapshot: () => receipts,
};

/** Turns one saved payment into the receipt to show, if it made an envelope. */
export function envelopeReceipt(result: PaymentResult, amount: number, currency: Currency, plate: string | null, customer: string | null): EnvelopeReceipt[] {
  return result.envelope_ref ? [{ ref: result.envelope_ref, amount, currency, plate, customer }] : [];
}
