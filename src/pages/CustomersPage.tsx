import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  nationality: string | null;
  id_type: string | null;
  id_number: string | null;
  driving_license_number: string | null;
  address: string | null;
  birth_date: string | null;
  notes: string | null;
  id_photo_url:               string | null;
  driving_license_photo_url:  string | null;
  entry_stamp_photo_url:      string | null;
}

interface CustomerBooking {
  id: number;
  booking_number: string;
  start_date: string;
  end_date: string;
  car_id: number;
  status: string | null;
  insurance_type: string | null;
  cars: { plate_number: string; model_group: { name: string } | { name: string }[] | null } | null;
}

interface InsightBooking {
  id: number;
  start_date: string;
  end_date: string;
  customer_id: string | null;
  customers: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
}

interface BookingInsights {
  avgDays:       number;
  topCustomer:   { name: string; count: number } | null;
  longestRental: { name: string; days: number }  | null;
}

type EditForm = Omit<Customer, 'id'>;

// ─── Country dial-code data (same list as BookingsPage) ───────────────────────

interface Country { code: string; name: string; dial: string; flag: string; }

const COUNTRIES: Country[] = [
  { code: 'AF', name: 'Afghanistan',                    dial: '+93',   flag: '🇦🇫' },
  { code: 'AL', name: 'Albania',                        dial: '+355',  flag: '🇦🇱' },
  { code: 'DZ', name: 'Algeria',                        dial: '+213',  flag: '🇩🇿' },
  { code: 'AD', name: 'Andorra',                        dial: '+376',  flag: '🇦🇩' },
  { code: 'AO', name: 'Angola',                         dial: '+244',  flag: '🇦🇴' },
  { code: 'AG', name: 'Antigua and Barbuda',            dial: '+1268', flag: '🇦🇬' },
  { code: 'AR', name: 'Argentina',                      dial: '+54',   flag: '🇦🇷' },
  { code: 'AM', name: 'Armenia',                        dial: '+374',  flag: '🇦🇲' },
  { code: 'AU', name: 'Australia',                      dial: '+61',   flag: '🇦🇺' },
  { code: 'AT', name: 'Austria',                        dial: '+43',   flag: '🇦🇹' },
  { code: 'AZ', name: 'Azerbaijan',                     dial: '+994',  flag: '🇦🇿' },
  { code: 'BS', name: 'Bahamas',                        dial: '+1242', flag: '🇧🇸' },
  { code: 'BH', name: 'Bahrain',                        dial: '+973',  flag: '🇧🇭' },
  { code: 'BD', name: 'Bangladesh',                     dial: '+880',  flag: '🇧🇩' },
  { code: 'BB', name: 'Barbados',                       dial: '+1246', flag: '🇧🇧' },
  { code: 'BY', name: 'Belarus',                        dial: '+375',  flag: '🇧🇾' },
  { code: 'BE', name: 'Belgium',                        dial: '+32',   flag: '🇧🇪' },
  { code: 'BZ', name: 'Belize',                         dial: '+501',  flag: '🇧🇿' },
  { code: 'BJ', name: 'Benin',                          dial: '+229',  flag: '🇧🇯' },
  { code: 'BT', name: 'Bhutan',                         dial: '+975',  flag: '🇧🇹' },
  { code: 'BO', name: 'Bolivia',                        dial: '+591',  flag: '🇧🇴' },
  { code: 'BA', name: 'Bosnia and Herzegovina',         dial: '+387',  flag: '🇧🇦' },
  { code: 'BW', name: 'Botswana',                       dial: '+267',  flag: '🇧🇼' },
  { code: 'BR', name: 'Brazil',                         dial: '+55',   flag: '🇧🇷' },
  { code: 'BN', name: 'Brunei',                         dial: '+673',  flag: '🇧🇳' },
  { code: 'BG', name: 'Bulgaria',                       dial: '+359',  flag: '🇧🇬' },
  { code: 'BF', name: 'Burkina Faso',                   dial: '+226',  flag: '🇧🇫' },
  { code: 'BI', name: 'Burundi',                        dial: '+257',  flag: '🇧🇮' },
  { code: 'CV', name: 'Cabo Verde',                     dial: '+238',  flag: '🇨🇻' },
  { code: 'KH', name: 'Cambodia',                       dial: '+855',  flag: '🇰🇭' },
  { code: 'CM', name: 'Cameroon',                       dial: '+237',  flag: '🇨🇲' },
  { code: 'CA', name: 'Canada',                         dial: '+1',    flag: '🇨🇦' },
  { code: 'CF', name: 'Central African Republic',       dial: '+236',  flag: '🇨🇫' },
  { code: 'TD', name: 'Chad',                           dial: '+235',  flag: '🇹🇩' },
  { code: 'CL', name: 'Chile',                          dial: '+56',   flag: '🇨🇱' },
  { code: 'CN', name: 'China',                          dial: '+86',   flag: '🇨🇳' },
  { code: 'CO', name: 'Colombia',                       dial: '+57',   flag: '🇨🇴' },
  { code: 'KM', name: 'Comoros',                        dial: '+269',  flag: '🇰🇲' },
  { code: 'CG', name: 'Congo',                          dial: '+242',  flag: '🇨🇬' },
  { code: 'CD', name: 'Congo (DRC)',                    dial: '+243',  flag: '🇨🇩' },
  { code: 'CR', name: 'Costa Rica',                     dial: '+506',  flag: '🇨🇷' },
  { code: 'HR', name: 'Croatia',                        dial: '+385',  flag: '🇭🇷' },
  { code: 'CU', name: 'Cuba',                           dial: '+53',   flag: '🇨🇺' },
  { code: 'CY', name: 'Cyprus',                         dial: '+357',  flag: '🇨🇾' },
  { code: 'CZ', name: 'Czech Republic',                 dial: '+420',  flag: '🇨🇿' },
  { code: 'DK', name: 'Denmark',                        dial: '+45',   flag: '🇩🇰' },
  { code: 'DJ', name: 'Djibouti',                       dial: '+253',  flag: '🇩🇯' },
  { code: 'DM', name: 'Dominica',                       dial: '+1767', flag: '🇩🇲' },
  { code: 'DO', name: 'Dominican Republic',             dial: '+1809', flag: '🇩🇴' },
  { code: 'EC', name: 'Ecuador',                        dial: '+593',  flag: '🇪🇨' },
  { code: 'EG', name: 'Egypt',                          dial: '+20',   flag: '🇪🇬' },
  { code: 'SV', name: 'El Salvador',                    dial: '+503',  flag: '🇸🇻' },
  { code: 'GQ', name: 'Equatorial Guinea',              dial: '+240',  flag: '🇬🇶' },
  { code: 'ER', name: 'Eritrea',                        dial: '+291',  flag: '🇪🇷' },
  { code: 'EE', name: 'Estonia',                        dial: '+372',  flag: '🇪🇪' },
  { code: 'SZ', name: 'Eswatini',                       dial: '+268',  flag: '🇸🇿' },
  { code: 'ET', name: 'Ethiopia',                       dial: '+251',  flag: '🇪🇹' },
  { code: 'FJ', name: 'Fiji',                           dial: '+679',  flag: '🇫🇯' },
  { code: 'FI', name: 'Finland',                        dial: '+358',  flag: '🇫🇮' },
  { code: 'FR', name: 'France',                         dial: '+33',   flag: '🇫🇷' },
  { code: 'GA', name: 'Gabon',                          dial: '+241',  flag: '🇬🇦' },
  { code: 'GM', name: 'Gambia',                         dial: '+220',  flag: '🇬🇲' },
  { code: 'GE', name: 'Georgia',                        dial: '+995',  flag: '🇬🇪' },
  { code: 'DE', name: 'Germany',                        dial: '+49',   flag: '🇩🇪' },
  { code: 'GH', name: 'Ghana',                          dial: '+233',  flag: '🇬🇭' },
  { code: 'GR', name: 'Greece',                         dial: '+30',   flag: '🇬🇷' },
  { code: 'GD', name: 'Grenada',                        dial: '+1473', flag: '🇬🇩' },
  { code: 'GT', name: 'Guatemala',                      dial: '+502',  flag: '🇬🇹' },
  { code: 'GN', name: 'Guinea',                         dial: '+224',  flag: '🇬🇳' },
  { code: 'GW', name: 'Guinea-Bissau',                  dial: '+245',  flag: '🇬🇼' },
  { code: 'GY', name: 'Guyana',                         dial: '+592',  flag: '🇬🇾' },
  { code: 'HT', name: 'Haiti',                          dial: '+509',  flag: '🇭🇹' },
  { code: 'HN', name: 'Honduras',                       dial: '+504',  flag: '🇭🇳' },
  { code: 'HU', name: 'Hungary',                        dial: '+36',   flag: '🇭🇺' },
  { code: 'IS', name: 'Iceland',                        dial: '+354',  flag: '🇮🇸' },
  { code: 'IN', name: 'India',                          dial: '+91',   flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia',                      dial: '+62',   flag: '🇮🇩' },
  { code: 'IR', name: 'Iran',                           dial: '+98',   flag: '🇮🇷' },
  { code: 'IQ', name: 'Iraq',                           dial: '+964',  flag: '🇮🇶' },
  { code: 'IE', name: 'Ireland',                        dial: '+353',  flag: '🇮🇪' },
  { code: 'IL', name: 'Israel',                         dial: '+972',  flag: '🇮🇱' },
  { code: 'IT', name: 'Italy',                          dial: '+39',   flag: '🇮🇹' },
  { code: 'JM', name: 'Jamaica',                        dial: '+1876', flag: '🇯🇲' },
  { code: 'JP', name: 'Japan',                          dial: '+81',   flag: '🇯🇵' },
  { code: 'JO', name: 'Jordan',                         dial: '+962',  flag: '🇯🇴' },
  { code: 'KZ', name: 'Kazakhstan',                     dial: '+7',    flag: '🇰🇿' },
  { code: 'KE', name: 'Kenya',                          dial: '+254',  flag: '🇰🇪' },
  { code: 'KI', name: 'Kiribati',                       dial: '+686',  flag: '🇰🇮' },
  { code: 'KP', name: 'North Korea',                    dial: '+850',  flag: '🇰🇵' },
  { code: 'KR', name: 'South Korea',                    dial: '+82',   flag: '🇰🇷' },
  { code: 'KW', name: 'Kuwait',                         dial: '+965',  flag: '🇰🇼' },
  { code: 'KG', name: 'Kyrgyzstan',                     dial: '+996',  flag: '🇰🇬' },
  { code: 'LA', name: 'Laos',                           dial: '+856',  flag: '🇱🇦' },
  { code: 'LV', name: 'Latvia',                         dial: '+371',  flag: '🇱🇻' },
  { code: 'LB', name: 'Lebanon',                        dial: '+961',  flag: '🇱🇧' },
  { code: 'LS', name: 'Lesotho',                        dial: '+266',  flag: '🇱🇸' },
  { code: 'LR', name: 'Liberia',                        dial: '+231',  flag: '🇱🇷' },
  { code: 'LY', name: 'Libya',                          dial: '+218',  flag: '🇱🇾' },
  { code: 'LI', name: 'Liechtenstein',                  dial: '+423',  flag: '🇱🇮' },
  { code: 'LT', name: 'Lithuania',                      dial: '+370',  flag: '🇱🇹' },
  { code: 'LU', name: 'Luxembourg',                     dial: '+352',  flag: '🇱🇺' },
  { code: 'MG', name: 'Madagascar',                     dial: '+261',  flag: '🇲🇬' },
  { code: 'MW', name: 'Malawi',                         dial: '+265',  flag: '🇲🇼' },
  { code: 'MY', name: 'Malaysia',                       dial: '+60',   flag: '🇲🇾' },
  { code: 'MV', name: 'Maldives',                       dial: '+960',  flag: '🇲🇻' },
  { code: 'ML', name: 'Mali',                           dial: '+223',  flag: '🇲🇱' },
  { code: 'MT', name: 'Malta',                          dial: '+356',  flag: '🇲🇹' },
  { code: 'MH', name: 'Marshall Islands',               dial: '+692',  flag: '🇲🇭' },
  { code: 'MR', name: 'Mauritania',                     dial: '+222',  flag: '🇲🇷' },
  { code: 'MU', name: 'Mauritius',                      dial: '+230',  flag: '🇲🇺' },
  { code: 'MX', name: 'Mexico',                         dial: '+52',   flag: '🇲🇽' },
  { code: 'FM', name: 'Micronesia',                     dial: '+691',  flag: '🇫🇲' },
  { code: 'MD', name: 'Moldova',                        dial: '+373',  flag: '🇲🇩' },
  { code: 'MC', name: 'Monaco',                         dial: '+377',  flag: '🇲🇨' },
  { code: 'MN', name: 'Mongolia',                       dial: '+976',  flag: '🇲🇳' },
  { code: 'ME', name: 'Montenegro',                     dial: '+382',  flag: '🇲🇪' },
  { code: 'MA', name: 'Morocco',                        dial: '+212',  flag: '🇲🇦' },
  { code: 'MZ', name: 'Mozambique',                     dial: '+258',  flag: '🇲🇿' },
  { code: 'MM', name: 'Myanmar',                        dial: '+95',   flag: '🇲🇲' },
  { code: 'NA', name: 'Namibia',                        dial: '+264',  flag: '🇳🇦' },
  { code: 'NR', name: 'Nauru',                          dial: '+674',  flag: '🇳🇷' },
  { code: 'NP', name: 'Nepal',                          dial: '+977',  flag: '🇳🇵' },
  { code: 'NL', name: 'Netherlands',                    dial: '+31',   flag: '🇳🇱' },
  { code: 'NZ', name: 'New Zealand',                    dial: '+64',   flag: '🇳🇿' },
  { code: 'NI', name: 'Nicaragua',                      dial: '+505',  flag: '🇳🇮' },
  { code: 'NE', name: 'Niger',                          dial: '+227',  flag: '🇳🇪' },
  { code: 'NG', name: 'Nigeria',                        dial: '+234',  flag: '🇳🇬' },
  { code: 'NO', name: 'Norway',                         dial: '+47',   flag: '🇳🇴' },
  { code: 'OM', name: 'Oman',                           dial: '+968',  flag: '🇴🇲' },
  { code: 'PK', name: 'Pakistan',                       dial: '+92',   flag: '🇵🇰' },
  { code: 'PW', name: 'Palau',                          dial: '+680',  flag: '🇵🇼' },
  { code: 'PA', name: 'Panama',                         dial: '+507',  flag: '🇵🇦' },
  { code: 'PG', name: 'Papua New Guinea',               dial: '+675',  flag: '🇵🇬' },
  { code: 'PY', name: 'Paraguay',                       dial: '+595',  flag: '🇵🇾' },
  { code: 'PE', name: 'Peru',                           dial: '+51',   flag: '🇵🇪' },
  { code: 'PH', name: 'Philippines',                    dial: '+63',   flag: '🇵🇭' },
  { code: 'PL', name: 'Poland',                         dial: '+48',   flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal',                       dial: '+351',  flag: '🇵🇹' },
  { code: 'QA', name: 'Qatar',                          dial: '+974',  flag: '🇶🇦' },
  { code: 'RO', name: 'Romania',                        dial: '+40',   flag: '🇷🇴' },
  { code: 'RU', name: 'Russia',                         dial: '+7',    flag: '🇷🇺' },
  { code: 'RW', name: 'Rwanda',                         dial: '+250',  flag: '🇷🇼' },
  { code: 'KN', name: 'Saint Kitts and Nevis',          dial: '+1869', flag: '🇰🇳' },
  { code: 'LC', name: 'Saint Lucia',                    dial: '+1758', flag: '🇱🇨' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', dial: '+1784', flag: '🇻🇨' },
  { code: 'WS', name: 'Samoa',                          dial: '+685',  flag: '🇼🇸' },
  { code: 'SM', name: 'San Marino',                     dial: '+378',  flag: '🇸🇲' },
  { code: 'ST', name: 'Sao Tome and Principe',          dial: '+239',  flag: '🇸🇹' },
  { code: 'SA', name: 'Saudi Arabia',                   dial: '+966',  flag: '🇸🇦' },
  { code: 'SN', name: 'Senegal',                        dial: '+221',  flag: '🇸🇳' },
  { code: 'RS', name: 'Serbia',                         dial: '+381',  flag: '🇷🇸' },
  { code: 'SC', name: 'Seychelles',                     dial: '+248',  flag: '🇸🇨' },
  { code: 'SL', name: 'Sierra Leone',                   dial: '+232',  flag: '🇸🇱' },
  { code: 'SG', name: 'Singapore',                      dial: '+65',   flag: '🇸🇬' },
  { code: 'SK', name: 'Slovakia',                       dial: '+421',  flag: '🇸🇰' },
  { code: 'SI', name: 'Slovenia',                       dial: '+386',  flag: '🇸🇮' },
  { code: 'SB', name: 'Solomon Islands',                dial: '+677',  flag: '🇸🇧' },
  { code: 'SO', name: 'Somalia',                        dial: '+252',  flag: '🇸🇴' },
  { code: 'ZA', name: 'South Africa',                   dial: '+27',   flag: '🇿🇦' },
  { code: 'SS', name: 'South Sudan',                    dial: '+211',  flag: '🇸🇸' },
  { code: 'ES', name: 'Spain',                          dial: '+34',   flag: '🇪🇸' },
  { code: 'LK', name: 'Sri Lanka',                      dial: '+94',   flag: '🇱🇰' },
  { code: 'SD', name: 'Sudan',                          dial: '+249',  flag: '🇸🇩' },
  { code: 'SR', name: 'Suriname',                       dial: '+597',  flag: '🇸🇷' },
  { code: 'SE', name: 'Sweden',                         dial: '+46',   flag: '🇸🇪' },
  { code: 'CH', name: 'Switzerland',                    dial: '+41',   flag: '🇨🇭' },
  { code: 'SY', name: 'Syria',                          dial: '+963',  flag: '🇸🇾' },
  { code: 'TW', name: 'Taiwan',                         dial: '+886',  flag: '🇹🇼' },
  { code: 'TJ', name: 'Tajikistan',                     dial: '+992',  flag: '🇹🇯' },
  { code: 'TZ', name: 'Tanzania',                       dial: '+255',  flag: '🇹🇿' },
  { code: 'TH', name: 'Thailand',                       dial: '+66',   flag: '🇹🇭' },
  { code: 'TL', name: 'Timor-Leste',                    dial: '+670',  flag: '🇹🇱' },
  { code: 'TG', name: 'Togo',                           dial: '+228',  flag: '🇹🇬' },
  { code: 'TO', name: 'Tonga',                          dial: '+676',  flag: '🇹🇴' },
  { code: 'TT', name: 'Trinidad and Tobago',            dial: '+1868', flag: '🇹🇹' },
  { code: 'TN', name: 'Tunisia',                        dial: '+216',  flag: '🇹🇳' },
  { code: 'TR', name: 'Turkey',                         dial: '+90',   flag: '🇹🇷' },
  { code: 'TM', name: 'Turkmenistan',                   dial: '+993',  flag: '🇹🇲' },
  { code: 'TV', name: 'Tuvalu',                         dial: '+688',  flag: '🇹🇻' },
  { code: 'UG', name: 'Uganda',                         dial: '+256',  flag: '🇺🇬' },
  { code: 'UA', name: 'Ukraine',                        dial: '+380',  flag: '🇺🇦' },
  { code: 'AE', name: 'United Arab Emirates',           dial: '+971',  flag: '🇦🇪' },
  { code: 'GB', name: 'United Kingdom',                 dial: '+44',   flag: '🇬🇧' },
  { code: 'US', name: 'United States',                  dial: '+1',    flag: '🇺🇸' },
  { code: 'UY', name: 'Uruguay',                        dial: '+598',  flag: '🇺🇾' },
  { code: 'UZ', name: 'Uzbekistan',                     dial: '+998',  flag: '🇺🇿' },
  { code: 'VU', name: 'Vanuatu',                        dial: '+678',  flag: '🇻🇺' },
  { code: 'VE', name: 'Venezuela',                      dial: '+58',   flag: '🇻🇪' },
  { code: 'VN', name: 'Vietnam',                        dial: '+84',   flag: '🇻🇳' },
  { code: 'YE', name: 'Yemen',                          dial: '+967',  flag: '🇾🇪' },
  { code: 'ZM', name: 'Zambia',                         dial: '+260',  flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe',                       dial: '+263',  flag: '🇿🇼' },
];

// ─── Phone parsing — identical logic to BookingsPage ─────────────────────────
// Splits "+905364067730" → { dial: "+90", local: "5364067730" }.
// If no valid country prefix is found (legacy bare digits like "111111"),
// defaults to Turkey (+90) instead of guessing +1/US.

function parseStoredPhone(stored: string | null): { dial: string; local: string } {
  if (!stored) return { dial: '+90', local: '' };
  const s = stored.startsWith('+') ? stored : `+${stored}`;
  // Sort longest dial first to avoid +1 matching +1868 etc.
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (s.startsWith(c.dial)) {
      return { dial: c.dial, local: s.slice(c.dial.length) };
    }
  }
  // No match — bare legacy number, fall back to Turkey
  return { dial: '+90', local: stored };
}

// ─── Searchable dial-code picker ─────────────────────────────────────────────

const DialCodePicker: React.FC<{
  value: string;
  onChange: (dial: string) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Prefer TR when dial is +90, otherwise find first match
  const selected =
    (value === '+90' ? COUNTRIES.find(c => c.code === 'TR') : undefined) ??
    COUNTRIES.find(c => c.dial === value) ??
    COUNTRIES.find(c => c.code === 'TR')!;

  const filtered = search.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dial.includes(search.replace(/^\+/, ''))
      )
    : COUNTRIES;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={{
          height: 40, padding: '0 10px',
          display: 'flex', alignItems: 'center', gap: 5,
          background: '#fff', border: '1.5px solid #e5e7eb',
          borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 13, color: '#0f1117', whiteSpace: 'nowrap',
          transition: 'border-color 140ms ease',
        }}
      >
        <span style={{ fontSize: 17, lineHeight: 1 }}>{selected.flag}</span>
        <span style={{ fontWeight: 500 }}>{selected.dial}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, left: 0, zIndex: 500,
          background: '#fff', border: '1.5px solid #e5e7eb',
          borderRadius: 10, width: 272,
          boxShadow: '0 8px 32px rgba(0,0,0,0.13)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px 6px' }}>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search country or code…"
              style={{
                width: '100%', height: 34, padding: '0 10px',
                fontSize: 13, border: '1.5px solid #e5e7eb',
                borderRadius: 7, outline: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 210, overflowY: 'auto' }}>
            {filtered.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.dial); setOpen(false); setSearch(''); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                  padding: '7px 12px', border: 'none', background: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                  textAlign: 'left', color: '#374151',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>{c.flag}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ color: '#9ca3af', fontSize: 12, flexShrink: 0 }}>{c.dial}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d;
}

