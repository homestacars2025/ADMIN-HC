import { inMyWalletFilter, myWalletTotals, withWalletRunning } from './myWallet';
import type { WalletEntry } from './payroll';

jest.mock('./supabase', () => ({ supabase: {} }));

const entry = (id: number, entry_type: WalletEntry['entry_type'], amount: number): WalletEntry => ({
  id, profile_id: 'me', entry_type, amount, month: '2026-11-01', note: null, receipt_url: null,
  created_at: `2026-11-0${id}T09:00:00Z`, voided_at: null, void_reason: null,
});

const rows = [entry(1, 'salary', 30000), entry(2, 'bonus', 2000), entry(3, 'advance', 5000), entry(4, 'payout', 20000)];

test('salary and bonus are earned, the rest paid, and the balance runs between', () => {
  expect(myWalletTotals(rows)).toEqual({ balance: 7000, earned: 32000, paid: 25000 });
  expect(withWalletRunning(rows).map((row) => row.running)).toEqual([30000, 32000, 27000, 7000]);
});

test('the tiles filter to earned or paid', () => {
  expect(rows.filter((row) => inMyWalletFilter(row, 'earned')).map((row) => row.id)).toEqual([1, 2]);
  expect(rows.filter((row) => inMyWalletFilter(row, 'paid')).map((row) => row.id)).toEqual([3, 4]);
  expect(rows.filter((row) => inMyWalletFilter(row, 'all'))).toHaveLength(4);
});
