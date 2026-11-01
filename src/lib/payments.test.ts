import type { CashAccount } from './cashAccounts';
import { accountsForMethod, equivalentLabel, envelopeReceipt, inLira, isRecordedPayment, paymentProblem, rateOf, type PaymentChoice } from './payments';

jest.mock('./supabase', () => ({ supabase: {} }));

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
  ];
  const ids = (method: PaymentChoice['method'], currency: PaymentChoice['currency']) => accountsForMethod(accounts, method, currency).map((row) => row.id);

  it('sends a card to a POS, and only an active one', () => {
    expect(ids('card', 'TRY')).toEqual([1]);
  });

  it('sends a transfer to a bank that holds that currency', () => {
    expect(ids('bank_transfer', 'TRY')).toEqual([2]);
    expect(ids('bank_transfer', 'USD')).toEqual([]);
  });

  it('lets online land on a gateway or a bank', () => {
    expect(ids('online', 'TRY')).toEqual([2, 3]);
  });

  it('needs no account for cash, and never offers a safe', () => {
    expect(ids('cash', 'TRY')).toEqual([]);
  });
});

describe('paymentProblem', () => {
  const accounts = [account({ id: 1, kind: 'pos' })];

  it('accepts cash with no account', () => {
    expect(paymentProblem(choice({}), [], RATES)).toBeNull();
  });

  it('needs an account for anything else', () => {
    expect(paymentProblem(choice({ method: 'card' }), accounts, RATES)).toMatch(/account/);
    expect(paymentProblem(choice({ method: 'card', accountId: 1 }), accounts, RATES)).toBeNull();
  });

  it('refuses an account left over from another method', () => {
    expect(paymentProblem(choice({ method: 'bank_transfer', accountId: 1 }), accounts, RATES)).toMatch(/account/);
  });

  it('needs a rate for foreign money', () => {
    expect(paymentProblem(choice({ currency: 'USD' }), [], [])).toMatch(/rate/);
  });
});

describe('recorded payments', () => {
  it('locks rows that have money behind them, not older ones', () => {
    expect(isRecordedPayment({ pay_method: 'cash' })).toBe(true);
    expect(isRecordedPayment({ pay_method: null })).toBe(false);
    expect(isRecordedPayment({})).toBe(false);
  });
});

describe('envelopeReceipt', () => {
  const result = { ledger_id: 'l', amount_try: 100, movement_ref: 'MOV-1' };

  it('makes a receipt only for cash', () => {
    expect(envelopeReceipt({ ...result, envelope_ref: 'ENV-2611-0001' }, 300, 'USD', '34ABC', 'Ali')).toEqual([{ ref: 'ENV-2611-0001', amount: 300, currency: 'USD', plate: '34ABC', customer: 'Ali' }]);
    expect(envelopeReceipt({ ...result, envelope_ref: null }, 300, 'USD', null, null)).toEqual([]);
  });
});
