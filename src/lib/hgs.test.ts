import {
  bookingOnDay,
  carsWithoutHgs,
  formatDay,
  formatTime,
  istanbulDay,
  formatChange,
  hgsRows,
  hgsSummary,
  matchesHgsSearch,
  monthChange,
  normalizeBarcode,
  sortHgsRows,
  syncedAgo,
  type HgsCarInfo,
  type HgsTransitLite,
} from './hgs';

jest.mock('./supabase', () => ({ supabase: {} }));

const car = (id: number, over: Partial<HgsCarInfo> = {}): HgsCarInfo => ({
  id, plate: `34 AB ${100 + id}`, model: 'Fiat Egea', image: null, barcode: `11315249${String(id).padStart(2, '0')}`, active: true, ...over,
});
let nextId = 1;
const transit = (carId: number | null, day: string, amount: number, over: Partial<HgsTransitLite> = {}): HgsTransitLite => ({
  id: nextId++, carId, plate: carId === null ? '34 ZZ 999' : null, day, at: `${day}T09:00:00+00:00`, amount, road: 'public', ...over,
});

const cars = [
  car(1),
  car(2),
  car(3, { barcode: null }),
  car(4, { barcode: '   ' }),
  car(5, { active: false }),
];
const transits = [
  transit(1, '2026-11-02', 100),
  transit(1, '2026-11-03', 50, { road: 'private' }),
  transit(2, '2026-10-20', 300),
  transit(5, '2026-11-01', 25),
  transit(null, '2026-11-04', 25),
];
const data = { cars, transits };

describe('cars without HGS', () => {
  it('counts an active car with no barcode, a blank one included', () => {
    expect(carsWithoutHgs(cars).map((c) => c.id)).toEqual([3, 4]);
  });
});

describe('the tiles', () => {
  it('follow the month', () => {
    const s = hgsSummary(data, '2026-11', '2026-11');
    expect(s).toMatchObject({ spend: 200, transits: 4, carsOnHgs: 2, idle: 1 });
  });

  it('count everything for all time', () => {
    expect(hgsSummary(data, 'all', '2026-11')).toMatchObject({ spend: 500, transits: 5, idle: 0 });
  });

  it('keep This month on the calendar month, against the one before', () => {
    const s = hgsSummary(data, '2026-10', '2026-11');
    expect(s.spend).toBe(300);
    expect(s.thisMonth).toEqual({ month: '2026-11', previous: '2026-10', spend: 200, previousSpend: 300, change: (200 - 300) / 300 * 100 });
  });

  it('has no change against an empty month', () => {
    expect(monthChange(200, 0)).toBeNull();
    expect(formatChange(null, 'October')).toBe('nothing in October');
    expect(formatChange(-66.4, 'October')).toBe('−66% vs October');
    expect(formatChange(12.6, 'October')).toBe('+13% vs October');
    expect(formatChange(0.2, 'October')).toBe('same as October');
  });
});

describe('the rows', () => {
  const rows = hgsRows(data, '2026-11');
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));

  it('list every car on HGS, and any other car that passed a toll', () => {
    expect(rows.map((row) => row.key).sort()).toEqual(['car:1', 'car:2', 'car:5', 'plate:34 ZZ 999']);
  });

  it('add up a car in the period, with its private-road rows and last transit', () => {
    expect(byKey['car:1']).toMatchObject({ transits: 2, privateRoad: 1, amount: 150, last: '2026-11-03T09:00:00+00:00', share: 0.75 });
    expect(byKey['car:2']).toMatchObject({ transits: 0, amount: 0, last: null, share: 0 });
  });

  it('sort biggest first, with the plate breaking a tie', () => {
    expect(sortHgsRows(rows, 'amount').map((row) => row.key)).toEqual(['car:1', 'car:5', 'plate:34 ZZ 999', 'car:2']);
    expect(sortHgsRows(rows, 'last')[0].key).toBe('plate:34 ZZ 999');
    expect(sortHgsRows(rows, 'transits')[0].key).toBe('car:1');
  });

  it('search plate without spaces, barcode and model', () => {
    const row = byKey['car:1'];
    expect(matchesHgsSearch(row, '34ab101')).toBe(true);
    expect(matchesHgsSearch(row, '1131524901')).toBe(true);
    expect(matchesHgsSearch(row, 'egea')).toBe(true);
    expect(matchesHgsSearch(row, 'clio')).toBe(false);
  });
});

describe('Istanbul time', () => {
  it('puts a late-evening UTC transit on the next Istanbul day and month', () => {
    expect(istanbulDay('2026-10-31T21:30:00+00:00')).toBe('2026-11-01');
    expect(istanbulDay('2026-10-31T20:59:00+00:00')).toBe('2026-10-31');
    expect(istanbulDay(null)).toBe('');
    expect(hgsRows({ cars: [], transits: [transit(9, istanbulDay('2026-10-31T21:30:00+00:00'), 40)] }, '2026-11')).toHaveLength(1);
  });

  it('shows the date and time in Istanbul', () => {
    expect(formatDay('2026-11-04T21:04:37+00:00')).toBe('5 Nov 2026');
    expect(formatTime('2026-11-04T11:04:37+00:00')).toBe('14:04');
    expect(formatDay(null)).toBe('—');
    expect(formatTime(null)).toBe('');
  });
});

describe('the booking on the car', () => {
  const bookings = [
    { id: 1, start: '2026-10-01', end: '2026-10-10' },
    { id: 2, start: '2026-10-10', end: '2026-10-20' },
  ];
  it('is the one whose dates hold the day, the newer one on a handover day', () => {
    expect(bookingOnDay(bookings, '2026-10-05')?.id).toBe(1);
    expect(bookingOnDay(bookings, '2026-10-10')?.id).toBe(2);
    expect(bookingOnDay(bookings, '2026-10-25')).toBeNull();
    expect(bookingOnDay(bookings, '')).toBeNull();
  });
});

describe('the barcode', () => {
  it('takes ten digits, spaces dropped', () => {
    expect(normalizeBarcode('1131 5249 91')).toBe('1131524991');
    expect(normalizeBarcode('113152499')).toBeNull();
    expect(normalizeBarcode('11315249AB')).toBeNull();
  });
});

describe('last sync', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  it('reads in minutes, hours and days', () => {
    expect(syncedAgo('2026-11-04T11:59:40Z', now)).toBe('just now');
    expect(syncedAgo('2026-11-04T11:48:00Z', now)).toBe('12 min ago');
    expect(syncedAgo('2026-11-04T09:00:00Z', now)).toBe('3 h ago');
    expect(syncedAgo('2026-11-02T09:00:00Z', now)).toBe('2 days ago');
    expect(syncedAgo(null, now)).toBe('never');
  });
});
