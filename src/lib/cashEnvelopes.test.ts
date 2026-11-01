import {
  ageLabel,
  balancesOf,
  canComplete,
  canReverse,
  filteredAccountId,
  findEnvelope,
  inEnvelopeFilter,
  inMovementFilter,
  isOverdue,
  posPending,
  totalsByCurrency,
  waitingForAdmin,
  withStaff,
  type Envelope,
  type Movement,
} from './cashEnvelopes';

jest.mock('./supabase', () => ({ supabase: {} }));

const NOW = Date.parse('2026-11-02T12:00:00Z');
const ago = (hours: number) => new Date(NOW - hours * 3600000).toISOString();
const envelope = (over: Partial<Envelope>): Envelope => ({
  id: 1, ref: 'ENV-2611-0001', amount: 100, currency: 'TRY', holder_profile_id: 'a', status: 'with_employee', current_account_id: null,
  counted_amount: null, difference: null, difference_note: null, created_at: ago(2), customer: 'Ali', plate: '34A', ...over,
});
const movement = (over: Partial<Movement>): Movement => ({
  id: 1, ref: 'MOV-1', kind: 'transfer', status: 'done', from_account_id: 1, to_account_id: 2, amount: 100, currency: 'TRY', amount_try: 100,
  expected_at: null, note: null, reverses_id: null, created_by: null, created_at: ago(2), ...over,
});
const day = (at: string) => at.slice(0, 10);
const NO_FILTERS = { accountId: null, kind: null, from: null, to: null };

describe('totalsByCurrency', () => {
  it('keeps currencies apart and leaves out zero', () => {
    expect(totalsByCurrency([{ currency: 'TRY', amount: 10 }, { currency: 'USD', amount: 5 }, { currency: 'TRY', amount: 3 }, { currency: 'EUR', amount: 0 }]))
      .toEqual([{ currency: 'TRY', total: 13 }, { currency: 'USD', total: 5 }]);
  });

  it('reads one account from the view', () => {
    expect(balancesOf([{ account_id: 1, currency: 'USD', balance: 90 }, { account_id: 2, currency: 'USD', balance: 7 }, { account_id: 1, currency: 'TRY', balance: 0 }], 1))
      .toEqual([{ currency: 'USD', total: 90 }]);
  });
});

describe('envelopes with staff', () => {
  it('turns late after 24 hours, only while staff hold it', () => {
    expect(isOverdue(envelope({ created_at: ago(23) }), NOW)).toBe(false);
    expect(isOverdue(envelope({ created_at: ago(25) }), NOW)).toBe(true);
    expect(isOverdue(envelope({ created_at: ago(99), status: 'in_safe' }), NOW)).toBe(false);
  });

  it('adds up what staff are holding', () => {
    const summary = withStaff([envelope({ amount: 100 }), envelope({ id: 2, amount: 50, currency: 'USD', created_at: ago(30) }), envelope({ id: 3, status: 'in_safe' })], NOW);
    expect(summary).toEqual({ count: 2, totals: [{ currency: 'TRY', total: 100 }, { currency: 'USD', total: 50 }], overdue: true });
  });

  it('writes the age', () => {
    expect(ageLabel(ago(0), NOW)).toBe('Under 1 h');
    expect(ageLabel(ago(5), NOW)).toBe('5 h');
    expect(ageLabel(ago(25), NOW)).toBe('1 day');
    expect(ageLabel(ago(72), NOW)).toBe('3 days');
  });
});

describe('findEnvelope', () => {
  it('forgives case and spaces', () => {
    expect(findEnvelope([envelope({})], ' env-2611-0001 ')?.id).toBe(1);
    expect(findEnvelope([envelope({})], 'ENV-9')).toBeNull();
    expect(findEnvelope([envelope({})], '')).toBeNull();
  });
});

describe('posPending', () => {
  it('sums what has not arrived and finds the next date', () => {
    expect(posPending([
      movement({ id: 1, kind: 'pos_settlement', status: 'pending', amount: 200, expected_at: '2026-11-30' }),
      movement({ id: 2, kind: 'pos_settlement', status: 'pending', amount: 100, expected_at: '2026-11-20' }),
      movement({ id: 3, kind: 'pos_settlement', status: 'done', amount: 999, expected_at: '2026-11-01' }),
    ])).toEqual({ count: 2, totals: [{ currency: 'TRY', total: 300 }], next: '2026-11-20' });
  });
});

describe('actions', () => {
  it('reverses a movement once, and never a reversal', () => {
    const first = movement({ id: 1 });
    const reversal = movement({ id: 2, kind: 'reversal', reverses_id: 1 });
    expect(canReverse(first, [first])).toBe(true);
    expect(canReverse(first, [first, reversal])).toBe(false);
    expect(canReverse(reversal, [first, reversal])).toBe(false);
    expect(canReverse(movement({ status: 'pending' }), [])).toBe(false);
  });

  it('only completes what is pending', () => {
    expect(canComplete(movement({ status: 'pending' }))).toBe(true);
    expect(canComplete(movement({}))).toBe(false);
  });
});

describe('tile filters', () => {
  it('reads an account out of the filter', () => {
    expect(filteredAccountId('account-5')).toBe(5);
    expect(filteredAccountId('staff')).toBeNull();
  });

  it('narrows envelopes', () => {
    expect(inEnvelopeFilter(envelope({}), 'staff')).toBe(true);
    expect(inEnvelopeFilter(envelope({ status: 'in_safe', current_account_id: 2 }), 'account-2')).toBe(true);
    expect(inEnvelopeFilter(envelope({ status: 'in_safe', current_account_id: 2 }), 'account-3')).toBe(false);
    expect(inEnvelopeFilter(envelope({}), 'all')).toBe(true);
  });

  it('narrows movements by tile, account, kind and date', () => {
    const row = movement({ created_at: '2026-11-02T10:00:00Z' });
    expect(inMovementFilter(row, 'account-1', NO_FILTERS, day)).toBe(true);
    expect(inMovementFilter(row, 'account-9', NO_FILTERS, day)).toBe(false);
    expect(inMovementFilter(row, 'pos', NO_FILTERS, day)).toBe(false);
    expect(inMovementFilter(row, 'all', { ...NO_FILTERS, kind: 'refund' }, day)).toBe(false);
    expect(inMovementFilter(row, 'all', { ...NO_FILTERS, from: '2026-11-03' }, day)).toBe(false);
    expect(inMovementFilter(row, 'all', { ...NO_FILTERS, to: '2026-11-02' }, day)).toBe(true);
  });
});

describe('waitingForAdmin', () => {
  it('uses the counted amount, and only bank, POS and gateway balances', () => {
    expect(waitingForAdmin(
      [{ amount: 100, counted_amount: 90, currency: 'USD' }, { amount: 50, counted_amount: null, currency: 'USD' }],
      [{ account_id: 1, currency: 'TRY', balance: 500 }, { account_id: 2, currency: 'TRY', balance: 700 }, { account_id: 3, currency: 'TRY', balance: 9 }],
      [{ id: 1, kind: 'safe' }, { id: 2, kind: 'pos' }, { id: 3, kind: 'custody' }],
    )).toEqual({
      envelopes: { count: 2, totals: [{ currency: 'USD', total: 140 }] },
      accounts: [{ currency: 'TRY', total: 700 }],
    });
  });
});
