import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

/** The country code picker and number field of the investor form, as it was on the old page. */

export interface Country { code: string; name: string; dial: string; flag: string; }

export const COUNTRIES: Country[] = [
  { code: 'TR', name: 'Turkey',                        dial: '+90',   flag: '🇹🇷' },
  { code: 'AF', name: 'Afghanistan',                   dial: '+93',   flag: '🇦🇫' },
  { code: 'AL', name: 'Albania',                       dial: '+355',  flag: '🇦🇱' },
  { code: 'DZ', name: 'Algeria',                       dial: '+213',  flag: '🇩🇿' },
  { code: 'AD', name: 'Andorra',                       dial: '+376',  flag: '🇦🇩' },
  { code: 'AO', name: 'Angola',                        dial: '+244',  flag: '🇦🇴' },
  { code: 'AG', name: 'Antigua and Barbuda',           dial: '+1268', flag: '🇦🇬' },
  { code: 'AR', name: 'Argentina',                     dial: '+54',   flag: '🇦🇷' },
  { code: 'AM', name: 'Armenia',                       dial: '+374',  flag: '🇦🇲' },
  { code: 'AU', name: 'Australia',                     dial: '+61',   flag: '🇦🇺' },
  { code: 'AT', name: 'Austria',                       dial: '+43',   flag: '🇦🇹' },
  { code: 'AZ', name: 'Azerbaijan',                    dial: '+994',  flag: '🇦🇿' },
  { code: 'BS', name: 'Bahamas',                       dial: '+1242', flag: '🇧🇸' },
  { code: 'BH', name: 'Bahrain',                       dial: '+973',  flag: '🇧🇭' },
  { code: 'BD', name: 'Bangladesh',                    dial: '+880',  flag: '🇧🇩' },
  { code: 'BB', name: 'Barbados',                      dial: '+1246', flag: '🇧🇧' },
  { code: 'BY', name: 'Belarus',                       dial: '+375',  flag: '🇧🇾' },
  { code: 'BE', name: 'Belgium',                       dial: '+32',   flag: '🇧🇪' },
  { code: 'BZ', name: 'Belize',                        dial: '+501',  flag: '🇧🇿' },
  { code: 'BJ', name: 'Benin',                         dial: '+229',  flag: '🇧🇯' },
  { code: 'BT', name: 'Bhutan',                        dial: '+975',  flag: '🇧🇹' },
  { code: 'BO', name: 'Bolivia',                       dial: '+591',  flag: '🇧🇴' },
  { code: 'BA', name: 'Bosnia and Herzegovina',        dial: '+387',  flag: '🇧🇦' },
  { code: 'BW', name: 'Botswana',                      dial: '+267',  flag: '🇧🇼' },
  { code: 'BR', name: 'Brazil',                        dial: '+55',   flag: '🇧🇷' },
  { code: 'BN', name: 'Brunei',                        dial: '+673',  flag: '🇧🇳' },
  { code: 'BG', name: 'Bulgaria',                      dial: '+359',  flag: '🇧🇬' },
  { code: 'BF', name: 'Burkina Faso',                  dial: '+226',  flag: '🇧🇫' },
  { code: 'BI', name: 'Burundi',                       dial: '+257',  flag: '🇧🇮' },
  { code: 'CV', name: 'Cabo Verde',                    dial: '+238',  flag: '🇨🇻' },
  { code: 'KH', name: 'Cambodia',                      dial: '+855',  flag: '🇰🇭' },
  { code: 'CM', name: 'Cameroon',                      dial: '+237',  flag: '🇨🇲' },
  { code: 'CA', name: 'Canada',                        dial: '+1',    flag: '🇨🇦' },
  { code: 'CF', name: 'Central African Republic',      dial: '+236',  flag: '🇨🇫' },
  { code: 'TD', name: 'Chad',                          dial: '+235',  flag: '🇹🇩' },
  { code: 'CL', name: 'Chile',                         dial: '+56',   flag: '🇨🇱' },
  { code: 'CN', name: 'China',                         dial: '+86',   flag: '🇨🇳' },
  { code: 'CO', name: 'Colombia',                      dial: '+57',   flag: '🇨🇴' },
  { code: 'KM', name: 'Comoros',                       dial: '+269',  flag: '🇰🇲' },
  { code: 'CG', name: 'Congo',                         dial: '+242',  flag: '🇨🇬' },
  { code: 'CD', name: 'Congo (DRC)',                   dial: '+243',  flag: '🇨🇩' },
  { code: 'CR', name: 'Costa Rica',                    dial: '+506',  flag: '🇨🇷' },
  { code: 'HR', name: 'Croatia',                       dial: '+385',  flag: '🇭🇷' },
  { code: 'CU', name: 'Cuba',                          dial: '+53',   flag: '🇨🇺' },
  { code: 'CY', name: 'Cyprus',                        dial: '+357',  flag: '🇨🇾' },
  { code: 'CZ', name: 'Czech Republic',                dial: '+420',  flag: '🇨🇿' },
  { code: 'DK', name: 'Denmark',                       dial: '+45',   flag: '🇩🇰' },
  { code: 'DJ', name: 'Djibouti',                      dial: '+253',  flag: '🇩🇯' },
  { code: 'DM', name: 'Dominica',                      dial: '+1767', flag: '🇩🇲' },
  { code: 'DO', name: 'Dominican Republic',            dial: '+1809', flag: '🇩🇴' },
  { code: 'EC', name: 'Ecuador',                       dial: '+593',  flag: '🇪🇨' },
  { code: 'EG', name: 'Egypt',                         dial: '+20',   flag: '🇪🇬' },
  { code: 'SV', name: 'El Salvador',                   dial: '+503',  flag: '🇸🇻' },
  { code: 'GQ', name: 'Equatorial Guinea',             dial: '+240',  flag: '🇬🇶' },
  { code: 'ER', name: 'Eritrea',                       dial: '+291',  flag: '🇪🇷' },
  { code: 'EE', name: 'Estonia',                       dial: '+372',  flag: '🇪🇪' },
  { code: 'SZ', name: 'Eswatini',                      dial: '+268',  flag: '🇸🇿' },
  { code: 'ET', name: 'Ethiopia',                      dial: '+251',  flag: '🇪🇹' },
  { code: 'FJ', name: 'Fiji',                          dial: '+679',  flag: '🇫🇯' },
  { code: 'FI', name: 'Finland',                       dial: '+358',  flag: '🇫🇮' },
  { code: 'FR', name: 'France',                        dial: '+33',   flag: '🇫🇷' },
  { code: 'GA', name: 'Gabon',                         dial: '+241',  flag: '🇬🇦' },
  { code: 'GM', name: 'Gambia',                        dial: '+220',  flag: '🇬🇲' },
  { code: 'GE', name: 'Georgia',                       dial: '+995',  flag: '🇬🇪' },
  { code: 'DE', name: 'Germany',                       dial: '+49',   flag: '🇩🇪' },
  { code: 'GH', name: 'Ghana',                         dial: '+233',  flag: '🇬🇭' },
  { code: 'GR', name: 'Greece',                        dial: '+30',   flag: '🇬🇷' },
  { code: 'GD', name: 'Grenada',                       dial: '+1473', flag: '🇬🇩' },
  { code: 'GT', name: 'Guatemala',                     dial: '+502',  flag: '🇬🇹' },
  { code: 'GN', name: 'Guinea',                        dial: '+224',  flag: '🇬🇳' },
  { code: 'GW', name: 'Guinea-Bissau',                 dial: '+245',  flag: '🇬🇼' },
  { code: 'GY', name: 'Guyana',                        dial: '+592',  flag: '🇬🇾' },
  { code: 'HT', name: 'Haiti',                         dial: '+509',  flag: '🇭🇹' },
  { code: 'HN', name: 'Honduras',                      dial: '+504',  flag: '🇭🇳' },
  { code: 'HU', name: 'Hungary',                       dial: '+36',   flag: '🇭🇺' },
  { code: 'IS', name: 'Iceland',                       dial: '+354',  flag: '🇮🇸' },
  { code: 'IN', name: 'India',                         dial: '+91',   flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia',                     dial: '+62',   flag: '🇮🇩' },
  { code: 'IR', name: 'Iran',                          dial: '+98',   flag: '🇮🇷' },
  { code: 'IQ', name: 'Iraq',                          dial: '+964',  flag: '🇮🇶' },
  { code: 'IE', name: 'Ireland',                       dial: '+353',  flag: '🇮🇪' },
  { code: 'IL', name: 'Israel',                        dial: '+972',  flag: '🇮🇱' },
  { code: 'IT', name: 'Italy',                         dial: '+39',   flag: '🇮🇹' },
  { code: 'JM', name: 'Jamaica',                       dial: '+1876', flag: '🇯🇲' },
  { code: 'JP', name: 'Japan',                         dial: '+81',   flag: '🇯🇵' },
  { code: 'JO', name: 'Jordan',                        dial: '+962',  flag: '🇯🇴' },
  { code: 'KZ', name: 'Kazakhstan',                    dial: '+7',    flag: '🇰🇿' },
  { code: 'KE', name: 'Kenya',                         dial: '+254',  flag: '🇰🇪' },
  { code: 'KI', name: 'Kiribati',                      dial: '+686',  flag: '🇰🇮' },
  { code: 'KW', name: 'Kuwait',                        dial: '+965',  flag: '🇰🇼' },
  { code: 'KG', name: 'Kyrgyzstan',                    dial: '+996',  flag: '🇰🇬' },
  { code: 'LA', name: 'Laos',                          dial: '+856',  flag: '🇱🇦' },
  { code: 'LV', name: 'Latvia',                        dial: '+371',  flag: '🇱🇻' },
  { code: 'LB', name: 'Lebanon',                       dial: '+961',  flag: '🇱🇧' },
  { code: 'LS', name: 'Lesotho',                       dial: '+266',  flag: '🇱🇸' },
  { code: 'LR', name: 'Liberia',                       dial: '+231',  flag: '🇱🇷' },
  { code: 'LY', name: 'Libya',                         dial: '+218',  flag: '🇱🇾' },
  { code: 'LI', name: 'Liechtenstein',                 dial: '+423',  flag: '🇱🇮' },
  { code: 'LT', name: 'Lithuania',                     dial: '+370',  flag: '🇱🇹' },
  { code: 'LU', name: 'Luxembourg',                    dial: '+352',  flag: '🇱🇺' },
  { code: 'MG', name: 'Madagascar',                    dial: '+261',  flag: '🇲🇬' },
  { code: 'MW', name: 'Malawi',                        dial: '+265',  flag: '🇲🇼' },
  { code: 'MY', name: 'Malaysia',                      dial: '+60',   flag: '🇲🇾' },
  { code: 'MV', name: 'Maldives',                      dial: '+960',  flag: '🇲🇻' },
  { code: 'ML', name: 'Mali',                          dial: '+223',  flag: '🇲🇱' },
  { code: 'MT', name: 'Malta',                         dial: '+356',  flag: '🇲🇹' },
  { code: 'MH', name: 'Marshall Islands',              dial: '+692',  flag: '🇲🇭' },
  { code: 'MR', name: 'Mauritania',                    dial: '+222',  flag: '🇲🇷' },
  { code: 'MU', name: 'Mauritius',                     dial: '+230',  flag: '🇲🇺' },
  { code: 'MX', name: 'Mexico',                        dial: '+52',   flag: '🇲🇽' },
  { code: 'FM', name: 'Micronesia',                    dial: '+691',  flag: '🇫🇲' },
  { code: 'MD', name: 'Moldova',                       dial: '+373',  flag: '🇲🇩' },
  { code: 'MC', name: 'Monaco',                        dial: '+377',  flag: '🇲🇨' },
  { code: 'MN', name: 'Mongolia',                      dial: '+976',  flag: '🇲🇳' },
  { code: 'ME', name: 'Montenegro',                    dial: '+382',  flag: '🇲🇪' },
  { code: 'MA', name: 'Morocco',                       dial: '+212',  flag: '🇲🇦' },
  { code: 'MZ', name: 'Mozambique',                    dial: '+258',  flag: '🇲🇿' },
  { code: 'MM', name: 'Myanmar',                       dial: '+95',   flag: '🇲🇲' },
  { code: 'NA', name: 'Namibia',                       dial: '+264',  flag: '🇳🇦' },
  { code: 'NR', name: 'Nauru',                         dial: '+674',  flag: '🇳🇷' },
  { code: 'NP', name: 'Nepal',                         dial: '+977',  flag: '🇳🇵' },
  { code: 'NL', name: 'Netherlands',                   dial: '+31',   flag: '🇳🇱' },
  { code: 'NZ', name: 'New Zealand',                   dial: '+64',   flag: '🇳🇿' },
  { code: 'NI', name: 'Nicaragua',                     dial: '+505',  flag: '🇳🇮' },
  { code: 'NE', name: 'Niger',                         dial: '+227',  flag: '🇳🇪' },
  { code: 'NG', name: 'Nigeria',                       dial: '+234',  flag: '🇳🇬' },
  { code: 'KP', name: 'North Korea',                   dial: '+850',  flag: '🇰🇵' },
  { code: 'MK', name: 'North Macedonia',               dial: '+389',  flag: '🇲🇰' },
  { code: 'NO', name: 'Norway',                        dial: '+47',   flag: '🇳🇴' },
  { code: 'OM', name: 'Oman',                          dial: '+968',  flag: '🇴🇲' },
  { code: 'PK', name: 'Pakistan',                      dial: '+92',   flag: '🇵🇰' },
  { code: 'PW', name: 'Palau',                         dial: '+680',  flag: '🇵🇼' },
  { code: 'PA', name: 'Panama',                        dial: '+507',  flag: '🇵🇦' },
  { code: 'PG', name: 'Papua New Guinea',              dial: '+675',  flag: '🇵🇬' },
  { code: 'PY', name: 'Paraguay',                      dial: '+595',  flag: '🇵🇾' },
  { code: 'PE', name: 'Peru',                          dial: '+51',   flag: '🇵🇪' },
  { code: 'PH', name: 'Philippines',                   dial: '+63',   flag: '🇵🇭' },
  { code: 'PL', name: 'Poland',                        dial: '+48',   flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal',                      dial: '+351',  flag: '🇵🇹' },
  { code: 'QA', name: 'Qatar',                         dial: '+974',  flag: '🇶🇦' },
  { code: 'RO', name: 'Romania',                       dial: '+40',   flag: '🇷🇴' },
  { code: 'RU', name: 'Russia',                        dial: '+7',    flag: '🇷🇺' },
  { code: 'RW', name: 'Rwanda',                        dial: '+250',  flag: '🇷🇼' },
  { code: 'KN', name: 'Saint Kitts and Nevis',         dial: '+1869', flag: '🇰🇳' },
  { code: 'LC', name: 'Saint Lucia',                   dial: '+1758', flag: '🇱🇨' },
  { code: 'VC', name: 'Saint Vincent and Grenadines',  dial: '+1784', flag: '🇻🇨' },
  { code: 'WS', name: 'Samoa',                         dial: '+685',  flag: '🇼🇸' },
  { code: 'SM', name: 'San Marino',                    dial: '+378',  flag: '🇸🇲' },
  { code: 'ST', name: 'Sao Tome and Principe',         dial: '+239',  flag: '🇸🇹' },
  { code: 'SA', name: 'Saudi Arabia',                  dial: '+966',  flag: '🇸🇦' },
  { code: 'SN', name: 'Senegal',                       dial: '+221',  flag: '🇸🇳' },
  { code: 'RS', name: 'Serbia',                        dial: '+381',  flag: '🇷🇸' },
  { code: 'SC', name: 'Seychelles',                    dial: '+248',  flag: '🇸🇨' },
  { code: 'SL', name: 'Sierra Leone',                  dial: '+232',  flag: '🇸🇱' },
  { code: 'SG', name: 'Singapore',                     dial: '+65',   flag: '🇸🇬' },
  { code: 'SK', name: 'Slovakia',                      dial: '+421',  flag: '🇸🇰' },
  { code: 'SI', name: 'Slovenia',                      dial: '+386',  flag: '🇸🇮' },
  { code: 'SB', name: 'Solomon Islands',               dial: '+677',  flag: '🇸🇧' },
  { code: 'SO', name: 'Somalia',                       dial: '+252',  flag: '🇸🇴' },
  { code: 'ZA', name: 'South Africa',                  dial: '+27',   flag: '🇿🇦' },
  { code: 'KR', name: 'South Korea',                   dial: '+82',   flag: '🇰🇷' },
  { code: 'SS', name: 'South Sudan',                   dial: '+211',  flag: '🇸🇸' },
  { code: 'ES', name: 'Spain',                         dial: '+34',   flag: '🇪🇸' },
  { code: 'LK', name: 'Sri Lanka',                     dial: '+94',   flag: '🇱🇰' },
  { code: 'SD', name: 'Sudan',                         dial: '+249',  flag: '🇸🇩' },
  { code: 'SR', name: 'Suriname',                      dial: '+597',  flag: '🇸🇷' },
  { code: 'SE', name: 'Sweden',                        dial: '+46',   flag: '🇸🇪' },
  { code: 'CH', name: 'Switzerland',                   dial: '+41',   flag: '🇨🇭' },
  { code: 'SY', name: 'Syria',                         dial: '+963',  flag: '🇸🇾' },
  { code: 'TW', name: 'Taiwan',                        dial: '+886',  flag: '🇹🇼' },
  { code: 'TJ', name: 'Tajikistan',                    dial: '+992',  flag: '🇹🇯' },
  { code: 'TZ', name: 'Tanzania',                      dial: '+255',  flag: '🇹🇿' },
  { code: 'TH', name: 'Thailand',                      dial: '+66',   flag: '🇹🇭' },
  { code: 'TL', name: 'Timor-Leste',                   dial: '+670',  flag: '🇹🇱' },
  { code: 'TG', name: 'Togo',                          dial: '+228',  flag: '🇹🇬' },
  { code: 'TO', name: 'Tonga',                         dial: '+676',  flag: '🇹🇴' },
  { code: 'TT', name: 'Trinidad and Tobago',           dial: '+1868', flag: '🇹🇹' },
  { code: 'TN', name: 'Tunisia',                       dial: '+216',  flag: '🇹🇳' },
  { code: 'TM', name: 'Turkmenistan',                  dial: '+993',  flag: '🇹🇲' },
  { code: 'TV', name: 'Tuvalu',                        dial: '+688',  flag: '🇹🇻' },
  { code: 'UG', name: 'Uganda',                        dial: '+256',  flag: '🇺🇬' },
  { code: 'UA', name: 'Ukraine',                       dial: '+380',  flag: '🇺🇦' },
  { code: 'AE', name: 'United Arab Emirates',          dial: '+971',  flag: '🇦🇪' },
  { code: 'GB', name: 'United Kingdom',                dial: '+44',   flag: '🇬🇧' },
  { code: 'US', name: 'United States',                 dial: '+1',    flag: '🇺🇸' },
  { code: 'UY', name: 'Uruguay',                       dial: '+598',  flag: '🇺🇾' },
  { code: 'UZ', name: 'Uzbekistan',                    dial: '+998',  flag: '🇺🇿' },
  { code: 'VU', name: 'Vanuatu',                       dial: '+678',  flag: '🇻🇺' },
  { code: 'VE', name: 'Venezuela',                     dial: '+58',   flag: '🇻🇪' },
  { code: 'VN', name: 'Vietnam',                       dial: '+84',   flag: '🇻🇳' },
  { code: 'YE', name: 'Yemen',                         dial: '+967',  flag: '🇾🇪' },
  { code: 'ZM', name: 'Zambia',                        dial: '+260',  flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe',                      dial: '+263',  flag: '🇿🇼' },
];

// Sort by dial length descending for greedy prefix matching
const COUNTRIES_BY_DIAL_LEN = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

export function parsePhone(stored: string | null): { dial: string; number: string } {
  if (!stored) return { dial: '+90', number: '' };
  const s = stored.trim();
  if (!s.startsWith('+')) return { dial: '+90', number: s };
  for (const c of COUNTRIES_BY_DIAL_LEN) {
    if (s.startsWith(c.dial)) {
      return { dial: c.dial, number: s.slice(c.dial.length) };
    }
  }
  return { dial: '+90', number: s };
}

// ─── PhoneInput ───────────────────────────────────────────────────────────────

interface PhoneInputProps {
  dial: string;
  number: string;
  onDialChange: (dial: string) => void;
  onNumberChange: (number: string) => void;
  placeholder?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({ dial, number, onDialChange, onNumberChange, placeholder = '' }) => {
  const [open,    setOpen]    = useState(false);
  const [search,  setSearch]  = useState('');
  const [focused, setFocused] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number } | null>(null);

  const triggerRef  = useRef<HTMLButtonElement>(null);
  const searchRef   = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find(c => c.dial === dial) ?? COUNTRIES[0];

  const filteredCountries = search.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dial.includes(search)
      )
    : COUNTRIES;

  const openDropdown = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropPos({ top: rect.bottom + 4, left: rect.left });
    setSearch('');
    setOpen(true);
    setTimeout(() => searchRef.current?.focus(), 40);
  };

  const selectCountry = (c: Country) => {
    onDialChange(c.dial);
    setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const borderColor = focused || open ? '#4ba6ea' : '#e5e7eb';

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      border: `1.5px solid ${borderColor}`,
      borderRadius: 8, background: '#fff',
      transition: 'border-color 150ms ease',
      overflow: 'hidden',
    }}>
      {/* Country selector trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '0 10px', height: 38, flexShrink: 0,
          background: '#f9fafb', border: 'none',
          borderRight: `1px solid ${borderColor}`,
          cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 13, color: '#374151', fontWeight: 500,
          transition: 'border-color 150ms ease',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{selected.flag}</span>
        <span>{selected.dial}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ color: '#9ca3af', marginLeft: 1 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Number input */}
      <input
        type="tel"
        value={number}
        onChange={e => onNumberChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, height: 38, padding: '0 12px',
          fontSize: 14, color: '#0f1117',
          background: '#fff', border: 'none', outline: 'none',
          fontFamily: 'inherit', minWidth: 0,
        }}
      />

      {/* Dropdown portal */}
      {open && dropPos && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            width: 300,
            zIndex: 3000,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 12px 40px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}
        >
          {/* Search */}
          <div style={{ padding: '10px 10px 6px' }}>
            <div style={{ position: 'relative' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{
                position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
                color: '#9ca3af', pointerEvents: 'none',
              }}>
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search country or code…"
                style={{
                  width: '100%', height: 34, paddingLeft: 28, paddingRight: 10,
                  fontSize: 13, color: '#0f1117',
                  background: '#f3f4f6', border: '1px solid transparent',
                  borderRadius: 7, outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; (e.target as HTMLInputElement).style.background = '#fff'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'transparent'; (e.target as HTMLInputElement).style.background = '#f3f4f6'; }}
              />
            </div>
          </div>

          {/* Country list */}
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: '0 6px 6px' }}>
            {filteredCountries.length === 0 ? (
              <div style={{ padding: '16px 10px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
                No countries found
              </div>
            ) : filteredCountries.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => selectCountry(c)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                  padding: '7px 10px', border: 'none', borderRadius: 7,
                  background: c.dial === dial ? 'rgba(75,166,234,0.08)' : 'none',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  transition: 'background 80ms ease',
                }}
                onMouseEnter={e => {
                  if (c.dial !== dial) (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6';
                }}
                onMouseLeave={e => {
                  if (c.dial !== dial) (e.currentTarget as HTMLButtonElement).style.background = 'none';
                }}
              >
                <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>{c.flag}</span>
                <span style={{ flex: 1, fontSize: 13, color: '#374151', fontWeight: 500 }}>{c.name}</span>
                <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>{c.dial}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
