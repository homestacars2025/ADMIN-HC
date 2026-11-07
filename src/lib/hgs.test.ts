import {
  bookingOnDay,
  carsWithoutTransits,
  fetchCarTransits,
  hgsCsv,
  hgsCsvName,
  parseDayRange,
  presetOf,
  presetRange,
  rangeChip,
  rangeSentence,
  windowDays,
  formatDay,
  formatTime,
  istanbulDay,
  formatChange,
  hgsRows,
  hgsSummary,
  inHgsFilter,
  matchesHgsSearch,
  monthChange,
  normalizeBarcode,
  sortHgsRows,
  syncedAgo,
  type HgsCarInfo,
  type HgsTransitDetail,
  type HgsTransitLite,
} from './hgs';
import { supabase } from './supabase';

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

describe('cars without transits', () => {
  it('are the active cars with no HGS data in the month, barcode or not', () => {
    expect(carsWithoutTransits(data, '2026-11').map((c) => c.id)).toEqual([2, 3, 4]);
    expect(carsWithoutTransits(data, '2026-10').map((c) => c.id)).toEqual([1, 3, 4]);
  });

  it('are the ones with none ever for all time', () => {
    expect(carsWithoutTransits(data, 'all').map((c) => c.id)).toEqual([3, 4]);
  });

  it('are the same cars as the idle filter on the rows', () => {
    const idle = hgsRows(data, '2026-11').filter((row) => inHgsFilter(row, 'idle')).map((row) => row.carId).sort();
    expect(idle).toEqual(carsWithoutTransits(data, '2026-11').map((c) => c.id));
  });
});

