import type { AccountKind, CashAccount } from './cashAccounts';
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
  method: PayMethod | null;
  accountId: number | null;
}

export const NEW_PAYMENT: PaymentChoice = { currency: 'TRY', method: null, accountId: null };

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

/** Where each way of paying can land. The database insists on the same. */
const ACCOUNT_KINDS: Record<PayMethod, AccountKind[]> = {
  cash: ['safe'],
  card: ['pos'],
  bank_transfer: ['bank', 'gateway'],
  online: ['bank', 'gateway'],
};

const WRONG_ACCOUNT: Record<PayMethod, string> = {
  cash: 'Cash must go into a safe.',
  card: 'Card payments go to a POS account.',
  bank_transfer: 'Choose a bank or payment gateway account.',
  online: 'Choose a bank or payment gateway account.',
};

export function accountsForMethod(accounts: CashAccount[], method: PayMethod, currency: Currency): CashAccount[] {
  return accounts.filter((account) => account.is_active && ACCOUNT_KINDS[method].includes(account.kind) && account.currencies.includes(currency));
}

export function paymentProblem(choice: PaymentChoice, accounts: CashAccount[], rates: Rate[]): string | null {
  if (rateOf(rates, choice.currency) === null) return `Today's ${choice.currency} rate hasn't loaded. Reload and try again.`;
  if (!choice.method) return 'Choose how the money was received.';
  if (choice.accountId === null) return 'Choose where the money went.';
  if (!accountsForMethod(accounts, choice.method, choice.currency).some((account) => account.id === choice.accountId)) return WRONG_ACCOUNT[choice.method];
  return null;
}

/** The database's own wording reads fine, apart from the two that were never meant for staff. */
export function friendlyPaymentError(message: string): string {
  if (/forbidden/i.test(message)) return "You don't have permission to record payments.";
  if (/^Account not found/i.test(message)) return 'That account is no longer active. Choose another one.';
  return /[.!?]$/.test(message) ? message : `${message}.`;
}

/** What goes on the envelope, as the database wrote it. */
export interface EnvelopeReceipt {
  ref: string;
  plate: string | null;
  customer: string | null;
  booking_number: string | null;
  date: string;
  amount: number;
  currency: Currency;
  safe: string;
}

export interface PaymentResult {
  ledger_id: string;
  amount_try: number;
  movement_ref: string;
  envelope: EnvelopeReceipt | null;
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
    p_account_id: input.choice.accountId,
    p_note: input.note || null,
  });
  if (error) throw new Error(friendlyPaymentError(error.message));
  return data as PaymentResult;
}

/** A recorded payment has an envelope or an account behind it, so it can't just be typed over. */
export const isRecordedPayment = (row: { pay_method?: string | null }): boolean => Boolean(row.pay_method);

let receipts: EnvelopeReceipt[] = [];
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

/** Kept outside the form that made them, because that form closes as soon as it saves. */
export function showEnvelopes(next: EnvelopeReceipt[]): void {
  if (next.length === 0) return;
  receipts = [...receipts, ...next];
  notify();
}

/** Each envelope is written by hand, so each one is acknowledged on its own. */
export function finishEnvelope(): void {
  receipts = receipts.slice(1);
  notify();
}

export const envelopeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  snapshot: () => receipts,
};

export const envelopeReceipt = (result: PaymentResult): EnvelopeReceipt[] => (result.envelope ? [result.envelope] : []);

/** "2026-11-02 14:05", the way the database sends it, as "02.11.2026 14:05". */
const envelopeDate = (date: string): string => {
  const [day, time] = date.split(' ');
  return [day.split('-').reverse().join('.'), time].filter(Boolean).join(' ');
};

export function envelopeLines(receipt: EnvelopeReceipt): Array<{ label: string; value: string }> {
  return [
    { label: 'Plate', value: receipt.plate ?? '' },
    { label: 'Customer', value: receipt.customer ?? '' },
    { label: 'Booking', value: receipt.booking_number ?? '' },
    { label: 'Date and time', value: envelopeDate(receipt.date) },
    { label: 'Amount', value: formatMoney(Number(receipt.amount), receipt.currency) },
    { label: 'Safe', value: receipt.safe },
  ];
}

export const envelopeText = (receipt: EnvelopeReceipt): string => [
  receipt.ref,
  ...envelopeLines(receipt).filter((line) => line.value).map((line) => `${line.label}: ${line.value}`),
].join('\n');
