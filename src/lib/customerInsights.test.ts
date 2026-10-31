import {
  customerTrends,
  findDataIssues,
  groupPeople,
  languageRows,
  loyaltyStats,
  monthKeys,
  nameKey,
  nationalityRows,
  newCustomersByMonth,
  percentChange,
  phoneKey,
  sameDayLastMonth,
  similarNames,
  topNationalities,
} from './customerInsights';
import { summarizeCustomers, type Customer, type CustomerDirectory } from './customers';

const TODAY = '2026-10-15';

const customer = (id: string, over: Partial<Customer> = {}): Customer => ({
  id, first_name: 'Name', last_name: id, phone: null, email: null, nationality: 'Turkey', language: 'ar',
  id_type: null, id_number: null, birth_date: null, address: null, driving_license_number: null,
  license_issue_date: null, notes: null, created_at: '2026-01-10T10:00:00Z', id_photo_url: null,
  id_photo_back_url: null, driving_license_photo_url: null, driving_license_back_url: null,
  entry_stamp_photo_url: null,
  ...over,
});

const booking = (id: number, customerId: string, over = {}) => ({
  id, customer_id: customerId, car_id: id, start_date: '2026-09-01', end_date: '2026-09-05', status: 'completed',
  total_amount: null, is_currently_active: false, cars: { plate_number: '34 ABC 1' }, ...over,
});

const entry = (customerId: string, direction: 'IN' | 'OUT', amount: number, date: string, bookingId = 1) => ({
  booking_id: bookingId, customer_id: customerId, type: 'rental', amount, direction, created_at: `${date}T10:00:00Z`,
});

describe('months', () => {
  it('walks back across a year end', () => {
    expect(monthKeys('2026-02-10', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('finds the same day last month, or the last day of a shorter month', () => {
    expect(sameDayLastMonth('2026-10-15')).toBe('2026-09-15');
    expect(sameDayLastMonth('2026-03-31')).toBe('2026-02-28');
    expect(sameDayLastMonth('2026-01-20')).toBe('2025-12-20');
  });

  it('has no percent to show when last month was zero', () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(90, 100)).toBe(-10);
  });
});

describe('customerTrends', () => {
  const directory: CustomerDirectory = {
    customers: [
      customer('a', { created_at: '2026-09-02T10:00:00Z' }),
      customer('b', { created_at: '2026-09-20T10:00:00Z' }),
      customer('c', { created_at: '2026-10-03T10:00:00Z' }),
      customer('d', { created_at: '2026-10-05T10:00:00Z' }),
    ],
    bookings: [
      booking(1, 'a', { is_currently_active: true, status: 'confirmed', car_id: 7, start_date: '2026-10-10', end_date: '2026-10-20' }),
      booking(2, 'a', { is_currently_active: true, status: 'confirmed', car_id: 7, start_date: '2026-10-10', end_date: '2026-10-20' }),
      booking(3, 'b', { start_date: '2026-09-10', end_date: '2026-09-20' }),
      booking(4, 'b', { start_date: '2026-09-10', end_date: '2026-09-20', status: 'cancelled' }),
    ],
    ledger: [
      entry('a', 'OUT', 1000, '2026-09-10'),
      entry('a', 'IN', 400, '2026-10-05'),
      entry('b', 'IN', 500, '2026-09-11'),
    ],
    reviews: [],
  };
  const trends = customerTrends(directory, TODAY);

  it('counts everyone added by each month end', () => {
    expect(trends.total.series.slice(-2)).toEqual([2, 4]);
    expect(trends.total.change).toBe(100);
    expect(trends.total.addedThisMonth).toBe(2);
  });

  it('counts rentals, and each car once', () => {
    expect(trends.active.rentals).toBe(2);
    expect(trends.active.carsOut).toBe(1);
  });

  it('compares active rentals with the same day last month, ignoring cancelled ones', () => {
    expect(trends.active.change).toBe(100);
  });

  it('sums debts without letting one customer\'s credit cancel another\'s', () => {
    expect(trends.owed.series.slice(-2)).toEqual([1000, 600]);
    expect(trends.owed.change).toBe(-40);
  });

  it('compares new customers like for like', () => {
    expect(trends.newCustomers.series.slice(-2)).toEqual([2, 2]);
    expect(trends.newCustomers.previous).toBe(1);
    expect(trends.newCustomers.change).toBe(100);
  });
});

describe('nationalities', () => {
  const directory: CustomerDirectory = {
    customers: [
      customer('a', { nationality: 'Libya' }), customer('b', { nationality: 'Libya' }), customer('c', { nationality: 'Syria' }),
      customer('d', { nationality: 'Jordan' }), customer('e', { nationality: null }),
    ],
    bookings: [booking(1, 'a'), booking(2, 'c'), booking(3, 'd')],
    ledger: [entry('a', 'OUT', 900, '2026-09-01', 1), entry('c', 'OUT', 300, '2026-09-01', 2), entry('d', 'OUT', 100, '2026-09-01', 3)],
    reviews: [],
  };
  const rows = nationalityRows(summarizeCustomers(directory, TODAY));

  it('adds up customers and revenue, averaging only over spenders', () => {
    expect(rows.find((row) => row.nationality === 'Libya')).toMatchObject({ customers: 2, revenue: 900, averageSpend: 900 });
    expect(rows.find((row) => row.nationality === 'Unknown')).toMatchObject({ customers: 1, revenue: 0, averageSpend: 0 });
  });

  it('folds the rest into Others, keeping the totals', () => {
    const top = topNationalities(rows, 'customers', 2);
    expect(top.map((row) => row.nationality)).toEqual(['Libya', expect.any(String), 'Others']);
    expect(top.reduce((sum, row) => sum + row.customers, 0)).toBe(5);
  });

  it('leaves zero-revenue nationalities out of the revenue view', () => {
    expect(topNationalities(rows, 'revenue', 6).map((row) => row.nationality)).toEqual(['Libya', 'Syria', 'Jordan']);
  });
});

describe('languages and months', () => {
  it('names each language and puts the unknown under Other', () => {
    expect(languageRows([{ language: 'ar' }, { language: 'ar' }, { language: 'tr' }, { language: 'ru' }, { language: 'de' }]))
      .toEqual([
        { label: 'Arabic', count: 2 },
        { label: 'Turkish', count: 1 },
        { label: 'Russian', count: 1 },
        { label: 'Other', count: 1 },
      ]);
  });

  it('gives every one of the 12 months a bar, even empty ones', () => {
    const months = newCustomersByMonth([{ created_at: '2026-10-01T10:00:00Z' }, { created_at: null }], TODAY);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ month: '2025-11', count: 0 });
    expect(months[11]).toEqual({ month: '2026-10', count: 1 });
  });
});

