import {
  EMPTY_FORM,
  additionalServicesValue,
  busyCarIds,
  carAvailability,
  describeBlock,
  hardConflictMessage,
  type CalendarBlockDetail,
  carMatches,
  changedFields,
  editFormData,
  extrasLabel,
  formatDays,
  formatShortRange,
  friendlyBookingError,
  groupCars,
  insuranceValue,
  parseAdditionalServices,
  parseAdditionalServicesCustom,
  parseServiceCounts,
  rangeDays,
  resolveInsuranceSelect,
  resolveLocationSelect,
  serviceQuantity,
  toTry,
  usdLedgerNote,
  withServiceQuantity,
  type BookingFormData,
  type CarChoice,
} from './bookingForm';
import type { Booking } from '../types';

const form = (over: Partial<BookingFormData> = {}): BookingFormData => ({ ...EMPTY_FORM, ...over });

describe('saved values', () => {
  it('splits a location into a preset or free text', () => {
    expect(resolveLocationSelect('Şişli Branch')).toEqual({ select: 'Şişli Branch', custom: '' });
    expect(resolveLocationSelect('laleli')).toEqual({ select: 'Other', custom: 'laleli' });
    expect(resolveLocationSelect(null)).toEqual({ select: '', custom: '' });
  });

  it('keeps legacy insurance as free text rather than losing it', () => {
    expect(resolveInsuranceSelect('Tam Koruma')).toEqual({ select: 'Tam Koruma', custom: '' });
    expect(resolveInsuranceSelect('TRAFFIC')).toEqual({ select: 'Diğer', custom: 'TRAFFIC' });
  });

  it('round-trips extras, presets and free text alike', () => {
    const saved = 'Çocuk Koltuğu, AIRPORT DELIVERY';
    const selected = parseAdditionalServices(saved);
    const custom = parseAdditionalServicesCustom(saved);
    expect(selected).toEqual(['Çocuk Koltuğu', 'Diğer']);
    expect(custom).toBe('AIRPORT DELIVERY');
    expect(additionalServicesValue(form({ additional_services_selected: selected, additional_services_custom: custom }))).toBe(saved);
  });

  it('saves one of an extra as the plain name, and more as a count', () => {
    const one = withServiceQuantity(form(), 'Yedek Sürücü', 1);
    expect(additionalServicesValue(one)).toBe('Yedek Sürücü');
    const three = withServiceQuantity(one, 'Yedek Sürücü', 3);
    expect(additionalServicesValue(three)).toBe('Yedek Sürücü x3');
    expect(extrasLabel(three)).toBe('Additional driver × 3');
    expect(serviceQuantity(three, 'Yedek Sürücü')).toBe(3);
  });

  it('removes an extra at 0, and keeps the others in order', () => {
    const start = form({ additional_services_selected: ['Çocuk Koltuğu', 'Ek Kilometre'], additional_services_counts: { 'Çocuk Koltuğu': 2 } });
    const bumped = withServiceQuantity(start, 'Çocuk Koltuğu', 3);
    expect(additionalServicesValue(bumped)).toBe('Çocuk Koltuğu x3, Ek Kilometre');
    const gone = withServiceQuantity(bumped, 'Çocuk Koltuğu', 0);
    expect(additionalServicesValue(gone)).toBe('Ek Kilometre');
    expect(gone.additional_services_counts).toEqual({});
  });

  it('reads counted extras back the way they were stored', () => {
    const saved = 'Çocuk Koltuğu x2, Yedek Sürücü, AIRPORT DELIVERY';
    const back = form({
      additional_services_selected: parseAdditionalServices(saved),
      additional_services_counts: parseServiceCounts(saved),
      additional_services_custom: parseAdditionalServicesCustom(saved),
    });
    expect(back.additional_services_selected).toEqual(['Çocuk Koltuğu', 'Yedek Sürücü', 'Diğer']);
    expect(back.additional_services_counts).toEqual({ 'Çocuk Koltuğu': 2 });
    expect(additionalServicesValue(back)).toBe(saved);
  });

  it('keeps anything it cannot count as free text, untouched', () => {
    ['Ek Kilometre x2', 'Çocuk Koltuğu x0', 'Çocuk Koltuğu x1', 'Çocuk Koltuğu x10', 'Taxi x2', '{broken'].forEach((saved) => {
      expect(parseServiceCounts(saved)).toEqual({});
      expect(parseAdditionalServices(saved)).toEqual(['Diğer']);
      expect(parseAdditionalServicesCustom(saved)).toBe(saved);
      expect(additionalServicesValue(form({
        additional_services_selected: parseAdditionalServices(saved),
        additional_services_custom: parseAdditionalServicesCustom(saved),
      }))).toBe(saved);
    });
  });

  const fromStored = (saved: string) => form({
    additional_services_selected: parseAdditionalServices(saved),
    additional_services_counts: parseServiceCounts(saved),
    additional_services_custom: parseAdditionalServicesCustom(saved),
  });

  it('reads the JSON format as real choices, as on booking HOM-09-26-033', () => {
    const back = fromStored('{"child_seat":1, "additional_drivers":2, "extra_km":true}');
    expect(serviceQuantity(back, 'Çocuk Koltuğu')).toBe(1);
    expect(serviceQuantity(back, 'Yedek Sürücü')).toBe(2);
    expect(back.additional_services_selected).toContain('Ek Kilometre');
    expect(back.additional_services_custom).toBe('');
  });

  it.each([
    'Çocuk Koltuğu',
    'Ek Kilometre,Çocuk Koltuğu',
    'Çocuk Koltuğu x2,Yedek Sürücü x3',
    'Çocuk Koltuğu,GPS,Roof rack',
    '{"child_seat":1, "additional_drivers":2, "extra_km":true}',
  ])('unchanged, %s goes back exactly as stored', (saved) => {
    expect(additionalServicesValue(fromStored(saved), saved)).toBe(saved);
  });

  it('keeps a changed JSON booking as JSON, with what it does not know', () => {
    const saved = '{"child_seat":1,"additional_drivers":2,"extra_km":true,"source":"app"}';
    const changed = withServiceQuantity(fromStored(saved), 'Çocuk Koltuğu', 3);
    expect(JSON.parse(additionalServicesValue(changed, saved) as string))
      .toEqual({ child_seat: 3, additional_drivers: 2, extra_km: true, source: 'app' });
  });

  it('writes a changed comma list in the usual form', () => {
    expect(additionalServicesValue(withServiceQuantity(fromStored('Çocuk Koltuğu,Ek Kilometre'), 'Çocuk Koltuğu', 0), 'Çocuk Koltuğu,Ek Kilometre')).toBe('Ek Kilometre');
  });

  it('reads insurance back the way it was stored', () => {
    expect(insuranceValue(form({ insurance_type_select: 'Tam Koruma' }))).toBe('Tam Koruma');
    expect(insuranceValue(form({ insurance_type_select: 'Diğer', insurance_type_custom: ' TRAFFIC ' }))).toBe('TRAFFIC');
    expect(insuranceValue(form({ insurance_type_select: 'Diğer' }))).toBeNull();
    expect(insuranceValue(form())).toBeNull();
    expect(additionalServicesValue(form())).toBeNull();
  });
});

