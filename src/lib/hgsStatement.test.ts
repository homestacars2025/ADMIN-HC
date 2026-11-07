import {
  overlap,
  statementDay,
  statementFileName,
  statementLanguage,
  statementLines,
  statementMoney,
  statementNumber,
  statementPeriod,
  statementTotals,
} from './hgsStatement';
import { isRtl, STATEMENT_TEXT } from './hgsStatementText';
import type { HgsTransitDetail } from './hgs';

const transit = (id: number, at: string, amount: number, over: Partial<HgsTransitDetail> = {}): HgsTransitDetail => ({
  id, day: at.slice(0, 10), at, entry: 'ORHANLI', exit: 'KURTKÖY SGS', road: 'İSTANBUL-ANKARA OTOYOLU', roadType: 'public', amount,
  bookingId: null, bookingNumber: null, bookingMonth: null, customerId: null, customerName: null, ...over,
});

describe('the statement', () => {
  it('is numbered and named from the plate, the days and the language', () => {
    expect(statementNumber('34 HZY 380', '2026-11-07')).toBe('HGS-261107-34HZY380');
    expect(statementFileName('34 hzy 380', { from: '2026-11-01', to: '2026-11-06' }, 'tr')).toBe('HGS-34HZY380-2026-11-01_2026-11-06-tr.pdf');
  });

  it("writes in the customer's language when it's one of the four, else Arabic", () => {
    expect(statementLanguage('tr')).toBe('tr');
    expect(statementLanguage('EN')).toBe('en');
    expect(statementLanguage('de')).toBe('ar');
    expect(statementLanguage(null)).toBe('ar');
  });

  it('with a booking, keeps only the days the range and the booking share', () => {
    const range = { from: '2026-11-01', to: '2026-11-10' };
    expect(statementPeriod(range, null)).toEqual(range);
    expect(statementPeriod(range, { start: '2026-10-28', end: '2026-11-04' })).toEqual({ from: '2026-11-01', to: '2026-11-04' });
    expect(statementPeriod(range, { start: '2026-11-11', end: '2026-11-14' })).toBeNull();
    expect(overlap(range, { from: '2026-11-10', to: '2026-11-20' })).toEqual({ from: '2026-11-10', to: '2026-11-10' });
  });

  it('lists the period oldest first in Istanbul time, private roads left out when asked', () => {
    const transits = [
      transit(3, '2026-11-03T11:04:00+00:00', 96, { roadType: 'private' }),
      transit(1, '2026-11-01T22:30:00+00:00', 148.5, { day: '2026-11-02' }),
      transit(2, '2026-11-02T05:00:00+00:00', 59),
      transit(4, '2026-11-09T09:00:00+00:00', 40),
    ];
    const period = { from: '2026-11-01', to: '2026-11-05' };
    expect(statementLines(transits, period, true).map((line) => [line.id, line.time])).toEqual([[1, '01:30'], [2, '08:00'], [3, '14:04']]);
    expect(statementLines(transits, period, false).map((line) => line.id)).toEqual([1, 2]);
  });

  it('adds up the amount, the passes and the days with passes', () => {
    const lines = statementLines([
      transit(1, '2026-11-02T08:00:00+00:00', 148.5),
      transit(2, '2026-11-02T09:00:00+00:00', 0.1),
      transit(3, '2026-11-03T09:00:00+00:00', 0.2),
    ], { from: '2026-11-01', to: '2026-11-30' }, true);
    expect(statementTotals(lines)).toEqual({ amount: 148.8, passes: 3, days: 2 });
  });

  it('writes days and lira the same way in every language', () => {
    expect(statementDay('2026-11-06')).toBe('06.11.2026');
    expect(statementMoney(1355)).toBe('₺1.355,00');
    expect(statementMoney(-12.5)).toBe('−₺12,50');
  });

  it('has every line in all four languages, Arabic right to left', () => {
    const keys = Object.keys(STATEMENT_TEXT.en);
    (['ar', 'tr', 'fr'] as const).forEach((lang) => {
      expect(Object.keys(STATEMENT_TEXT[lang])).toEqual(keys);
      expect(Object.values(STATEMENT_TEXT[lang]).every((value) => value.trim().length > 0)).toBe(true);
    });
    expect(STATEMENT_TEXT.en.page).toContain('{x}');
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('fr')).toBe(false);
  });
});