describe('phone and name keys', () => {
  it('treats the ways a number gets stored as one number', () => {
    expect(phoneKey('+90 536 406 77 30')).toBe('905364067730');
    expect(phoneKey('00905364067730')).toBe('905364067730');
    expect(phoneKey('05364067730')).toBe('905364067730');
  });

  it('ignores placeholders', () => {
    expect(phoneKey('+111111')).toBeNull();
    expect(phoneKey('+1111111111')).toBeNull();
    expect(phoneKey('1234567')).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });

  it('folds case and Turkish letters', () => {
    expect(nameKey('İBRAHİM  Çelik')).toBe('ibrahim celik');
    expect(nameKey('Ayşe YILMAZ')).toBe(nameKey('ayse yilmaz'));
  });

  it('calls names similar only when they really are', () => {
    expect(similarNames('abdolghani toudzili', 'abdolghani toudzilli')).toBe(true);
    expect(similarNames('ibrahim albrahim', 'albrahim ibrahim')).toBe(true);
    expect(similarNames('ibrahim albrahim', 'ibrahim alibrahim')).toBe(true);
    expect(similarNames('ali can', 'ali cam')).toBe(false);
    expect(similarNames('ahmad mahmud', 'mohamed ali')).toBe(false);
    expect(similarNames('', '')).toBe(false);
  });
});

describe('groupPeople', () => {
  it('links records through a shared phone or ID, even in a chain', () => {
    const groups = groupPeople([
      customer('a', { phone: '+905364067730' }),
      customer('b', { phone: '05364067730', id_number: 'U1234567' }),
      customer('c', { id_number: 'u1234567' }),
      customer('d', { phone: '+905550000001' }),
    ]);
    expect(groups.map((group) => group.map((record) => record.id).sort())).toEqual([['a', 'b', 'c'], ['d']]);
  });

  it('does not merge different people who share a phone', () => {
    const groups = groupPeople([
      customer('a', { first_name: 'Ahmed', last_name: 'Shamden', phone: '+905364067730' }),
      customer('b', { first_name: 'Areeb', last_name: 'Ahmed Alwan', phone: '+905364067730' }),
      customer('c', { first_name: 'AHMED', last_name: 'SHAMDAN', phone: '05364067730' }),
    ]);
    expect(groups.map((group) => group.map((record) => record.id).sort())).toEqual([['a', 'c'], ['b']]);
  });

  it('does not trust an ID made of leading zeros', () => {
    expect(groupPeople([customer('a', { id_number: '00012345' }), customer('b', { id_number: '00012345' })])).toHaveLength(2);
  });

  it('never links two people on a name alone', () => {
    expect(groupPeople([customer('a', { last_name: 'Same' }), customer('b', { last_name: 'Same' })])).toHaveLength(2);
  });

  it('does not link records that share a placeholder', () => {
    expect(groupPeople([customer('a', { phone: '+111111' }), customer('b', { phone: '+111111' })])).toHaveLength(2);
  });
});

