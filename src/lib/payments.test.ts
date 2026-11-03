import type { CashAccount } from './cashAccounts';
import { formatMoney } from './money';
import {
  accountsForMethod,
  envelopeLines,
  envelopeReceipt,
  envelopeStore,
  envelopeText,
  equivalentLabel,
  finishEnvelope,
  friendlyPaymentError,
  inLira,
  isRecordedPayment,
  NEW_PAYMENT,
  paymentProblem,
  rateOf,
  recordCustomerPayment,
  showEnvelopes,
  type EnvelopeReceipt,
  type PaymentChoice,
  type PayMethod,
} from './payments';
import { supabase } from './supabase';

jest.mock('./supabase', () => ({ supabase: { rpc: jest.fn() } }));

const RATES = [{ currency: 'USD', rate_to_try: 49 }, { currency: 'EUR', rate_to_try: 53 }];
const account = (over: Partial<CashAccount>): CashAccount => ({
  id: 1, code: 'A', name: 'A', kind: 'pos', branch: null, currencies: ['TRY', 'USD', 'EUR'], bank_name: null, iban: null,
  holder_profile_id: null, is_active: true, sort_order: 0, notes: null, is_final: false, settlement_days: null, settles_to_account_id: null, ...over,
});
const choice = (over: Partial<PaymentChoice>): PaymentChoice => ({ currency: 'TRY', method: 'cash', accountId: null, ...over });

describe('rates', () => {
  it('treats lira as one and reads the others', () => {
    expect(rateOf(RATES, 'TRY')).toBe(1);
    expect(rateOf(RATES, 'EUR')).toBe(53);
    expect(rateOf([], 'USD')).toBeNull();
  });

  it('shows the lira equivalent and the rate, except for lira', () => {
    expect(equivalentLabel(300, 'USD', RATES)).toBe('= ₺14.700,00 (49,00)');
    expect(equivalentLabel(300, 'TRY', RATES)).toBeNull();
    expect(equivalentLabel(0, 'USD', RATES)).toBeNull();
    expect(inLira(2, 'EUR', RATES)).toBe(106);
  });
});

describe('accountsForMethod', () => {
  const accounts = [
    account({ id: 1, kind: 'pos' }),
    account({ id: 2, kind: 'bank', currencies: ['TRY'] }),
    account({ id: 3, kind: 'gateway' }),
    account({ id: 4, kind: 'safe' }),
    account({ id: 5, kind: 'pos', is_active: false }),
    account({ id: 6, kind: 'custody' }),
  ];
  const ids = (method: PayMethod, currency: PaymentChoice['currency']) => accountsForMethod(accounts, method, currency).map((row) => row.id);

  it('sends cash to a safe, and never to the admin\'s custody account', () => {
    expect(ids('cash', 'TRY')).toEqual([4]);
  });

  it('sends a card to a POS, and only an active one', () => {
    expect(ids('card', 'TRY')).toEqual([1]);
  });

  it('lets a transfer or online land on a bank or a gateway that holds that currency', () => {
    expect(ids('bank_transfer', 'TRY')).toEqual([2, 3]);
    expect(ids('online', 'TRY')).toEqual([2, 3]);
    expect(ids('bank_transfer', 'USD')).toEqual([3]);
  });
});

describe('paymentProblem', () => {
  const accounts = [account({ id: 1, kind: 'pos' }), account({ id: 2, kind: 'safe' })];

  it('needs a method first, and starts without one', () => {
    expect(NEW_PAYMENT.method).toBeNull();
    expect(paymentProblem(NEW_PAYMENT, accounts, RATES)).toBe('Choose how the money was received.');
  });

  it('needs an account for every method, cash included', () => {
    expect(paymentProblem(choice({ method: 'cash' }), accounts, RATES)).toBe('Choose where the money went.');
    expect(paymentProblem(choice({ method: 'card' }), accounts, RATES)).toBe('Choose where the money went.');
    expect(paymentProblem(choice({ method: 'cash', accountId: 2 }), accounts, RATES)).toBeNull();
    expect(paymentProblem(choice({ method: 'card', accountId: 1 }), accounts, RATES)).toBeNull();
  });

  it('refuses an account left over from another method', () => {
    expect(paymentProblem(choice({ method: 'cash', accountId: 1 }), accounts, RATES)).toBe('Cash must go into a safe.');
    expect(paymentProblem(choice({ method: 'card', accountId: 2 }), accounts, RATES)).toBe('Card payments go to a POS account.');
    expect(paymentProblem(choice({ method: 'online', accountId: 1 }), accounts, RATES)).toBe('Choose a bank or payment gateway account.');
  });

  it('lets an admin leave the method empty, but not a chosen method without its account', () => {
    expect(paymentProblem(NEW_PAYMENT, accounts, RATES, true)).toBeNull();
    expect(paymentProblem(choice({ method: 'cash' }), accounts, RATES, true)).toBe('Choose where the money went.');
    expect(paymentProblem(choice({ currency: 'USD' }), [], [], true)).toMatch(/rate/);
  });

  it('needs a rate for foreign money', () => {
    expect(paymentProblem(choice({ currency: 'USD' }), [], [])).toMatch(/rate/);
  });
});

