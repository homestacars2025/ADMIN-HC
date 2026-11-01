import {
  canVoid,
  inSupplierFilter,
  ledgerCsv,
  ledgerTotals,
  matchesSupplier,
  owedByCurrency,
  whatsappLink,
  withRunning,
  type Supplier,
  type SupplierBalance,
  type SupplierTx,
} from './suppliers';

jest.mock('./supabase', () => ({ supabase: {} }));

const tx = (over: Partial<SupplierTx>): SupplierTx => ({
  id: 1, supplier_id: 1, kind: 'bill', tx_date: '2026-11-01', amount: 100, currency: 'TRY', car_id: null, description: null, receipt_url: null,
  paid_from_account_id: null, custody_expense_id: null, voided_at: null, void_reason: null, plate: null, account: null, ...over,
});
const balance = (over: Partial<SupplierBalance>): SupplierBalance => ({ supplier_id: 1, currency: 'TRY', total_bills: 0, total_paid: 0, balance: 0, last_tx: null, ...over });
const supplier = (over: Partial<Supplier>): Supplier => ({
  id: 1, name: 'Usta', category: 'mechanic', contact_person: null, phone: null, whatsapp: null, address: null, district: null,
  tax_number: null, iban: null, bank_name: null, notes: null, is_active: true, ...over,
});

describe('withRunning', () => {
  it('keeps a balance per currency', () => {
    const rows = withRunning([
      tx({ id: 1, amount: 1000 }),
      tx({ id: 2, amount: 100, currency: 'USD' }),
      tx({ id: 3, amount: 400, kind: 'payment' }),
      tx({ id: 4, amount: 30, kind: 'payment', currency: 'USD' }),
    ]);
    expect(rows.map((row) => row.running)).toEqual([1000, 100, 600, 70]);
  });

  it('lets a voided row move nothing', () => {
    const rows = withRunning([tx({ id: 1, amount: 1000 }), tx({ id: 2, amount: 400, voided_at: '2026-11-01' }), tx({ id: 3, amount: 100, kind: 'payment' })]);
    expect(rows.map((row) => row.running)).toEqual([1000, null, 900]);
  });

  it('goes below zero when we overpay', () => {
    expect(withRunning([tx({ kind: 'payment', amount: 50 })])[0].running).toBe(-50);
  });
});

describe('ledgerTotals', () => {
  it('never adds currencies together, and skips voided rows', () => {
    expect(ledgerTotals([
      tx({ amount: 1000 }),
      tx({ amount: 200, kind: 'payment' }),
      tx({ amount: 999, voided_at: '2026-11-01' }),
      tx({ amount: 50, currency: 'EUR' }),
    ])).toEqual([
      { currency: 'TRY', bills: 1000, paid: 200, balance: 800 },
      { currency: 'EUR', bills: 50, paid: 0, balance: 50 },
    ]);
  });
});

describe('canVoid', () => {
  it('allows a normal row once', () => {
    expect(canVoid(tx({}))).toBe(true);
    expect(canVoid(tx({ voided_at: '2026-11-01' }))).toBe(false);
  });

  it('keeps rows made by a custody approval out of reach', () => {
    expect(canVoid(tx({ custody_expense_id: 12 }))).toBe(false);
  });
});

describe('supplier filters', () => {
  it('counts as owed only where the balance is positive', () => {
    expect(inSupplierFilter(supplier({}), [balance({ balance: 10 })], 'owed')).toBe(true);
    expect(inSupplierFilter(supplier({}), [balance({ balance: 0 })], 'owed')).toBe(false);
    expect(inSupplierFilter(supplier({}), [balance({ balance: -5 })], 'settled')).toBe(true);
    expect(inSupplierFilter(supplier({ is_active: false }), [], 'inactive')).toBe(true);
  });

  it('adds what we owe per currency', () => {
    expect(owedByCurrency([balance({ balance: 10 }), balance({ supplier_id: 2, balance: 5 }), balance({ currency: 'USD', balance: 3 }), balance({ currency: 'EUR', balance: -9 })]))
      .toEqual([{ currency: 'TRY', total: 15 }, { currency: 'USD', total: 3 }]);
  });
});

describe('matchesSupplier', () => {
  it('ignores case, spaces and Turkish letters', () => {
    expect(matchesSupplier({ name: 'Şişli Lastik' }, 'sisli la')).toBe(true);
    expect(matchesSupplier({ name: 'Şişli Lastik' }, 'cam')).toBe(false);
    expect(matchesSupplier({ name: 'x' }, '')).toBe(true);
  });
});

describe('whatsappLink', () => {
  it('adds the country code to a number written from the 0', () => {
    expect(whatsappLink('0532 123 45 67')).toBe('https://wa.me/905321234567');
    expect(whatsappLink('+90 532 123 45 67')).toBe('https://wa.me/905321234567');
    expect(whatsappLink('12')).toBeNull();
  });
});

describe('ledgerCsv', () => {
  it('writes one line per row, keeping voided rows marked', () => {
    const csv = ledgerCsv(withRunning([
      tx({ description: 'Brakes, front', plate: '34ABC1', amount: 500 }),
      tx({ id: 2, kind: 'payment', amount: 100, account: 'Sisli - 01', voided_at: '2026-11-01', void_reason: 'wrong' }),
    ]));
    expect(csv.split('\r\n')).toEqual([
      '﻿date,type,description,car,bill,payment,currency,balance,paid_from,voided,void_reason',
      '2026-11-01,bill,"Brakes, front",34ABC1,500,,TRY,500,,,',
      '2026-11-01,payment,,,,100,TRY,,Sisli - 01,yes,wrong',
    ]);
  });
});
