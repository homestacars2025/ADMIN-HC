import {
  fleetMix,
  investorName,
  investorTotals,
  matchesInvestorFilter,
  matchesInvestorSearch,
  modelLabel,
  parseInvestor,
  telLink,
  whatsappLink,
} from './investors';

jest.mock('./supabase', () => ({ supabase: {} }));

const raw = (overrides: Record<string, unknown> = {}) => ({
  id: 'a1',
  company_name: 'Al fahd Group',
  full_name: 'Alfahd Group',
  avatar_url: null,
  avatar_bg: 'mint',
  phone: '+90 555 111 2233',
  whatsapp: null,
  email: 'x@y.com',
  is_active: true,
  commission_rate: '25.00',
  total_investment: 0,
  created_at: '2025-10-01T09:00:00Z',
  cars_total: 3,
  model_types: 2,
  cars_rented_now: 1,
  utilization_pct: 50,
  month_in: 1000,
  month_out: 1500,
  model_groups: [
    { model_group_id: 7, name: 'Corolla', brand: 'Toyota', model: 'Corolla', category: 'Middle', transmission: 'Automatic', fuel: 'Hybrid', image_url: null, count: 2,
      plates: [{ car_id: 1, plate: '34 ABC 123' }, { car_id: 2, plate: '34 XYZ 9' }] },
    { model_group_id: null, name: null, brand: null, model: null, category: null, transmission: null, fuel: null, image_url: null, count: 1,
      plates: [{ car_id: 3, plate: '34 NEW 1' }] },
  ],
  ...overrides,
});

describe('parseInvestor', () => {
  it('reads numbers sent as text and keeps the model groups and plates', () => {
    const investor = parseInvestor(raw());
    expect(investor.commissionRate).toBe(25);
    expect(investor.modelGroups).toHaveLength(2);
    expect(investor.modelGroups[0].plates[1]).toEqual({ carId: 2, plate: '34 XYZ 9' });
    expect(investor.modelGroups[1].id).toBeNull();
  });

  it('keeps a missing utilization as null, not zero', () => {
    expect(parseInvestor(raw({ utilization_pct: null })).utilization).toBeNull();
  });
});

describe('reading an investor', () => {
  it('names by company, then person', () => {
    expect(investorName({ companyName: null, fullName: 'Recep' })).toBe('Recep');
    expect(modelLabel({ brand: null, model: null, name: null, id: null })).toBe('No model group');
  });

  it('builds contact links only from real numbers', () => {
    expect(whatsappLink('+90 (555) 111-22 33')).toBe('https://wa.me/905551112233');
    expect(whatsappLink('12')).toBeNull();
    expect(telLink('+90 555 111 2233')).toBe('tel:+905551112233');
  });

  it('finds an investor by plate whatever the spacing, and by model', () => {
    const investor = parseInvestor(raw());
    expect(matchesInvestorSearch(investor, '34abc')).toBe(true);
    expect(matchesInvestorSearch(investor, 'corolla')).toBe(true);
    expect(matchesInvestorSearch(investor, 'bmw')).toBe(false);
  });
});

describe('tiles', () => {
  const a = parseInvestor(raw());
  const b = parseInvestor(raw({ id: 'b2', is_active: false, cars_total: 0, cars_rented_now: 0, utilization_pct: null, month_in: 0, month_out: 0, model_groups: [] }));
  const c = parseInvestor(raw({ id: 'c3', cars_total: 6, utilization_pct: 90, month_in: 5000, month_out: 1000 }));

  it('weights utilization by cars and counts each filter', () => {
    const totals = investorTotals([a, b, c]);
    expect(totals.utilization).toBe(76.7); // (50×3 + 90×6) / 9
    expect(totals.net).toBe(3500);
    expect(totals.counts).toEqual({ cars: 2, rented: 2, low: 1, in: 2, out: 2, net: 1 });
    expect(totals.activeInvestors).toBe(2);
  });

  it('filters the red ones on Net', () => {
    expect(matchesInvestorFilter(a, 'net')).toBe(true);
    expect(matchesInvestorFilter(c, 'net')).toBe(false);
    expect(matchesInvestorFilter(b, 'all')).toBe(true);
  });

  it('splits the fleet by model, shares adding to one', () => {
    const slices = fleetMix(a.modelGroups);
    expect(slices.map((slice) => slice.count)).toEqual([2, 1]);
    expect(slices.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1);
  });
});
