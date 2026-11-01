import { bookingsCovering, filterFines, fineDocuments, fineStats, type BookingOnCar, type Fine } from './fines';

jest.mock('./supabase', () => ({ supabase: {} }));

const fine = (over: Partial<Fine> = {}): Fine => ({
  id: 'f1', status: 'unpaid', plate_number: '34ABC123', violation_number: 'MB-1', customer_name: null,
  resolved_customer_name: 'Yusuf Demir', notification_date: null, amount: 1000, location: 'Şişli',
  violation_date: '2026-11-01', violation_time: '14:32', article: null, description: null,
  fine_image_url: null, fine_pdf_url: null, payment_receipt_url: null, created_at: '2026-11-01',
  car_id: 1, customer_id: 'c1', violation_code: null, ...over,
});

const booking = (over: Partial<BookingOnCar> = {}): BookingOnCar => ({
  id: 1, booking_number: 'HOM-1', customer_id: 'c1', customer_name: 'Yusuf Demir', is_banned: false,
  start_date: '2026-10-01', end_date: '2026-10-10', status: 'completed', ...over,
});

describe('fineStats', () => {
  const fines = [
    fine({ id: 'a', status: 'unpaid', amount: 1000 }),
    fine({ id: 'b', status: 'paid', amount: 500, customer_id: null }),
    fine({ id: 'c', status: 'unpaid', amount: 250, violation_date: '2026-09-30' }),
  ];

  it('adds up each side', () => {
    const stats = fineStats(fines, '2026-11');
    expect(stats.unpaid).toEqual({ count: 2, amount: 1250 });
    expect(stats.paid).toEqual({ count: 1, amount: 500 });
    expect(stats.month).toEqual({ count: 2, amount: 1500 });
    expect(stats.all).toEqual({ count: 3, amount: 1750 });
    expect(stats.linked).toBe(2);
    expect(stats.unassigned).toEqual({ count: 1, amount: 500 });
  });

  it('dates a fine by the violation, then by the notification', () => {
    const dated = [
      fine({ id: 'a', violation_date: null, notification_date: '2026-11-03' }),
      fine({ id: 'b', violation_date: '2026-10-30', notification_date: '2026-11-03' }),
      fine({ id: 'c', violation_date: null, notification_date: null }),
    ];
    expect(fineStats(dated, '2026-11').month.count).toBe(1);
    expect(filterFines(dated, 'month', '', '2026-11').map((row) => row.id)).toEqual(['a']);
  });

  it('adds amounts that arrive as text', () => {
    expect(fineStats([fine({ amount: '1246' as unknown as number }), fine({ amount: '4' as unknown as number })], '2026-11').unpaid.amount).toBe(1250);
  });
});

describe('filterFines', () => {
  const fines = [
    fine({ id: 'a' }),
    fine({ id: 'b', status: 'paid', customer_id: null, resolved_customer_name: null, plate_number: '06XYZ9', violation_number: 'TR-7', violation_date: '2026-01-02' }),
  ];
  const ids = (rows: Fine[]) => rows.map((row) => row.id);

  it('filters by segment', () => {
    expect(ids(filterFines(fines, 'all', '', '2026-11'))).toEqual(['a', 'b']);
    expect(ids(filterFines(fines, 'unpaid', '', '2026-11'))).toEqual(['a']);
    expect(ids(filterFines(fines, 'paid', '', '2026-11'))).toEqual(['b']);
    expect(ids(filterFines(fines, 'unassigned', '', '2026-11'))).toEqual(['b']);
    expect(ids(filterFines(fines, 'month', '', '2026-11'))).toEqual(['a']);
  });

  it('searches plate, violation number and customer', () => {
    expect(ids(filterFines(fines, 'all', '06xyz', '2026-11'))).toEqual(['b']);
    expect(ids(filterFines(fines, 'all', 'tr-7', '2026-11'))).toEqual(['b']);
    expect(ids(filterFines(fines, 'all', 'yusuf', '2026-11'))).toEqual(['a']);
  });

  it('combines the two', () => {
    expect(filterFines(fines, 'paid', 'yusuf', '2026-11')).toEqual([]);
  });
});

describe('bookingsCovering', () => {
  it('finds the booking on the day, ends included', () => {
    expect(bookingsCovering([booking()], '2026-10-01')).toHaveLength(1);
    expect(bookingsCovering([booking()], '2026-10-10')).toHaveLength(1);
    expect(bookingsCovering([booking()], '2026-10-11')).toHaveLength(0);
  });

  it('offers both customers on a handover day', () => {
    const rows = [booking(), booking({ id: 2, customer_id: 'c2', customer_name: 'Ali', start_date: '2026-10-10', end_date: '2026-10-12' })];
    expect(bookingsCovering(rows, '2026-10-10').map((row) => row.customer_id)).toEqual(['c1', 'c2']);
  });

  it('skips cancelled bookings, repeats, and rows with no customer', () => {
    const rows = [booking({ status: 'cancelled' }), booking({ id: 2 }), booking({ id: 3 }), booking({ id: 4, customer_id: null })];
    expect(bookingsCovering(rows, '2026-10-05').map((row) => row.id)).toEqual([2]);
  });

  it('needs a date', () => {
    expect(bookingsCovering([booking()], '')).toEqual([]);
  });
});

describe('fineDocuments', () => {
  it('lists only what exists, in a fixed order', () => {
    expect(fineDocuments({ fine_image_url: null, fine_pdf_url: 'p.pdf', payment_receipt_url: 'r.jpg' }).map((item) => item.key)).toEqual(['pdf', 'receipt']);
    expect(fineDocuments({ fine_image_url: null, fine_pdf_url: null, payment_receipt_url: null })).toEqual([]);
  });
});
