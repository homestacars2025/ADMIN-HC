import { convertAmount, effectiveCurrency, formatInCurrency, rateNote, rateToTry, type RateRow } from './money';

const RATES: RateRow[] = [
  { currency: 'USD', rate_to_try: 50, updated_at: '2026-11-09T08:15:56.648' },
  { currency: 'EUR', rate_to_try: 56.2, updated_at: '2026-11-09T08:16:17.219' },
];

describe('showing lira amounts in the top-bar currency', () => {
  it('converts through lira, both ways and between currencies', () => {
    expect(rateToTry('TRY', RATES)).toBe(1);
    expect(convertAmount(5000, 'TRY', 'USD', RATES)).toBe(100);
    expect(convertAmount(100, 'USD', 'TRY', RATES)).toBe(5000);
    expect(convertAmount(100, 'USD', 'EUR', RATES)).toBeCloseTo(88.97, 2);
    expect(convertAmount(100, 'GBP', 'TRY', RATES)).toBeNull();
  });

  it('stays in lira while the picked currency has no rate', () => {
    expect(effectiveCurrency('USD', RATES)).toBe('USD');
    expect(effectiveCurrency('USD', [])).toBe('TRY');
    expect(effectiveCurrency('LYD', RATES)).toBe('TRY');
  });

  it('formats with the symbol and two decimals, Turkish digits for lira', () => {
    expect(formatInCurrency(192037, 'TRY')).toBe('₺192.037,00');
    expect(formatInCurrency(3840.74, 'USD')).toBe('$3,840.74');
    expect(formatInCurrency(-12.5, 'EUR')).toBe('−€12.50');
    expect(formatInCurrency(12.5, 'EUR', { signed: true })).toBe('+€12.50');
    expect(formatInCurrency(-0.001, 'USD')).toBe('$0.00');
  });

  it('says which rate converted the amounts, only when they are not in lira', () => {
    expect(rateNote('USD', RATES)).toBe('Converted at \u20661 USD = 50,00 ₺\u2069 (9 Nov 2026)');
    expect(rateNote('EUR', RATES)).toBe('Converted at \u20661 EUR = 56,20 ₺\u2069 (9 Nov 2026)');
    expect(rateNote('TRY', RATES)).toBeNull();
  });
});
