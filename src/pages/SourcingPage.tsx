import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ListingStatus = 'Active' | 'Sold';
type LeadStatus    = 'New' | 'Contacted' | 'Offer Sent' | 'Rejected' | 'Ignored';
type Transmission  = 'Automatic' | 'Manual';
type FuelType      = 'Petrol' | 'Diesel' | 'Hybrid' | 'Electric' | 'LPG';
type DamageRecord  = 'Heavy Damage' | 'No Damage' | 'Damage Value';

interface SourcingRow {
  id: number;
  created_at: string;
  updated_at: string | null;
  added_by: string | null;
  source_platform: string;
  source_platform_custom: string | null;
  model_group_id: number | null;
  model_group_custom: string | null;
  model_year: number | null;
  mileage_km: number | null;
  transmission: Transmission | null;
  fuel_type: FuelType | null;
  damage_record: DamageRecord | null;
  damage_value: number | null;
  paint_sections_count: number | null;
  trim_package: string | null;
  listing_url: string | null;
  listing_status: ListingStatus;
  listed_on: string | null;
  lead_status: LeadStatus;
  asking_price: number | null;
  target_price: number | null;
  notes: string | null;
  // Geo — id type is left wide (bigint or uuid) so existing rows never crash.
  city_id: string | number | null;
  district_id: string | number | null;
  // Embedded join rows from PostgREST (geo_cities(name) / geo_districts(name)).
  geo_cities?: { name: string } | null;
  geo_districts?: { name: string } | null;
  // client-joined / flattened
  model_name: string | null;
  city_name: string | null;
  district_name: string | null;
}

interface SourcingForm {
  source_platform: string;
  source_platform_custom: string;
  listing_url: string;
  listed_on: string;
  model_group_id: string;
  model_group_custom: string;
  model_year: string;
  mileage_km: string;
  transmission: string;
  fuel_type: string;
  trim_package: string;
  damage_record: string;
  damage_value: string;
  paint_sections_count: string;
  asking_price: string;
  target_price: string;
  city_id: string;
  district_id: string;
  lead_status: LeadStatus;
  listing_status: ListingStatus;
  notes: string;
}

interface ModelGroupOption { id: number; name: string; }

// Geo dropdown option — id kept as a string so it works for bigint or uuid PKs.
interface GeoOption { id: string; name: string; }

// ─── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  'sahibinden.com', 'arabam.com', 'letgo', 'Instagram', 'Facebook Marketplace', 'Other',
];

// Sentinel for the Model Group <select>, mirroring the platform field's 'Other'.
// Real options carry a numeric id as their value, so a non-numeric sentinel can
// never collide with a model_group row.
const MODEL_OTHER = 'other';

