import {
  addDays,
  buildFleet,
  dayEnd,
  dayLabel,
  daySeries,
  dayStats,
  hiddenNote,
  historyCsv,
  isIgnitionOn,
  isMoving,
  kmRemaining,
  liveStats,
  niceMax,
  noSignal,
  oilBarPercent,
  oilState,
  parseNextOil,
  pastRows,
  signalAgo,
  signalTone,
  trackingOutage,
  validDay,
  visibleDayRows,
  visibleLiveCars,
  type CarInfo,
  type DailyKmRow,
  type DayRow,
  type TrackedCar,
  type TrackingRow,
} from './carTracking';

jest.mock('./supabase', () => ({ supabase: {} }));

const NOW = Date.parse('2026-11-01T13:00:00Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const tracker = (over: Partial<TrackingRow>): TrackingRow => ({
  id: 1, car_id: 1, plate_number: '34ABC101', current_km: 1000, km_at_midnight: 900, daily_km: 100,
  next_oil_change: 5000, ignition: 'OFF', speed: 0, last_signal_at: ago(5), ...over,
});
const car = (id: number, is_active = true): CarInfo => ({ id, plate_number: `34ABC${id}`, is_active, model_group: { name: 'Fiat Egea' } });
const tracked = (over: Partial<TrackedCar>): TrackedCar => ({
  id: 1, car_id: 1, plate: '34ABC101', model: 'Fiat', current_km: 1000, start_km: 900, today_km: 100,
  next_oil_change: 5000, ignition: false, speed: 0, last_signal_at: ago(5), ...over,
});
const dayRow = (over: Partial<DayRow>): DayRow => ({
  key: 'a', car_id: 1, plate: '34ABC101', model: 'Fiat', start_km: 900, end_km: 1000, km: 100, last_signal_at: ago(5), ...over,
});

describe('buildFleet', () => {
  it('keeps unlinked real plates and leaves out device serials, removed units and inactive cars', () => {
    const fleet = buildFleet([
      tracker({ id: 1, car_id: 1 }),
      tracker({ id: 2, car_id: null, plate_number: '860141076055400' }),
      tracker({ id: 3, car_id: null, plate_number: 'SÖK-34FDL046' }),
      tracker({ id: 4, car_id: null, plate_number: '06EHP376' }),
      tracker({ id: 5, car_id: 2 }),
    ], [car(1), car(2, false), car(3)]);
    expect(fleet.cars.map((row) => row.id)).toEqual([1, 4]);
    expect(fleet.cars[1].car_id).toBeNull();
    expect(fleet.hiddenDevices).toBe(2);
    expect(fleet.hiddenInactive).toBe(1);
    expect(fleet.noTracker).toBe(1);
  });

  it('does not merge unlinked cars into one row', () => {
    const fleet = buildFleet([
      tracker({ id: 1, car_id: null, plate_number: '34MGM921' }),
      tracker({ id: 2, car_id: null, plate_number: '06EHP376' }),
    ], []);
    expect(fleet.cars).toHaveLength(2);
  });

  it('keeps only the newest tracker of a car', () => {
    expect(buildFleet([tracker({ id: 1 }), tracker({ id: 2 })], [car(1)]).cars.map((row) => row.id)).toEqual([1]);
  });

  it('reads model_group as an object or an array, and never shows negative km', () => {
    const fleet = buildFleet([tracker({ daily_km: -5 })], [{ ...car(1), model_group: [{ name: 'Clio' }] }]);
    expect(fleet.cars[0].model).toBe('Clio');
    expect(fleet.cars[0].today_km).toBe(0);
  });
});

describe('hiddenNote', () => {
  const base = buildFleet([], []);

  it('says what was left out, in the right number', () => {
    expect(hiddenNote({ ...base, hiddenDevices: 10, hiddenInactive: 1, noTracker: 1 }))
      .toBe('Not shown: 10 tracker devices with no car, 1 inactive car. 1 active car has no tracker.');
    expect(hiddenNote({ ...base, noTracker: 6 })).toBe('6 active cars have no tracker.');
    expect(hiddenNote(base)).toBeNull();
  });
});

