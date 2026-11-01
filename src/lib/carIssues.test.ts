import { daysOpen, daysTone, filterIssues, issueFolder, issueStats, withResolutionNote, type Issue } from './carIssues';

jest.mock('./supabase', () => ({ supabase: {} }));

const issue = (over: Partial<Issue> = {}): Issue => ({
  id: 1, car_id: 1, plate_number: '34ABC123', model_name: 'Fiat Egea', type: 'damage', status: 'open',
  description: 'Scratch on the door', damage_photos: [], repair_photos: [], booking_id: null, booking_number: null,
  customer_id: null, customer_name: 'Yusuf Demir', discovered_at: '2026-10-20', discovered_by: null,
  discovered_by_name: null, resolved_at: null, days_to_resolve: null, ...over,
});

describe('days open', () => {
  it('counts whole days', () => {
    expect(daysOpen({ discovered_at: '2026-10-29' }, '2026-11-01')).toBe(3);
    expect(daysOpen({ discovered_at: '2026-11-01' }, '2026-11-01')).toBe(0);
  });

  it('never goes negative for a date in the future', () => {
    expect(daysOpen({ discovered_at: '2026-11-05' }, '2026-11-01')).toBe(0);
  });

  it('turns amber after 3 days and red after 7', () => {
    expect(daysTone(3)).toBe('neutral');
    expect(daysTone(4)).toBe('amber');
    expect(daysTone(7)).toBe('amber');
    expect(daysTone(8)).toBe('red');
  });
});

describe('issueStats', () => {
  const rows = [
    issue({ id: 1 }),
    issue({ id: 2, type: 'accident', status: 'resolved', resolved_at: '2026-11-01', days_to_resolve: 4 }),
    issue({ id: 3, status: 'resolved', resolved_at: '2026-09-01', days_to_resolve: 11 }),
  ];

  it('counts each tile', () => {
    expect(issueStats(rows, '2026-11')).toEqual({ open: 1, resolvedThisMonth: 1, accidents: 1, averageDays: 7.5 });
  });

  it('has no average with nothing resolved', () => {
    expect(issueStats([issue()], '2026-11').averageDays).toBeNull();
  });

  it('counts a same-day repair as 0 days', () => {
    expect(issueStats([issue({ days_to_resolve: 0, status: 'resolved' })], '2026-11').averageDays).toBe(0);
  });
});

describe('filterIssues', () => {
  const rows = [issue({ id: 1 }), issue({ id: 2, type: 'sound', status: 'resolved', plate_number: '06XYZ9', customer_name: null, description: null })];
  const ids = (list: Issue[]) => list.map((item) => item.id);

  it('filters by status and type', () => {
    expect(ids(filterIssues(rows, 'open', 'all', ''))).toEqual([1]);
    expect(ids(filterIssues(rows, 'all', 'sound', ''))).toEqual([2]);
    expect(ids(filterIssues(rows, 'open', 'sound', ''))).toEqual([]);
  });

  it('searches plate, model, customer and description', () => {
    expect(ids(filterIssues(rows, 'all', 'all', '06xy'))).toEqual([2]);
    expect(ids(filterIssues(rows, 'all', 'all', 'scratch'))).toEqual([1]);
    expect(ids(filterIssues(rows, 'all', 'all', 'yusuf'))).toEqual([1]);
  });
});

describe('withResolutionNote', () => {
  it('adds the note after the description', () => {
    expect(withResolutionNote('Scratch', 'Painted at the garage')).toBe('Scratch\n\nResolution note: Painted at the garage');
  });

  it('works with no description', () => {
    expect(withResolutionNote(null, 'Done')).toBe('Resolution note: Done');
  });

  it('leaves the description alone with no note', () => {
    expect(withResolutionNote('Scratch', '   ')).toBe('Scratch');
    expect(withResolutionNote(null, '')).toBeNull();
  });
});

describe('issueFolder', () => {
  it('reuses the folder of the damage photos', () => {
    const url = 'https://x.supabase.co/storage/v1/object/public/car-issues/34abc123/uuid-1/damage/1.jpg?t=1';
    expect(issueFolder([url], '34 ABC 123')).toBe('34abc123/uuid-1');
  });

  it('makes a new one for a row with no photos', () => {
    expect(issueFolder([], '34 ABC 123')).toMatch(/^34abc123\/.+/);
  });

  it('refuses a path that climbs out of the bucket', () => {
    expect(issueFolder(['https://x/public/car-issues/../secret/damage/1.jpg'], '34ABC')).toMatch(/^34abc\/.+/);
  });
});