function statusStyle(status: string | null): { color: string; bg: string } {
  switch (status) {
    case 'confirmed': return { color: '#2563eb', bg: 'rgba(37,99,235,0.08)' };
    case 'completed': return { color: '#16a34a', bg: 'rgba(34,197,94,0.08)' };
    case 'cancelled': return { color: '#dc2626', bg: 'rgba(239,68,68,0.08)' };
    case 'pending':   return { color: '#d97706', bg: 'rgba(217,119,6,0.08)' };
    default:          return { color: '#6b7280', bg: 'rgba(107,114,128,0.08)' };
  }
}

function initials(c: Customer): string {
  return `${c.first_name.charAt(0)}${c.last_name.charAt(0)}`.toUpperCase();
}

// Deterministic pastel color from name — keeps avatars distinct without randomness
const AVATAR_PALETTES = [
  { bg: 'linear-gradient(135deg,#4ba6ea,#2e8fd4)', text: '#fff' },
  { bg: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', text: '#fff' },
  { bg: 'linear-gradient(135deg,#ec4899,#db2777)', text: '#fff' },
  { bg: 'linear-gradient(135deg,#10b981,#059669)', text: '#fff' },
  { bg: 'linear-gradient(135deg,#f59e0b,#d97706)', text: '#fff' },
  { bg: 'linear-gradient(135deg,#ef4444,#dc2626)', text: '#fff' },
  { bg: 'linear-gradient(135deg,#06b6d4,#0891b2)', text: '#fff' },
  { bg: 'linear-gradient(135deg,#64748b,#475569)', text: '#fff' },
];

function avatarPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

// ─── Doc Upload Field ─────────────────────────────────────────────────────────

const DocUploadField: React.FC<{
  label:       string;
  existingUrl: string | null;
  file:        File | null;
  onChange:    (f: File | null) => void;
}> = ({ label, existingUrl, file, onChange }) => {
  const [preview,  setPreview]  = useState<string | null>(null);
  const [imgErr,   setImgErr]   = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImgErr(false);
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isImageUrl = (url: string) => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);

  const FileIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2v6h6" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  // Full-screen lightbox for image documents
  const lightboxPortal = lightbox && existingUrl
    ? ReactDOM.createPortal(
        <div
          onClick={() => setLightbox(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <button
            onClick={e => { e.stopPropagation(); setLightbox(false); }}
            style={{ position: 'absolute', top: 20, right: 20, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)', flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          </button>
          <img
            src={existingUrl}
            alt="Document"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 32px 96px rgba(0,0,0,0.6)' }}
          />
        </div>,
        document.body,
      )
    : null;

  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 7, display: 'block' }}>
        {label}
      </label>

      {/* Existing file */}
      {existingUrl && !file && (
        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1.5px solid rgba(75,166,234,0.2)', background: '#f8faff' }}>
          {isImageUrl(existingUrl) && !imgErr ? (
            <>
              <img
                src={existingUrl}
                alt="doc"
                onError={() => setImgErr(true)}
                onClick={() => setLightbox(true)}
                style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
              />
              {/* View + Replace action bar */}
              <div style={{ display: 'flex', borderTop: '1px solid rgba(75,166,234,0.12)' }}>
                <button
                  type="button"
                  onClick={() => setLightbox(true)}
                  style={{ flex: 1, height: 36, border: 'none', borderRight: '1px solid rgba(75,166,234,0.12)', background: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#4ba6ea', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: 'inherit', transition: 'background 120ms ease' }}
                  onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(75,166,234,0.07)'; }}
                  onMouseLeave={e => { (e.currentTarget).style.background = 'none'; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  View
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  style={{ flex: 1, height: 36, border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: 'inherit', transition: 'background 120ms ease' }}
                  onMouseEnter={e => { (e.currentTarget).style.background = '#f3f4f6'; }}
                  onMouseLeave={e => { (e.currentTarget).style.background = 'none'; }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Replace
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
              <div style={{ width: 34, height: 34, borderRadius: 7, background: '#e0edfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileIcon />
              </div>
              <a href={existingUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#4ba6ea', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                View file
              </a>
              <button type="button" onClick={() => inputRef.current?.click()} style={{ fontSize: 11, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                Replace
              </button>
            </div>
          )}
        </div>
      )}

      {/* New file selected */}
      {file && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, border: '1.5px solid #4ba6ea', background: 'rgba(75,166,234,0.04)' }}>
          {preview ? (
            <img src={preview} alt="preview" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 7, border: '1px solid rgba(75,166,234,0.2)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 7, background: 'rgba(75,166,234,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileIcon />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
            <div style={{ fontSize: 11, color: '#4ba6ea', marginTop: 1 }}>Ready · {(file.size / 1024).toFixed(0)} KB</div>
          </div>
          <button type="button" onClick={() => onChange(null)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexShrink: 0 }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.color = '#ef4444'; b.style.borderColor = '#fca5a5'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.color = '#9ca3af'; b.style.borderColor = '#e5e7eb'; }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}

      {/* Upload button (empty state) */}
      {!file && !existingUrl && (
        <button type="button" onClick={() => inputRef.current?.click()}
          style={{ width: '100%', height: 72, borderRadius: 10, border: '1.5px dashed #e5e7eb', background: '#fafafa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', color: '#9ca3af', fontSize: 12, fontWeight: 500, transition: 'all 140ms ease' }}
          onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; b.style.background = 'rgba(75,166,234,0.04)'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; b.style.background = '#fafafa'; }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          Upload file
        </button>
      )}

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,.pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0] ?? null; onChange(f); e.target.value = ''; }} />

      {lightboxPortal}
    </div>
  );
};

// ─── Edit Customer Modal ───────────────────────────────────────────────────────

const EditCustomerModal: React.FC<{
  customer: Customer;
  onClose:  () => void;
  onSaved:  (updated: Customer) => void;
}> = ({ customer, onClose, onSaved }) => {
  // Parse stored phone into dial + local on mount
  const parsed = parseStoredPhone(customer.phone);

  const [phoneDial,  setPhoneDial]  = useState(parsed.dial);
  const [phoneLocal, setPhoneLocal] = useState(parsed.local);

  const [form, setForm] = useState<Omit<EditForm, 'phone'>>({
    first_name:                   customer.first_name,
    last_name:                    customer.last_name,
    nationality:                  customer.nationality             ?? '',
    id_type:                      customer.id_type                 ?? '',
    id_number:                    customer.id_number               ?? '',
    driving_license_number:       customer.driving_license_number  ?? '',
    address:                      customer.address                 ?? '',
    birth_date:                   customer.birth_date              ?? '',
    notes:                        customer.notes                   ?? '',
    id_photo_url:                 customer.id_photo_url            ?? null,
    driving_license_photo_url:    customer.driving_license_photo_url ?? null,
    entry_stamp_photo_url:        customer.entry_stamp_photo_url   ?? null,
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const [docIdPhoto,        setDocIdPhoto]        = useState<File | null>(null);
  const [docDrivingLicense, setDocDrivingLicense] = useState<File | null>(null);
  const [docEntryStamp,     setDocEntryStamp]     = useState<File | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const uploadDoc = async (file: File, prefix: string): Promise<string | null> => {
    const ext  = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
    // Path mirrors BookingsPage uploadDocById: customerId sub-folder + timestamp = unique per upload
    const path = `${customer.id}/${prefix}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('customers_doc').upload(path, file, { upsert: true });
    if (upErr) return null;
    const { data } = supabase.storage.from('customers_doc').getPublicUrl(path);
    // Cache-buster appended to URL so the new image shows immediately (same as ModelGroupsPage)
    return `${data.publicUrl}?v=${Date.now()}`;
  };

  const handleSave = async () => {
    if (!form.first_name.trim()) { setError('First name is required.'); return; }
    setSaving(true);
    setError(null);

    const [idUrl, dlUrl, esUrl] = await Promise.all([
      docIdPhoto        ? uploadDoc(docIdPhoto,        'ID')             : Promise.resolve(null),
      docDrivingLicense ? uploadDoc(docDrivingLicense, 'DrivingLicense') : Promise.resolve(null),
      docEntryStamp     ? uploadDoc(docEntryStamp,     'EntryStamp')     : Promise.resolve(null),
    ]);

    // Compose E.164: dial + local digits
    const phone = phoneLocal.trim() ? `${phoneDial}${phoneLocal.trim()}` : null;

    const { data, error: err } = await supabase
      .from('customers')
      .update({
        first_name:      form.first_name.trim(),
        last_name:       form.last_name.trim(),
        phone,
        nationality:     form.nationality?.trim()     || null,
        id_type:         form.id_type?.trim()         || null,
        id_number:       form.id_number?.trim()       || null,
        driving_license_number: form.driving_license_number?.trim() || null,
        address:         form.address?.trim()         || null,
        birth_date:      form.birth_date             || null,
        notes:           form.notes?.trim()           || null,
        ...(idUrl && { id_photo_url:              idUrl }),
        ...(dlUrl && { driving_license_photo_url: dlUrl }),
        ...(esUrl && { entry_stamp_photo_url:     esUrl }),
      })
      .eq('id', customer.id)
      .select()
      .single();

    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved(data as Customer);
    onClose();
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    fontFamily: 'inherit', color: '#0f1117', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 140ms ease',
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block',
  };
  const g2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };
  const focusBlue = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    { (e.target as HTMLElement).style.borderColor = '#4ba6ea'; };
  const blurGray  = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    { (e.target as HTMLElement).style.borderColor = '#e5e7eb'; };

  const pal = avatarPalette(`${customer.first_name} ${customer.last_name}`);

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 200ms ease' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: pal.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pal.text, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
            {initials(customer)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117' }}>Edit Customer</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{customer.first_name} {customer.last_name}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Name row */}
          <div style={g2}>
            <div>
              <label style={lbl}>First Name</label>
              <input value={form.first_name} onChange={e => set('first_name', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
            <div>
              <label style={lbl}>Last Name</label>
              <input value={form.last_name} onChange={e => set('last_name', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
          </div>

          {/* Phone + Nationality */}
          <div style={g2}>
            <div>
              <label style={lbl}>Phone</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <DialCodePicker value={phoneDial} onChange={setPhoneDial} />
                <input
                  type="tel"
                  value={phoneLocal}
                  onChange={e => setPhoneLocal(e.target.value.replace(/[^\d\s\-()]/g, ''))}
                  placeholder="5XX XXX XX XX"
                  style={{ ...inp, flex: 1 }}
                  onFocus={focusBlue}
                  onBlur={blurGray}
                />
              </div>
            </div>
            <div>
              <label style={lbl}>Nationality</label>
              <input value={form.nationality ?? ''} onChange={e => set('nationality', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
          </div>

          {/* ID fields */}
          <div style={g2}>
            <div>
              <label style={lbl}>ID Type</label>
              <input value={form.id_type ?? ''} onChange={e => set('id_type', e.target.value)} placeholder="Passport, National ID…" style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
            <div>
              <label style={lbl}>ID Number</label>
              <input value={form.id_number ?? ''} onChange={e => set('id_number', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
          </div>

          {/* License + Birth date */}
          <div style={g2}>
            <div>
              <label style={lbl}>Driving License</label>
              <input value={form.driving_license_number ?? ''} onChange={e => set('driving_license_number', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
            <div>
              <label style={lbl}>Birth Date</label>
              <input type="date" value={form.birth_date ?? ''} onChange={e => set('birth_date', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
          </div>

          {/* Address */}
          <div>
            <label style={lbl}>Address</label>
            <input value={form.address ?? ''} onChange={e => set('address', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
          </div>

          {/* Notes */}
          <div>
            <label style={lbl}>Notes</label>
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={3}
              style={{ ...inp, resize: 'vertical', minHeight: 68 }}
              onFocus={focusBlue} onBlur={blurGray} />
          </div>

          {/* Documents */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, marginTop: 2 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(75,166,234,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ba6ea', flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Customer Documents</span>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <DocUploadField label="ID Photo"        existingUrl={customer.id_photo_url ?? null}              file={docIdPhoto}        onChange={setDocIdPhoto} />
              <DocUploadField label="Driving License" existingUrl={customer.driving_license_photo_url ?? null}  file={docDrivingLicense} onChange={setDocDrivingLicense} />
              <DocUploadField label="Entry Stamp"     existingUrl={customer.entry_stamp_photo_url ?? null}      file={docEntryStamp}     onChange={setDocEntryStamp} />
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: saving ? '#d1d5db' : '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: saving ? 'none' : '0 2px 8px rgba(75,166,234,0.28)' }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Customer Detail View ─────────────────────────────────────────────────────

const CustomerDetailView: React.FC<{
  customer:  Customer;
  onBack:    () => void;
  onUpdated: (c: Customer) => void;
}> = ({ customer, onBack, onUpdated }) => {
  const [cust,     setCust]     = useState<Customer>(customer);
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('bookings')
      .select('id, booking_number, start_date, end_date, car_id, status, insurance_type, cars(plate_number, model_group(name))')
      .eq('customer_id', cust.id)
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        setBookings((data ?? []) as unknown as CustomerBooking[]);
        setLoading(false);
      });
  }, [cust.id]);

  const pal = avatarPalette(`${cust.first_name} ${cust.last_name}`);

  const th: React.CSSProperties = {
    padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'left',
    borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap',
    background: '#fafafa', position: 'sticky', top: 0, zIndex: 1,
  };
  const td: React.CSSProperties = { padding: '11px 16px', fontSize: 13, color: '#374151', borderBottom: '1px solid #f7f7f7' };

  const InfoField: React.FC<{ label: string; value: string | null }> = ({ label, value }) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: value ? '#0f1117' : '#d1d5db', fontWeight: value ? 500 : 400 }}>{value || '—'}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#f8fafc 0%,#f1f5f9 100%)', padding: '44px 40px' }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          <div style={{ width: 1, height: 24, background: '#e5e7eb', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: pal.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pal.text, fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
              {initials(cust)}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 2 }}>Customer</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.5px', lineHeight: 1.1 }}>{cust.first_name} {cust.last_name}</div>
            </div>
          </div>
        </div>
        <button onClick={() => setEditOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 11, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(75,166,234,0.3)', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Edit Customer
        </button>
      </div>

      {/* Info card */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: '24px 28px', marginBottom: 24, boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 20 }}>Customer Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 22 }}>
          <InfoField label="Phone"           value={cust.phone} />
          <InfoField label="Nationality"     value={cust.nationality} />
          <InfoField label="ID Type"         value={cust.id_type} />
          <InfoField label="ID Number"       value={cust.id_number} />
          <InfoField label="Driving License" value={cust.driving_license_number} />
          <InfoField label="Birth Date"      value={cust.birth_date ? fmtDate(cust.birth_date) : null} />
          <InfoField label="Address"         value={cust.address} />
        </div>
        {cust.notes && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{cust.notes}</div>
          </div>
        )}
      </div>

      {/* Booking history */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: '0.8px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Booking History</span>
          {!loading && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(75,166,234,0.1)', color: '#4ba6ea', whiteSpace: 'nowrap' }}>
              {bookings.length} {bookings.length === 1 ? 'rental' : 'rentals'}
            </span>
          )}
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,#e5e7eb 0%,transparent 80%)' }} />
        </div>
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#4ba6ea' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
              </svg>
            </div>
          ) : bookings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '44px 24px', color: '#9ca3af', fontSize: 13 }}>No bookings found for this customer.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                <thead>
                  <tr>{['Booking #', 'Car', 'Start Date', 'End Date', 'Insurance', 'Status'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {bookings.map(b => {
                    const sc       = statusStyle(b.status);
                    const carRaw   = Array.isArray(b.cars) ? b.cars[0] : b.cars;
                    const mgRaw    = carRaw?.model_group;
                    const mg       = Array.isArray(mgRaw) ? mgRaw[0] : mgRaw;
                    const carLabel = carRaw ? `${carRaw.plate_number}${mg ? ` — ${mg.name}` : ''}` : `Car #${b.car_id}`;
                    return (
                      <tr key={b.id}>
                        <td style={{ ...td, fontWeight: 700, fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.3px' }}>{b.booking_number}</td>
                        <td style={{ ...td, fontWeight: 500 }}>{carLabel}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(b.start_date)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(b.end_date)}</td>
                        <td style={{ ...td, color: '#6b7280' }}>{b.insurance_type ?? '—'}</td>
                        <td style={td}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: sc.color, background: sc.bg, textTransform: 'capitalize' }}>
                            {b.status ?? '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <EditCustomerModal
          customer={cust}
          onClose={() => setEditOpen(false)}
          onSaved={updated => { setCust(updated); onUpdated(updated); }}
        />
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

// ─── Customers Page (list view) ───────────────────────────────────────────────

const CustomersPage: React.FC = () => {
  const [customers,       setCustomers]       = useState<Customer[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = useState('');
  const [selected,        setSelected]        = useState<Customer | null>(null);
  const [editModal,       setEditModal]       = useState<Customer | null>(null);
  const [insights,        setInsights]        = useState<BookingInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);

  useEffect(() => {
    supabase.from('customers').select('*').order('first_name', { ascending: true })
      .then(({ data }) => { setCustomers((data ?? []) as Customer[]); setLoading(false); });
  }, []);

  useEffect(() => {
    supabase.from('bookings').select('id, start_date, end_date, customer_id, customers(first_name, last_name)')
      .not('start_date', 'is', null).not('end_date', 'is', null)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as InsightBooking[];
        const withDays = rows.map(b => {
          const days = Math.round((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86400000);
          const cr = Array.isArray(b.customers) ? b.customers[0] : b.customers;
          return { ...b, days, name: cr ? `${cr.first_name} ${cr.last_name}` : null };
        }).filter(b => b.days > 0 && b.customer_id);

        const avgDays = withDays.length > 0 ? Math.round(withDays.reduce((s, b) => s + b.days, 0) / withDays.length) : 0;
        const countMap = new Map<string, { name: string; count: number }>();
        for (const b of withDays) {
          const existing = countMap.get(b.customer_id!);
          if (existing) existing.count++; else countMap.set(b.customer_id!, { name: b.name ?? 'Unknown', count: 1 });
        }
        const topCustomer    = countMap.size > 0 ? Array.from(countMap.values()).sort((a, b) => b.count - a.count)[0] : null;
        const longestRental  = withDays.length > 0 ? (() => { const b = [...withDays].sort((a, z) => z.days - a.days)[0]; return { name: b.name ?? 'Unknown', days: b.days }; })() : null;
        setInsights({ avgDays, topCustomer, longestRental });
        setInsightsLoading(false);
      });
  }, []);

  const handleUpdated = useCallback((updated: Customer) => {
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
  }, []);

  if (selected) {
    return <CustomerDetailView customer={selected} onBack={() => setSelected(null)} onUpdated={handleUpdated} />;
  }

  const filtered = customers.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    // Strip spaces, dashes, plus signs and parentheses so "905364" matches "+90 (536) 4…"
    const digits = (s: string) => s.replace(/[\s\-+()]/g, '');
    const qDigits = digits(q);

    const first = (c.first_name ?? '').toLowerCase();
    const last  = (c.last_name  ?? '').toLowerCase();

    return (
      `${first} ${last}`.includes(q) ||                                  // full name
      first.includes(q) ||                                               // first name alone
      last.includes(q) ||                                                // last name alone
      (qDigits !== '' && digits((c.phone ?? '').toLowerCase()).includes(qDigits)) || // phone (digits only)
      (c.id_number ?? '').toLowerCase().includes(q) ||                   // ID number
      (c.nationality ?? '').toLowerCase().includes(q)                    // nationality
    );
  });

  // Nationality breakdown
  const natMap = new Map<string, number>();
  for (const c of customers) {
    const n = c.nationality?.trim() || null;
    if (n) natMap.set(n, (natMap.get(n) ?? 0) + 1);
  }
  const topNat       = Array.from(natMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxNatCount  = topNat[0]?.[1] ?? 1;
  const totalWithNat = Array.from(natMap.values()).reduce((s, v) => s + v, 0);

  const Spinner = () => (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#4ba6ea' }}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
      </svg>
    </div>
  );

  const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
    boxShadow: '0 1px 6px rgba(0,0,0,0.04)', padding: '20px 22px',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#f8fafc 0%,#f1f5f9 100%)', padding: '44px 40px' }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Management</span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', margin: '0 0 5px', lineHeight: 1.1 }}>Customers</h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Browse customer profiles and rental history.</p>
      </div>

      {/* Analytics cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginBottom: 24 }}>

        {/* Nationality Breakdown */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Customer Nationalities</span>
            {!loading && totalWithNat > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>{customers.length} total</span>
            )}
          </div>
          {loading ? <Spinner /> : topNat.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '14px 0' }}>No nationality data.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {topNat.map(([nat, count]) => {
                const pct  = Math.round((count / totalWithNat) * 100);
                const barW = Math.round((count / maxNatCount) * 100);
                return (
                  <div key={nat}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#0f1117' }}>{nat}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1117' }}>{count}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 30, textAlign: 'right' }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: '#f0f4f8', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barW}%`, borderRadius: 99, background: 'linear-gradient(90deg,#4ba6ea 0%,#2e8fd4 100%)', transition: 'width 500ms ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Booking Insights */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 16 }}>Booking Insights</div>
          {insightsLoading ? <Spinner /> : !insights ? (
            <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '14px 0' }}>No data yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                {
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#4ba6ea" strokeWidth="1.8"/><path d="M12 7v5l3 3" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round"/></svg>,
                  iconBg: 'rgba(75,166,234,0.08)',
                  label: 'Avg. rental duration',
                  right: <span style={{ fontSize: 16, fontWeight: 700, color: '#0f1117' }}>{insights.avgDays} <span style={{ fontSize: 12, fontWeight: 500, color: '#9ca3af' }}>days</span></span>,
                  border: true,
                },
                {
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#16a34a" strokeWidth="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round"/></svg>,
                  iconBg: 'rgba(22,163,74,0.07)',
                  label: 'Most frequent customer',
                  right: insights.topCustomer
                    ? <div style={{ textAlign: 'right' }}><div style={{ fontSize: 13, fontWeight: 700, color: '#0f1117' }}>{insights.topCustomer.name}</div><div style={{ fontSize: 11, color: '#9ca3af' }}>{insights.topCustomer.count} bookings</div></div>
                    : <span style={{ fontSize: 13, color: '#9ca3af' }}>—</span>,
                  border: true,
                },
                {
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round"/><rect x="9" y="11" width="14" height="10" rx="2" stroke="#d97706" strokeWidth="1.8"/></svg>,
                  iconBg: 'rgba(217,119,6,0.07)',
                  label: 'Longest rental',
                  right: insights.longestRental
                    ? <div style={{ textAlign: 'right' }}><div style={{ fontSize: 13, fontWeight: 700, color: '#0f1117' }}>{insights.longestRental.name}</div><div style={{ fontSize: 11, color: '#9ca3af' }}>{insights.longestRental.days} days</div></div>
                    : <span style={{ fontSize: 13, color: '#9ca3af' }}>—</span>,
                  border: false,
                },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: row.border ? '1px solid #f7f7f7' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: row.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {row.icon}
                    </div>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>{row.label}</span>
                  </div>
                  {row.right}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search + count */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', maxWidth: 380, flex: 1 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.9"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search by name, phone, ID number, or nationality..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 14px 10px 38px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 11, outline: 'none', fontFamily: 'inherit', color: '#0f1117', background: '#fff', boxSizing: 'border-box', transition: 'border-color 140ms ease, box-shadow 140ms ease' }}
            onFocus={e => { const t = e.target as HTMLInputElement; t.style.borderColor = '#4ba6ea'; t.style.boxShadow = '0 0 0 3px rgba(75,166,234,0.12)'; }}
            onBlur={e => { const t = e.target as HTMLInputElement; t.style.borderColor = '#e5e7eb'; t.style.boxShadow = 'none'; }}
          />
        </div>
        {!loading && (
          <span style={{ fontSize: 13, color: '#9ca3af', whiteSpace: 'nowrap' }}>
            {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#4ba6ea' }}>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
            </svg>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px', color: '#9ca3af', fontSize: 13 }}>
            {search ? 'No customers match your search.' : 'No customers found.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  {['Full Name', 'Phone', 'Nationality', 'ID Number', 'Driving License', ''].map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af',
                      textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'left',
                      borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap',
                      background: '#fff', position: 'sticky', top: 0, zIndex: 1,
                      ...(i === 5 ? { width: 56, textAlign: 'right' as const } : {}),
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const pal = avatarPalette(`${c.first_name} ${c.last_name}`);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelected(c)}
                      className="cust-row"
                      style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7', cursor: 'pointer' }}
                    >
                      <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: 13, color: '#0f1117' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: pal.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pal.text, fontSize: 11, fontWeight: 700, flexShrink: 0, letterSpacing: '0.5px' }}>
                            {initials(c)}
                          </div>
                          {c.first_name} {c.last_name}
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: c.phone ? '#6b7280' : '#d1d5db' }}>{c.phone || '—'}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: c.nationality ? '#374151' : '#d1d5db' }}>{c.nationality || '—'}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', color: c.id_number ? '#374151' : '#d1d5db' }}>{c.id_number || '—'}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', color: c.driving_license_number ? '#374151' : '#d1d5db' }}>{c.driving_license_number || '—'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <button
                          onClick={e => { e.stopPropagation(); setEditModal(c); }}
                          title="Edit customer"
                          style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', transition: 'all 140ms ease' }}
                          onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; b.style.background = 'rgba(75,166,234,0.06)'; }}
                          onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = '#e5e7eb'; b.style.color = '#6b7280'; b.style.background = '#fff'; }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editModal && (
        <EditCustomerModal
          customer={editModal}
          onClose={() => setEditModal(null)}
          onSaved={updated => {
            setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
            setEditModal(null);
          }}
        />
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .cust-row { transition: background 100ms ease; }
        .cust-row:hover { background: #f8faff !important; }
      `}</style>
    </div>
  );
};

export default CustomersPage;