describe('dates', () => {
  it('steps across a month', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('ends a day at Istanbul midnight', () => {
    expect(new Date(dayEnd('2026-11-01')).toISOString()).toBe('2026-11-01T21:00:00.000Z');
  });

  it('labels today and other days', () => {
    expect(dayLabel('2026-11-01', '2026-11-01')).toBe('Today, 1 Nov 2026');
    expect(dayLabel('2026-10-31', '2026-11-01')).toBe('Sat, 31 Oct 2026');
  });

  it('turns a bad, future or too old day in the URL into a safe one', () => {
    expect(validDay(null, '2026-11-05')).toBe('2026-11-05');
    expect(validDay('nonsense', '2026-11-05')).toBe('2026-11-05');
    expect(validDay('2026-12-01', '2026-11-05')).toBe('2026-11-05');
    expect(validDay('2020-01-01', '2026-11-05')).toBe('2026-10-31');
    expect(validDay('2026-11-02', '2026-11-05')).toBe('2026-11-02');
  });
});

describe('signal', () => {
  it('turns amber after 6 hours and red after 24', () => {
    expect(signalTone(ago(359), NOW)).toBe('ok');
    expect(signalTone(ago(361), NOW)).toBe('amber');
    expect(signalTone(ago(24 * 60 + 1), NOW)).toBe('red');
    expect(signalTone(null, NOW)).toBe('red');
  });

  it('counts no signal only past 24 hours', () => {
    expect(noSignal(ago(24 * 60 - 1), NOW)).toBe(false);
    expect(noSignal(ago(24 * 60 + 1), NOW)).toBe(true);
    expect(noSignal(null, NOW)).toBe(true);
  });

  it('writes the age in the largest unit', () => {
    expect(signalAgo(ago(0), NOW)).toBe('Just now');
    expect(signalAgo(ago(12), NOW)).toBe('12 min ago');
    expect(signalAgo(ago(125), NOW)).toBe('2 h ago');
    expect(signalAgo(ago(26 * 60), NOW)).toBe('1 day ago');
    expect(signalAgo(ago(72 * 60), NOW)).toBe('3 days ago');
    expect(signalAgo(null, NOW)).toBe('No signal');
  });
});

describe('daily report', () => {
  const rows = [
    dayRow({ key: 'a', plate: '34AAA1', km: 600 }),
    dayRow({ key: 'b', plate: '34BBB2', km: 0, last_signal_at: ago(3000) }),
    dayRow({ key: 'c', plate: '34CCC3', km: 100, model: 'Audi A3' }),
  ];

  it('adds up the tiles', () => {
    expect(dayStats(rows, NOW)).toEqual({ cars: 3, total: 700, moved: 2, idle: 1, noSignal: 1, over: 1 });
  });

  it('filters and sorts by km', () => {
    expect(visibleDayRows(rows, 'all', NOW, '').map((row) => row.key)).toEqual(['a', 'c', 'b']);
    expect(visibleDayRows(rows, 'idle', NOW, '').map((row) => row.key)).toEqual(['b']);
    expect(visibleDayRows(rows, 'over_500', NOW, '').map((row) => row.key)).toEqual(['a']);
    expect(visibleDayRows(rows, 'no_signal', NOW, '').map((row) => row.key)).toEqual(['b']);
    expect(visibleDayRows(rows, 'all', NOW, 'audi').map((row) => row.key)).toEqual(['c']);
  });

  it('treats exactly 500 km as not over', () => {
    expect(dayStats([dayRow({ km: 500 })], NOW).over).toBe(0);
  });

  const saved = (over: Partial<DailyKmRow>): DailyKmRow => ({
    car_id: 1, day: '2026-11-01', plate_number: '34ABC1', start_km: 10, end_km: 30, km: 20, last_signal_at: ago(5), ...over,
  });

  it('keeps a past day to active cars, plus cars that left but drove that day', () => {
    const fleet = buildFleet([], [car(1), car(2, false), car(3, false)]);
    const result = pastRows([
      saved({ car_id: 1, km: 0 }),
      saved({ car_id: 2, km: 40 }),
      saved({ car_id: 3, km: 0 }),
      saved({ car_id: 1, day: '2026-10-31' }),
    ], '2026-11-01', fleet);
    expect(result.map((row) => row.car_id)).toEqual([1, 2]);
    expect(result[0].model).toBe('Fiat Egea');
  });

  it('keeps a missing day apart from a day at 0 km', () => {
    const series = daySeries([saved({ day: '2026-11-01', km: 0 })], 1, '2026-10-31', '2026-11-02');
    expect(series.map((day) => day.km)).toEqual([null, 0, null]);
  });

  it('puts the live row on the last day', () => {
    const series = daySeries([], 1, '2026-10-31', '2026-11-01', dayRow({ km: 18, start_km: 5, end_km: 23 }));
    expect(series[1]).toEqual({ day: '2026-11-01', start_km: 5, end_km: 23, km: 18 });
  });

  it('writes a CSV Excel can open, without the missing days', () => {
    const csv = historyCsv(daySeries([saved({})], 1, '2026-10-31', '2026-11-01'));
    expect(csv).toBe('﻿day,start_km,end_km,km\r\n2026-11-01,10,30,20');
  });

  it('rounds a chart scale up', () => {
    expect(niceMax(306)).toBe(500);
    expect(niceMax(612)).toBe(1000);
    expect(niceMax(0)).toBe(100);
  });
});

describe('oil', () => {
  it('works from what is left', () => {
    expect(kmRemaining({ current_km: 1000, next_oil_change: 1500 })).toBe(500);
    expect(kmRemaining({ current_km: 0, next_oil_change: 1500 })).toBe(1500);
    expect(kmRemaining({ current_km: 1000, next_oil_change: null })).toBeNull();
  });

  it('is green above 1000, amber to 1, red from 0', () => {
    expect(oilState(1001)).toBe('ok');
    expect(oilState(1000)).toBe('due');
    expect(oilState(1)).toBe('due');
    expect(oilState(0)).toBe('over');
    expect(oilState(-18)).toBe('over');
    expect(oilState(null)).toBe('unknown');
  });

  it('fills the bar by the service interval, and fully when overdue', () => {
    expect(oilBarPercent(5000)).toBe(50);
    expect(oilBarPercent(12000)).toBe(100);
    expect(oilBarPercent(-18)).toBe(100);
    expect(oilBarPercent(null)).toBe(0);
  });

  it('accepts whole km or nothing', () => {
    expect(parseNextOil('25000')).toEqual({ value: 25000 });
    expect(parseNextOil('  ')).toEqual({ value: null });
    expect(parseNextOil('12.5')).toBeNull();
    expect(parseNextOil('-1')).toBeNull();
    expect(parseNextOil('abc')).toBeNull();
  });
});

describe('live fleet', () => {
  it('does not call a car moving on a stale reading', () => {
    expect(isMoving(tracked({ speed: 40, last_signal_at: ago(5) }), NOW)).toBe(true);
    expect(isMoving(tracked({ speed: 7, last_signal_at: ago(480) }), NOW)).toBe(false);
    expect(isMoving(tracked({ speed: 0 }), NOW)).toBe(false);
    expect(isIgnitionOn(tracked({ ignition: true, last_signal_at: ago(480) }), NOW)).toBe(false);
  });

  it('keeps each car in one oil tile', () => {
    const cars = [tracked({ next_oil_change: 1500 }), tracked({ next_oil_change: 900 }), tracked({ next_oil_change: null })];
    expect(liveStats(cars, NOW)).toMatchObject({ cars: 3, oilDue: 1, oilOver: 1 });
    expect(visibleLiveCars(cars, 'oil_over', NOW, '')).toEqual([cars[1]]);
  });

  it('searches plate and model', () => {
    const cars = [tracked({ plate: '34 ABC 101' }), tracked({ plate: '06EHP376', model: null })];
    expect(visibleLiveCars(cars, 'all', NOW, '34abc')).toEqual([cars[0]]);
  });

  it('calls an outage only past half the fleet', () => {
    const silent = tracked({ last_signal_at: ago(2000) });
    const fresh = tracked({ last_signal_at: ago(10) });
    expect(trackingOutage([silent, fresh], NOW)).toBeNull();
    expect(trackingOutage([silent, silent, fresh], NOW)).toEqual({ lastSignal: ago(10) });
    expect(trackingOutage([], NOW)).toBeNull();
  });
});