const LEAD_CFG: Record<LeadStatus, { color: string; bg: string }> = {
  'New':        { color: '#4ba6ea', bg: 'rgba(75,166,234,0.1)'  },
  'Contacted':  { color: '#ca8a04', bg: 'rgba(234,179,8,0.1)'   },
  'Offer Sent': { color: '#ea580c', bg: 'rgba(249,115,22,0.1)'  },
  'Rejected':   { color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  'Ignored':    { color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

const TRANS_CFG: Record<Transmission, { color: string; bg: string }> = {
  'Automatic': { color: '#4ba6ea', bg: 'rgba(75,166,234,0.1)'  },
  'Manual':    { color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

const FUEL_CFG: Record<FuelType, { color: string; bg: string }> = {
  'Petrol':   { color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  'Diesel':   { color: '#374151', bg: 'rgba(55,65,81,0.1)'    },
  'Hybrid':   { color: '#16a34a', bg: 'rgba(34,197,94,0.1)'   },
  'Electric': { color: '#4ba6ea', bg: 'rgba(75,166,234,0.1)'  },
  'LPG':      { color: '#ca8a04', bg: 'rgba(234,179,8,0.1)'   },
};

const DAMAGE_CFG: Record<DamageRecord, { color: string }> = {
  'Heavy Damage': { color: '#ef4444' },
  'No Damage':    { color: '#16a34a' },
  'Damage Value': { color: '#ea580c' },
};

const CURRENT_YEAR   = new Date().getFullYear();
const YEAR_OPTIONS   = Array.from({ length: CURRENT_YEAR - 2019 }, (_, i) => CURRENT_YEAR - i);
const LEAD_STATUSES: LeadStatus[] = ['New', 'Contacted', 'Offer Sent', 'Rejected', 'Ignored'];

type SortCol = 'model_year' | 'mileage_km' | 'asking_price' | 'listed_on' | 'lead_status' | 'city_name' | 'district_name';

const LEAD_ORDER: Record<LeadStatus, number> = {
  'New': 0, 'Contacted': 1, 'Offer Sent': 2, 'Rejected': 3, 'Ignored': 4,
};

const EMPTY_FORM: SourcingForm = {
  source_platform: '', source_platform_custom: '',
  listing_url: '', listed_on: new Date().toISOString().slice(0, 10),
  model_group_id: '', model_group_custom: '', model_year: '', mileage_km: '', transmission: '',
  fuel_type: '', trim_package: '', damage_record: '', damage_value: '',
  paint_sections_count: '', asking_price: '', target_price: '',
  city_id: '', district_id: '',
  lead_status: 'New', listing_status: 'Active', notes: '',
};

// Pins İstanbul to the top of a city list; everything else keeps its A→Z order.
// Only affects the dropdown order — table column sorting stays purely alphabetical.
function pinIstanbul(cities: GeoOption[]): GeoOption[] {
  const idx = cities.findIndex(c => c.name === 'İstanbul');
  if (idx <= 0) return cities;
  const copy = [...cities];
  const [ist] = copy.splice(idx, 1);
  return [ist, ...copy];
}

// Loads active districts for a city, name-sorted. Returns [] for no city.
async function fetchDistricts(cityId: string): Promise<GeoOption[]> {
  const { data } = await supabase
    .from('geo_districts')
    .select('id, name')
    .eq('city_id', cityId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  return (data ?? []).map(d => ({ id: String(d.id), name: d.name as string }));
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return `${dd}.${m}.${y}`;
}

function daysAgo(d: string | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86_400_000);
}

function fmtMileage(km: number | null): string {
  if (km == null) return '—';
  return km.toLocaleString('en-US') + ' km';
}

function fmtPrice(n: number | null): string {
  if (n == null) return '—';
  return '₺' + n.toLocaleString('en-US');
}

function displayPlatform(row: SourcingRow): string {
  return row.source_platform === 'Other'
    ? (row.source_platform_custom || 'Other')
    : row.source_platform;
}

// Same fallback shape as displayPlatform: a linked model_group wins, otherwise
// the free-text model the employee typed under "Other".
function displayModel(row: SourcingRow): string {
  return row.model_name ?? row.model_group_custom ?? '—';
}

function isCustomModel(row: SourcingRow): boolean {
  return row.model_group_id == null && !!row.model_group_custom;
}

// ─── Toast ─────────────────────────────────────────────────────────────────────

interface ToastState { message: string; type: 'success' | 'error'; }
const Toast: React.FC<ToastState> = ({ message, type }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: type === 'success' ? '#0f1117' : '#ef4444',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'slideUpIn 200ms ease',
    }}>
      {type === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
      }
      {message}
    </div>,
    document.body,
  );

// ─── Badges ────────────────────────────────────────────────────────────────────

const LeadBadge: React.FC<{ status: LeadStatus }> = ({ status }) => {
  const cfg = LEAD_CFG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg,
      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {status}
    </span>
  );
};

const TransBadge: React.FC<{ t: Transmission | null }> = ({ t }) => {
  if (!t) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;
  const cfg = TRANS_CFG[t] ?? { color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg,
      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      {t}
    </span>
  );
};

const FuelBadge: React.FC<{ f: FuelType | null }> = ({ f }) => {
  if (!f) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;
  const cfg = FUEL_CFG[f] ?? { color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg,
      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      {f}
    </span>
  );
};

// ─── Action button ─────────────────────────────────────────────────────────────

const ActionBtn: React.FC<{
  onClick: () => void; title: string; hoverColor: string; children: React.ReactNode;
}> = ({ onClick, title, hoverColor, children }) => {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 30, height: 30, borderRadius: 7, border: 'none',
        background: hov ? `${hoverColor}18` : 'transparent',
        color: hov ? hoverColor : '#9ca3af',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 140ms ease', flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
};

// ─── Status toggle ─────────────────────────────────────────────────────────────

const StatusToggle: React.FC<{
  id: number; status: ListingStatus;
  onChange: (id: number, next: ListingStatus) => void;
}> = ({ id, status, onChange }) => {
  const [busy, setBusy] = useState(false);
  const active = status === 'Active';
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next: ListingStatus = active ? 'Sold' : 'Active';
    setBusy(true);
    const { error } = await supabase.from('sourcing').update({ listing_status: next }).eq('id', id);
    setBusy(false);
    if (!error) onChange(id, next);
  };
  return (
    <button
      onClick={toggle} disabled={busy}
      title={active ? 'Mark as Sold' : 'Mark as Active'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 11px', borderRadius: 20, border: 'none',
        cursor: busy ? 'not-allowed' : 'pointer',
        fontSize: 11, fontWeight: 700, opacity: busy ? 0.6 : 1,
        background: active ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.1)',
        color: active ? '#16a34a' : '#6b7280',
        transition: 'all 150ms ease',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: active ? '#22c55e' : '#9ca3af' }} />
      {active ? 'Active' : 'Sold'}
    </button>
  );
};

// ─── KPI card ──────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  label: string; count: number; description: string;
  accentColor: string; iconBg: string; icon: React.ReactNode; loading: boolean;
}> = ({ label, count, description, accentColor, iconBg, icon, loading }) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onMouseEnter={() => { if (ref.current) { ref.current.style.transform = 'translateY(-4px)'; ref.current.style.boxShadow = '0 16px 40px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)'; }}}
      onMouseLeave={() => { if (ref.current) { ref.current.style.transform = 'translateY(0)'; ref.current.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)'; }}}
      style={{
        background: '#fff', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        transition: 'transform 200ms ease, box-shadow 200ms ease',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ height: 4, background: accentColor, flexShrink: 0 }} />
      <div style={{ padding: '24px 24px 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 42, height: 42, borderRadius: 11, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          {loading
            ? <div style={{ width: '50%', height: 52, borderRadius: 8, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
            : <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-3px', color: '#0f1117', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{count}</div>
          }
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0f1117', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.4 }}>{description}</div>
        </div>
      </div>
    </div>
  );
};

// ─── Platform multi-select dropdown ────────────────────────────────────────────

const PlatformFilter: React.FC<{
  selected: string[]; onChange: (v: string[]) => void;
}> = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          height: 38, padding: '0 12px', border: '1.5px solid #e5e7eb', borderRadius: 8,
          background: selected.length > 0 ? 'rgba(75,166,234,0.06)' : '#fff',
          cursor: 'pointer', fontSize: 13, color: '#374151', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}
      >
        Platform
        {selected.length > 0 && (
          <span style={{ background: '#4ba6ea', color: '#fff', borderRadius: 20, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>
            {selected.length}
          </span>
        )}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 1 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
          background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
          boxShadow: '0 8px 24px rgba(0,0,0,0.10)', minWidth: 210, padding: '6px 0',
        }}>
          {PLATFORM_OPTIONS.map(p => (
            <label
              key={p}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#374151' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f7f8fa')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <input
                type="checkbox" checked={selected.includes(p)}
                onChange={e => onChange(e.target.checked ? [...selected, p] : selected.filter(s => s !== p))}
                style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#4ba6ea' }}
              />
              {p}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Sortable table header cell ─────────────────────────────────────────────────

const SortTh: React.FC<{
  col: SortCol; activeCol: SortCol | null; dir: 'asc' | 'desc';
  onSort: (c: SortCol) => void; children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ col, activeCol, dir, onSort, children, style }) => {
  const active = activeCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLTableCellElement).style.color = '#6b7280'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLTableCellElement).style.color = '#9ca3af'; }}
      style={{
        padding: '9px 12px', fontSize: 11, fontWeight: 700,
        color: active ? '#4ba6ea' : '#9ca3af',
        textTransform: 'uppercase', letterSpacing: '0.7px',
        textAlign: 'left', background: '#fff',
        borderBottom: '1.5px solid #f0f0f0',
        whiteSpace: 'nowrap', userSelect: 'none', cursor: 'pointer',
        ...style,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {children}
        {active
          ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              {dir === 'asc'
                ? <path d="M12 19V5M5 12l7-7 7 7" stroke="#4ba6ea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                : <path d="M12 5v14M5 12l7 7 7-7" stroke="#4ba6ea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              }
            </svg>
          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3 }}>
              <path d="M12 5v14M7 9l5-5 5 5M7 15l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        }
      </span>
    </th>
  );
};

const PlainTh: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <th style={{
    padding: '9px 12px', fontSize: 11, fontWeight: 700,
    color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
    textAlign: 'left', background: '#fff', borderBottom: '1.5px solid #f0f0f0',
    whiteSpace: 'nowrap', userSelect: 'none', ...style,
  }}>
    {children}
  </th>
);

