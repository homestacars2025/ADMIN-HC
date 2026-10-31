export interface Country { code: string; name: string; dial: string; flag: string; }

export const COUNTRIES: Country[] = [
  { code: 'TR', name: 'Turkey',               dial: '+90',  flag: '🇹🇷' },
  { code: 'US', name: 'United States',        dial: '+1',   flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom',       dial: '+44',  flag: '🇬🇧' },
  { code: 'DE', name: 'Germany',              dial: '+49',  flag: '🇩🇪' },
  { code: 'FR', name: 'France',               dial: '+33',  flag: '🇫🇷' },
  { code: 'IT', name: 'Italy',                dial: '+39',  flag: '🇮🇹' },
  { code: 'ES', name: 'Spain',                dial: '+34',  flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands',          dial: '+31',  flag: '🇳🇱' },
  { code: 'BE', name: 'Belgium',              dial: '+32',  flag: '🇧🇪' },
  { code: 'CH', name: 'Switzerland',          dial: '+41',  flag: '🇨🇭' },
  { code: 'AT', name: 'Austria',              dial: '+43',  flag: '🇦🇹' },
  { code: 'PL', name: 'Poland',               dial: '+48',  flag: '🇵🇱' },
  { code: 'RU', name: 'Russia',               dial: '+7',   flag: '🇷🇺' },
  { code: 'UA', name: 'Ukraine',              dial: '+380', flag: '🇺🇦' },
  { code: 'GR', name: 'Greece',               dial: '+30',  flag: '🇬🇷' },
  { code: 'RO', name: 'Romania',              dial: '+40',  flag: '🇷🇴' },
  { code: 'BG', name: 'Bulgaria',             dial: '+359', flag: '🇧🇬' },
  { code: 'HR', name: 'Croatia',              dial: '+385', flag: '🇭🇷' },
  { code: 'RS', name: 'Serbia',               dial: '+381', flag: '🇷🇸' },
  { code: 'SE', name: 'Sweden',               dial: '+46',  flag: '🇸🇪' },
  { code: 'NO', name: 'Norway',               dial: '+47',  flag: '🇳🇴' },
  { code: 'DK', name: 'Denmark',              dial: '+45',  flag: '🇩🇰' },
  { code: 'FI', name: 'Finland',              dial: '+358', flag: '🇫🇮' },
  { code: 'SA', name: 'Saudi Arabia',         dial: '+966', flag: '🇸🇦' },
  { code: 'AE', name: 'UAE',                  dial: '+971', flag: '🇦🇪' },
  { code: 'QA', name: 'Qatar',                dial: '+974', flag: '🇶🇦' },
  { code: 'KW', name: 'Kuwait',               dial: '+965', flag: '🇰🇼' },
  { code: 'BH', name: 'Bahrain',              dial: '+973', flag: '🇧🇭' },
  { code: 'OM', name: 'Oman',                 dial: '+968', flag: '🇴🇲' },
  { code: 'IQ', name: 'Iraq',                 dial: '+964', flag: '🇮🇶' },
  { code: 'IR', name: 'Iran',                 dial: '+98',  flag: '🇮🇷' },
  { code: 'SY', name: 'Syria',                dial: '+963', flag: '🇸🇾' },
  { code: 'JO', name: 'Jordan',               dial: '+962', flag: '🇯🇴' },
  { code: 'LB', name: 'Lebanon',              dial: '+961', flag: '🇱🇧' },
  { code: 'EG', name: 'Egypt',                dial: '+20',  flag: '🇪🇬' },
  { code: 'MA', name: 'Morocco',              dial: '+212', flag: '🇲🇦' },
  { code: 'DZ', name: 'Algeria',              dial: '+213', flag: '🇩🇿' },
  { code: 'TN', name: 'Tunisia',              dial: '+216', flag: '🇹🇳' },
  { code: 'LY', name: 'Libya',                dial: '+218', flag: '🇱🇾' },
  { code: 'PK', name: 'Pakistan',             dial: '+92',  flag: '🇵🇰' },
  { code: 'IN', name: 'India',                dial: '+91',  flag: '🇮🇳' },
  { code: 'BD', name: 'Bangladesh',           dial: '+880', flag: '🇧🇩' },
  { code: 'AF', name: 'Afghanistan',          dial: '+93',  flag: '🇦🇫' },
  { code: 'AZ', name: 'Azerbaijan',           dial: '+994', flag: '🇦🇿' },
  { code: 'KZ', name: 'Kazakhstan',           dial: '+7',   flag: '🇰🇿' },
  { code: 'UZ', name: 'Uzbekistan',           dial: '+998', flag: '🇺🇿' },
  { code: 'TM', name: 'Turkmenistan',         dial: '+993', flag: '🇹🇲' },
  { code: 'GE', name: 'Georgia',              dial: '+995', flag: '🇬🇪' },
  { code: 'AM', name: 'Armenia',              dial: '+374', flag: '🇦🇲' },
  { code: 'CN', name: 'China',                dial: '+86',  flag: '🇨🇳' },
  { code: 'JP', name: 'Japan',                dial: '+81',  flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea',          dial: '+82',  flag: '🇰🇷' },
  { code: 'AU', name: 'Australia',            dial: '+61',  flag: '🇦🇺' },
  { code: 'CA', name: 'Canada',               dial: '+1',   flag: '🇨🇦' },
  { code: 'BR', name: 'Brazil',               dial: '+55',  flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico',               dial: '+52',  flag: '🇲🇽' },
  { code: 'AR', name: 'Argentina',            dial: '+54',  flag: '🇦🇷' },
  { code: 'ZA', name: 'South Africa',         dial: '+27',  flag: '🇿🇦' },
  { code: 'NG', name: 'Nigeria',              dial: '+234', flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya',                dial: '+254', flag: '🇰🇪' },
  { code: 'GH', name: 'Ghana',                dial: '+233', flag: '🇬🇭' },
  { code: 'ET', name: 'Ethiopia',             dial: '+251', flag: '🇪🇹' },
  { code: 'TZ', name: 'Tanzania',             dial: '+255', flag: '🇹🇿' },
  { code: 'NZ', name: 'New Zealand',          dial: '+64',  flag: '🇳🇿' },
  { code: 'SG', name: 'Singapore',            dial: '+65',  flag: '🇸🇬' },
  { code: 'MY', name: 'Malaysia',             dial: '+60',  flag: '🇲🇾' },
  { code: 'ID', name: 'Indonesia',            dial: '+62',  flag: '🇮🇩' },
  { code: 'TH', name: 'Thailand',             dial: '+66',  flag: '🇹🇭' },
  { code: 'VN', name: 'Vietnam',              dial: '+84',  flag: '🇻🇳' },
  { code: 'PH', name: 'Philippines',          dial: '+63',  flag: '🇵🇭' },
];

// Sorted longest-first so "+1268" matches before "+1"
const COUNTRIES_BY_DIAL_LEN = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

export function parsePhone(phone: string | null): { dial: string; number: string } {
  if (!phone) return { dial: '+90', number: '' };
  const s = phone.trim().replace(/\s+/g, '');
  if (!s.startsWith('+')) return { dial: '+90', number: s };
  for (const c of COUNTRIES_BY_DIAL_LEN) {
    if (s.startsWith(c.dial)) {
      return { dial: c.dial, number: s.slice(c.dial.length) };
    }
  }
  return { dial: '+90', number: s };
}