describe('money', () => {
  it('stores USD in lira, rounded to kuruş', () => {
    expect(toTry(300, 'USD', 34.5)).toBe(10350);
    expect(toTry(33.33, 'USD', 49.123)).toBe(1637.27);
    expect(toTry(300, 'TRY', 34.5)).toBe(300);
  });

  it('writes the ledger note the brief asks for', () => {
    expect(usdLedgerNote(300, 34.5)).toBe('($300 × 34,50)');
    expect(usdLedgerNote(1250.5, 49)).toBe('($1,250.5 × 49,00)');
  });
});

describe('dates and availability', () => {
  it('counts days, with a same-day rental as one', () => {
    expect(rangeDays('2026-11-01', '2026-11-06')).toBe(5);
    expect(rangeDays('2026-11-01', '2026-11-01')).toBe(1);
    expect(rangeDays('', '2026-11-01')).toBe(0);
    expect([formatDays(1), formatDays(5)]).toEqual(['1 day', '5 days']);
    expect(formatShortRange('2026-11-10', '2026-11-15')).toBe('10.11 → 15.11.2026');
    expect(formatShortRange('2026-11-10', '')).toBe('10.11 → …');
    expect(formatShortRange('', '')).toBe('—');
  });

  it('marks a car busy, unless the block is the booking being edited', () => {
    const blocks = [{ car_id: 1, booking_id: 10 }, { car_id: 2, booking_id: null }];
    expect(Array.from(busyCarIds(blocks))).toEqual([1, 2]);
    expect(Array.from(busyCarIds(blocks, 10))).toEqual([2]);
  });
});

