import {
  balanceState,
  bookingCountdown,
  buildActivity,
  buildInsights,
  checkAge,
  customerName,
  customerStats,
  daysBetween,
  documentCount,
  focusBooking,
  inSegment,
  isCharge,
  istanbulDate,
  ledgerBalance,
  ledgerTypeLabel,
  matchesSearch,
  normalizeLanguage,
  rentalDays,
  reviewStatusFor,
  runningLedger,
  summarizeCustomers,
  totalSpent,
  vipSpendThreshold,
  yearsSince,
  type Customer,
  type CustomerDirectory,
  type CustomerProfile,
  type LedgerEntry,
  type ProfileBooking,
} from './customers';

const TODAY = '2026-10-31';

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1', first_name: 'Ayşe', last_name: 'Yılmaz', phone: '+905364067730', email: null, nationality: 'Turkey',
  language: 'tr', id_type: 'passport', id_number: 'U123', birth_date: '1990-05-01', address: null,
  driving_license_number: null, license_issue_date: null, notes: null, created_at: '2026-01-10T10:00:00Z',
  id_photo_url: null, id_photo_back_url: null, driving_license_photo_url: null, driving_license_back_url: null,
  entry_stamp_photo_url: null,
  ...over,
});

const directoryBooking = (id: number, customerId: string, over = {}) => ({
  id, customer_id: customerId, start_date: '2026-09-01', end_date: '2026-09-05', status: 'completed',
  total_amount: null, is_currently_active: false, cars: { plate_number: '34 ABC 123' }, ...over,
});

const ledger = (bookingId: number, customerId: string, direction: 'IN' | 'OUT', amount: number, type = 'rental') =>
  ({ booking_id: bookingId, customer_id: customerId, direction, amount, type });

const booking = (over: Partial<ProfileBooking> = {}): ProfileBooking => ({
  id: 1, booking_number: 'HOM-1', car_id: 9, start_date: '2026-09-01', end_date: '2026-09-05', status: 'completed',
  insurance_type: null, total_amount: null, is_currently_active: false,
  cars: { plate_number: '34 ABC 123', car_photo_urls: null, model_group: { name: 'Fiat Egea', image_url: 'm.jpg', min_age: 23 } },
  ...over,
});

describe('ledger balance', () => {
  it('is OUT minus IN, so a positive balance is owed to us', () => {
    expect(ledgerBalance([{ direction: 'OUT', amount: 1000 }, { direction: 'IN', amount: 400 }])).toBe(600);
    expect(ledgerBalance([{ direction: 'IN', amount: 400 }])).toBe(-400);
  });

  it('copes with numeric strings and float noise', () => {
    expect(ledgerBalance([
      { direction: 'OUT', amount: '0.1' as unknown as number },
      { direction: 'OUT', amount: 0.2 },
      { direction: 'IN', amount: 0.3 },
    ])).toBe(0);
  });

  it('names the three states', () => {
    expect([balanceState(5), balanceState(-5), balanceState(0)]).toEqual(['owes', 'credit', 'clear']);
  });
});

describe('total spent', () => {
  it('treats refunds and deposits as money moving, not spend', () => {
    ['refund', 'REFUND', 'REF', 'REFOUND', 'deposit'].forEach((type) => {
      expect(isCharge({ type, direction: 'OUT' })).toBe(false);
    });
    expect(isCharge({ type: 'rental', direction: 'OUT' })).toBe(true);
    expect(isCharge({ type: 'rental', direction: 'IN' })).toBe(false);
  });

  it('takes the larger of the ledger and total_amount for each booking', () => {
    const bookings = [
      { id: 1, status: 'completed', total_amount: 13392 },
      { id: 2, status: 'completed', total_amount: 19665 },
      { id: 3, status: 'completed', total_amount: null },
      { id: 4, status: 'completed', total_amount: 500 },
    ];
    const rows = [ledger(1, 'c', 'OUT', 163), ledger(2, 'c', 'OUT', 27309), ledger(3, 'c', 'OUT', 900)];
    expect(totalSpent(bookings, rows)).toBe(13392 + 27309 + 900 + 500);
  });

  it('leaves out cancelled bookings', () => {
    expect(totalSpent([{ id: 1, status: 'cancelled', total_amount: 500 }], [])).toBe(0);
  });
});

describe('VIP', () => {
  it('sets the bar at the top 10% of customers who spent anything', () => {
    const spends = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 0, 0];
    expect(vipSpendThreshold(spends)).toBe(1000);
  });

  it('has no bar when nobody has spent', () => {
    expect(vipSpendThreshold([0, 0])).toBe(Infinity);
  });

  it('counts three bookings, or a top spend, and never a customer with no spend', () => {
    const directory: CustomerDirectory = {
      customers: [customer({ id: 'a' }), customer({ id: 'b' }), customer({ id: 'c' })],
      bookings: [
        directoryBooking(1, 'a'), directoryBooking(2, 'a'), directoryBooking(3, 'a'),
        directoryBooking(4, 'b'),
      ],
      ledger: [ledger(4, 'b', 'OUT', 5000), ledger(1, 'a', 'OUT', 10)],
      reviews: [],
    };
    const [a, b, c] = summarizeCustomers(directory, TODAY);
    expect([a.isVip, b.isVip, c.isVip]).toEqual([true, true, false]);
  });
});

