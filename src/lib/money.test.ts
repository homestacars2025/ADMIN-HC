import { csvCell, formatMoney, parseAmount } from './money';

describe('formatMoney', () => {
  it('writes each currency with its own symbol', () => {
    expect(formatMoney(1250.5)).toBe('₺1.250,50');
    expect(formatMoney(1250.5, 'USD')).toBe('$1,250.50');
    expect(formatMoney(1250.5, 'EUR')).toBe('€1,250.50');
  });

  it('puts the minus before the symbol', () => {
    expect(formatMoney(-30, 'USD')).toBe('−$30.00');
  });
});

describe('parseAmount', () => {
  it('reads the ways people type money here', () => {
    expect(parseAmount('1250')).toBe(1250);
    expect(parseAmount('1250.50')).toBe(1250.5);
    expect(parseAmount('1250,50')).toBe(1250.5);
    expect(parseAmount('1.250,50')).toBe(1250.5);
    expect(parseAmount('1,250.50')).toBe(1250.5);
    expect(parseAmount(' 90 ')).toBe(90);
  });

  it('reads a single separator before three digits as thousands', () => {
    expect(parseAmount('1.250')).toBe(1250);
    expect(parseAmount('1,250')).toBe(1250);
    expect(parseAmount('12.500')).toBe(12500);
    expect(parseAmount('1.25')).toBe(1.25);
    expect(parseAmount('12,50')).toBe(12.5);
  });

  it('refuses nothing, zero and negatives', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('stops a spreadsheet running a cell as a formula', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+90555')).toBe("'+90555");
  });

  it('leaves numbers alone and empties empty', () => {
    expect(csvCell(-20)).toBe('-20');
    expect(csvCell(null)).toBe('');
  });
});