describe('carAvailability', () => {
  let nextId = 1;
  const block = (car_id: number, block_type: CalendarBlockDetail['block_type'], over: Partial<CalendarBlockDetail> = {}): CalendarBlockDetail => ({
    id: nextId++, car_id, booking_id: null, block_type, start_date: '2026-11-04', end_date: '2026-11-21', notes: null, ...over,
  });
  const own = block(1, 'booked_confirmed', { booking_id: 10 });
  const ownReplacement = block(2, 'replacement', { notes: 'Replacement for 34KDK804 · FURKAN KAÇAR' });
  const othersReplacement = block(3, 'replacement', { notes: 'Replacement for 34ABC1' });
  const maintenance = block(4, 'maintenance');
  const othersBooking = block(5, 'booked_pending', { booking_id: 11 });
  const forSale = block(6, 'selling');
  const unknown = block(7, null);
  const all = [own, ownReplacement, othersReplacement, maintenance, othersBooking, forSale, unknown];

  it("leaves out the booking's own block and the customer's own replacement car", () => {
    const result = carAvailability(all, { bookingId: 10, ownBlockIds: new Set([ownReplacement.id]) });
    expect(result.hard.has(1)).toBe(false);
    expect(result.hard.has(2) || result.soft.has(2)).toBe(false);
  });

  it("keeps another customer's booking, a car for sale and an unknown block as hard stops", () => {
    const result = carAvailability(all, { bookingId: 10 });
    expect(Array.from(result.hard.keys()).sort()).toEqual([5, 6, 7]);
  });

  it('makes replacement and maintenance blocks a warning, with what they are', () => {
    const result = carAvailability(all, { bookingId: 10 });
    expect(Array.from(result.soft.keys()).sort()).toEqual([2, 3, 4]);
    expect(describeBlock(othersReplacement)).toBe('Replacement car · 04.11 → 21.11.2026 · Replacement for 34ABC1');
    expect(describeBlock(maintenance)).toBe('Maintenance · 04.11 → 21.11.2026');
  });

  it('without the booking, its own block counts like any other', () => {
    expect(carAvailability([own]).hard.has(1)).toBe(true);
  });

  it('words the hard stop by what is in the way', () => {
    expect(hardConflictMessage([forSale])).toBe('This car is for sale on those dates. Choose other dates or another car.');
    expect(hardConflictMessage([forSale, othersBooking])).toBe('This car is already booked for those dates. Choose other dates or another car.');
  });
});

