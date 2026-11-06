import {
  canDeleteExpense,
  canEditExpense,
  custodyTotals,
  expenseErrorMessage,
  expenseProblems,
  inCustodyFilter,
  latinDigits,
  matchesCustodySearch,
  parseAmount,
  amountInput,
  receiptPath,
  statusChip,
  withRunning,
  type CustodyMovement,
} from './myCustody';

jest.mock('./supabase', () => ({ supabase: {} }));

const ME = 'u-me';
const row = (over: Partial<CustodyMovement>): CustodyMovement => ({
  id: 1,
  transaction_date: '2026-11-01',
  direction: 'OUT',
  category: 'Petrol',
  amount: 100,
  description: null,
  receipt_url: 'https://x/r.jpg',
  created_at: '2026-11-06T09:00:00Z',
  created_by: ME,
  expense_scope: 'car',
  car_id: 7,
  supplier_id: null,
  posted_car_tx_id: null,
  posted_company_expense_id: null,
  review_status: 'pending',
  reviewed_at: null,
  review_note: null,
  car: { plate_number: '34KDT101' },
  supplier: null,
  ...over,
});

describe('amounts', () => {
  it('read what a keypad types, in any locale', () => {
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('12.50')).toBe(12.5);
    expect(parseAmount('1.250,50')).toBe(1250.5);
    expect(parseAmount('1,250.50')).toBe(1250.5);
    expect(parseAmount('1.250')).toBe(1250);
    expect(parseAmount('₺ 75')).toBe(75);
    expect(parseAmount('\u0661\u0662\u066B\u0665')).toBe(12.5);
    expect(latinDigits('\u06F4\u06F5')).toBe('45');
  });

  it('refuse what is not a positive amount', () => {
    ['', '0', 'abc', '-5', '12,345,6', '1.2.3,456,7', '12,,555'].forEach((text) => expect(parseAmount(text)).toBeNull());
  });

  it('show a stored amount the way the field reads it back', () => {
    expect(amountInput(1250.5)).toBe('1250,50');
    expect(amountInput(75)).toBe('75');
    expect(parseAmount(amountInput(1250.5))).toBe(1250.5);
  });
});

describe('the form', () => {
  const draft = { amount: '100', scope: 'car' as const, carId: 7, category: 'Petrol', date: '2026-11-06', hasReceipt: true };

  it('asks for amount, car, category, a date not in the future, and a receipt', () => {
    expect(expenseProblems(draft, '2026-11-06')).toEqual([]);
    expect(expenseProblems({ ...draft, amount: '', carId: null, category: null, date: '2026-11-07', hasReceipt: false }, '2026-11-06'))
      .toEqual(['amount', 'car', 'category', 'date', 'receipt']);
  });

  it("doesn't ask for a car on a company expense", () => {
    expect(expenseProblems({ ...draft, scope: 'company', carId: null }, '2026-11-06')).toEqual([]);
  });

  it('says what the server refused, plainly', () => {
    expect(expenseErrorMessage('Receipt photo required')).toBe('A receipt is required.');
    expect(expenseErrorMessage('Only within 24 hours')).toBe('An expense can only be deleted within 24 hours.');
    expect(expenseErrorMessage('boom')).toBe('Could not save. Check your connection and try again.');
  });

  it("files a receipt under the person's own month folder", () => {
    expect(receiptPath(ME, { name: 'a.png', type: 'image/png' }, 'id1', '2026-11-06')).toBe('u-me/2026-11/id1.png');
    expect(receiptPath(ME, { name: 'b.pdf', type: 'application/pdf' }, 'id2', '2026-11-06')).toBe('u-me/2026-11/id2.pdf');
  });
});

describe('who can change an expense', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');

  it('edits their own while pending or rejected', () => {
    expect(canEditExpense(row({}), ME)).toBe(true);
    expect(canEditExpense(row({ review_status: 'rejected' }), ME)).toBe(true);
    expect(canEditExpense(row({ review_status: 'approved' }), ME)).toBe(false);
    expect(canEditExpense(row({ created_by: 'finance' }), ME)).toBe(false);
    expect(canEditExpense(row({ direction: 'IN' }), ME)).toBe(false);
  });

  it('deletes their own pending one within 24 hours, before it is posted', () => {
    expect(canDeleteExpense(row({}), ME, now)).toBe(true);
    expect(canDeleteExpense(row({ created_at: '2026-11-05T11:00:00Z' }), ME, now)).toBe(false);
    expect(canDeleteExpense(row({ review_status: 'rejected' }), ME, now)).toBe(false);
    expect(canDeleteExpense(row({ posted_car_tx_id: 4 }), ME, now)).toBe(false);
    expect(canDeleteExpense(row({}), null, now)).toBe(false);
  });
});

describe('the list', () => {
  const rows = [
    row({ id: 1, direction: 'IN', amount: 1000, category: null, review_status: 'approved', reviewed_at: '2026-11-01' }),
    row({ id: 2, amount: 150 }),
    row({ id: 3, amount: 50, review_status: 'rejected', review_note: 'No receipt date' }),
    row({ id: 4, amount: 200, review_status: 'approved', reviewed_at: '2026-11-02', posted_car_tx_id: 9 }),
  ];

  it('keeps a running balance and the totals', () => {
    expect(withRunning(rows).map((item) => item.running)).toEqual([1000, 850, 800, 600]);
    expect(custodyTotals(rows)).toEqual({ received: 1000, spent: 400, balance: 600, pending: { count: 1, total: 150 } });
  });

  it('labels each entry with where finance has got to', () => {
    expect(rows.map((item) => statusChip(item).label)).toEqual(['From finance', 'Pending', 'Rejected', 'Approved']);
    expect(statusChip(row({ review_status: 'approved' })).label).toBe('Approved (old)');
  });

  it('filters by the tiles and finds by plate, category or note', () => {
    expect(rows.filter((item) => inCustodyFilter(item, 'in')).map((item) => item.id)).toEqual([1]);
    expect(rows.filter((item) => inCustodyFilter(item, 'out')).map((item) => item.id)).toEqual([2, 3, 4]);
    expect(rows.filter((item) => inCustodyFilter(item, 'pending')).map((item) => item.id)).toEqual([2]);
    expect(matchesCustodySearch(rows[1], '34 kdt')).toBe(true);
    expect(matchesCustodySearch(rows[1], 'petrol')).toBe(true);
    expect(matchesCustodySearch(rows[1], 'wash')).toBe(false);
  });
});
