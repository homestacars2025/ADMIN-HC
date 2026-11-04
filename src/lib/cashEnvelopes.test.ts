import {
  ageLabel,
  balancesOf,
  canComplete,
  canReverse,
  deletedMessage,
  deleteEnvelopes,
  deleteFailedMessage,
  filteredAccountId,
  findEnvelope,
  inEnvelopeFilter,
  inMovementFilter,
  isOverdue,
  movementType,
  posPending,
  reversalsOf,
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
  counted_amount: null, difference: null, difference_note: null, created_at: ago(2), created_by: 'a', note: null, customer_id: 'c1',
  customer: 'Ali', plate: '34A', booking_number: 'HOM-11-26-001', ...over,
});
const movement = (over: Partial<Movement>): Movement => ({
  id: 1, ref: 'MOV-1', kind: 'transfer', status: 'done', from_account_id: 1, to_account_id: 2, amount: 100, currency: 'TRY', amount_try: 100,
  expected_at: null, note: null, reverses_id: null, created_by: null, created_at: ago(2), ...over,
});
const day = (at: string) => at.slice(0, 10);
const NO_FILTERS = { accountId: null, type: null, from: null, to: null, banks: new Set([2]), showInternal: false };

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

  it('narrows movements by tile, account, type and date', () => {
    const row = movement({ created_at: '2026-11-02T10:00:00Z' });
    expect(inMovementFilter(row, 'account-1', NO_FILTERS, day)).toBe(true);
    expect(inMovementFilter(row, 'account-9', NO_FILTERS, day)).toBe(false);
    expect(inMovementFilter(row, 'pos', NO_FILTERS, day)).toBe(false);
    expect(inMovementFilter(row, 'all', { ...NO_FILTERS, type: 'admin_receipt' }, day)).toBe(false);
    expect(inMovementFilter(row, 'all', { ...NO_FILTERS, type: 'bank_deposit' }, day)).toBe(true);
    expect(inMovementFilter(row, 'all', { ...NO_FILTERS, from: '2026-11-03' }, day)).toBe(false);
    expect(inMovementFilter(row, 'all', { ...NO_FILTERS, to: '2026-11-02' }, day)).toBe(true);
  });
});

describe('movement types', () => {
  const banks = new Set([2]);

  it('folds the stored kinds into three types', () => {
    expect(movementType(movement({ kind: 'customer_payment' }), banks)).toBe('customer_payment');
    expect(movementType(movement({ kind: 'bank_deposit' }), banks)).toBe('bank_deposit');
    expect(movementType(movement({ kind: 'pos_settlement' }), banks)).toBe('bank_deposit');
    expect(movementType(movement({ kind: 'admin_receipt' }), banks)).toBe('admin_receipt');
    expect(movementType(movement({ kind: 'envelope_handover' }), banks)).toBe('admin_receipt');
  });

  it('calls a transfer a bank deposit only when it reaches a bank', () => {
    expect(movementType(movement({ kind: 'transfer', to_account_id: 2 }), banks)).toBe('bank_deposit');
    expect(movementType(movement({ kind: 'transfer', to_account_id: 3 }), banks)).toBeNull();
    expect(movementType(movement({ kind: 'transfer', to_account_id: null }), banks)).toBeNull();
  });

  it('leaves the rest out, even with internal transfers showing', () => {
    (['custody_out', 'refund', 'adjustment', 'reversal'] as const).forEach((kind) => {
      expect(movementType(movement({ kind }), banks)).toBeNull();
      expect(inMovementFilter(movement({ kind }), 'all', { ...NO_FILTERS, showInternal: true }, day)).toBe(false);
    });
  });

  it('shows internal transfers only under the toggle, and never under a type', () => {
    const row = movement({ kind: 'transfer', to_account_id: 3 });
    expect(inMovementFilter(row, 'all', NO_FILTERS, day)).toBe(false);
    expect(inMovementFilter(row, 'all', { ...NO_FILTERS, showInternal: true }, day)).toBe(true);
    expect(inMovementFilter(row, 'all', { ...NO_FILTERS, showInternal: true, type: 'bank_deposit' }, day)).toBe(false);
  });

  it('finds what was reversed', () => {
    const first = movement({ id: 1 });
    const reversal = movement({ id: 2, kind: 'reversal', reverses_id: 1 });
    const reversals = reversalsOf([first, reversal]);
    expect(reversals.get(1)).toBe(reversal);
    expect(reversals.has(2)).toBe(false);
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

describe('deleting envelopes', () => {
  const gone = (id: number, ref: string) => ({ ref, amount: id * 100, currency: 'TRY' as const, ledgerRowsDeleted: 1 });

  it('deletes each in turn, keeps going past a failure and reports progress', async () => {
    const remove = jest.fn(async (id: number) => {
      if (id === 2) throw new Error('Envelope not found');
      return gone(id, `ENV-${id}`);
    });
    const progress: number[] = [];
    const outcome = await deleteEnvelopes(
      [{ id: 1, ref: 'ENV-1' }, { id: 2, ref: 'ENV-2' }, { id: 3, ref: 'ENV-3' }],
      'test data',
      (done) => progress.push(done),
      remove,
    );
    expect(remove.mock.calls).toEqual([[1, 'test data'], [2, 'test data'], [3, 'test data']]);
    expect(outcome.deleted.map((row) => row.ref)).toEqual(['ENV-1', 'ENV-3']);
    expect(outcome.failed).toEqual([{ envelope: { id: 2, ref: 'ENV-2' }, message: 'Envelope not found' }]);
    expect(progress).toEqual([1, 2, 3]);
  });

  it('words the toast by count', () => {
    expect(deletedMessage([gone(1, 'ENV-2611-0007')])).toBe('ENV-2611-0007 deleted');
    expect(deletedMessage([gone(1, 'ENV-1'), gone(2, 'ENV-2')])).toBe('2 envelopes deleted');
    expect(deletedMessage([])).toBeNull();
    expect(deleteFailedMessage([{ envelope: { id: 2, ref: 'ENV-2' }, message: 'Admins only' }])).toBe("Couldn't delete ENV-2: Admins only");
    expect(deleteFailedMessage([{ envelope: { id: 2, ref: 'ENV-2' }, message: 'x' }, { envelope: { id: 3, ref: 'ENV-3' }, message: 'y' }])).toBe("Couldn't delete 2 envelopes: ENV-2, ENV-3");
    expect(deleteFailedMessage([])).toBeNull();
  });
});
