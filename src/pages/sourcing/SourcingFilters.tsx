import React, { useEffect, useState } from 'react';
import { SearchField } from '../../components/shared/PageBits';
import { cn } from '../../lib/media/badgeColor';
import {
  LEAD_STAGES,
  LEAD_TONES,
  LISTING_STATUSES,
  NO_FILTERS,
  PLATFORMS,
  activeFilterCount,
  fetchDistricts,
  parseAmount,
  platformLabel,
  type GeoOption,
  type SourcingFilters,
} from '../../lib/sourcing';

const CONTROL = 'h-11 min-w-0 rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[13.5px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-black/35 focus:border-[#6EA4E7] focus:ring-[3px] focus:ring-[#6EA4E7]/25 disabled:bg-black/[0.03] disabled:text-black/35 md:h-10';
const SELECT = cn(CONTROL, 'cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%236b7280%27%20stroke-width=%272.2%27%3E%3Cpath%20d=%27M6%209l6%206%206-6%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_10px_center] bg-no-repeat pe-7');

const toNumber = (value: string): number | null => {
  const parsed = parseAmount(value);
  return parsed === null || Number.isNaN(parsed) ? null : parsed;
};

/** Search on its own line; the rest behind "Filters" on a phone, in a row on a wider screen. */
export const SourcingFilterBar: React.FC<{
  filters: SourcingFilters;
  cities: GeoOption[];
  onChange: (next: SourcingFilters) => void;
}> = ({ filters, cities, onChange }) => {
  const [open, setOpen] = useState(false);
  const [districts, setDistricts] = useState<GeoOption[]>([]);
  const count = activeFilterCount(filters);
  const set = <K extends keyof SourcingFilters>(key: K, value: SourcingFilters[K]) => onChange({ ...filters, [key]: value });

  useEffect(() => {
    let active = true;
    if (filters.city === null) { setDistricts([]); return undefined; }
    fetchDistricts(filters.city).then((rows) => { if (active) setDistricts(rows); }).catch(() => { if (active) setDistricts([]); });
    return () => { active = false; };
  }, [filters.city]);

  return (
    <div className="mb-4 mt-4 flex flex-col gap-2">
      <div className="flex gap-2">
        <SearchField value={filters.query} onChange={(value) => set('query', value)} placeholder="Search model, trim, city or notes" className="flex-1 sm:max-w-[360px]" />
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={cn('inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium md:hidden', count ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.08] text-brand-strong' : 'border-[#E5E7EB] bg-white text-black/60')}
        >
          Filters{count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#6EA4E7] px-1 text-[11px] text-white">{count}</span>}
        </button>
      </div>

      <div role="group" aria-label="Filter the listings" className={cn('grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center', !open && 'hidden md:flex')}>
        <select aria-label="Platform" className={cn(SELECT, 'md:w-[150px]')} value={filters.platform} onChange={(event) => set('platform', event.target.value)}>
          <option value="">All platforms</option>
          {PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform === 'Other' ? 'Other' : platformLabel({ source_platform: platform, source_platform_custom: null })}</option>)}
        </select>
        <select aria-label="Listing status" className={cn(SELECT, 'md:w-[136px]')} value={filters.listing} onChange={(event) => set('listing', event.target.value)}>
          <option value="">Any listing</option>
          {LISTING_STATUSES.map((status) => <option key={status} value={status}>{status === 'Active' ? 'Still listed' : 'Sold'}</option>)}
        </select>
        <select aria-label="Lead stage" className={cn(SELECT, 'md:w-[140px]')} value={filters.lead} onChange={(event) => set('lead', event.target.value)}>
          <option value="">Any lead</option>
          {LEAD_STAGES.map((stage) => <option key={stage} value={stage}>{LEAD_TONES[stage].label}</option>)}
        </select>
        <select aria-label="City" className={cn(SELECT, 'md:w-[150px]')} value={filters.city ?? ''} onChange={(event) => onChange({ ...filters, city: event.target.value ? Number(event.target.value) : null, district: null })}>
          <option value="">Any city</option>
          {cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
        </select>
        <select aria-label="District" className={cn(SELECT, 'col-span-2 md:col-span-1 md:w-[150px]')} value={filters.district ?? ''} disabled={filters.city === null} onChange={(event) => set('district', event.target.value ? Number(event.target.value) : null)}>
          <option value="">{filters.city === null ? 'District: city first' : 'Any district'}</option>
          {districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <input aria-label="Year from" inputMode="numeric" placeholder="Year from" className={cn(CONTROL, 'w-full md:w-[96px]')} value={filters.yearFrom ?? ''} onChange={(event) => set('yearFrom', toNumber(event.target.value))} />
          <span aria-hidden="true" className="text-black/30">–</span>
          <input aria-label="Year to" inputMode="numeric" placeholder="to" className={cn(CONTROL, 'w-full md:w-[76px]')} value={filters.yearTo ?? ''} onChange={(event) => set('yearTo', toNumber(event.target.value))} />
        </div>
        <div className="flex items-center gap-1.5">
          <input aria-label="Price from (₺)" inputMode="numeric" placeholder="₺ from" className={cn(CONTROL, 'w-full md:w-[110px]')} value={filters.priceMin ?? ''} onChange={(event) => set('priceMin', toNumber(event.target.value))} />
          <span aria-hidden="true" className="text-black/30">–</span>
          <input aria-label="Price to (₺)" inputMode="numeric" placeholder="to" className={cn(CONTROL, 'w-full md:w-[110px]')} value={filters.priceMax ?? ''} onChange={(event) => set('priceMax', toNumber(event.target.value))} />
        </div>
        {count > 0 && (
          <button type="button" onClick={() => onChange({ ...NO_FILTERS, query: filters.query })} className="col-span-2 h-11 rounded-[10px] px-3 text-[13px] font-semibold text-brand-strong hover:bg-[#6EA4E7]/[0.08] md:col-span-1 md:h-10">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
};
