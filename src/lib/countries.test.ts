import { nationalityToFlag, whatsAppUrl } from './countries';

/** Every nationality in the live customers table on 2026-10-31. */
const LIVE_NATIONALITIES = [
  'Turkey', 'Libya', 'Syria', 'Jordan', 'Yemen', 'Lebanon', 'Algeria', 'Israel', 'Egypt', 'Tunisia', 'Iraq',
  'Palestine', 'Australia', 'United Kingdom', 'Canada', 'South Africa', 'Morocco', 'Afghanistan', 'Uzbekistan',
  'Kuwait', 'Saudi Arabia', 'Nigeria', 'Austria', 'United States', 'Spain', 'Sudan', 'Cuba', 'Kenya',
  'Kazakhstan', 'Albania', 'Pakistan', 'Qatar',
];

describe('nationalityToFlag', () => {
  it('has a real flag for every nationality we hold', () => {
    LIVE_NATIONALITIES.forEach((nationality) => {
      expect([nationality, nationalityToFlag(nationality).flag.length]).toEqual([nationality, 4]);
    });
  });

  it('reads any case and stray spaces', () => {
    expect(nationalityToFlag(' TURKEY ').flag).toBe('🇹🇷');
    expect(nationalityToFlag('Türkiye').flag).toBe('🇹🇷');
    expect(nationalityToFlag('palestine').flag).toBe('🇵🇸');
  });

  it('shows no flag at all when it does not know the country', () => {
    expect(nationalityToFlag('Atlantis')).toEqual({ flag: '', label: 'Atlantis' });
    expect(nationalityToFlag(null)).toEqual({ flag: '', label: '—' });
  });
});

describe('whatsAppUrl', () => {
  it('drops the plus and any 00 prefix', () => {
    expect(whatsAppUrl('+90 536 406 77 30')).toBe('https://wa.me/905364067730');
    expect(whatsAppUrl('00966501234567')).toBe('https://wa.me/966501234567');
    expect(whatsAppUrl('12')).toBeNull();
  });
});
