import {
  buildPhotoList,
  changedFields,
  deletePhoto,
  docObjectPath,
  DOC_SLOTS,
  expiryChip,
  fieldUpdates,
  makePrimary,
  matchesSpareKey,
  mirrorOf,
  movePhoto,
  parseSpareKeyFilter,
  persistPhotos,
  photoObjectPath,
  removeDoc,
  storagePathOf,
  validateFields,
  versionedUrl,
  type CarFields,
  type CarPhoto,
  type PhotoRow,
} from './carEditor';

interface Call { table: string; op: string; values?: unknown; filters: [string, unknown][] }

const mockCalls: Call[] = [];
const mockRemoved: { bucket: string; paths: string[] }[] = [];
let mockNextId = 100;
let mockRegistrationRows: { id: string }[] = [];

jest.mock('./session', () => ({ ensureFreshSession: async () => 'token' }));
jest.mock('./supabase', () => {
  const builder = (table: string) => {
    const call: Call = { table, op: 'select', filters: [] };
    let single = false;
    const chain = {
      select: () => chain,
      update: (values: unknown) => { call.op = 'update'; call.values = values; return chain; },
      insert: (values: unknown) => { call.op = 'insert'; call.values = values; return chain; },
      delete: () => { call.op = 'delete'; return chain; },
      eq: (column: string, value: unknown) => { call.filters.push([column, value]); return chain; },
      limit: () => chain,
      single: () => { single = true; return chain; },
      then: (resolve: (value: unknown) => unknown) => {
        mockCalls.push(call);
        if (call.op === 'insert' && single) { mockNextId += 1; return resolve({ data: { id: mockNextId }, error: null }); }
        if (call.op === 'select' && table === 'cars_registration') return resolve({ data: mockRegistrationRows, error: null });
        return resolve({ data: [{ id: 1 }], error: null });
      },
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => builder(table),
      storage: {
        from: (bucket: string) => ({
          remove: async (paths: string[]) => { mockRemoved.push({ bucket, paths }); return { error: null }; },
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
        }),
      },
    },
  };
});

const BASE = 'https://x.supabase.co/storage/v1/object/public';
const row = (over: Partial<PhotoRow>): PhotoRow => ({ id: 1, car_id: 7, file_path: `${BASE}/cars-photos/car_7/1_a.jpg`, is_primary: false, sort_order: 0, created_at: '2026-11-01T10:00:00Z', ...over });
const photo = (url: string, id: number | null = null, dead = false): CarPhoto => ({ id, url, name: url, uploadedAt: '', dead });

beforeEach(() => {
  mockCalls.length = 0;
  mockRemoved.length = 0;
  mockNextId = 100;
  mockRegistrationRows = [{ id: 'r1' }];
});

describe('expiryChip', () => {
  const today = '2026-11-05';
  it('is grey with no date', () => {
    expect(expiryChip(null, today)).toEqual({ tone: 'grey', label: 'Not set', days: null });
  });
  it('is green past 60 days, amber from 15 to 60, red under 15', () => {
    expect(expiryChip('2027-01-05', today)).toMatchObject({ tone: 'green', days: 61, label: '61 days left' });
    expect(expiryChip('2027-01-04', today)).toMatchObject({ tone: 'amber', days: 60 });
    expect(expiryChip('2026-11-20', today)).toMatchObject({ tone: 'amber', days: 15 });
    expect(expiryChip('2026-11-19', today)).toMatchObject({ tone: 'red', days: 14 });
    expect(expiryChip('2026-11-06', today)).toMatchObject({ tone: 'red', label: '1 day left' });
  });
  it('says today, and how long ago once expired', () => {
    expect(expiryChip('2026-11-05', today)).toMatchObject({ tone: 'red', label: 'Expires today' });
    expect(expiryChip('2026-11-02T00:00:00', today)).toMatchObject({ tone: 'red', label: 'Expired 3 days ago', days: -3 });
  });
});

