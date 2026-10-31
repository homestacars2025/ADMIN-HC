import { buildSchedule, greetingFor, istanbulToday } from './homeData';

const booking = (id: number, start_date: string, end_date: string) => ({
  id, booking_number: `HC-${id}`, start_date, end_date,
  pickup_location: 'Şişli', dropoff_location: 'Kayaşehir',
  cars: { plate_number: '34 ABC 123' }, customers: { first_name: 'Ayşe', last_name: 'Yılmaz' },
});

describe('Istanbul time', () => {
  it('uses the Istanbul date, not the browser date', () => {
    expect(istanbulToday(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11-01');
  });

  it('greets by the Istanbul hour', () => {
    expect(greetingFor(new Date('2026-10-31T05:00:00Z'))).toBe('Good morning');
    expect(greetingFor(new Date('2026-10-31T12:00:00Z'))).toBe('Good afternoon');
    expect(greetingFor(new Date('2026-10-31T18:00:00Z'))).toBe('Good evening');
  });
});

describe('buildSchedule', () => {
  const today = '2026-10-31';

  it('lists a same-day booking as both a delivery and a pickup', () => {
    expect(buildSchedule(today, [booking(1, today, today)], []).map((s) => s.kind)).toEqual(['delivery', 'pickup']);
  });

  it('marks a stop done, with the time, once its operation exists', () => {
    const [item] = buildSchedule(today, [booking(1, today, '2026-11-05')], [
      { booking_id: 1, type: 'DELIVERY', operation_time: '10:30:00' },
    ]);
    expect(item).toMatchObject({ kind: 'delivery', done: true, time: '10:30', location: 'Şişli' });
  });

  it('leaves the time empty for a stop not done yet', () => {
    const [item] = buildSchedule(today, [booking(1, '2026-10-20', today)], []);
    expect(item).toMatchObject({ kind: 'pickup', done: false, time: null, location: 'Kayaşehir' });
  });
});
