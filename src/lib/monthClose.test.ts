import {
  allWithAdmin,
  inCloseFilter,
  matchesCloseSearch,
  monthCloseCsv,
  monthClosePrintHtml,
  monthSummary,
  nowLabel,
  periodLabel,
  rowPlace,
  sortCloseRows,
  unknownPayments,
  type EventPayment,
  type MonthEvent,
} from './monthClose';

jest.mock('./supabase', () => ({ supabase: {} }));

const payment = (over: Partial<EventPayment>): EventPayment => ({
  ledger_id: 'l1', type: 'payment', method: 'cash', amount: 100, currency: 'TRY', amount_try: 100, date: '2026-11-02T10:00:00Z', ref: 'ENV-2611-0001',
  first_account: 'Sisli - 01', now: 'in_safe', now_account: 'Sisli - 01', legacy: false, ...over,
});
const event = (over: Partial<MonthEvent>): MonthEvent => ({
  event_id: 1, booking_id: 1, booking_number: 'HOM-11-26-001', event_no: 0, kind: 'new', created_at: '2026-11-02T10:00:00Z',
  period_start: '2026-12-01', period_end: '2026-12-06', days: 5, customer_id: 'c', customer_name: 'Ali Veli', car_id: 1, plate: '34 ABC 101',
  rental_amount: 1000, paid: 0, deposit: 0, remaining: 1000, payments: [], checked_by: null, checked_at: null, ...over,
});

describe('where the money is', () => {
  it('needs every payment with the admin, not just most', () => {
    expect(allWithAdmin({ payments: [] })).toBe(false);
    expect(allWithAdmin({ payments: [payment({ now: 'with_admin' })] })).toBe(true);
    expect(allWithAdmin({ payments: [payment({ now: 'with_admin' }), payment({ now: 'in_account', ref: null })] })).toBe(false);
  });

  it('shows what has not arrived, even when the first payment has', () => {
    expect(rowPlace({ payments: [] })).toBeNull();
    expect(rowPlace({ payments: [payment({ now: 'with_admin' }), payment({ now: 'pending_bank' })] })).toBe('pending_bank');
    expect(rowPlace({ payments: [payment({ now: 'with_admin' })] })).toBe('with_admin');
  });
});

describe('legacy payments', () => {
  const legacy = payment({ ledger_id: 'old', legacy: true, method: null, ref: null, first_account: 'Unknown (legacy)', now: 'unknown', now_account: 'Unknown', amount_try: 500 });
  const received = payment({ ...legacy, now: 'with_admin', now_account: 'Admin — Rajab' });

  it('is not with the admin until the admin says so', () => {
    expect(rowPlace({ payments: [legacy] })).toBe('unknown');
    expect(allWithAdmin({ payments: [legacy] })).toBe(false);
    expect(inCloseFilter(event({ payments: [legacy] }), 'not_with_admin')).toBe(true);
    expect(monthSummary([event({ payments: [legacy, received] })])).toMatchObject({ notWithAdmin: 500, notWithAdminCount: 1 });
  });

  it('counts as with the admin once confirmed', () => {
    expect(rowPlace({ payments: [received] })).toBe('with_admin');
    expect(allWithAdmin({ payments: [received] })).toBe(true);
    expect(monthSummary([event({ payments: [received] })]).notWithAdmin).toBe(0);
  });

  it('offers only unconfirmed money for marking', () => {
    expect(unknownPayments([{ payments: [legacy, received, payment({})] }]).map((row) => row.ledger_id)).toEqual(['old']);
  });

  it('reads plainly', () => {
    expect(nowLabel(legacy)).toBe('Unknown');
    expect(nowLabel(received)).toBe('With admin ✓ · Admin — Rajab');
  });

  it('exports with its destination spelled out', () => {
    expect(monthCloseCsv([event({ payments: [legacy] })], () => '')).toContain('Unknown (legacy)');
  });
});

describe('monthSummary', () => {
  const rows = [
    event({ event_id: 1, rental_amount: 1000, paid: 400, deposit: 200, remaining: 600, checked_at: 'x', payments: [payment({ amount_try: 400 }), payment({ type: 'deposit', amount_try: 200, now: 'with_admin' })] }),
    event({ event_id: 2, kind: 'extension', event_no: 1, rental_amount: 500, paid: 900, deposit: 0, remaining: -400, payments: [payment({ amount_try: 900, now: 'pending_bank' })] }),
  ];

  it('adds revenue up, split into new and extensions', () => {
    const summary = monthSummary(rows);
    expect(summary).toMatchObject({ revenue: 1500, newRevenue: 1000, extensionRevenue: 500, collected: 1300, deposits: 200 });
  });

  it('nets outstanding, because a late payment lands on the newest event', () => {
    expect(monthSummary(rows).outstanding).toBe(200);
  });

  it('counts money away from the admin payment by payment, deposits included', () => {
    expect(monthSummary(rows)).toMatchObject({ notWithAdmin: 1300, notWithAdminCount: 2 });
  });

  it('counts the ticks', () => {
    expect(monthSummary(rows)).toMatchObject({ checked: 1, total: 2, left: 1 });
  });
});