describe('document paths', () => {
  it('keeps the old object names and versions the link', () => {
    const kasko = DOC_SLOTS.find((slot) => slot.column === 'kasko')!;
    expect(docObjectPath(kasko, ' 34abc123 ')).toBe('K-34ABC123');
    expect(versionedUrl(`${BASE}/doc/K-34ABC123?v=1`, 2)).toBe(`${BASE}/doc/K-34ABC123?v=2`);
  });
  it('finds the object path in a link, decoded and without the version', () => {
    expect(storagePathOf(`${BASE}/doc/R-34%20AB?v=9`, 'doc')).toBe('R-34 AB');
    expect(storagePathOf(`${BASE}/cars-photos/34X%20-%20Fiat/1_a.jpg`, 'cars-photos')).toBe('34X - Fiat/1_a.jpg');
    expect(storagePathOf('https://elsewhere.com/a.pdf', 'doc')).toBeNull();
  });
  it('puts new photos under the car id', () => {
    expect(photoObjectPath(7, 'IMG 1 (2).jpg', 123)).toBe('car_7/123_IMG_1_2_.jpg');
  });
});

describe('buildPhotoList', () => {
  const dead = row({ id: 9, file_path: `${BASE}/car_photos/car_7/old.jpg`, is_primary: true });
  const mirror = [{ url: `${BASE}/cars-photos/a.jpg`, name: 'a.jpg', uploaded_at: 'x' }, { url: `${BASE}/cars-photos/b.jpg`, name: 'b.jpg', uploaded_at: 'y' }];

  it('shows the usable rows, primary first, then the dead ones', () => {
    const list = buildPhotoList([row({ id: 2, sort_order: 0 }), dead, row({ id: 3, sort_order: 1, is_primary: true, file_path: `${BASE}/cars-photos/p.jpg` })], mirror);
    expect(list.map((item) => [item.id, item.dead])).toEqual([[3, false], [2, false], [9, true]]);
  });

  it('falls back to the mirror when no row is usable, keeping the dead rows to remove', () => {
    const list = buildPhotoList([dead], mirror);
    expect(list.map((item) => [item.id, item.url.split('/').pop(), item.dead])).toEqual([[null, 'a.jpg', false], [null, 'b.jpg', false], [9, 'old.jpg', true]]);
    expect(mirrorOf(list).map((entry) => entry.name)).toEqual(['a.jpg', 'b.jpg']);
  });
});

describe('ordering', () => {
  const list = [photo('a'), photo('b'), photo('c'), photo('dead', 9, true)];
  it('moves a photo and keeps dead ones last', () => {
    expect(movePhoto(list, 2, 0).map((item) => item.url)).toEqual(['c', 'a', 'b', 'dead']);
    expect(movePhoto(list, 0, 3).map((item) => item.url)).toEqual(['b', 'c', 'a', 'dead']);
  });
  it('makes a photo primary by putting it first, never a dead one', () => {
    expect(makePrimary(list, 'b').map((item) => item.url)).toEqual(['b', 'a', 'c', 'dead']);
    expect(makePrimary(list, 'dead')).toBe(list);
  });
});

describe('persistPhotos', () => {
  it('clears the old primary first, writes the order, sets the new primary last and mirrors', async () => {
    const saved = await persistPhotos(7, [photo('dead', 9, true), photo(`${BASE}/cars-photos/a.jpg`, null), photo(`${BASE}/cars-photos/b.jpg`, 4)]);
    const photoCalls = mockCalls.filter((call) => call.table === 'car_photos');
    expect(photoCalls[0]).toMatchObject({ op: 'update', values: { is_primary: false }, filters: [['car_id', 7], ['is_primary', true]] });
    expect(photoCalls.find((call) => call.op === 'insert')?.values).toEqual({ car_id: 7, file_path: `${BASE}/cars-photos/a.jpg`, sort_order: 0, is_primary: false });
    expect(photoCalls.find((call) => call.filters[0]?.[1] === 4)?.values).toEqual({ sort_order: 1 });
    expect(photoCalls.find((call) => call.filters[0]?.[1] === 9)?.values).toEqual({ sort_order: 2 });
    expect(photoCalls[photoCalls.length - 1]).toMatchObject({ op: 'update', values: { is_primary: true }, filters: [['id', 101]] });
    const mirror = mockCalls[mockCalls.length - 1];
    expect(mirror).toMatchObject({ table: 'cars', op: 'update', filters: [['id', 7]] });
    expect((mirror.values as { car_photo_urls: { url: string }[] }).car_photo_urls.map((entry) => entry.url)).toEqual([`${BASE}/cars-photos/a.jpg`, `${BASE}/cars-photos/b.jpg`]);
    expect(saved.map((item) => item.id)).toEqual([101, 4, 9]);
  });

  it('deletes the row and the file in the live bucket only', async () => {
    const live = photo(`${BASE}/cars-photos/car_7/1_a.jpg`, 4);
    await deletePhoto(7, [live, photo(`${BASE}/cars-photos/b.jpg`, 5)], live);
    expect(mockCalls[0]).toMatchObject({ table: 'car_photos', op: 'delete', filters: [['id', 4]] });
    expect(mockRemoved).toEqual([{ bucket: 'cars-photos', paths: ['car_7/1_a.jpg'] }]);

    mockRemoved.length = 0;
    const dead = photo(`${BASE}/car_photos/car_7/old.jpg`, 9, true);
    await deletePhoto(7, [dead], dead);
    expect(mockRemoved).toEqual([]);
  });
});

