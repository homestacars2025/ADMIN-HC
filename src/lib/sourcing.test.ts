import {
  NO_FILTERS,
  activeFilterCount,
  carName,
  damageBadges,
  daysListed,
  detectPlatform,
  emptyForm,
  formPayload,
  gapPercent,
  investmentCheck,
  leadStage,
  leadUpdateError,
  listedLabel,
  matchesFilters,
  matchesTile,
  parseAmount,
  paybackTone,
  platformLabel,
  sortRows,
  summarize,
  toForm,
  toSourcingRow,
  validateForm,
  type SourcingRow,
} from './sourcing';
import type { ModelGroupStats } from './modelGroups';

jest.mock('./supabase', () => ({ supabase: {} }));

const TODAY = '2026-11-07';
const lira = (amount: number) => `₺${amount}`;

const row = (over: Partial<SourcingRow> = {}): SourcingRow => ({
  id: 1, created_at: null, updated_at: '2026-11-03T10:00:00Z', source_platform: 'sahibinden.com', source_platform_custom: null,
  model_group_id: 4, model_group_custom: null, model_year: 2023, mileage_km: 42000, transmission: 'Automatic', fuel_type: 'Petrol',
  damage_record: 'No Damage', damage_value: null, paint_sections_count: 0, trim_package: 'Touch', listing_url: 'https://www.sahibinden.com/ilan/1',
  listing_status: 'Active', listed_on: '2026-11-01', lead_status: 'New', asking_price: 1_100_000, target_price: 1_000_000, notes: null,
  city_id: 34, district_id: 7, added_by: null, city: 'İstanbul', district: 'Şişli', group: { name: 'Renault Clio', brand: 'Renault', model: 'Clio', image_url: null },
  ...over,
});

const stats = (over: Partial<ModelGroupStats> = {}): ModelGroupStats => ({
  model_group_id: 4, cars_total: 9, cars_active: 7, rented_now: 6, utilization: 60, bookings_month: 3, avg_daily_rate: 1500, ...over,
});

describe('lead stages', () => {
  it('reads the older Rejected and Ignored as Lost, and anything unknown as New', () => {
    expect(leadStage('Rejected')).toBe('Lost');
    expect(leadStage('Ignored')).toBe('Lost');
    expect(leadStage('Negotiating')).toBe('Negotiating');
    expect(leadStage(null)).toBe('New');
  });

  it('explains a stage the database does not accept yet', () => {
    expect(leadUpdateError('new row violates check constraint "sourcing_lead_status_check"', 'Bought')).toContain('20261107_sourcing_pipeline_lead_statuses.sql');
    expect(leadUpdateError('permission denied', 'Bought')).toBe('permission denied');
  });
});

describe('reading a listing', () => {
  it('maps a row from the database with its city, district and model group', () => {
    const mapped = toSourcingRow({ id: '9', model_year: 2024, source_platform: 'letgo', asking_price: '950000', geo_cities: { name: 'İstanbul' }, geo_districts: [{ name: 'Kayaşehir' }], model_group: { name: 'Fiat Egea', brand: 'Fiat', model: 'Egea', image_url: 'x.jpg' } });
    expect(mapped).toMatchObject({ id: 9, asking_price: 950000, city: 'İstanbul', district: 'Kayaşehir', lead_status: 'New', listing_status: 'Active' });
    expect(carName(mapped)).toBe('Fiat Egea');
  });

  it('names a custom model and the platforms', () => {
    expect(carName(row({ group: null, model_group_custom: 'Peugeot 2008' }))).toBe('Peugeot 2008');
    expect(platformLabel(row())).toBe('Sahibinden');
    expect(platformLabel(row({ source_platform: 'Other', source_platform_custom: 'otoplus.com' }))).toBe('otoplus.com');
  });

  it('finds the platform from the link', () => {
    expect(detectPlatform('https://www.sahibinden.com/ilan/vasita-otomobil-123')).toEqual({ platform: 'sahibinden.com', custom: null });
    expect(detectPlatform('arabam.com/ilan/galeriden/renault-clio/1')).toEqual({ platform: 'arabam.com', custom: null });
    expect(detectPlatform('https://www.letgo.com/item/x')).toEqual({ platform: 'letgo', custom: null });
    expect(detectPlatform('https://m.facebook.com/marketplace/item/1')).toEqual({ platform: 'Facebook Marketplace', custom: null });
    expect(detectPlatform('https://www.otoplus.com/ilan/2')).toEqual({ platform: 'Other', custom: 'otoplus.com' });
    expect(detectPlatform('not a link')).toBeNull();
  });

  it('works out the gap to target: under is negative', () => {
    expect(gapPercent(1_100_000, 1_000_000)).toBe(10);
    expect(gapPercent(950_000, 1_000_000)).toBe(-5);
    expect(gapPercent(950_000, null)).toBeNull();
  });

  it('puts the damage record in badges', () => {
    expect(damageBadges(row(), lira)).toEqual([{ tone: 'clean', label: 'Clean' }]);
    expect(damageBadges(row({ damage_record: 'Damage Value', damage_value: 12500, paint_sections_count: 2 }), lira)).toEqual([
      { tone: 'damage', label: '₺12500 damage' },
      { tone: 'paint', label: '2 painted parts' },
    ]);
    expect(damageBadges(row({ damage_record: 'Heavy Damage' }), lira)[0].tone).toBe('heavy');
    expect(damageBadges(row({ damage_record: null }), lira)[0].label).toBe('No record');
  });

  it('says how long ago it was listed', () => {
    expect(daysListed('2026-11-01', TODAY)).toBe(6);
    expect(listedLabel(daysListed('2026-11-07', TODAY))).toBe('Listed today');
    expect(listedLabel(1)).toBe('Listed yesterday');
    expect(listedLabel(null)).toBe('Listing date unknown');
  });
});

