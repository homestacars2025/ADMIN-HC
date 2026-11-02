import { attentionItems, dayListRange, deltaPercent, type AdminDashboard } from './adminDashboard';

jest.mock('./supabase', () => ({ supabase: {} }));

const alerts = (over: Partial<AdminDashboard['alerts']>): AdminDashboard['alerts'] => ({
  pending_invoices: 0, kabis_missing: 0, unpaid_fines: 0, unpaid_fines_amount: 0, open_car_issues: 0, custody_pending_review: 0,
  insurance_30d: 0, inspection_30d: 0, customers_owing: 0, customers_owing_amount: 0, ...over,
});

describe('deltaPercent', () => {
  it('compares with last month', () => {
    expect(deltaPercent(150, 100)).toBe(50);
    expect(deltaPercent(50, 100)).toBe(-50);
    expect(deltaPercent(100, 100)).toBe(0);
  });

  it('says nothing when there is nothing to compare with', () => {
    expect(deltaPercent(100, 0)).toBeNull();
  });
});

describe('attentionItems', () => {
  it('is empty when nothing needs attention', () => {
    expect(attentionItems(alerts({}))).toEqual([]);
  });

  it('only shows what is above zero', () => {
    expect(attentionItems(alerts({ open_car_issues: 1 })).map((item) => item.key)).toEqual(['issues']);
  });

  it('keeps customers owing out, because it lives in the money row', () => {
    expect(attentionItems(alerts({ customers_owing: 9, customers_owing_amount: 100 }))).toEqual([]);
  });

  it('puts what stops a car driving first', () => {
    const items = attentionItems(alerts({ pending_invoices: 91, kabis_missing: 4, unpaid_fines: 5, open_car_issues: 1, custody_pending_review: 2, insurance_30d: 1, inspection_30d: 3 }));
    expect(items.map((item) => item.key)).toEqual(['insurance', 'inspection', 'kabis', 'fines', 'issues', 'custody', 'invoices']);
  });

  it('shows the fine amount, and links to the filtered lists', () => {
    const fines = attentionItems(alerts({ unpaid_fines: 5, unpaid_fines_amount: 48738 }))[0];
    expect(fines.detail).toContain('48.738');
    expect(fines.to).toBe('/dashboard/fines?filter=unpaid');
    expect(attentionItems(alerts({ pending_invoices: 1 }))[0].to).toBe('/dashboard/pending-invoices?month=all');
    expect(attentionItems(alerts({ custody_pending_review: 1 }))[0].to).toBe('/dashboard/accounting?tab=custody&filter=pending');
  });

  it('reads properly for one', () => {
    expect(attentionItems(alerts({ inspection_30d: 1 }))[0].detail).toBe('car within 30 days');
    expect(attentionItems(alerts({ inspection_30d: 3 }))[0].detail).toBe('cars within 30 days');
  });
});

describe('dayListRange', () => {
  const today = '2026-11-30';

  it('matches the dashboard rule for each list', () => {
    expect(dayListRange('active', today)).toEqual({ startFrom: null, startBefore: '2026-12-01', endFrom: today, endBefore: null, statuses: ['confirmed', 'active'] });
    expect(dayListRange('pickups', today)).toEqual({ startFrom: today, startBefore: '2026-12-01', endFrom: null, endBefore: null, statuses: null });
    expect(dayListRange('returns', today)).toEqual({ startFrom: null, startBefore: null, endFrom: today, endBefore: '2026-12-01', statuses: null });
  });

  it('counts the next seven days from tomorrow, today excluded', () => {
    expect(dayListRange('next7', today)).toMatchObject({ endFrom: '2026-12-01', endBefore: '2026-12-08' });
  });
});
