import {
  barDays,
  barSpan,
  daysInMonth,
  highSeverityBars,
  historySummary,
  inHistoryFilter,
  matchesCalendarSearch,
  parseHistory,
  parseStamp,
  placeBars,
  shiftCalendarMonth,
  sortCars,
  statusCounts,
  fleetUtilization,
  utilizationTone,
  type CalendarBar,
  type CalendarCar,
  type CalendarConflict,
} from './fleetCalendar';
import { bookingStatusKey, carStatusToken, FLEET_STATUS } from './fleetStatus';

jest.mock('./supabase', () => ({ supabase: {} }));

const bar = (key: string, start: string, end: string, over: Partial<CalendarBar> = {}): CalendarBar => ({
  key, carId: 1, status: 'booked', start, end,
  booking: { id: Number(key.replace(/\D/g, '')) || 1, number: `HOM-${key}`, customer: 'Ali Veli', customerId: 'c1', status: 'confirmed' },
  block: null, ...over,
});

describe('months', () => {
  it('know their length and move across years', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(shiftCalendarMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftCalendarMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('a bar', () => {
  it('runs from the middle of its first day to the middle of its last', () => {
    expect(barSpan({ start: '2026-11-03', end: '2026-11-07' }, '2026-11')).toEqual({ from: 2.5, to: 6.5, cutStart: false, cutEnd: false });
    expect(barDays({ start: '2026-11-03', end: '2026-11-07' })).toBe(4);
  });

  it('fills its day when it starts and ends the same day', () => {
    const span = barSpan({ start: '2026-11-03', end: '2026-11-03' }, '2026-11')!;
    expect(span.from).toBeCloseTo(2.08);
    expect(span.to).toBeCloseTo(2.92);
    expect(barDays({ start: '2026-11-03', end: '2026-11-03' })).toBe(1);
  });

  it('is cut flat where it carries on past the month, and absent when outside it', () => {
    expect(barSpan({ start: '2026-10-20', end: '2026-12-05' }, '2026-11')).toEqual({ from: 0, to: 30, cutStart: true, cutEnd: true });
    expect(barSpan({ start: '2026-10-01', end: '2026-10-31' }, '2026-11')).toBeNull();
    expect(barSpan({ start: '2026-12-01', end: '2026-12-03' }, '2026-11')).toBeNull();
  });
});

describe('lanes', () => {
  it('keep a return and the next pickup on the same day on one line', () => {
    const { placed, lanes } = placeBars([bar('b1', '2026-11-01', '2026-11-10'), bar('b2', '2026-11-10', '2026-11-15')], '2026-11');
    expect(lanes).toBe(1);
    expect(placed.map((item) => item.lane)).toEqual([0, 0]);
  });

  it('put a double booking on a second line, so both show', () => {
    const { placed, lanes } = placeBars([bar('b1', '2026-11-01', '2026-11-10'), bar('b2', '2026-11-05', '2026-11-12'), bar('b3', '2026-11-20', '2026-11-22')], '2026-11');
    expect(lanes).toBe(2);
    expect(Object.fromEntries(placed.map((item) => [item.bar.key, item.lane]))).toEqual({ b1: 0, b2: 1, b3: 0 });
  });
});

describe('issues', () => {
  const conflict = (over: Partial<CalendarConflict>): CalendarConflict => ({
    kind: 'double_booking', severity: 'high', carId: 1, plate: '34ABC1', bookingId: 1, bookingNumber: 'HOM-b1', otherRef: 'HOM-b2', from: '2026-11-05', to: '2026-11-10', message: '', ...over,
  });

  it('outline both sides of a double booking and a booking over a block, never a medium one', () => {
    const bars = [bar('b1', '2026-11-01', '2026-11-10'), bar('b2', '2026-11-05', '2026-11-12'), bar('b3', '2026-11-20', '2026-11-22')];
    const keys = highSeverityBars([
      conflict({}),
      conflict({ kind: 'blocked_period', bookingId: 3, otherRef: 'maintenance' }),
      conflict({ kind: 'missing_pickup', severity: 'medium', bookingId: 9 }),
    ], bars);
    expect(Array.from(keys).sort()).toEqual(['b2', 'booking-1', 'booking-3']);
  });
});

describe('the rows', () => {
  const cars: CalendarCar[] = [
    { id: 1, plate: '34 ABC 101', model: 'Fiat Egea', status: 'working' },
    { id: 2, plate: '34 KDT 102', model: 'Renault Clio', status: 'parking' },
    { id: 3, plate: '06 XYZ 103', model: 'Fiat Egea', status: 'maintenance' },
  ];

  it('count cars per status for the tiles', () => {
    expect(statusCounts(cars)).toEqual({ working: 1, pending: 0, parking: 1, maintenance: 1, selling: 0, replacement: 0 });
  });

  it('find a car by plate without spaces, model, customer or booking number', () => {
    const bars = [bar('b1', '2026-11-01', '2026-11-10')];
    expect(matchesCalendarSearch(cars[1], [], '34kdt')).toBe(true);
    expect(matchesCalendarSearch(cars[0], [], 'egea')).toBe(true);
    expect(matchesCalendarSearch(cars[0], bars, 'ali veli')).toBe(true);
    expect(matchesCalendarSearch(cars[0], bars, 'HOM-b1')).toBe(true);
    expect(matchesCalendarSearch(cars[1], [], 'ali')).toBe(false);
  });
});

describe('colours', () => {
  it('come from one palette, matching the Bookings tiles', () => {
    expect(bookingStatusKey('confirmed')).toBe('booked');
    expect(bookingStatusKey('pending')).toBe('pending');
    expect(bookingStatusKey('completed')).toBe('completed');
    expect(FLEET_STATUS.booked.tile).toBe('green');
    expect(FLEET_STATUS.pending.tile).toBe('amber');
    expect(FLEET_STATUS.completed.tile).toBe('slate');
    expect(carStatusToken('working')).toMatchObject({ key: 'booked', label: 'Working', chip: '#22C55E' });
    expect(carStatusToken('something new')).toMatchObject({ key: 'parking' });
  });
});

describe('car history', () => {
  const raw = [
    { kind: 'booking', at: '2026-10-20', end: '2026-11-20', title: 'HOM-10-26-017', status: 'confirmed', customer: 'Ali Veli', ref_id: 743 },
    { kind: 'operation', at: '2026-11-05 12:37:26.168693+00', title: 'MAINTENANCE', km: 39088, fuel: 170, by: 'Abdul', ref_id: 850 },
    { kind: 'operation', at: '2026-10-20 13:19:05+00', title: 'DELIVERY', km: 38162, ref_id: 798 },
    { kind: 'booking', at: '2025-12-20', end: '2026-01-05', title: 'HOM-12-25-001', status: 'completed', ref_id: 1 },
    { kind: 'booking', at: '2026-03-01', end: '2026-03-04', title: 'HOM-03-26-001', status: 'cancelled', ref_id: 2 },
    { kind: 'fine', at: '2026-09-01', amount: '1500', status: 'unpaid', ref_id: 5 },
    { kind: 'issue', at: '2026-11-05', title: 'accident', status: 'open', ref_id: 41 },
    { kind: 'maintenance', at: '2026-08-01', end: '2026-08-03', ref_id: 9 },
  ];

  it('comes newest first, whatever order it arrives in', () => {
    expect(parseHistory(raw).map((item) => item.refId)).toEqual([850, 41, 798, 743, 5, 9, 2, 1]);
    expect(parseHistory(null)).toEqual([]);
    expect(parseStamp('2026-11-05 12:37:26.1+00')).toBe('2026-11-05T12:37:26.1+00:00');
  });

  it('filters into bookings, operations, issues and fines', () => {
    const items = parseHistory(raw);
    expect(items.filter((item) => inHistoryFilter(item, 'bookings')).map((item) => item.refId)).toEqual([743, 2, 1]);
    expect(items.filter((item) => inHistoryFilter(item, 'operations')).map((item) => item.refId)).toEqual([850, 798, 9]);
    expect(items.filter((item) => inHistoryFilter(item, 'fines'))[0].amount).toBe(1500);
  });

  it('sums bookings, days rented this year and the latest km', () => {
    // 4 days of January (1st to 5th) and 31 of the October booking, the cancelled one left out.
    expect(historySummary(parseHistory(raw), 2026)).toEqual({ bookings: 2, daysThisYear: 4 + 31, km: 39088 });
  });
});

describe('utilization', () => {
  const cars: CalendarCar[] = [
    { id: 1, plate: '34 ABC 101', model: 'Fiat Egea', status: 'working' },
    { id: 2, plate: '34 ABC 100', model: 'Fiat Egea', status: 'working' },
    { id: 3, plate: '06 XYZ 103', model: 'Renault Clio', status: 'parking' },
    { id: 4, plate: '01 NEW 104', model: 'Renault Clio', status: 'parking' },
  ];
  const util = new Map([[1, { days: 30, rented: 15, rate: 50 }], [2, { days: 30, rented: 15, rate: 50 }], [3, { days: 30, rented: 29, rate: 97 }]]);

  it('is green from 80%, amber from 50%, red below', () => {
    expect([100, 80, 79, 50, 49, 0].map(utilizationTone)).toEqual(['green', 'green', 'amber', 'amber', 'red', 'red']);
  });

  it('pools the fleet: rented days over all days, not an average of rounded rates', () => {
    expect(fleetUtilization(util)).toBe(Math.round((100 * 59) / 90));
    expect(fleetUtilization(new Map())).toBeNull();
  });

  it('sorts high to low or low to high, ties in model order, a car with no figure last', () => {
    expect(sortCars(cars, util, 'util_desc').map((car) => car.id)).toEqual([3, 1, 2, 4]);
    expect(sortCars(cars, util, 'util_asc').map((car) => car.id)).toEqual([1, 2, 3, 4]);
    expect(sortCars(cars, util, 'model')).toBe(cars);
  });
});
