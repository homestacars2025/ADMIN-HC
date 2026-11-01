import {
  approvalMessage,
  canUndo,
  carCategoryFor,
  companyCategoryFor,
  defaultTarget,
  employeeSummaries,
  groupByEmployee,
  inReviewFilter,
  isLegacy,
  postingLabel,
  postingTarget,
  reviewStats,
  setSignature,
  sheetLink,
  signatureMap,
  suggestionChoice,
  toReviewExpense,
  wantsSignature,
  type ReviewExpense,
} from './expenseApprovals';

jest.mock('./supabase', () => ({ supabase: {} }));

const expense = (over: Partial<ReviewExpense>): ReviewExpense => ({
  id: 1, employee_id: 'a', direction: 'OUT', transaction_date: '2026-11-01', category: 'Wash', amount: 100, description: 'x', receipt_url: 'r.jpg',
  expense_scope: 'company', car_id: null, review_status: 'pending', reviewed_at: null, review_note: null,
  posted_car_tx_id: null, posted_company_expense_id: null, posted_car_id: null, plate: null, model: null, image: null, investor_id: null, investor: null, supplier: null,
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
  it('points at the car it was really posted to, not the one on the expense', () => {
    expect(sheetLink(expense({ transaction_date: '2026-10-30', car_id: 5, posted_car_id: 9, posted_car_tx_id: 77 })))
      .toBe('/dashboard/accounting?tab=investors&view=cars&month=2026-10&car=9&entry=77');
  });

  it('points at the row in company expenses', () => {
    expect(sheetLink(expense({ posted_company_expense_id: 9 }))).toBe('/dashboard/accounting?tab=expenses&month=2026-11&entry=9');
  });

  it('has nowhere to go when nothing was posted', () => {
    expect(sheetLink(expense({ review_status: 'approved' }))).toBeNull();
  });
});

describe('legacy rows', () => {
  const legacy = expense({ review_status: 'approved', reviewed_at: null });

  it('are the approved rows nobody reviewed', () => {
    expect(isLegacy(legacy)).toBe(true);
    expect(isLegacy(expense({ review_status: 'approved', reviewed_at: '2026-11-01T10:00:00Z' }))).toBe(false);
    expect(isLegacy(expense({}))).toBe(false);
  });

  it('cannot be undone, or they would post for the first time', () => {
    expect(canUndo(legacy)).toBe(false);
    expect(canUndo(expense({ review_status: 'approved', reviewed_at: '2026-11-01T10:00:00Z' }))).toBe(true);
    expect(canUndo(expense({ review_status: 'rejected', reviewed_at: '2026-11-01T10:00:00Z' }))).toBe(false);
  });

  it('do not wait for a signature', () => {
    expect(wantsSignature(legacy)).toBe(false);
    expect(wantsSignature(expense({ review_status: 'rejected' }))).toBe(false);
    expect(wantsSignature(expense({}))).toBe(true);
  });
});

describe('defaultTarget', () => {
  it('follows what the staff member chose', () => {
    expect(defaultTarget(expense({ expense_scope: 'car', car_id: 5 }))).toBe('car');
    expect(defaultTarget(expense({ expense_scope: 'company' }))).toBe('company');
    expect(defaultTarget(expense({ expense_scope: 'car', car_id: null }))).toBe('company');
  });
});

describe('prefilled categories', () => {
  it('matches the car sheet list, whatever the case', () => {
    expect(carCategoryFor('wash')).toBe('Wash');
    expect(carCategoryFor('fuel')).toBe('Petrol');
    expect(carCategoryFor('Branch')).toBe('Other');
    expect(carCategoryFor(null)).toBe('Other');
  });

  it('uses the stored value the company tab groups by', () => {
    expect(companyCategoryFor('Branch')).toBe('branch');
    expect(companyCategoryFor('Wash')).toBe('other');
  });
});

describe('suggestionChoice', () => {
  it('posts a car suggestion to its own car, under the car sheet category', () => {
    expect(suggestionChoice(expense({ car_id: 5, category: 'fuel' }), 'car'))
      .toEqual({ target: 'car', carId: 5, category: 'Petrol', note: null });
  });

  it('posts a company suggestion under the value the tab groups by', () => {
    expect(suggestionChoice(expense({ category: 'Branch' }), 'company'))
      .toEqual({ target: 'company', carId: null, category: 'branch', note: null });
  });
});