describe('summarizeCustomers', () => {
  const directory: CustomerDirectory = {
    customers: [
      customer({ id: 'a', created_at: '2026-10-05T10:00:00Z', id_photo_url: 'x', entry_stamp_photo_url: 'y' }),
      customer({ id: 'b', first_name: 'Omar', last_name: 'Saleh', phone: '+218 91 (234) 5678', nationality: 'Libya' }),
    ],
    bookings: [
      directoryBooking(1, 'a', { is_currently_active: true, status: 'confirmed', start_date: '2026-10-29', cars: [{ plate_number: '34 XYZ 99' }] }),
      directoryBooking(2, 'a', { status: 'cancelled', start_date: '2026-11-20' }),
    ],
    ledger: [ledger(1, 'a', 'OUT', 1000), ledger(1, 'a', 'IN', 250, 'payment'), ledger(9, 'b', 'IN', 40, 'deposit')],
    reviews: [{ customer_id: 'b', our_rating: 2 }],
  };
  const [first, second] = summarizeCustomers(directory, TODAY);

  it('rolls up one row per customer', () => {
    expect(first).toMatchObject({
      bookingCount: 1, balance: 750, documents: 2, activeNow: true, currentPlate: '34 XYZ 99',
      lastBooking: '2026-10-29', isNew: true, rating: null,
    });
    expect(second).toMatchObject({ bookingCount: 0, balance: -40, rating: 2, lastBooking: null, isNew: false });
  });

  it('places customers in the right segments', () => {
    expect(inSegment(first, 'active')).toBe(true);
    expect(inSegment(first, 'owes')).toBe(true);
    expect(inSegment(first, 'new')).toBe(true);
    expect(inSegment(second, 'credit')).toBe(true);
    expect(inSegment(second, 'low')).toBe(true);
    expect(inSegment(second, 'active')).toBe(false);
    expect(inSegment(first, 'low')).toBe(false);
    expect(inSegment(first, 'documents')).toBe(true);
    expect(inSegment(first, 'all')).toBe(true);
  });

  it('adds up the tiles', () => {
    expect(customerStats([first, second])).toEqual({
      total: 2, active: 1, owingCount: 1, owingTotal: 750, newThisMonth: 1,
    });
  });

  it('searches name, phone digits, ID, nationality and current plate', () => {
    expect(matchesSearch(first, 'ayşe y')).toBe(true);
    expect(matchesSearch(second, '218912345')).toBe(true);
    expect(matchesSearch(first, 'u123')).toBe(true);
    expect(matchesSearch(second, 'liby')).toBe(true);
    expect(matchesSearch(first, '34xyz')).toBe(true);
    expect(matchesSearch(second, '34xyz')).toBe(false);
    expect(matchesSearch(first, '   ')).toBe(true);
  });
});

describe('insights', () => {
  it('keeps the nationality and booking figures the old page showed', () => {
    const insights = buildInsights({
      customers: [customer({ id: 'a' }), customer({ id: 'b', first_name: 'Omar', nationality: 'Libya' }), customer({ id: 'c', nationality: ' Libya ' })],
      bookings: [
        directoryBooking(1, 'a', { start_date: '2026-01-01', end_date: '2026-01-03' }),
        directoryBooking(2, 'a', { start_date: '2026-02-01', end_date: '2026-02-05' }),
        directoryBooking(3, 'b', { start_date: '2026-03-01', end_date: '2026-03-13' }),
      ],
      ledger: [],
      reviews: [],
    });
    expect(insights.nationalities[0]).toEqual({ nationality: 'Libya', count: 2 });
    expect(insights.withNationality).toBe(3);
    expect(insights.averageDays).toBe(6);
    expect(insights.topCustomer).toEqual({ name: 'Ayşe Yılmaz', count: 2 });
    expect(insights.longestRental).toEqual({ name: 'Omar Yılmaz', days: 12 });
  });
});

