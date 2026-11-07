import {
  EMPTY_FORM,
  bestTier,
  changedFields,
  discounted,
  displayName,
  filterCounts,
  formPayload,
  imagePath,
  imageProblem,
  isFullyRented,
  isLowUtilization,
  listPriceTry,
  matchesFilter,
  matchesSearch,
  rateTone,
  sortGroupCars,
  sortGroups,
  tierChanges,
  tierDraftChangeCount,
  toForm,
  toTierDrafts,
  validateForm,
  validateTiers,
  type ModelGroupRow,
  type ModelGroupStats,
  type PricingTier,
} from './modelGroups';

jest.mock('./supabase', () => ({ supabase: {} }));

const group = (over: Partial<ModelGroupRow> = {}): ModelGroupRow => ({
  id: 1, name: 'Renault Clio', brand: 'Renault', model: 'Clio', category: 'Economy', transmission: 'Automatic', fuel: 'Petrol',
  seats: 5, luggage: 2, daily_km: 300, monthly_km: 6000, deposit: 8000, min_age: 21, price: 30, image_url: 'https://x/clio.jpg', ...over,
});

const stat = (over: Partial<ModelGroupStats> = {}): ModelGroupStats => ({
  model_group_id: 1, cars_total: 4, cars_active: 4, rented_now: 2, utilization: 70, bookings_month: 3, avg_daily_rate: 1100, ...over,
});

const tiers: PricingTier[] = [
  { id: 1, min_days: 5, max_days: 14, discount_percent: 0, is_active: true },
  { id: 3, min_days: 15, max_days: 30, discount_percent: 13, is_active: true },
  { id: 5, min_days: 91, max_days: 180, discount_percent: 35, is_active: true },
  { id: 6, min_days: 181, max_days: 365, discount_percent: 50, is_active: false },
];

describe('the stat tiles', () => {
  it('counts a group fully rented only when every active car is out', () => {
    expect(isFullyRented(stat({ cars_active: 3, rented_now: 3 }))).toBe(true);
    expect(isFullyRented(stat({ cars_active: 3, rented_now: 2 }))).toBe(false);
    expect(isFullyRented(stat({ cars_active: 0, rented_now: 0 }))).toBe(false);
    expect(isFullyRented(undefined)).toBe(false);
  });

  it('calls a month below 60% low, and no figure not low', () => {
    expect(isLowUtilization(stat({ utilization: 59 }))).toBe(true);
    expect(isLowUtilization(stat({ utilization: 60 }))).toBe(false);
    expect(isLowUtilization(stat({ utilization: null }))).toBe(false);
  });

  it('filters and counts by tile', () => {
    const groups = [group({ id: 1 }), group({ id: 2, image_url: null }), group({ id: 3 })];
    const stats = new Map([[1, stat({ model_group_id: 1, cars_active: 2, rented_now: 2 })], [2, stat({ model_group_id: 2, utilization: 30 })], [3, stat({ model_group_id: 3 })]]);
    expect(filterCounts(groups, stats)).toEqual({ rented: 1, low: 1, noimage: 1 });
    expect(matchesFilter(groups[1], stats.get(2), 'noimage')).toBe(true);
    expect(matchesFilter(groups[0], stats.get(1), 'all')).toBe(true);
  });
});

describe('search and sort', () => {
  it('finds a group by name or brand, any case and without accents', () => {
    expect(matchesSearch(group(), 'renault')).toBe(true);
    expect(matchesSearch(group({ brand: 'Citroën', model: 'C4 X', name: 'Citroën C4 X' }), 'citroen c4')).toBe(true);
    expect(matchesSearch(group(), 'fiat')).toBe(false);
    expect(matchesSearch(group(), '  ')).toBe(true);
  });

  it('names a group brand + model, or by its name when one is missing', () => {
    expect(displayName(group())).toBe('Renault Clio');
    expect(displayName(group({ brand: null, name: 'Corolla Toyota' }))).toBe('Corolla Toyota');
  });

  it('sorts by utilization with groups without a figure last, ties by name', () => {
    const groups = [group({ id: 1, name: 'B' , brand: null }), group({ id: 2, name: 'A', brand: null }), group({ id: 3, name: 'C', brand: null })];
    const stats = new Map([[1, stat({ utilization: 50 })], [2, stat({ utilization: 50 })], [3, stat({ utilization: null })]]);
    expect(sortGroups(groups, stats, 'utilization', 'desc').map((g) => g.id)).toEqual([2, 1, 3]);
    expect(sortGroups(groups, stats, 'utilization', 'asc').map((g) => g.id)).toEqual([2, 1, 3]);
    expect(sortGroups(groups, stats, 'name', 'asc').map((g) => g.id)).toEqual([2, 1, 3]);
  });

  it('sorts by price and by cars', () => {
    const groups = [group({ id: 1, price: 30 }), group({ id: 2, price: 50 })];
    const stats = new Map([[1, stat({ cars_total: 9 })], [2, stat({ cars_total: 2 })]]);
    expect(sortGroups(groups, stats, 'price', 'desc').map((g) => g.id)).toEqual([2, 1]);
    expect(sortGroups(groups, stats, 'cars', 'desc').map((g) => g.id)).toEqual([1, 2]);
  });

  it('lists the cars out on a booking first and inactive ones last', () => {
    const cars = sortGroupCars([
      { id: 1, plate: '34 B', isActive: true, status: 'parking', utilization: undefined },
      { id: 2, plate: '34 A', isActive: false, status: 'working', utilization: undefined },
      { id: 3, plate: '34 C', isActive: true, status: 'working', utilization: undefined },
    ]);
    expect(cars.map((car) => car.id)).toEqual([3, 1, 2]);
  });
});