describe('signatures', () => {
  const map = signatureMap([
    { expense_id: 1, profile_id: 'me', signed_at: 't1' },
    { expense_id: 1, profile_id: 'you', signed_at: 't2' },
  ]);

  it('groups them by expense', () => {
    expect(map.get(1)?.get('you')).toBe('t2');
    expect(map.get(2)).toBeUndefined();
  });

  it('adds and removes without touching the original, or anyone else', () => {
    const removed = setSignature(map, 1, 'me', null);
    expect(removed.get(1)?.has('me')).toBe(false);
    expect(removed.get(1)?.has('you')).toBe(true);
    expect(map.get(1)?.has('me')).toBe(true);
    expect(setSignature(map, 3, 'me', 't9').get(3)?.get('me')).toBe('t9');
  });
});

describe('filters', () => {
  const rows = [
    expense({ id: 1, amount: 100 }),
    expense({ id: 2, amount: 50, review_status: 'approved', reviewed_at: '2026-11-01T01:00:00Z' }),
    expense({ id: 3, amount: 25, review_status: 'approved', reviewed_at: '2026-10-31T10:00:00Z' }),
    expense({ id: 4, amount: 10, review_status: 'approved', reviewed_at: null, receipt_url: null }),
    expense({ id: 5, amount: 5, review_status: 'rejected', reviewed_at: '2026-11-01T01:00:00Z', receipt_url: null }),
    expense({ id: 6, amount: 999, direction: 'IN', review_status: 'approved', receipt_url: null }),
  ];
  const context = { month: '2026-11', me: 'me', signatures: signatureMap([{ expense_id: 2, profile_id: 'me', signed_at: 't' }, { expense_id: 3, profile_id: 'you', signed_at: 't' }]) };

  it('counts approved in the month it was approved, on Istanbul time', () => {
    expect(inReviewFilter(expense({ review_status: 'approved', reviewed_at: '2026-10-31T22:00:00Z' }), 'approved', context)).toBe(true);
    expect(inReviewFilter(rows[2], 'approved', context)).toBe(false);
    expect(inReviewFilter(rows[3], 'approved', context)).toBe(false);
  });

  it('counts unsigned by me, leaving out what I signed, legacy and rejected rows', () => {
    expect(rows.filter((row) => inReviewFilter(row, 'unsigned', context)).map((row) => row.id)).toEqual([1, 3]);
  });

  it('keeps money coming in out of every review tile', () => {
    expect(inReviewFilter(rows[5], 'no_receipt', context)).toBe(false);
    expect(inReviewFilter(rows[5], 'unsigned', context)).toBe(false);
    expect(inReviewFilter(rows[5], 'all', context)).toBe(true);
  });

  it('adds up each tile', () => {
    expect(reviewStats(rows, context)).toEqual({
      pending: { count: 1, total: 100 },
      unsigned: { count: 2, total: 125 },
      approved: { count: 1, total: 50 },
      rejected: { count: 1, total: 5 },
      noReceipt: { count: 2, total: 15 },
    });
  });
});

describe('employeeSummaries', () => {
  it('splits this month by direction, and a rejected expense was not spent', () => {
    const rows = [
      expense({ id: 1, employee_id: 'a', direction: 'IN', amount: 1000 }),
      expense({ id: 2, employee_id: 'a', amount: 200, review_status: 'approved' }),
      expense({ id: 3, employee_id: 'a', amount: 70 }),
      expense({ id: 4, employee_id: 'a', amount: 30, review_status: 'rejected' }),
      expense({ id: 5, employee_id: 'a', amount: 500, transaction_date: '2026-10-01', review_status: 'approved' }),
    ];
    expect(employeeSummaries(rows, [{ employee_id: 'a', full_name: 'A', balance: 200 }], '2026-11')).toEqual([
      { employeeId: 'a', balance: 200, received: 1000, spent: 270, pending: 1 },
    ]);
  });

  it('shows someone holding money with no movements yet, and leaves out empty wallets', () => {
    const result = employeeSummaries([], [{ employee_id: 'b', full_name: 'B', balance: 50 }, { employee_id: 'c', full_name: 'C', balance: 0 }], '2026-11');
    expect(result.map((row) => row.employeeId)).toEqual(['b']);
  });

  it('puts whoever has most waiting first', () => {
    const result = employeeSummaries([expense({ id: 1, employee_id: 'a' }), expense({ id: 2, employee_id: 'b', review_status: 'approved' })], [{ employee_id: 'b', full_name: 'B', balance: 900 }], '2026-11');
    expect(result[0].employeeId).toBe('a');
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