describe('documents', () => {
  it('removes the link, then the file', async () => {
    await removeDoc(7, DOC_SLOTS[0], `${BASE}/doc/R-34ABC?v=5`);
    expect(mockCalls.map((call) => [call.table, call.op])).toEqual([['cars_registration', 'select'], ['cars_registration', 'update']]);
    expect(mockCalls[1].values).toEqual({ ruhsat_url: null });
    expect(mockRemoved).toEqual([{ bucket: 'doc', paths: ['R-34ABC'] }]);
  });
});

describe('spare key filter', () => {
  it('reads only yes or no from the URL', () => {
    expect(parseSpareKeyFilter('yes')).toBe('yes');
    expect(parseSpareKeyFilter('no')).toBe('no');
    expect(parseSpareKeyFilter('maybe')).toBeNull();
    expect(parseSpareKeyFilter(null)).toBeNull();
  });
  it('treats a car with no record as having no spare key', () => {
    expect(matchesSpareKey(true, 'yes')).toBe(true);
    expect(matchesSpareKey(undefined, 'yes')).toBe(false);
    expect(matchesSpareKey(null, 'no')).toBe(true);
    expect(matchesSpareKey(true, 'no')).toBe(false);
    expect(matchesSpareKey(false, null)).toBe(true);
  });
});

describe('fields', () => {
  const base: CarFields = { plate: '34ABC1', modelGroupId: '2', investorId: 'i1', manufactureYear: '2022', carPackage: '', insuranceExpiry: '2027-01-01', inspectionExpiry: '', purchaseDate: '', hasSpareKey: 'false' };

  it('sends only what changed, to the right table', () => {
    const next = { ...base, plate: '34abc2', manufactureYear: '2023', inspectionExpiry: '2027-03-01', carPackage: '  ' };
    expect(changedFields(next, base)).toEqual(['plate', 'manufactureYear', 'inspectionExpiry']);
    expect(fieldUpdates(next, base)).toEqual({
      car: { plate_number: '34ABC2' },
      registration: { manufacture_year: 2023, inspection_expiry: '2027-03-01' },
    });
    expect(fieldUpdates({ ...base, insuranceExpiry: '' }, base).registration).toEqual({ insurance_expiry: null });
  });

  it('saves the spare key as a boolean', () => {
    expect(fieldUpdates({ ...base, hasSpareKey: 'true' }, base)).toEqual({ car: {}, registration: { has_spare_key: true } });
    expect(fieldUpdates(base, { ...base, hasSpareKey: 'true' }).registration).toEqual({ has_spare_key: false });
  });

  it('needs a plate and a sensible year', () => {
    expect(validateFields({ ...base, plate: ' ' }, 2026)).toEqual({ plate: 'Plate number is required.' });
    expect(validateFields({ ...base, manufactureYear: '2028' }, 2026).manufactureYear).toBe('Enter a year between 1980 and 2027.');
    expect(validateFields({ ...base, manufactureYear: '' }, 2026)).toEqual({});
  });
});
