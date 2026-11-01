import { formatFuelRange, fuelRangeDigits } from './fuelRange';

describe('formatFuelRange', () => {
  it('shows km, from text or a number', () => {
    expect(formatFuelRange('280')).toBe('280 km');
    expect(formatFuelRange(544)).toBe('544 km');
    expect(formatFuelRange(' 120 ')).toBe('120 km');
  });

  it('keeps a real zero', () => {
    expect(formatFuelRange('0')).toBe('0 km');
    expect(formatFuelRange(0)).toBe('0 km');
  });

  it('separates thousands', () => {
    expect(formatFuelRange('1280')).toBe('1,280 km');
  });

  it('shows a dash when nothing was recorded', () => {
    expect(formatFuelRange(null)).toBe('—');
    expect(formatFuelRange(undefined)).toBe('—');
    expect(formatFuelRange('  ')).toBe('—');
  });

  it('never adds km to text that is not a reading', () => {
    expect(formatFuelRange('n/a')).toBe('n/a');
  });
});

describe('fuelRangeDigits', () => {
  it('keeps whole km only', () => {
    expect(fuelRangeDigits('280')).toBe('280');
    expect(fuelRangeDigits('-5')).toBe('5');
    expect(fuelRangeDigits('12.5')).toBe('125');
    expect(fuelRangeDigits('')).toBe('');
  });
});