describe('recordCustomerPayment', () => {
  const rpc = supabase.rpc as unknown as jest.Mock;

  it('sends no method and no account for the amount alone', async () => {
    rpc.mockResolvedValueOnce({ data: { ledger_id: 'l1', amount_try: 400, movement_ref: null, envelope: null }, error: null });
    await recordCustomerPayment({ bookingId: 7, type: 'payment', amount: 400, choice: { currency: 'TRY', method: null, accountId: 3 } });
    expect(rpc).toHaveBeenCalledWith('record_customer_payment', expect.objectContaining({ p_method: null, p_account_id: null }));
  });

  it('keeps the account that goes with a method', async () => {
    rpc.mockResolvedValueOnce({ data: { ledger_id: 'l2', amount_try: 400, movement_ref: 'MOV-1', envelope: null }, error: null });
    await recordCustomerPayment({ bookingId: 7, type: 'payment', amount: 400, choice: { currency: 'TRY', method: 'card', accountId: 6 } });
    expect(rpc).toHaveBeenLastCalledWith('record_customer_payment', expect.objectContaining({ p_method: 'card', p_account_id: 6 }));
  });
});

describe('friendlyPaymentError', () => {
  it('keeps the database wording and finishes the sentence', () => {
    expect(friendlyPaymentError('Choose where the money went')).toBe('Choose where the money went.');
    expect(friendlyPaymentError('Cash must go into a safe')).toBe('Cash must go into a safe.');
  });

  it('rewords what was never meant for staff', () => {
    expect(friendlyPaymentError('forbidden')).toMatch(/permission/);
    expect(friendlyPaymentError('Account not found')).toMatch(/no longer active/);
  });
});

describe('recorded payments', () => {
  it('locks rows that have money behind them, not older ones', () => {
    expect(isRecordedPayment({ pay_method: 'cash' })).toBe(true);
    expect(isRecordedPayment({ pay_method: null })).toBe(false);
    expect(isRecordedPayment({})).toBe(false);
  });
});

describe('envelopes', () => {
  const envelope: EnvelopeReceipt = {
    ref: 'ENV-2611-0001', plate: '34ABC101', customer: 'Ali Veli', booking_number: 'BK-1', date: '2026-11-02 14:05', amount: 300, currency: 'USD', safe: 'Sisli - 01',
  };
  const result = { ledger_id: 'l', amount_try: 100, movement_ref: 'MOV-1' };

  afterEach(() => { while (envelopeStore.snapshot().length > 0) finishEnvelope(); });

  it('makes a receipt only for cash', () => {
    expect(envelopeReceipt({ ...result, envelope })).toEqual([envelope]);
    expect(envelopeReceipt({ ...result, envelope: null })).toEqual([]);
  });

  it('lists what goes on the envelope, with a readable date', () => {
    const lines = Object.fromEntries(envelopeLines(envelope).map((line) => [line.label, line.value]));
    expect(lines).toEqual({ Plate: '34ABC101', Customer: 'Ali Veli', Booking: 'BK-1', 'Date and time': '02.11.2026 14:05', Amount: formatMoney(300, 'USD'), Safe: 'Sisli - 01' });
  });

  it('copies everything, leaving out what is missing', () => {
    const text = envelopeText({ ...envelope, plate: null });
    expect(text.split('\n')[0]).toBe('ENV-2611-0001');
    expect(text).toContain('Safe: Sisli - 01');
    expect(text).not.toContain('Plate');
  });

  it('asks for each envelope in turn', () => {
    showEnvelopes([envelope, { ...envelope, ref: 'ENV-2611-0002' }]);
    expect(envelopeStore.snapshot().map((row) => row.ref)).toEqual(['ENV-2611-0001', 'ENV-2611-0002']);
    finishEnvelope();
    expect(envelopeStore.snapshot().map((row) => row.ref)).toEqual(['ENV-2611-0002']);
  });
});
