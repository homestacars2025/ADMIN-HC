import { bookingRange, coveredUntil, defaultRate, friendlyHgsError, previewTotals, routeLabel, suggestedFrom, toPreview } from './hgsPortalPosting';

jest.mock('./supabase', () => ({ supabase: {} }));

const BOOKING = { startDate: '2026-09-22', endDate: '2026-12-07' };

describe('where charging starts', () => {
  it('reads the last day a typed HGS line covers', () => {
    expect(coveredUntil('HGS to 31/09/2026', 2026)).toBe('2026-09-30'); // past the month's end → its last day
    expect(coveredUntil('hgs to 05.11.2026', 2026)).toBe('2026-11-05');
    expect(coveredUntil('FROM 02/10 TO 01/11', 2026)).toBe('2026-11-01');
    expect(coveredUntil('TO 3.11', 2026)).toBe('2026-11-03');
    expect(coveredUntil('HGS FROM 14/10 TO -5/11/2026', 2026)).toBe('2026-11-05');
    expect(coveredUntil('HGS', 2026)).toBeNull();
    expect(coveredUntil(null, 2026)).toBeNull();
  });

  it('starts the day after what was typed by hand, or on the booking’s first day', () => {
    expect(suggestedFrom(BOOKING, [{ description: 'HGS to 31/09/2026' }])).toBe('2026-10-01');
    expect(suggestedFrom(BOOKING, [{ description: 'HGS to 31/09/2026' }, { description: 'TO 03.10' }])).toBe('2026-10-04');
    expect(suggestedFrom(BOOKING, [])).toBe('2026-09-22');
    expect(suggestedFrom(BOOKING, [{ description: 'HGS to 15/08/2026' }])).toBe('2026-09-22'); // before the booking
    expect(suggestedFrom(BOOKING, [{ description: 'HGS to 20/12/2026' }])).toBe('2026-12-07'); // never past it
  });

  it('never leaves the booking', () => {
    expect(bookingRange(BOOKING, '2026-09-01', '2027-01-10')).toEqual({ from: '2026-09-22', to: '2026-12-07' });
    expect(bookingRange(BOOKING, '2026-10-04', '2026-11-08')).toEqual({ from: '2026-10-04', to: '2026-11-08' });
    expect(bookingRange(BOOKING, '2026-11-08', '2026-10-04')).toEqual({ from: '2026-10-04', to: '2026-11-08' });
  });
});

describe('rate and totals', () => {
  it('takes the booking’s own newest rate, else today’s', () => {
    expect(defaultRate([null, 48.5, undefined, 49.2], 50)).toBe(49.2);
    expect(defaultRate([null], 50)).toBe(50);
    expect(defaultRate([], null)).toBeNull();
  });

  it('sums the lira and shows the dollars at the rate', () => {
    const transits = [{ id: 1, at: '', amount: 1215.5, roadType: 'private', entry: null, exit: null, otoyol: null }, { id: 2, at: '', amount: 586.5, roadType: 'public', entry: null, exit: null, otoyol: null }];
    expect(previewTotals(transits, 50)).toEqual({ count: 2, tl: 1802, usd: 36.04 });
    expect(previewTotals(transits, null).usd).toBeNull();
  });

  it('names the route, falling back to the motorway and then "?"', () => {
    expect(routeLabel({ entry: 'Çamlıca', exit: 'Kurtköy', otoyol: null })).toBe('Çamlıca → Kurtköy');
    expect(routeLabel({ entry: null, exit: null, otoyol: 'Osmangazi Köprüsü' })).toBe('? → Osmangazi Köprüsü');
    expect(routeLabel({ entry: null, exit: null, otoyol: null })).toBe('? → ?');
  });
});

describe('reading the database', () => {
  it('maps the preview, with the range it used and the investor’s passes apart', () => {
    const preview = toPreview({
      from: '2026-10-04', to: '2026-11-08', last_upload: '2026-11-05T15:53', last_transit: '2026-11-03T18:20', rate_hint: '48.5',
      investor_count: 2, investor_total: '40', transits: [{ id: 9, at: '2026-10-04 08:12', amount: '65', road_type: 'private', entry_location: null, exit_location: 'Kurtköy', otoyol: 'O-7' }],
    }, '2026-10-01', '2026-12-07');
    expect(preview).toMatchObject({ from: '2026-10-04', to: '2026-11-08', rateHint: 48.5, investorCount: 2, investorTotal: 40, lastUpload: '2026-11-05T15:53' });
    expect(preview.transits[0]).toEqual({ id: 9, at: '2026-10-04T08:12', amount: 65, roadType: 'private', entry: null, exit: 'Kurtköy', otoyol: 'O-7' });
  });

  it('says plainly when the functions are missing or not allowed', () => {
    expect(friendlyHgsError('forbidden', '42501')).toBe("You don't have permission to add HGS to customer wallets.");
    expect(friendlyHgsError('Could not find the function public.booking_portal_hgs_preview(p_booking_id, p_from, p_to) in the schema cache')).toBe('Adding HGS from the portal is not set up in the database yet.');
  });
});