describe('the tiles', () => {
  it('follow the month', () => {
    const s = hgsSummary(data, '2026-11', '2026-11');
    expect(s).toMatchObject({ spend: 200, transits: 4, carsOnHgs: 4, idle: 3 });
  });

  it('count everything for all time', () => {
    expect(hgsSummary(data, 'all', '2026-11')).toMatchObject({ spend: 500, transits: 5, idle: 2 });
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

  it('list every active car, and any other car that passed a toll', () => {
    expect(rows.map((row) => row.key).sort()).toEqual(['car:1', 'car:2', 'car:3', 'car:4', 'car:5', 'plate:34 ZZ 999']);
  });

  it('add up a car in the period, with its private-road rows and last transit', () => {
    expect(byKey['car:1']).toMatchObject({ transits: 2, privateRoad: 1, amount: 150, last: '2026-11-03T09:00:00+00:00', share: 0.75 });
    expect(byKey['car:2']).toMatchObject({ transits: 0, amount: 0, last: null, share: 0 });
  });

  it('sort biggest first, with the plate breaking a tie', () => {
    expect(sortHgsRows(rows, 'amount').map((row) => row.key)).toEqual(['car:1', 'car:5', 'plate:34 ZZ 999', 'car:2', 'car:3', 'car:4']);
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

describe('a range of days', () => {
  const today = '2026-11-07';

  it('reads from the URL, ends swapped when backwards, nonsense dropped', () => {
    expect(parseDayRange('2026-11-01', '2026-11-06')).toEqual({ from: '2026-11-01', to: '2026-11-06' });
    expect(parseDayRange('2026-11-06', '2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-06' });
    expect(parseDayRange('2026-02-30', '2026-03-01')).toBeNull();
    expect(parseDayRange('2026-11-01', null)).toBeNull();
  });

  it('has presets in Istanbul days, and knows which one it is', () => {
    expect(presetRange('today', today)).toEqual({ from: today, to: today });
    expect(presetRange('last7', today)).toEqual({ from: '2026-11-01', to: today });
    expect(presetRange('this_month', today)).toEqual({ from: '2026-11-01', to: today });
    expect(presetRange('last_month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetOf({ from: '2026-10-01', to: '2026-10-31' }, today)).toBe('last_month');
    expect(presetOf({ from: '2026-10-02', to: '2026-10-31' }, today)).toBeNull();
  });

  it('reads as a chip, with years only when it leaves this year', () => {
    expect(rangeChip({ from: '2026-11-01', to: '2026-11-06' }, today)).toBe('01.11 → 06.11');
    expect(rangeChip({ from: '2025-11-01', to: '2026-01-06' }, today)).toBe('01.11.25 → 06.01.26');
    expect(rangeChip({ from: '2026-11-06', to: '2026-11-06' }, today)).toBe('06.11');
    expect(rangeSentence({ from: '2026-11-01', to: '2026-11-06' }, today)).toBe('from 01.11 to 06.11');
    expect(rangeSentence({ from: '2026-11-06', to: '2026-11-06' }, today)).toBe('on 06.11');
  });

  it('covers a month from its first to its last day', () => {
    expect(windowDays('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(windowDays('all')).toBeNull();
  });

  it('counts the page, both ends in', () => {
    const range = { from: '2026-11-02', to: '2026-11-03' };
    expect(hgsSummary(data, range, '2026-11')).toMatchObject({ spend: 150, transits: 2 });
    expect(carsWithoutTransits(data, range).map((c) => c.id)).toEqual([2, 3, 4]);
  });

  it("gives one car its own numbers, its share of the fleet's spend in that range", () => {
    const rows = hgsRows(data, '2026-11', { car: '1', range: { from: '2026-11-03', to: '2026-11-03' } });
    expect(rows.find((row) => row.carId === 1)).toMatchObject({ transits: 1, privateRoad: 1, amount: 50, share: 1 });
    // Everyone else keeps the month.
    expect(rows.find((row) => row.carId === null)).toMatchObject({ amount: 25 });
    const empty = hgsRows(data, '2026-11', { car: '1', range: { from: '2026-12-01', to: '2026-12-02' } });
    expect(empty.find((row) => row.carId === 1)).toMatchObject({ transits: 0, amount: 0, last: null, share: 0 });
    // A car found by its plate only is named by it, spaces dropped.
    const plate = hgsRows(data, '2026-10', { car: '34ZZ999', range: { from: '2026-11-04', to: '2026-11-04' } });
    expect(plate.find((row) => row.carId === null)).toMatchObject({ transits: 1, amount: 25 });
  });

  it("asks for one car's transits between Istanbul midnights", async () => {
    const calls: [string, unknown[]][] = [];
    const builder: Record<string, unknown> = {};
    ['select', 'order', 'eq', 'neq', 'not', 'is', 'gte', 'lt', 'lte', 'range'].forEach((name) => {
      builder[name] = (...args: unknown[]) => { calls.push([name, args]); return builder; };
    });
    builder.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
    (supabase as unknown as { from: () => unknown }).from = () => builder;
    await fetchCarTransits({ carId: 39, plate: '06FHN975' }, { from: '2026-11-01', to: '2026-11-06' });
    expect(calls).toEqual(expect.arrayContaining([
      ['gte', ['transit_datetime', '2026-11-01T00:00:00+03:00']],
      ['lt', ['transit_datetime', '2026-11-07T00:00:00+03:00']],
      ['lte', ['start_date', '2026-11-06']],
      ['gte', ['end_date', '2026-11-01']],
    ]));
  });
});

describe('the export', () => {
  const row = (over: Partial<HgsTransitDetail>): HgsTransitDetail => ({
    id: 1, day: '2026-11-03', at: '2026-11-03T11:04:00+00:00', entry: 'ORHANLI', exit: 'KURTKÖY SGS', road: 'İSTANBUL-ANKARA OTOYOLU', roadType: 'public', amount: 148.5,
    bookingId: null, bookingNumber: null, bookingMonth: null, customerId: null, customerName: null, ...over,
  });

  it('writes Date, Time, Entry, Exit, Toll road, Amount oldest first, in Istanbul time, quoting what needs it', () => {
    const csv = hgsCsv([row({}), row({ id: 2, day: '2026-11-02', at: '2026-11-01T22:30:00+00:00', entry: null, exit: 'FENERTEPE', road: 'KCO, GECIS', amount: 96 })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Date,Time,Entry,Exit,Toll road,Amount (TRY)',
      '2026-11-02,01:30,,FENERTEPE,"KCO, GECIS",96.00',
      '2026-11-03,14:04,ORHANLI,KURTKÖY SGS,İSTANBUL-ANKARA OTOYOLU,148.50',
      '',
    ]);
  });

  it('is named after the plate and the days it covers', () => {
    expect(hgsCsvName('06 FHN 975', { from: '2026-11-01', to: '2026-11-06' })).toBe('hgs-06FHN975-2026-11-01_2026-11-06.csv');
    expect(hgsCsvName('06FHN975', '2026-02')).toBe('hgs-06FHN975-2026-02-01_2026-02-28.csv');
    expect(hgsCsvName('06FHN975', 'all')).toBe('hgs-06FHN975-all.csv');
  });
});