describe('dates', () => {
  it('uses the Istanbul day', () => {
    expect(istanbulDate(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11-01');
  });

  it('counts days across a clock change', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('counts completed years only', () => {
    expect(yearsSince('1990-11-01', TODAY)).toBe(35);
    expect(yearsSince('1990-10-31', TODAY)).toBe(36);
    expect(yearsSince(null, TODAY)).toBeNull();
  });
});

describe('profile helpers', () => {
  it('prefers the live booking, then the soonest upcoming one', () => {
    const later = booking({ id: 2, start_date: '2026-12-01', end_date: '2026-12-02', status: 'confirmed' });
    const sooner = booking({ id: 3, start_date: '2026-11-10', end_date: '2026-11-12', status: 'pending' });
    const live = booking({ id: 4, is_currently_active: true, status: 'confirmed', start_date: '2026-10-30', end_date: '2026-11-02' });
    expect(focusBooking([later, sooner, live, booking()], TODAY)?.id).toBe(4);
    expect(focusBooking([later, sooner, booking()], TODAY)?.id).toBe(3);
    expect(focusBooking([booking()], TODAY)).toBeNull();
    expect(focusBooking([booking({ start_date: '2026-11-10', status: 'cancelled' })], TODAY)).toBeNull();
  });

  it('counts down in plain words', () => {
    const live = (end: string) => booking({ is_currently_active: true, end_date: end });
    expect(bookingCountdown(live('2026-11-03'), TODAY)).toBe('Due back in 3 days');
    expect(bookingCountdown(live(TODAY), TODAY)).toBe('Due back today');
    expect(bookingCountdown(live('2026-10-30'), TODAY)).toBe('1 day overdue');
    expect(bookingCountdown(booking({ start_date: '2026-11-01' }), TODAY)).toBe('Starts in 1 day');
    expect(bookingCountdown(booking({ start_date: TODAY }), TODAY)).toBe('Starts today');
  });

  it('adds up rented days, counting a same-day rental as one', () => {
    expect(rentalDays([
      booking({ start_date: '2026-09-01', end_date: '2026-09-05' }),
      booking({ start_date: '2026-09-07', end_date: '2026-09-07' }),
      booking({ status: 'cancelled' }),
    ])).toBe(5);
  });

  it('builds a running balance and shows it newest first', () => {
    const entry = (id: string, direction: 'IN' | 'OUT', amount: number): LedgerEntry => ({
      id, booking_id: 1, customer_id: 'c', car_id: 1, type: 'rental', description: null, amount, direction, created_at: `2026-01-0${id}`,
    });
    const lines = runningLedger([entry('1', 'OUT', 1000), entry('2', 'IN', 400), entry('3', 'IN', 700)]);
    expect(lines.map((line) => [line.id, line.running])).toEqual([['3', -100], ['2', 600], ['1', 1000]]);
  });

  it('tidies ledger types without touching what staff typed', () => {
    expect(ledgerTypeLabel('car_wash')).toBe('Car wash');
    expect(ledgerTypeLabel('hgs')).toBe('HGS');
    expect(ledgerTypeLabel('payment')).toBe('Payment');
    expect(ledgerTypeLabel('TOTAL 34HZU404')).toBe('TOTAL 34HZU404');
  });

  it('checks age against the car in question', () => {
    expect(checkAge({ birth_date: null }, [booking()], TODAY)).toEqual({ state: 'missing' });
    expect(checkAge({ birth_date: '1990-01-01' }, [booking()], TODAY))
      .toEqual({ state: 'ok', age: 36, minAge: 23, model: 'Fiat Egea' });
    expect(checkAge({ birth_date: '2005-01-01' }, [booking()], TODAY))
      .toEqual({ state: 'under', age: 21, minAge: 23, model: 'Fiat Egea' });
    expect(checkAge({ birth_date: '1990-01-01' }, [], TODAY)).toEqual({ state: 'no_rule', age: 36 });
  });

  it('never queues a second review request, and only asks at 5★', () => {
    expect(reviewStatusFor(5, null)).toBe('awaiting_send');
    expect(reviewStatusFor(4, 'awaiting_send')).toBe('rejected');
    expect(reviewStatusFor(5, 'rejected')).toBe('awaiting_send');
    expect(reviewStatusFor(2, 'sent')).toBe('sent');
    expect(reviewStatusFor(5, 'sent')).toBe('sent');
  });

  it('merges activity newest first, with payments but not charges', () => {
    const profile: CustomerProfile = {
      customer: customer(),
      bookings: [booking({ start_date: '2026-09-01' })],
      ledger: [
        { id: 'p', booking_id: 1, customer_id: 'c1', car_id: 9, type: 'payment', description: null, amount: 500, direction: 'IN', created_at: '2026-09-03T10:00:00Z' },
        { id: 'r', booking_id: 1, customer_id: 'c1', car_id: 9, type: 'rental', description: null, amount: 500, direction: 'OUT', created_at: '2026-09-04T10:00:00Z' },
      ],
      fines: [{ id: 'f', status: 'unpaid', plate_number: '34 ABC 123', violation_number: null, amount: 900, location: null, violation_date: '2026-09-02', description: null, fine_image_url: null, fine_pdf_url: null }],
      hgs: [],
      review: { id: 7, our_rating: 5, status: 'awaiting_send', rated_at: '2026-09-10T10:00:00Z', rated_by: null, review_sent_at: null },
      raterName: null,
    };
    expect(buildActivity(profile).map((item) => item.kind)).toEqual(['review', 'payment', 'fine', 'booking']);
  });
});

describe('small helpers', () => {
  it('counts the five documents', () => {
    expect(documentCount(customer({ id_photo_url: 'a', driving_license_back_url: 'b' }))).toBe(2);
  });

  it('names a customer even with nothing on file', () => {
    expect(customerName({ first_name: null, last_name: null })).toBe('Unnamed customer');
    expect(customerName({ first_name: 'Omar', last_name: null })).toBe('Omar');
  });

  it('keeps language inside the database constraint', () => {
    expect(normalizeLanguage('tr')).toBe('tr');
    expect(normalizeLanguage('de')).toBe('ar');
  });
});
