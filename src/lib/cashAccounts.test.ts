import { cleanIban, formatIban, inAccountFilter, validIban } from './cashAccounts';

jest.mock('./supabase', () => ({ supabase: {} }));

describe('inAccountFilter', () => {
  it('groups POS and gateways on one tile', () => {
    expect(inAccountFilter({ kind: 'gateway' }, 'pos')).toBe(true);
    expect(inAccountFilter({ kind: 'pos' }, 'pos')).toBe(true);
    expect(inAccountFilter({ kind: 'bank' }, 'pos')).toBe(false);
  });

  it('shows everything under All', () => {
    expect(inAccountFilter({ kind: 'other' }, 'all')).toBe(true);
  });
});

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
