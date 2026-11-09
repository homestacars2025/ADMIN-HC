import { applyCustomerHgs, bookingRange, coveredUntil, fetchPortalFreshness, previewCustomerHgs, previewTotals, suggestedFrom } from './hgsPortalPosting';
import { hgsLineInfo } from './customerWallet';

const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args), from: (...args: unknown[]) => mockFrom(...args) } }));

const BOOKING = { startDate: '2026-09-22', endDate: '2026-12-07' };

beforeEach(() => { mockRpc.mockReset(); mockFrom.mockReset(); });

describe('where charging starts', () => {
  it('reads the last day a typed HGS line covers', () => {
    expect(coveredUntil('HGS to 31/09/2026', 2026)).toBe('2026-09-30'); // past the month's end → its last day
    expect(coveredUntil('hgs to 05.11.2026', 2026)).toBe('2026-11-05');
    expect(coveredUntil('FROM 02/10 TO 01/11', 2026)).toBe('2026-11-01');
    expect(coveredUntil('TO 3.11', 2026)).toBe('2026-11-03');
    expect(coveredUntil('HGS', 2026)).toBeNull();
  });

  it('suggests the day after what was typed by hand, inside the booking', () => {
    expect(suggestedFrom(BOOKING, [{ description: 'HGS to 31/09/2026' }])).toBe('2026-10-01');
    expect(suggestedFrom(BOOKING, [])).toBe('2026-09-22');
    expect(suggestedFrom(BOOKING, [{ description: 'HGS to 20/12/2026' }])).toBe('2026-12-07');
  });

  it('keeps From inside the booking', () => {
    expect(bookingRange(BOOKING, '2026-09-01', BOOKING.endDate)).toEqual({ from: '2026-09-22', to: '2026-12-07' });
  });
});

describe('the database calls', () => {
  it('always sends p_from_date, so PostgREST picks the two-argument function', async () => {
    mockRpc.mockResolvedValue({ data: [{ portal_id: 7, tdate: '2026-10-02', amount: '65', road_type: 'private', note: '02-10-2026 Çamlıca → Kurtköy' }], error: null });
    expect(await previewCustomerHgs(710, '2026-10-01')).toEqual([{ id: 7, day: '2026-10-02', amount: 65, roadType: 'private', note: '02-10-2026 Çamlıca → Kurtköy' }]);
    expect(mockRpc).toHaveBeenCalledWith('preview_customer_hgs', { p_booking_id: 710, p_from_date: '2026-10-01' });
    await previewCustomerHgs(710, null);
    expect(mockRpc).toHaveBeenLastCalledWith('preview_customer_hgs', { p_booking_id: 710, p_from_date: null });
  });

  it('applies and reads back the count and the lira total, with no rate anywhere', async () => {
    mockRpc.mockResolvedValue({ data: [{ inserted_count: 25, inserted_total: '1903' }], error: null });
    expect(await applyCustomerHgs(710, '2026-10-01')).toEqual({ count: 25, total: 1903 });
    expect(mockRpc).toHaveBeenCalledWith('apply_customer_hgs', { p_booking_id: 710, p_from_date: '2026-10-01' });
    expect(JSON.stringify(mockRpc.mock.calls)).not.toMatch(/rate/);
  });

  it('reads the freshness without the test files', async () => {
    const chain = (row: Record<string, string>) => {
      const query: Record<string, jest.Mock> = {};
      ['select', 'eq', 'not', 'order'].forEach((name) => { query[name] = jest.fn(() => query); });
      query.limit = jest.fn(async () => ({ data: [row], error: null }));
      return query;
    };
    const uploads = chain({ created_at: '2026-11-05T12:53:05Z', transit_datetime: '2026-11-01T10:00:00Z' });
    const transits = chain({ created_at: '2026-11-05T12:53:05Z', transit_datetime: '2026-11-03T20:30:00Z' });
    mockFrom.mockReturnValueOnce(uploads).mockReturnValueOnce(transits);
    expect(await fetchPortalFreshness(26)).toEqual({ lastUpload: '2026-11-05T12:53:05Z', lastTransit: '2026-11-03' });
    expect(uploads.not).toHaveBeenCalledWith('source_file', 'like', '%test%');
  });

  it('totals in lira', () => {
    expect(previewTotals([{ id: 1, day: '', amount: 1215.5, roadType: null, note: '' }, { id: 2, day: '', amount: 687.5, roadType: null, note: '' }])).toEqual({ count: 2, total: 1903 });
  });
});

describe('the wallet reads what apply_customer_hgs writes', () => {
  it('as a pass, with its day and route, not as a line typed by hand', () => {
    expect(hgsLineInfo({ description: '02-10-2026 Çamlıca → Kurtköy', created_at: '2026-11-09T10:00:00Z' })).toMatchObject({ pass: true, day: '2026-10-02' });
    expect(hgsLineInfo({ description: 'HGS to 31/09/2026', created_at: '2026-10-07T00:00:00Z' }).pass).toBe(false);
  });
});