describe('groupCars', () => {
  const cars: CarChoice[] = [
    { id: 1, plate_number: '34 ZZZ 1', model: 'Fiat Egea' },
    { id: 2, plate_number: '34 AAA 1', model: 'Fiat Egea' },
    { id: 3, plate_number: '34 BBB 1', model: 'Audi A3' },
    { id: 4, plate_number: '34 CCC 1', model: '' },
  ];

  it('sorts models A→Z, then plates A→Z inside each', () => {
    const groups = groupCars(cars);
    expect(groups.map((group) => group.label)).toEqual(['Audi A3', 'Fiat Egea', 'Other']);
    expect(groups[1].cars.map((car) => car.id)).toEqual([2, 1]);
  });

  it('pins recent cars on top, in the order they were used', () => {
    const groups = groupCars(cars, [3, 1, 99]);
    expect(groups[0]).toMatchObject({ label: 'Recently used' });
    expect(groups[0].cars.map((car) => car.id)).toEqual([3, 1]);
  });

  it('searches plate and model, ignoring spaces, and drops the pins', () => {
    expect(carMatches(cars[1], '34aaa')).toBe(true);
    expect(carMatches(cars[1], 'egea')).toBe(true);
    expect(carMatches(cars[1], 'audi')).toBe(false);
    expect(groupCars(cars, [3], 'egea').map((group) => group.label)).toEqual(['Fiat Egea']);
  });
});

describe('changedFields', () => {
  const baseline = form({ car_id: '1', fin_rental_amount: '10350', pickup_location: 'Şişli Branch', insurance_type_select: 'Diğer', insurance_type_custom: 'TRAFFIC' });

  it('finds nothing when nothing changed', () => {
    expect(changedFields(baseline, { ...baseline })).toEqual([]);
  });

  it('counts a location once however it was typed in', () => {
    const next = { ...baseline, pickup_location: 'Other place', pickup_location_select: 'Other', pickup_location_custom: 'Other place' };
    expect(changedFields(baseline, next)).toEqual(['pickup_location']);
  });

  it('names insurance and extras as single changes', () => {
    const next = { ...baseline, insurance_type_select: 'Tam Koruma', insurance_type_custom: '', additional_services_selected: ['Ek Kilometre'] };
    expect(changedFields(baseline, next)).toEqual(['insurance', 'extras']);
  });

  it('compares money in lira, so switching currency alone changes nothing', () => {
    const next = { ...baseline, fin_currency: 'USD' as const, fin_rental_amount: '300' };
    expect(changedFields(baseline, next, 34.5)).toEqual([]);
    expect(changedFields(baseline, { ...next, fin_rental_amount: '301' }, 34.5)).toEqual(['fin_rental_amount']);
  });
});

describe('friendlyBookingError', () => {
  it('explains a calendar clash in plain words', () => {
    const raw = 'conflicting key value violates exclusion constraint "car_calendar_no_overlap"';
    expect(friendlyBookingError(raw)).toBe('This car is already booked for those dates. Choose other dates or another car.');
  });

  it('still explains customer rules', () => {
    expect(friendlyBookingError('CUSTOMER_BANNED: X is banned (matched on phone). Reason: Late')).toBe('This customer is banned — Late');
  });
});

describe('editFormData', () => {
  it('fills the form from a booking without touching stored oddities', () => {
    const booking = {
      booking_number: 'HOM-1', status: 'completed', car_id: 7, start_date: '2026-10-01', end_date: '2026-10-05',
      is_currently_active: false, pickup_location: 'laleli', dropoff_location: null, km_at_delivery: 120,
      fuel_at_delivery: '150', insurance_type: 'TRAFFIC', additional_services: null,
    } as unknown as Booking;
    expect(editFormData(booking)).toMatchObject({
      status: 'completed', car_id: '7', pickup_location_select: 'Other', pickup_location_custom: 'laleli',
      km_at_delivery: '120', fuel_at_delivery: '150', insurance_type_custom: 'TRAFFIC',
    });
  });
});

describe('a new booking', () => {
  it('starts confirmed: staff bookings are confirmed, only website and app bookings wait as pending', () => {
    expect(EMPTY_FORM.status).toBe('confirmed');
  });
});
