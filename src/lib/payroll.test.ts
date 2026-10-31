import {
  formatTry,
  monthLabel,
  monthTotals,
  salariesToPost,
  shiftMonth,
  signedAmount,
  staffMonth,
  type PayrollStaff,
  type WalletEntry,
} from './payroll';

const entry = (over: Partial<WalletEntry>): WalletEntry => ({
  id: 1, profile_id: 'a', entry_type: 'salary', amount: 100, month: '2026-10-01',
  note: null, receipt_url: null, created_at: '', voided_at: null, void_reason: null, ...over,
});

const staff = (over: Partial<PayrollStaff>): PayrollStaff => ({
  id: 'a', full_name: 'A', email: null, avatar_url: null, gender: null, status: 'active',
  department: null, monthly_salary: 30000, salary_active: true, balance: 0, ...over,
});

describe('signedAmount', () => {
  it('adds salary and bonus, and subtracts everything else', () => {
    expect(signedAmount({ entry_type: 'salary', amount: 10 })).toBe(10);
    expect(signedAmount({ entry_type: 'bonus', amount: 10 })).toBe(10);
    expect(signedAmount({ entry_type: 'advance', amount: 10 })).toBe(-10);
    expect(signedAmount({ entry_type: 'deduction', amount: 10 })).toBe(-10);
    expect(signedAmount({ entry_type: 'payout', amount: 10 })).toBe(-10);
  });

  it('copes with the string numerics PostgREST can return', () => {
    expect(signedAmount({ entry_type: 'salary', amount: '12.50' as unknown as number })).toBe(12.5);
  });
});

describe('monthTotals and staffMonth', () => {
  const entries = [
    entry({ entry_type: 'salary', amount: 1000 }),
    entry({ entry_type: 'bonus', amount: 200 }),
    entry({ entry_type: 'advance', amount: 50 }),
    entry({ entry_type: 'deduction', amount: 25 }),
    entry({ entry_type: 'payout', amount: 300 }),
    entry({ profile_id: 'b', entry_type: 'salary', amount: 900 }),
  ];

  it('totals each type across all staff', () => {
    expect(monthTotals(entries)).toEqual({ salaries: 1900, bonuses: 200, advances: 50, deductions: 25, paidOut: 300 });
  });

  it('counts only salary and bonus as earned, and only payouts as paid', () => {
    expect(staffMonth(entries, 'a')).toEqual({ earned: 1200, paid: 300 });
  });
});

describe('salariesToPost', () => {
  it('matches who the RPC would pay', () => {
    const team = [
      staff({ id: 'due' }),
      staff({ id: 'posted' }),
      staff({ id: 'no-salary', monthly_salary: 0 }),
      staff({ id: 'paused', salary_active: false }),
      staff({ id: 'disabled', status: 'disabled' }),
    ];
    const posted = [entry({ profile_id: 'posted' })];
    expect(salariesToPost(team, posted).map((s) => s.id)).toEqual(['due']);
  });

  it('treats a bonus as not being the salary', () => {
    expect(salariesToPost([staff({})], [entry({ entry_type: 'bonus' })]).map((s) => s.id)).toEqual(['a']);
  });
});

describe('months', () => {
  it('moves across a year boundary', () => {
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
  });

  it('labels a month in English', () => {
    expect(monthLabel('2026-10-01')).toBe('October 2026');
  });
});

describe('formatTry', () => {
  it('always shows lira', () => {
    expect(formatTry(1234.5)).toContain('₺');
    expect(formatTry(1234.5)).toContain('1.234,50');
  });
});
