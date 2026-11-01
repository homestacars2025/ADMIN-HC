import { buildCompliance, carIssues, issueLabel, summarize, summaryLabel, type RegistrationDates } from './carCompliance';

const TODAY = '2026-11-01';
const reg = (car_id: number, insurance_expiry: string | null, inspection_expiry: string | null): RegistrationDates => ({ car_id, insurance_expiry, inspection_expiry });
const car = (id: number, plate_number: string) => ({ id, plate_number, model: 'Fiat Egea' });

describe('carIssues', () => {
  it('finds nothing wrong with future dates', () => {
    expect(carIssues(reg(1, '2027-01-01', '2027-01-01'), TODAY)).toEqual([]);
  });

  it('still counts a car as covered on the day its date falls', () => {
    expect(carIssues(reg(1, TODAY, TODAY), TODAY)).toEqual([]);
  });

  it('treats the day after as expired', () => {
    expect(carIssues(reg(1, '2026-10-31', '2027-01-01'), TODAY)).toEqual([{ doc: 'insurance', state: 'expired', daysAgo: 1 }]);
  });

  it('treats an empty date as missing', () => {
    expect(carIssues(reg(1, '2027-01-01', null), TODAY)).toEqual([{ doc: 'inspection', state: 'missing', daysAgo: null }]);
  });

  it('treats a car with no registration row as missing both', () => {
    expect(carIssues(undefined, TODAY).map((issue) => issue.state)).toEqual(['missing', 'missing']);
  });

  it('crosses a year correctly', () => {
    expect(carIssues(reg(1, '2025-11-01', '2027-01-01'), TODAY)[0].daysAgo).toBe(365);
  });
});

describe('issueLabel', () => {
  it('says what is wrong in plain words', () => {
    expect(issueLabel({ doc: 'insurance', state: 'expired', daysAgo: 12 })).toBe('Insurance expired 12 days ago');
    expect(issueLabel({ doc: 'insurance', state: 'expired', daysAgo: 1 })).toBe('Insurance expired 1 day ago');
    expect(issueLabel({ doc: 'inspection', state: 'missing', daysAgo: null })).toBe('Inspection date not recorded');
  });
});

describe('buildCompliance', () => {
  const cars = [car(1, '34 OK 1'), car(2, '34 NODATE'), car(3, '34 EXP 10'), car(4, '34 EXP 100'), car(5, '34 NOROW'), car(6, '34 BOTH')];
  const registrations = [
    reg(1, '2027-01-01', '2027-01-01'),
    reg(2, '2027-01-01', null),
    reg(3, '2026-10-22', '2027-01-01'),
    reg(4, '2026-07-24', '2027-01-01'),
    reg(6, '2026-10-30', null),
    reg(99, null, null),
  ];
  const result = buildCompliance(cars, registrations, TODAY);

  it('leaves out healthy cars, and cars that are not in the list', () => {
    expect(result.map((item) => item.id)).not.toContain(1);
    expect(result.map((item) => item.id)).not.toContain(99);
  });

  it('puts the longest expired first, then missing dates by plate', () => {
    expect(result.map((item) => item.plate_number)).toEqual(['34 EXP 100', '34 EXP 10', '34 BOTH', '34 NODATE', '34 NOROW']);
  });

  it('counts a car with an expired and a missing date as expired, and keeps both issues', () => {
    const both = result.find((item) => item.id === 6);
    expect(both?.severity).toBe('expired');
    expect(both?.issues).toHaveLength(2);
  });

  it('never counts a car twice', () => {
    expect(summarize(result)).toEqual({ expired: 3, missing: 2, total: 5, tone: 'red' });
  });
});

describe('summary', () => {
  it('is amber when nothing has expired', () => {
    const onlyMissing = buildCompliance([car(1, 'A')], [reg(1, null, '2027-01-01')], TODAY);
    expect(summarize(onlyMissing).tone).toBe('amber');
    expect(summaryLabel(summarize(onlyMissing))).toBe('1 no date');
  });

  it('shows both sides, and leaves out an empty one', () => {
    expect(summaryLabel({ expired: 8, missing: 7, total: 15, tone: 'red' })).toBe('8 expired · 7 no date');
    expect(summaryLabel({ expired: 2, missing: 0, total: 2, tone: 'red' })).toBe('2 expired');
  });
});
