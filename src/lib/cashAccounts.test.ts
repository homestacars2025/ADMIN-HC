import { cleanIban, formatIban, validIban } from './cashAccounts';

jest.mock('./supabase', () => ({ supabase: {} }));

describe('IBAN', () => {
  it('stores it without spaces, in capitals', () => {
    expect(cleanIban('tr33 0006 1005')).toBe('TR3300061005');
  });

  it('accepts an empty one or a real shape', () => {
    expect(validIban('')).toBe(true);
    expect(validIban('TR330006100519786457841326')).toBe(true);
    expect(validIban('12345')).toBe(false);
  });

  it('prints in fours', () => {
    expect(formatIban('TR3300061005')).toBe('TR33 0006 1005');
  });
});