// ─── Searchable single-select (typeahead) ───────────────────────────────────────
// Shared by the City / District pickers in the modal and the toolbar filters so
// they stay visually consistent with the modal inputs.

const SearchableSelect: React.FC<{
  value: string;
  onChange: (id: string) => void;
  options: GeoOption[];
  placeholder: string;
  disabled?: boolean;
  disabledPlaceholder?: string;
  height?: number;
}> = ({ value, onChange, options, placeholder, disabled = false, disabledPlaceholder, height = 40 }) => {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.id === value) ?? null;
  const filtered = search.trim()
    ? options.filter(o => o.name.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const shownPlaceholder = disabled ? (disabledPlaceholder ?? placeholder) : placeholder;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setOpen(o => !o); setSearch(''); } }}
        style={{
          width: '100%', height, padding: '0 12px', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          border: '1.5px solid #e5e7eb', borderRadius: 8, fontFamily: 'inherit',
          fontSize: height >= 40 ? 14 : 13, textAlign: 'left',
          background: disabled ? '#f9fafb' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: selected ? '#0f1117' : '#9ca3af',
          transition: 'border-color 150ms ease',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.name : shownPlaceholder}
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && !disabled && (
        <div style={{
          position: 'absolute', top: height + 4, left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10,
          boxShadow: '0 8px 28px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px 6px' }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{
                width: '100%', height: 34, padding: '0 10px', fontSize: 13,
                border: '1.5px solid #e5e7eb', borderRadius: 7, outline: 'none',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.map(o => (
              <button
                key={o.id || '__all__'}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); setSearch(''); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 14px', border: 'none',
                  background: o.id === value ? 'rgba(75,166,234,0.08)' : 'none',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: '#374151',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f7f8fa'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = o.id === value ? 'rgba(75,166,234,0.08)' : 'none'; }}
              >
                {o.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: 12, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Modal section header ───────────────────────────────────────────────────────

const ModalSection: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
      <span style={{ color: '#9ca3af' }}>{icon}</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.9px', textTransform: 'uppercase' }}>
        {title}
      </span>
    </div>
    <div style={{ height: 1, background: '#f0f0f0', marginBottom: 14 }} />
    {children}
  </div>
);

// ─── Sourcing Modal ─────────────────────────────────────────────────────────────

interface SourcingModalProps {
  editRow: SourcingRow | null;
  modelGroups: ModelGroupOption[];
  cities: GeoOption[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}

const SourcingModal: React.FC<SourcingModalProps> = ({ editRow, modelGroups, cities, onClose, onSaved }) => {
  const isEdit = editRow !== null;
  const [form, setForm] = useState<SourcingForm>(
    editRow ? {
      source_platform: editRow.source_platform,
      source_platform_custom: editRow.source_platform_custom ?? '',
      listing_url: editRow.listing_url ?? '',
      listed_on: editRow.listed_on ?? '',
      model_group_id: editRow.model_group_id != null
        ? String(editRow.model_group_id)
        : (editRow.model_group_custom ? MODEL_OTHER : ''),
      model_group_custom: editRow.model_group_custom ?? '',
      model_year: editRow.model_year != null ? String(editRow.model_year) : '',
      mileage_km: editRow.mileage_km != null ? String(editRow.mileage_km) : '',
      transmission: editRow.transmission ?? '',
      fuel_type: editRow.fuel_type ?? '',
      trim_package: editRow.trim_package ?? '',
      damage_record: editRow.damage_record ?? '',
      damage_value: editRow.damage_value != null ? String(editRow.damage_value) : '',
      paint_sections_count: editRow.paint_sections_count != null ? String(editRow.paint_sections_count) : '',
      asking_price: editRow.asking_price != null ? String(editRow.asking_price) : '',
      target_price: editRow.target_price != null ? String(editRow.target_price) : '',
      city_id: editRow.city_id != null ? String(editRow.city_id) : '',
      district_id: editRow.district_id != null ? String(editRow.district_id) : '',
      lead_status: editRow.lead_status,
      listing_status: editRow.listing_status,
      notes: editRow.notes ?? '',
    } : { ...EMPTY_FORM }
  );

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Districts depend on the selected city. Reloaded whenever city_id changes.
  // On edit, the initial city_id triggers a load and the prefilled district survives.
  const [districts, setDistricts] = useState<GeoOption[]>([]);
  useEffect(() => {
    if (!form.city_id) { setDistricts([]); return; }
    let active = true;
    fetchDistricts(form.city_id).then(d => { if (active) setDistricts(d); });
    return () => { active = false; };
  }, [form.city_id]);

  // Changing city resets the district selection (controlled dependent pattern).
  const handleCityChange = (id: string) =>
    setForm(f => ({ ...f, city_id: id, district_id: '' }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const set = <K extends keyof SourcingForm>(key: K, val: SourcingForm[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setFormError(null);
    if (!form.source_platform) { setFormError('Source platform is required.'); return; }
    if (!form.model_group_id)  { setFormError('Model group is required.'); return; }
    if (form.model_group_id === MODEL_OTHER && !form.model_group_custom.trim()) {
      setFormError('Model name is required when Model Group is "Other".'); return;
    }
    if (!form.model_year)      { setFormError('Year is required.'); return; }
    if (!form.city_id)         { setFormError('City is required.'); return; }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    const payload: Record<string, unknown> = {
      source_platform: form.source_platform,
      source_platform_custom: form.source_platform === 'Other' ? (form.source_platform_custom.trim() || null) : null,
      listing_url: form.listing_url.trim() || null,
      listed_on: form.listed_on || null,
      model_group_id: form.model_group_id === MODEL_OTHER ? null : Number(form.model_group_id),
      model_group_custom: form.model_group_id === MODEL_OTHER ? (form.model_group_custom.trim() || null) : null,
      model_year: Number(form.model_year),
      mileage_km: form.mileage_km !== '' ? Number(form.mileage_km) : null,
      transmission: form.transmission || null,
      fuel_type: form.fuel_type || null,
      trim_package: form.trim_package.trim() || null,
      damage_record: form.damage_record || null,
      damage_value: form.damage_record === 'Damage Value' && form.damage_value !== '' ? Number(form.damage_value) : null,
      paint_sections_count: form.paint_sections_count !== '' ? Number(form.paint_sections_count) : null,
      asking_price: form.asking_price !== '' ? Number(form.asking_price) : null,
      target_price: form.target_price !== '' ? Number(form.target_price) : null,
      // Sent as the raw selected id (string) — Postgres coerces to bigint/uuid as needed.
      city_id: form.city_id || null,
      district_id: form.district_id || null,
      lead_status: form.lead_status,
      listing_status: form.listing_status,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (isEdit) {
      ({ error } = await supabase.from('sourcing').update(payload).eq('id', editRow!.id));
    } else {
      ({ error } = await supabase.from('sourcing').insert({ ...payload, added_by: user?.id ?? null }));
    }

    setSaving(false);
    if (error) {
      // The DB trigger that checks district↔city belonging raises an exception;
      // surface a friendly message instead of the raw Postgres text.
      const friendly = /district/i.test(error.message) && /city/i.test(error.message)
        ? 'The selected district does not belong to the selected city.'
        : error.message;
      setFormError(friendly);
      return;
    }
    onSaved(isEdit ? 'Listing updated successfully' : 'Listing added successfully');
    onClose();
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const inp: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px', fontSize: 14,
    border: '1.5px solid #e5e7eb', borderRadius: 8, outline: 'none',
    color: '#0f1117', background: '#fff', boxSizing: 'border-box',
    fontFamily: 'inherit', transition: 'border-color 150ms ease',
  };
  const sel: React.CSSProperties = { ...inp, cursor: 'pointer', appearance: 'none' };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: '#374151', marginBottom: 5, letterSpacing: '0.1px',
  };
  const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

  return ReactDOM.createPortal(
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'fadeIn 160ms ease',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        animation: 'slideUp 200ms ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 24px 18px', borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>
              {isEdit ? 'Edit Listing' : 'Add Listing'}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              {isEdit ? 'Update this sourcing lead.' : 'Track a new car listing in the pipeline.'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Section 1 — Listing Source */}
          <ModalSection
            title="Listing Source"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={row2}>
                <div>
                  <label style={lbl}>Source Platform <span style={{ color: '#ef4444' }}>*</span></label>
                  <select value={form.source_platform} onChange={e => set('source_platform', e.target.value)} style={sel}>
                    <option value="">Select platform…</option>
                    {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Listed On</label>
                  <input type="date" value={form.listed_on} onChange={e => set('listed_on', e.target.value)} style={inp}
                    onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
              </div>
              {form.source_platform === 'Other' && (
                <div>
                  <label style={lbl}>Custom Platform Name</label>
                  <input type="text" value={form.source_platform_custom} onChange={e => set('source_platform_custom', e.target.value)}
                    placeholder="e.g. WhatsApp group, dealer site…" style={inp}
                    onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
              )}
              <div>
                <label style={lbl}>Listing URL</label>
                <input type="url" value={form.listing_url} onChange={e => set('listing_url', e.target.value)}
                  placeholder="https://www.sahibinden.com/ilan/…" style={inp}
                  onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
                  onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                />
              </div>
            </div>
          </ModalSection>

          {/* Section 2 — Vehicle Details */}
          <ModalSection
            title="Vehicle Details"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><rect x="9" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/><circle cx="20" cy="16" r="1.2" fill="currentColor"/></svg>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Model Group <span style={{ color: '#ef4444' }}>*</span></label>
                <select value={form.model_group_id} onChange={e => set('model_group_id', e.target.value)} style={sel}>
                  <option value="">Select model…</option>
                  {modelGroups.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                  <option value={MODEL_OTHER}>Other (specify)</option>
                </select>
              </div>
              {form.model_group_id === MODEL_OTHER && (
                <div>
                  <label style={lbl}>Model name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="text" value={form.model_group_custom} onChange={e => set('model_group_custom', e.target.value)}
                    placeholder="e.g. Peugeot 2008, BYD Seal…" style={inp}
                    onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
              )}
              <div style={row2}>
                <div>
                  <label style={lbl}>Year <span style={{ color: '#ef4444' }}>*</span></label>
                  <select value={form.model_year} onChange={e => set('model_year', e.target.value)} style={sel}>
                    <option value="">Select year…</option>
                    {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Mileage (km)</label>
                  <input type="number" value={form.mileage_km} onChange={e => set('mileage_km', e.target.value)}
                    placeholder="e.g. 45000" style={inp} min={0}
                    onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
              </div>
              <div style={row2}>
                <div>
                  <label style={lbl}>Transmission</label>
                  <select value={form.transmission} onChange={e => set('transmission', e.target.value)} style={sel}>
                    <option value="">Select…</option>
                    <option value="Automatic">Automatic</option>
                    <option value="Manual">Manual</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Fuel Type</label>
                  <select value={form.fuel_type} onChange={e => set('fuel_type', e.target.value)} style={sel}>
                    <option value="">Select…</option>
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="Electric">Electric</option>
                    <option value="LPG">LPG</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Trim / Package</label>
                <input type="text" value={form.trim_package} onChange={e => set('trim_package', e.target.value)}
                  placeholder="e.g. Premium, Sport…" style={inp}
                  onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
                  onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                />
              </div>
            </div>
          </ModalSection>

          {/* Section 2b — Location */}
          <ModalSection
            title="Location"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>}
          >
            <div style={row2}>
              <div>
                <label style={lbl}>City <span style={{ color: '#ef4444' }}>*</span></label>
                <SearchableSelect
                  value={form.city_id}
                  onChange={handleCityChange}
                  options={cities}
                  placeholder="Select city..."
                />
              </div>
              <div>
                <label style={lbl}>District</label>
                <SearchableSelect
                  value={form.district_id}
                  onChange={id => set('district_id', id)}
                  options={districts}
                  placeholder="Select district..."
                  disabled={!form.city_id}
                  disabledPlaceholder="Select city first"
                />
              </div>
            </div>
          </ModalSection>

          {/* Section 3 — Condition */}
          <ModalSection
            title="Condition"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={row2}>
                <div>
                  <label style={lbl}>Damage Record</label>
                  <select value={form.damage_record} onChange={e => set('damage_record', e.target.value)} style={sel}>
                    <option value="">Select…</option>
                    <option value="No Damage">✅ No Damage</option>
                    <option value="Damage Value">⚠️ Damage Value</option>
                    <option value="Heavy Damage">🔴 Heavy Damage</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Paint Sections</label>
                  <input type="number" value={form.paint_sections_count} onChange={e => set('paint_sections_count', e.target.value)}
                    placeholder="0" style={inp} min={0}
                    onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
              </div>
              {form.damage_record === 'Damage Value' && (
                <div>
                  <label style={lbl}>Damage Amount (₺)</label>
                  <input type="number" value={form.damage_value} onChange={e => set('damage_value', e.target.value)}
                    placeholder="e.g. 5000" style={inp} min={0}
                    onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
              )}
            </div>
          </ModalSection>

          {/* Section 4 — Pricing & Lead */}
          <ModalSection
            title="Pricing & Lead"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><line x1="12" y1="1" x2="12" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={row2}>
                <div>
                  <label style={lbl}>Asking Price (₺)</label>
                  <input type="number" value={form.asking_price} onChange={e => set('asking_price', e.target.value)}
                    placeholder="e.g. 850000" style={inp} min={0}
                    onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
                <div>
                  <label style={lbl}>Target Price (₺)</label>
                  <input type="number" value={form.target_price} onChange={e => set('target_price', e.target.value)}
                    placeholder="e.g. 780000" style={inp} min={0}
                    onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
              </div>
              <div style={row2}>
                <div>
                  <label style={lbl}>Lead Status</label>
                  <select value={form.lead_status} onChange={e => set('lead_status', e.target.value as LeadStatus)} style={sel}>
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Listing Status</label>
                  <select value={form.listing_status} onChange={e => set('listing_status', e.target.value as ListingStatus)} style={sel}>
                    <option value="Active">Active</option>
                    <option value="Sold">Sold</option>
                  </select>
                </div>
              </div>
            </div>
          </ModalSection>

          {/* Section 5 — Notes */}
          <ModalSection
            title="Notes"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          >
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Internal notes about this listing…"
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14,
                border: '1.5px solid #e5e7eb', borderRadius: 8, outline: 'none',
                color: '#0f1117', background: '#fff', boxSizing: 'border-box',
                fontFamily: 'inherit', resize: 'vertical', transition: 'border-color 150ms ease',
              }}
              onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
              onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
            />
          </ModalSection>

          {/* Error */}
          {formError && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 9, padding: '10px 12px',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
                <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 13, color: '#dc2626' }}>{formError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f0f0f0',
          display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: 9, border: '1.5px solid #e5e7eb',
              background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '9px 22px', borderRadius: 9, border: 'none',
              background: saving ? '#93c5fd' : '#4ba6ea',
              fontSize: 14, fontWeight: 600, color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'background 150ms ease',
              boxShadow: saving ? 'none' : '0 2px 8px rgba(75,166,234,0.3)',
            }}
          >
            {saving && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.6s linear infinite' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
              </svg>
            )}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Listing'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Main page ──────────────────────────────────────────────────────────────────

const SourcingPage: React.FC = () => {
  const [rows,        setRows]        = useState<SourcingRow[]>([]);
  const [modelGroups, setModelGroups] = useState<ModelGroupOption[]>([]);
  const [cities,      setCities]      = useState<GeoOption[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [toast,       setToast]       = useState<ToastState | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editRow,   setEditRow]   = useState<SourcingRow | null>(null);

  // Filters
  const [search,          setSearch]          = useState('');
  const [platformFilter,  setPlatformFilter]  = useState<string[]>([]);
  const [statusFilter,    setStatusFilter]    = useState<'All' | ListingStatus>('All');
  const [leadFilter,      setLeadFilter]      = useState('');
  const [yearFrom,        setYearFrom]        = useState('');
  const [yearTo,          setYearTo]          = useState('');
  const [cityFilter,      setCityFilter]      = useState('');
  const [districtFilter,  setDistrictFilter]  = useState('');
  const [filterDistricts, setFilterDistricts] = useState<GeoOption[]>([]);

  // Toolbar district filter depends on the chosen filter city (same dependent pattern).
  useEffect(() => {
    if (!cityFilter) { setFilterDistricts([]); return; }
    let active = true;
    fetchDistricts(cityFilter).then(d => { if (active) setFilterDistricts(d); });
    return () => { active = false; };
  }, [cityFilter]);

  const handleFilterCityChange = (id: string) => { setCityFilter(id); setDistrictFilter(''); };

  // Sort — default Listed On desc
  const [sortCol, setSortCol] = useState<SortCol>('listed_on');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [srcRes, mgRes, cityRes] = await Promise.all([
      // Joined names pulled via the geo_cities / geo_districts foreign-key embeds.
      supabase.from('sourcing').select('*, geo_cities(name), geo_districts(name)').order('listed_on', { ascending: false }),
      supabase.from('model_group').select('id, name').order('name'),
      supabase.from('geo_cities').select('id, name').eq('is_active', true).order('name', { ascending: true }),
    ]);

    if (srcRes.error) { setError(srcRes.error.message); setLoading(false); return; }

    const mgData = (mgRes.data ?? []) as ModelGroupOption[];
    setModelGroups(mgData);
    // Fetched A→Z, then İstanbul is lifted to the top for the dropdowns.
    setCities(pinIstanbul((cityRes.data ?? []).map((c: { id: string | number; name: string }) => ({ id: String(c.id), name: c.name }))));
    const modelMap = new Map<number, string>(mgData.map(m => [m.id, m.name]));

    setRows(
      (srcRes.data ?? []).map((r: unknown) => {
        const row = r as SourcingRow;
        return {
          ...row,
          model_name: row.model_group_id != null ? (modelMap.get(row.model_group_id) ?? null) : null,
          city_name:     row.geo_cities?.name     ?? null,
          district_name: row.geo_districts?.name  ?? null,
        };
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // KPI counts
  const total    = rows.length;
  const active   = rows.filter(r => r.listing_status === 'Active').length;
  const sold     = rows.filter(r => r.listing_status === 'Sold').length;
  const hotLeads = rows.filter(r => r.lead_status === 'Contacted' || r.lead_status === 'Offer Sent').length;

  // Filter
  const filtered = rows.filter(row => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hit = [
        displayModel(row), row.trim_package, row.notes, row.listing_url, displayPlatform(row),
      ].some(f => (f ?? '').toLowerCase().includes(q));
      if (!hit) return false;
    }
    if (platformFilter.length > 0 && !platformFilter.includes(row.source_platform)) return false;
    if (statusFilter !== 'All' && row.listing_status !== statusFilter) return false;
    if (leadFilter && row.lead_status !== leadFilter) return false;
    if (yearFrom && (row.model_year ?? 0) < Number(yearFrom)) return false;
    if (yearTo   && (row.model_year ?? 9999) > Number(yearTo)) return false;
    if (cityFilter && String(row.city_id ?? '') !== cityFilter) return false;
    if (districtFilter && String(row.district_id ?? '') !== districtFilter) return false;
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    // Locale-aware string columns (City / District). NULLs always sink to the
    // bottom regardless of direction; the rest compare with Turkish collation.
    if (sortCol === 'city_name' || sortCol === 'district_name') {
      const an = sortCol === 'city_name' ? a.city_name : a.district_name;
      const bn = sortCol === 'city_name' ? b.city_name : b.district_name;
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
      return an.localeCompare(bn, 'tr') * (sortDir === 'asc' ? 1 : -1);
    }

    let av: number | string;
    let bv: number | string;
    switch (sortCol) {
      case 'model_year':   av = a.model_year   ?? 0;    bv = b.model_year   ?? 0;    break;
      case 'mileage_km':   av = a.mileage_km   ?? 0;    bv = b.mileage_km   ?? 0;    break;
      case 'asking_price': av = a.asking_price ?? 0;    bv = b.asking_price ?? 0;    break;
      case 'listed_on':    av = a.listed_on    ?? '';   bv = b.listed_on    ?? '';   break;
      case 'lead_status':  av = LEAD_ORDER[a.lead_status]; bv = LEAD_ORDER[b.lead_status]; break;
      default:             av = 0; bv = 0;
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const handleStatusChange = (id: number, next: ListingStatus) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, listing_status: next } : r));

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this listing? This cannot be undone.')) return;
    const { error: err } = await supabase.from('sourcing').delete().eq('id', id);
    if (err) { showToast(err.message, 'error'); return; }
    setRows(prev => prev.filter(r => r.id !== id));
    showToast('Listing deleted', 'success');
  };

  const openAdd  = () => { setEditRow(null); setShowModal(true); };
  const openEdit = (row: SourcingRow) => { setEditRow(row); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditRow(null); };

  const hasFilters = !!(search || platformFilter.length || statusFilter !== 'All' || leadFilter || yearFrom || yearTo || cityFilter || districtFilter);
  const resetFilters = () => {
    setSearch(''); setPlatformFilter([]); setStatusFilter('All');
    setLeadFilter(''); setYearFrom(''); setYearTo('');
    setCityFilter(''); setDistrictFilter('');
  };

  const filterSel: React.CSSProperties = {
    height: 38, padding: '0 10px', fontSize: 13, border: '1.5px solid #e5e7eb',
    borderRadius: 8, outline: 'none', color: '#374151', background: '#fff',
    fontFamily: 'inherit', cursor: 'pointer', appearance: 'none',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)',
      padding: '44px 40px',
    }}>
      {/* Page header */}
      <div style={{ marginBottom: 36, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              Acquisitions
            </span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', marginBottom: 6, lineHeight: 1.1 }}>
            Sourcing
          </h1>
          <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>
            Daily market watch — cars we're tracking to buy.
          </p>
        </div>
        <button
          onClick={openAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: '#4ba6ea', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', flexShrink: 0,
            boxShadow: '0 2px 8px rgba(75,166,234,0.35)',
            transition: 'background 150ms ease, box-shadow 150ms ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 14px rgba(75,166,234,0.45)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(75,166,234,0.35)';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          Add Listing
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#fff', border: '1px solid rgba(239,68,68,0.2)',
          borderLeft: '4px solid #ef4444', borderRadius: 12,
          padding: '14px 18px', marginBottom: 32,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
            <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117', marginBottom: 2 }}>Failed to load sourcing data</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{error}</div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 36 }}>
        <KpiCard
          label="Total Listings" count={total} description="All tracked vehicles"
          accentColor="#4ba6ea" iconBg="rgba(75,166,234,0.1)" loading={loading}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#4ba6ea" strokeWidth="1.8"/><path d="M21 21l-4.35-4.35" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round"/></svg>}
        />
        <KpiCard
          label="Active" count={active} description="Listings still available"
          accentColor="#22c55e" iconBg="rgba(34,197,94,0.1)" loading={loading}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="9" stroke="#22c55e" strokeWidth="1.8"/></svg>}
        />
        <KpiCard
          label="Sold" count={sold} description="Already off the market"
          accentColor="#6b7280" iconBg="rgba(107,114,128,0.1)" loading={loading}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round"/></svg>}
        />
        <KpiCard
          label="Hot Leads" count={hotLeads} description="Contacted or offer sent"
          accentColor="#f97316" iconBg="rgba(249,115,22,0.1)" loading={loading}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        />
      </div>

      {/* Filter bar */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0',
        padding: '14px 18px', marginBottom: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search model, trim, notes, URL…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', height: 38, paddingLeft: 32, paddingRight: 12,
              fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 8,
              outline: 'none', color: '#0f1117', background: '#fff',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
            onFocus={e => (e.target.style.borderColor = '#4ba6ea')}
            onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
          />
        </div>

        <PlatformFilter selected={platformFilter} onChange={setPlatformFilter} />

        {/* Listing status */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} style={filterSel}>
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Sold">Sold</option>
        </select>

        {/* Lead status */}
        <select value={leadFilter} onChange={e => setLeadFilter(e.target.value)} style={filterSel}>
          <option value="">All Leads</option>
          {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* City filter */}
        <div style={{ width: 150, flexShrink: 0 }}>
          <SearchableSelect
            value={cityFilter}
            onChange={handleFilterCityChange}
            options={[{ id: '', name: 'All Cities' }, ...cities]}
            placeholder="All Cities"
            height={38}
          />
        </div>

        {/* District filter — enabled once a city is picked */}
        <div style={{ width: 150, flexShrink: 0 }}>
          <SearchableSelect
            value={districtFilter}
            onChange={setDistrictFilter}
            options={[{ id: '', name: 'All Districts' }, ...filterDistricts]}
            placeholder="All Districts"
            disabled={!cityFilter}
            disabledPlaceholder="District"
            height={38}
          />
        </div>

        {/* Year range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" placeholder="Year from" value={yearFrom}
            onChange={e => setYearFrom(e.target.value)}
            style={{ ...filterSel, width: 96, padding: '0 8px' }}
            min={2020} max={CURRENT_YEAR}
          />
          <span style={{ color: '#d1d5db', fontSize: 13 }}>–</span>
          <input
            type="number" placeholder="to" value={yearTo}
            onChange={e => setYearTo(e.target.value)}
            style={{ ...filterSel, width: 76, padding: '0 8px' }}
            min={2020} max={CURRENT_YEAR}
          />
        </div>

        {/* Reset */}
        {hasFilters && (
          <button
            onClick={resetFilters}
            style={{
              height: 38, padding: '0 12px', borderRadius: 8,
              border: '1.5px solid #e5e7eb', background: '#fff',
              fontSize: 13, fontWeight: 500, color: '#6b7280',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'border-color 140ms ease, color 140ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.color = '#6b7280'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
            Reset
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1560 }}>
            <thead>
              <tr>
                <PlainTh>Source</PlainTh>
                <PlainTh>Model</PlainTh>
                <SortTh col="model_year"   activeCol={sortCol} dir={sortDir} onSort={handleSort}>Year</SortTh>
                <SortTh col="mileage_km"   activeCol={sortCol} dir={sortDir} onSort={handleSort}>Mileage</SortTh>
                <SortTh col="city_name"     activeCol={sortCol} dir={sortDir} onSort={handleSort}>City</SortTh>
                <SortTh col="district_name" activeCol={sortCol} dir={sortDir} onSort={handleSort}>District</SortTh>
                <PlainTh>Trans.</PlainTh>
                <PlainTh>Fuel</PlainTh>
                <PlainTh>Damage</PlainTh>
                <PlainTh style={{ textAlign: 'center' }}>Paint</PlainTh>
                <PlainTh>Trim</PlainTh>
                <SortTh col="listed_on"    activeCol={sortCol} dir={sortDir} onSort={handleSort}>Listed On</SortTh>
                <SortTh col="asking_price" activeCol={sortCol} dir={sortDir} onSort={handleSort}>Asking</SortTh>
                <PlainTh>Target</PlainTh>
                <SortTh col="lead_status"  activeCol={sortCol} dir={sortDir} onSort={handleSort}>Lead</SortTh>
                <PlainTh>Status</PlainTh>
                <PlainTh style={{ textAlign: 'center' }}>Actions</PlainTh>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 17 }).map((__, j) => (
                      <td key={j} style={{ padding: '12px 12px' }}>
                        <div style={{ height: 13, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', width: [80, 100, 40, 70, 70, 70, 60, 55, 70, 30, 80, 70, 80, 80, 70, 55, 60][j] }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={17} style={{ padding: '56px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(75,166,234,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                          <circle cx="11" cy="11" r="7" stroke="#4ba6ea" strokeWidth="1.6"/>
                          <path d="M21 21l-4.35-4.35" stroke="#4ba6ea" strokeWidth="1.6" strokeLinecap="round"/>
                          <path d="M11 8v3M11 14h.01" stroke="#4ba6ea" strokeWidth="1.6" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#0f1117', marginBottom: 4 }}>
                          {hasFilters ? 'No listings match your filters.' : 'No listings yet.'}
                        </div>
                        <div style={{ fontSize: 13, color: '#9ca3af' }}>
                          {hasFilters ? 'Try adjusting your search or filters.' : 'Add your first car to start tracking the pipeline.'}
                        </div>
                      </div>
                      {hasFilters && (
                        <button onClick={resetFilters} style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : sorted.map((row, idx) => {
                const isSold = row.listing_status === 'Sold';
                const days   = daysAgo(row.listed_on);

                const tdBase: React.CSSProperties = {
                  padding: '11px 12px',
                  borderTop: idx === 0 ? 'none' : '1px solid #f7f7f7',
                  opacity: isSold ? 0.6 : 1,
                  transition: 'background 120ms ease',
                };

                return (
                  <tr
                    key={row.id}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#fafafa'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                  >
                    {/* Source */}
                    <td style={tdBase}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                        {displayPlatform(row)}
                      </span>
                    </td>

                    {/* Model */}
                    <td style={tdBase}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', whiteSpace: 'nowrap' }}>
                        {displayModel(row)}
                      </span>
                      {isCustomModel(row) && (
                        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6, whiteSpace: 'nowrap' }}>
                          (custom)
                        </span>
                      )}
                    </td>

                    {/* Year */}
                    <td style={tdBase}>
                      <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#0f1117' }}>
                        {row.model_year ?? '—'}
                      </span>
                    </td>

                    {/* Mileage */}
                    <td style={tdBase}>
                      <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#374151', whiteSpace: 'nowrap' }}>
                        {fmtMileage(row.mileage_km)}
                      </span>
                    </td>

                    {/* City */}
                    <td style={tdBase}>
                      {row.city_name
                        ? <span style={{ fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>{row.city_name}</span>
                        : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                    </td>

                    {/* District */}
                    <td style={tdBase}>
                      {row.district_name
                        ? <span style={{ fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>{row.district_name}</span>
                        : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                    </td>

                    {/* Transmission */}
                    <td style={tdBase}><TransBadge t={row.transmission} /></td>

                    {/* Fuel */}
                    <td style={tdBase}><FuelBadge f={row.fuel_type} /></td>

                    {/* Damage */}
                    <td style={tdBase}>
                      {row.damage_record ? (
                        <span style={{ fontSize: 12, fontWeight: 600, color: DAMAGE_CFG[row.damage_record].color, whiteSpace: 'nowrap' }}>
                          {row.damage_record === 'Damage Value'
                            ? fmtPrice(row.damage_value)
                            : row.damage_record
                          }
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Paint */}
                    <td style={{ ...tdBase, textAlign: 'center' }}>
                      <span style={{ fontSize: 13, color: (row.paint_sections_count ?? 0) > 0 ? '#0f1117' : '#9ca3af' }}>
                        {(row.paint_sections_count ?? 0) > 0 ? row.paint_sections_count : '—'}
                      </span>
                    </td>

                    {/* Trim */}
                    <td style={tdBase}>
                      <span style={{ fontSize: 12, color: '#374151' }}>{row.trim_package || '—'}</span>
                    </td>

                    {/* Listed On */}
                    <td style={tdBase}>
                      <div>
                        <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#374151', whiteSpace: 'nowrap' }}>
                          {fmtDate(row.listed_on)}
                        </div>
                        {days !== null && (
                          <div style={{ fontSize: 11, marginTop: 2, whiteSpace: 'nowrap', color: days === 0 ? '#16a34a' : days > 30 ? '#ef4444' : '#9ca3af' }}>
                            {days === 0 ? 'Today' : days === 1 ? '1 day ago' : `${days} days ago`}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Asking price */}
                    <td style={tdBase}>
                      <span style={{
                        fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                        color: '#0f1117', fontWeight: 600,
                        textDecoration: isSold ? 'line-through' : 'none',
                      }}>
                        {fmtPrice(row.asking_price)}
                      </span>
                    </td>

                    {/* Target price */}
                    <td style={tdBase}>
                      <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {fmtPrice(row.target_price)}
                      </span>
                    </td>

                    {/* Lead status */}
                    <td style={tdBase}><LeadBadge status={row.lead_status} /></td>

                    {/* Listing status toggle */}
                    <td style={tdBase}>
                      <StatusToggle id={row.id} status={row.listing_status} onChange={handleStatusChange} />
                    </td>

                    {/* Actions */}
                    <td style={{ ...tdBase, textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        {/* View */}
                        <ActionBtn
                          onClick={() => { if (row.listing_url) window.open(row.listing_url, '_blank', 'noreferrer'); }}
                          title={row.listing_url ? 'View listing' : 'No URL'}
                          hoverColor="#4ba6ea"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: row.listing_url ? 1 : 0.3 }}>
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </ActionBtn>
                        {/* Edit */}
                        <ActionBtn onClick={() => openEdit(row)} title="Edit listing" hoverColor="#4ba6ea">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </ActionBtn>
                        {/* Delete */}
                        <ActionBtn onClick={() => handleDelete(row.id)} title="Delete listing" hoverColor="#ef4444">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        {!loading && sorted.length > 0 && (
          <div style={{
            padding: '10px 18px', borderTop: '1px solid #f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              {sorted.length === rows.length
                ? `${rows.length} listing${rows.length !== 1 ? 's' : ''}`
                : `${sorted.length} of ${rows.length} listings`
              }
            </span>
            {hasFilters && (
              <button onClick={resetFilters} style={{ fontSize: 12, color: '#4ba6ea', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <SourcingModal
          editRow={editRow}
          modelGroups={modelGroups}
          cities={cities}
          onClose={closeModal}
          onSaved={(msg) => { showToast(msg, 'success'); fetchData(); }}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      <style>{`
        @keyframes fadeIn   { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp  { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes slideUpIn { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes pulse    { 0%, 100% { opacity: 1 } 50% { opacity: 0.45 } }
        @keyframes spin     { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
};

export default SourcingPage;