describe('filters', () => {
  it('matches each tile', () => {
    expect(inCloseFilter(event({}), 'all')).toBe(true);
    expect(inCloseFilter(event({ paid: 0 }), 'collected')).toBe(false);
    expect(inCloseFilter(event({ remaining: 0 }), 'outstanding')).toBe(false);
    expect(inCloseFilter(event({ remaining: -5 }), 'outstanding')).toBe(false);
    expect(inCloseFilter(event({ deposit: 50 }), 'deposits')).toBe(true);
    expect(inCloseFilter(event({ payments: [payment({ now: 'with_admin' })] }), 'not_with_admin')).toBe(false);
    expect(inCloseFilter(event({ payments: [payment({ now: 'with_admin' }), payment({ now: 'in_safe' })] }), 'not_with_admin')).toBe(true);
    expect(inCloseFilter(event({ checked_at: 'x' }), 'unchecked')).toBe(false);
  });

  it('searches booking, customer and plate, ignoring spaces and case', () => {
    expect(matchesCloseSearch(event({}), 'hom-11')).toBe(true);
    expect(matchesCloseSearch(event({}), 'ali')).toBe(true);
    expect(matchesCloseSearch(event({}), '34abc')).toBe(true);
    expect(matchesCloseSearch(event({}), 'nothing')).toBe(false);
    expect(matchesCloseSearch(event({ customer_name: null, plate: null }), '')).toBe(true);
  });
});

describe('sortCloseRows', () => {
  const rows = [
    event({ event_id: 1, rental_amount: 900, created_at: '2026-11-03T00:00:00Z', customer_name: 'Zeki' }),
    event({ event_id: 2, rental_amount: 100, created_at: '2026-11-01T00:00:00Z', customer_name: 'Ayşe' }),
  ];
  const ids = (sorted: MonthEvent[]) => sorted.map((row) => row.event_id);

  it('sorts numbers as numbers and text as text, both ways', () => {
    expect(ids(sortCloseRows(rows, 'rental', 'desc'))).toEqual([1, 2]);
    expect(ids(sortCloseRows(rows, 'rental', 'asc'))).toEqual([2, 1]);
    expect(ids(sortCloseRows(rows, 'customer', 'asc'))).toEqual([2, 1]);
    expect(ids(sortCloseRows(rows, 'created', 'asc'))).toEqual([2, 1]);
  });

  it('leaves the list it was given alone', () => {
    sortCloseRows(rows, 'rental', 'asc');
    expect(ids(rows)).toEqual([1, 2]);
  });
});

describe('periodLabel', () => {
  it('reads like the brief', () => {
    expect(periodLabel(event({}))).toBe('1 Dec → 6 Dec · 5 days');
    expect(periodLabel(event({ period_start: '2026-12-01', period_end: '2026-12-02', days: 1 }))).toBe('1 Dec → 2 Dec · 1 day');
  });

  it('copes with a rental row that had no dates', () => {
    expect(periodLabel(event({ period_start: null, days: null }))).toBe('… → 6 Dec');
    expect(periodLabel(event({ period_start: null, period_end: null, days: null }))).toBe('—');
  });
});

describe('export', () => {
  const rows = [event({ customer_name: '=SUM(A1)', payments: [payment({})] }), event({ event_id: 2, kind: 'extension', event_no: 3, customer_name: '<b>Ali</b> & "co"', rental_amount: 500, remaining: 500 })];

  it('writes one line per event, then the totals', () => {
    const lines = monthCloseCsv(rows, () => '').split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0].charCodeAt(0)).toBe(0xfeff);
    expect(lines[2]).toContain('Extension #3');
    expect(lines[3]).toContain('Total');
    expect(lines[3]).toContain('1500');
  });

  it('stops a spreadsheet running a name as a formula', () => {
    expect(monthCloseCsv(rows, () => '')).toContain("'=SUM(A1)");
  });

  it('escapes names on the print page', () => {
    const html = monthClosePrintHtml(rows, 'Monthly close', 'Open', () => '');
    expect(html).not.toContain('<b>Ali</b>');
    expect(html).toContain('&lt;b&gt;Ali&lt;/b&gt; &amp; &quot;co&quot;');
    expect(html).toContain('Ext #3');
  });
});