describe('the investment check', () => {
  it('estimates revenue as rate × 30 × utilization and the payback in months', () => {
    // 1500 × 30 × 0.6 = 27,000 a month; 1,100,000 / 27,000 = 40.7 months.
    expect(investmentCheck(1_100_000, stats())).toEqual({ utilization: 60, avgDailyRate: 1500, monthlyRevenue: 27000, paybackMonths: 40.7, tone: 'red' });
  });

  it('colours the payback: green to 18 months, amber to 30, red beyond', () => {
    expect(paybackTone(18)).toBe('green');
    expect(paybackTone(18.1)).toBe('amber');
    expect(paybackTone(30)).toBe('amber');
    expect(paybackTone(30.5)).toBe('red');
  });

  it('gives no payback without a rate, utilization or asking price', () => {
    expect(investmentCheck(1_000_000, stats({ avg_daily_rate: null })).paybackMonths).toBeNull();
    expect(investmentCheck(null, stats()).paybackMonths).toBeNull();
    expect(investmentCheck(1_000_000, undefined).tone).toBeNull();
  });
});

describe('tiles, filters and sorting', () => {
  const rows = [
    row({ id: 1 }),
    row({ id: 2, lead_status: 'Offer Sent', listing_status: 'Sold', asking_price: 900_000, model_year: 2021, city_id: 6 }),
    row({ id: 3, lead_status: 'Bought', updated_at: '2026-11-05T09:00:00Z', target_price: null }),
    row({ id: 4, lead_status: 'Bought', updated_at: '2026-10-28T09:00:00Z', source_platform: 'arabam.com' }),
  ];

  it('counts the tiles: active, hot, bought this month and the average gap', () => {
    expect(summarize(rows, TODAY)).toEqual({ total: 4, active: 3, hot: 1, bought: 1, avgGap: 3.3, gapCount: 3 });
    expect(rows.filter((item) => matchesTile(item, 'bought', TODAY)).map((item) => item.id)).toEqual([3]);
  });

  it('filters by search, platform, lead, city, year and price', () => {
    const ids = (filters: Partial<typeof NO_FILTERS>) => rows.filter((item) => matchesFilters(item, { ...NO_FILTERS, ...filters })).map((item) => item.id);
    expect(ids({ query: 'clio sisli' })).toEqual([1, 2, 3, 4]);
    expect(ids({ platform: 'arabam.com' })).toEqual([4]);
    expect(ids({ lead: 'Offer Sent' })).toEqual([2]);
    expect(ids({ city: 6 })).toEqual([2]);
    expect(ids({ yearTo: 2022 })).toEqual([2]);
    expect(ids({ priceMax: 1_000_000 })).toEqual([2]);
    expect(activeFilterCount({ ...NO_FILTERS, query: 'x', city: 6, priceMin: 1 })).toBe(2);
  });

  it('sorts the table, rows without the figure last', () => {
    expect(sortRows(rows, 'asking', 'asc').map((item) => item.id)[0]).toBe(2);
    expect(sortRows(rows, 'gap', 'asc').map((item) => item.id)).toEqual([2, 4, 1, 3]); // ties: the newest first
  });
});

describe('the form', () => {
  it('needs a model, year, km and asking price', () => {
    const errors = validateForm(emptyForm(TODAY), 2026);
    expect(Object.keys(errors).sort()).toEqual(['asking_price', 'mileage_km', 'model_group_id', 'model_year', 'source_platform']);
    expect(validateForm({ ...toForm(row()), model_year: '2019' }, 2026).model_year).toBe('Between 2020 and 2026.');
    expect(validateForm(toForm(row()), 2026)).toEqual({});
  });

  it('reads Turkish and English thousands', () => {
    expect(parseAmount('1.250.000')).toBe(1_250_000);
    expect(parseAmount('1,250,000')).toBe(1_250_000);
    expect(parseAmount('12500,50')).toBe(12500.5);
    expect(parseAmount('')).toBeNull();
    expect(Number.isNaN(parseAmount('abc'))).toBe(true);
  });

  it('saves a custom model without a group, and only the damage amount it needs', () => {
    const form = { ...toForm(row()), model_group_id: 'custom', model_group_custom: ' Peugeot 2008 ', damage_value: '5000', listing_url: 'arabam.com/ilan/1' };
    expect(formPayload(form)).toMatchObject({ model_group_id: null, model_group_custom: 'Peugeot 2008', damage_value: null, listing_url: 'https://arabam.com/ilan/1', asking_price: 1_100_000 });
    expect(formPayload({ ...form, damage_record: 'Damage Value' }).damage_value).toBe(5000);
  });
});