describe('loyaltyStats', () => {
  it('counts a person once however many records they have', () => {
    const directory: CustomerDirectory = {
      customers: [
        customer('a', { phone: '+905364067730', last_name: 'Repeat' }),
        customer('b', { phone: '+905364067730', last_name: 'Repeat' }),
        customer('c', { phone: '+905550000001', last_name: 'Once' }),
        customer('d', { phone: '+905550000002', last_name: 'Never' }),
      ],
      bookings: [
        booking(1, 'a', { start_date: '2026-09-01', end_date: '2026-09-11' }),
        booking(2, 'b', { start_date: '2026-09-15', end_date: '2026-09-17' }),
        booking(3, 'c', { start_date: '2026-09-20', end_date: '2026-09-24' }),
      ],
      ledger: [entry('a', 'OUT', 1000, '2026-09-01', 1), entry('b', 'OUT', 500, '2026-09-01', 2), entry('c', 'OUT', 900, '2026-09-01', 3)],
      reviews: [],
    };
    const stats = loyaltyStats(directory, summarizeCustomers(directory, TODAY));
    expect(stats.people).toBe(2);
    expect(stats.repeatRate).toBe(50);
    expect(stats.averageBookings).toBe(1.5);
    expect(stats.averageDays).toBeCloseTo(16 / 3);
    expect(stats.topSpenders[0]).toMatchObject({ spent: 1500, bookings: 2, records: 2 });
    expect(stats.mostFrequent?.bookings).toBe(2);
    expect(stats.longestRental).toMatchObject({ id: 'a', days: 10 });
  });

  it('survives having no bookings', () => {
    const directory: CustomerDirectory = { customers: [customer('a')], bookings: [], ledger: [], reviews: [] };
    expect(loyaltyStats(directory, summarizeCustomers(directory, TODAY))).toMatchObject({
      people: 0, repeatRate: 0, averageBookings: 0, averageDays: 0, topSpenders: [], mostFrequent: null, longestRental: null,
    });
  });
});

describe('findDataIssues', () => {
  it('groups by phone, ID and name, biggest first, naming each reason', () => {
    const { duplicates, duplicateRecords } = findDataIssues([
      customer('a', { first_name: 'ABDOLGHANI', last_name: 'TOUDZILI', phone: '+905364067730' }),
      customer('b', { first_name: 'Abdolghani', last_name: 'Toudzili', phone: '05364067730' }),
      customer('c', { first_name: 'ABDOLGHANI', last_name: 'TOUDZILLI' }),
      customer('d', { first_name: 'Ibrahim', last_name: 'Albrahim', id_number: 'P1234567' }),
      customer('e', { first_name: 'Someone', last_name: 'Else', id_number: 'p1234567' }),
      customer('f', { first_name: 'Unrelated', last_name: 'Person' }),
    ]);
    expect(duplicates.map((group) => group.records.length)).toEqual([3, 2]);
    expect(duplicates[0].reasons).toEqual(['phone', 'name']);
    expect(duplicates[1].reasons).toEqual(['id']);
    expect(duplicateRecords).toBe(5);
  });

  it('flags records that look like tests, without grouping their placeholders', () => {
    const { testRecords, duplicates } = findDataIssues([
      customer('a', { first_name: '1111', last_name: '2', phone: '+111111' }),
      customer('b', { first_name: 'TEST', last_name: 'FineNotif' }),
      customer('c', { first_name: 'Real', last_name: 'Person', phone: '+111111' }),
      customer('d', { first_name: 'Real', last_name: 'Customer' }),
    ]);
    expect(testRecords.map((record) => [record.id, record.why])).toEqual([
      ['a', 'Name has no letters'],
      ['b', 'Test name'],
      ['c', 'Placeholder phone'],
    ]);
    expect(duplicates).toEqual([]);
  });

  it('keeps Arabic names as letters', () => {
    expect(findDataIssues([customer('a', { first_name: 'عمر', last_name: 'سعيد' })]).testRecords).toEqual([]);
  });
});