describe('prices', () => {
  it('shows the USD base price in lira at the rate', () => {
    expect(listPriceTry(30, 35.4)).toBe(1062);
    expect(listPriceTry(30, null)).toBeNull();
    expect(listPriceTry(null, 35)).toBeNull();
  });

  it('offers the deepest active tier', () => {
    expect(bestTier(tiers)?.id).toBe(5);
    expect(discounted(1000, 35)).toBe(650);
    expect(bestTier([])).toBeNull();
  });

  it('colours the real rate against the list price', () => {
    expect(rateTone(1100, 1062)).toBe('above');
    expect(rateTone(1062, 1062)).toBe('above');
    expect(rateTone(900, 1062)).toBe('below');
    expect(rateTone(null, 1062)).toBe('none');
    expect(rateTone(900, null)).toBe('none');
  });
});

describe('the edit form', () => {
  it('round-trips a group and saves numbers as numbers, empty as null', () => {
    const form = toForm(group({ luggage: null }));
    expect(form.luggage).toBe('');
    expect(formPayload({ ...form, price: '45,5', deposit: '' })).toMatchObject({ price: 45.5, deposit: null, seats: 5, luggage: null });
  });

  it('lists what changed', () => {
    const base = toForm(group());
    expect(changedFields({ ...base, price: '35', name: ' Renault Clio ' }, base)).toEqual(['price']);
  });

  it('needs a brand, model, name and a price above zero', () => {
    expect(Object.keys(validateForm(EMPTY_FORM)).sort()).toEqual(['brand', 'model', 'name', 'price']);
    expect(validateForm({ ...toForm(group()), price: '0' }).price).toBe('Enter a price above zero.');
    expect(validateForm({ ...toForm(group()), seats: '2.5', min_age: '16' })).toEqual({ seats: 'Enter a whole number, or leave it empty.', min_age: 'Between 18 and 99.' });
    expect(validateForm(toForm(group()))).toEqual({});
  });
});

describe('pricing tiers', () => {
  it('rejects overlapping active tiers and bad numbers', () => {
    const drafts = toTierDrafts(tiers);
    expect(validateTiers(drafts)).toEqual({});
    const overlapping = drafts.map((draft) => (draft.id === 3 ? { ...draft, min_days: '10' } : draft));
    expect(validateTiers(overlapping)['tier-3']).toBe('Overlaps 5–14 days.');
    const broken = drafts.map((draft) => (draft.id === 1 ? { ...draft, discount_percent: '120' } : draft));
    expect(validateTiers(broken)['tier-1']).toBe('The discount is 0 to 100%.');
  });

  it('writes only what changed: edits, new tiers and removed ones', () => {
    const drafts = toTierDrafts(tiers)
      .filter((draft) => draft.id !== 6)
      .map((draft) => (draft.id === 3 ? { ...draft, discount_percent: '15' } : draft));
    drafts.push({ key: 'new-1', id: null, min_days: '31', max_days: '90', discount_percent: '25', is_active: true });
    expect(tierChanges(tiers, drafts)).toEqual({
      inserts: [{ min_days: 31, max_days: 90, discount_percent: 25, is_active: true }],
      updates: [{ id: 3, min_days: 15, max_days: 30, discount_percent: 15, is_active: true }],
      deletes: [6],
    });
    expect(tierDraftChangeCount(tiers, drafts)).toBe(3);
    expect(tierDraftChangeCount(tiers, toTierDrafts(tiers))).toBe(0);
  });
});

describe('the image', () => {
  const file = (type: string, size = 1000) => ({ type, size, name: 'x' } as File);

  it('takes a JPG, PNG or WebP under 5 MB', () => {
    expect(imageProblem(file('image/png'))).toBeNull();
    expect(imageProblem(file('image/gif'))).toBe('Use a JPG, PNG or WebP image.');
    expect(imageProblem(file('image/jpeg', 6 * 1024 * 1024))).toBe('The image must be under 5 MB.');
  });

  it('uploads to a new path each time, named after the group', () => {
    expect(imagePath('Citroën C4 X', file('image/webp'), 123)).toBe('model-groups/citroen-c4-x-123.webp');
    expect(imagePath('', file('image/jpeg'), 5)).toBe('model-groups/model-group-5.jpg');
  });
});
