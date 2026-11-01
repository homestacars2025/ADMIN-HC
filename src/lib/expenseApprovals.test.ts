import {
  approvalMessage,
  canUndo,
  groupByEmployee,
  inReviewFilter,
  postingLabel,
  postingTarget,
  reviewStats,
  sheetLink,
  toReviewExpense,
  type ReviewExpense,
} from './expenseApprovals';

jest.mock('./supabase', () => ({ supabase: {} }));

const expense = (over: Partial<ReviewExpense>): ReviewExpense => ({
  id: 1, employee_id: 'a', transaction_date: '2026-11-01', category: 'Wash', amount: 100, description: 'x', receipt_url: 'r.jpg',
  expense_scope: 'company', car_id: null, review_status: 'pending', reviewed_at: null, review_note: null,
  posted_car_tx_id: null, posted_company_expense_id: null, plate: null, model: null, image: null, investor_id: null, investor: null, supplier: null,
  ...over,
});

describe('toReviewExpense', () => {
  it('flattens the joins, in the object or the array shape', () => {
    const row = toReviewExpense({
      ...expense({}),
      amount: '150.50',
      car: [{ plate_number: '34ABC1', investor_id: 'i1', investor: { company_name: null, profiles: [{ full_name: 'Alfahd' }] }, model_group: { name: 'Clio', image_url: 'c.jpg' } }],
      supplier: { name: 'Usta', category: 'mechanic' },
    });
    expect(row).toMatchObject({ amount: 150.5, plate: '34ABC1', model: 'Clio', image: 'c.jpg', investor_id: 'i1', investor: 'Alfahd', supplier: 'Usta' });
  });

  it('prefers the company name', () => {
    const row = toReviewExpense({ ...expense({}), car: { plate_number: 'p', investor_id: 'i', investor: { company_name: 'ALFAHD', profiles: { full_name: 'Someone' } }, model_group: null }, supplier: null });
    expect(row.investor).toBe('ALFAHD');
  });
});

describe('where an expense will be posted', () => {
  it('sends a car expense to that car sheet, naming the investor', () => {
    const target = postingTarget(expense({ expense_scope: 'car', car_id: 5, plate: '34ABC123', investor: 'ALFAHD' }));
    expect(postingLabel(target)).toBe('Car sheet 34ABC123 — investor ALFAHD');
  });

  it('sends everything else to company expenses, as the server does', () => {
    expect(postingLabel(postingTarget(expense({ expense_scope: 'company' })))).toBe('Company expenses');
    expect(postingLabel(postingTarget(expense({ expense_scope: 'car', car_id: null })))).toBe('Company expenses');
    expect(postingLabel(postingTarget(expense({ expense_scope: null })))).toBe('Company expenses');
  });
});

describe('sheetLink', () => {
  it('points at the row on the car sheet, in the month of the expense', () => {
    expect(sheetLink(expense({ transaction_date: '2026-10-30', car_id: 5, investor_id: 'i1', posted_car_tx_id: 77 })))
      .toBe('/dashboard/accounting/report?investor_id=i1&month=2026-10&car=5&entry=77');
  });

  it('points at the row in company expenses', () => {
    expect(sheetLink(expense({ posted_company_expense_id: 9 }))).toBe('/dashboard/accounting?tab=expenses&month=2026-11&entry=9');
  });

  it('has nowhere to go for a row nothing was posted for', () => {
    expect(sheetLink(expense({ review_status: 'approved' }))).toBeNull();
  });
});

describe('canUndo', () => {
  it('allows it on an expense approved through this page', () => {
    expect(canUndo(expense({ review_status: 'approved', reviewed_at: '2026-11-01T10:00:00Z' }))).toBe(true);
  });

  it('refuses it on older rows, which were never posted', () => {
    expect(canUndo(expense({ review_status: 'approved', reviewed_at: null }))).toBe(false);
  });

  it('refuses it on anything not approved', () => {
    expect(canUndo(expense({ review_status: 'rejected', reviewed_at: '2026-11-01T10:00:00Z' }))).toBe(false);
  });
});

describe('filters', () => {
  const rows = [
    expense({ id: 1, amount: 100 }),
    expense({ id: 2, amount: 50, review_status: 'approved', reviewed_at: '2026-11-01T01:00:00Z' }),
    expense({ id: 3, amount: 25, review_status: 'approved', reviewed_at: '2026-10-31T10:00:00Z' }),
    expense({ id: 4, amount: 10, review_status: 'approved', reviewed_at: null, receipt_url: null }),
    expense({ id: 5, amount: 5, review_status: 'rejected', reviewed_at: '2026-11-01T01:00:00Z', receipt_url: null }),
  ];

  it('counts approved in the month it was approved, on Istanbul time', () => {
    expect(inReviewFilter(expense({ review_status: 'approved', reviewed_at: '2026-10-31T22:00:00Z' }), 'approved', '2026-11')).toBe(true);
    expect(inReviewFilter(rows[2], 'approved', '2026-11')).toBe(false);
    expect(inReviewFilter(rows[3], 'approved', '2026-11')).toBe(false);
  });

  it('adds up each tile', () => {
    expect(reviewStats(rows, '2026-11')).toEqual({
      all: { count: 5, total: 190 },
      pending: { count: 1, total: 100 },
      approved: { count: 1, total: 50 },
      rejected: { count: 1, total: 5 },
      noReceipt: { count: 2, total: 15 },
    });
  });
});

describe('groupByEmployee', () => {
  it('puts whoever is waiting most first, and pending rows first inside', () => {
    const groups = groupByEmployee([
      expense({ id: 1, employee_id: 'a', amount: 10, review_status: 'approved', transaction_date: '2026-11-05' }),
      expense({ id: 2, employee_id: 'a', amount: 10, transaction_date: '2026-11-01' }),
      expense({ id: 3, employee_id: 'b', amount: 90 }),
    ]);
    expect(groups.map((group) => group.employeeId)).toEqual(['b', 'a']);
    expect(groups[1].rows.map((row) => row.id)).toEqual([2, 1]);
    expect(groups[1].pendingTotal).toBe(10);
  });
});

describe('approvalMessage', () => {
  it('turns server refusals into plain words', () => {
    expect(approvalMessage('Car has no investor — cannot post to a car sheet')).toMatch(/no investor/);
    expect(approvalMessage('Already approved')).toMatch(/already approved/);
    expect(approvalMessage('something new')).toBe('something new');
  });
});
