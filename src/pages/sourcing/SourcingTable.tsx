import React from 'react';
import { ArrowDown, ArrowUp, Pencil } from '../../components/media/MediaIcons';
import { CarThumb } from '../../components/shared/CarThumb';
import { formatLira } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import type { ProfileOption } from '../../lib/notifications';
import {
  PAYBACK_COLORS,
  carName,
  daysListed,
  type InvestmentCheck,
  type LeadStage,
  type SourcingRow,
  type TableSort,
} from '../../lib/sourcing';
import { AddedBy, DamageBadges, ExternalLinkIcon, GapPill, LeadSelect, PlatformChip } from './SourcingParts';

const TH = 'sticky top-0 z-10 whitespace-nowrap bg-[#F8F9FB] px-3 py-2.5 text-start text-[11.5px] font-medium text-black/50 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]';
const TD = 'whitespace-nowrap px-3 py-2.5 align-middle';

const SortHead: React.FC<{ label: string; sortKey: TableSort; active: TableSort; direction: 'asc' | 'desc'; onSort: (key: TableSort) => void; end?: boolean }> = ({ label, sortKey, active, direction, onSort, end }) => {
  const Arrow = direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={cn(TH, end && 'text-end')} aria-sort={active === sortKey ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(sortKey)} className={cn('inline-flex min-h-[32px] items-center gap-1 rounded-md hover:text-foreground', end && 'flex-row-reverse', active === sortKey && 'text-foreground')}>
        {label}
        {active === sortKey && <Arrow size={12} />}
      </button>
    </th>
  );
};

/** Every listing in one sheet: scrolls sideways on a phone, header kept in view. */
export const SourcingTable: React.FC<{
  rows: SourcingRow[];
  today: string;
  checkFor: (row: SourcingRow) => InvestmentCheck | null;
  people: Record<string, ProfileOption>;
  moving: Set<number>;
  sort: { key: TableSort; direction: 'asc' | 'desc'; sortBy: (key: TableSort) => void };
  onOpen: (row: SourcingRow) => void;
  onMove: (row: SourcingRow, stage: LeadStage) => void;
}> = ({ rows, today, checkFor, people, moving, sort, onOpen, onMove }) => (
  <div className="overflow-hidden rounded-2xl border border-subtle bg-surface">
    <div className="max-h-[calc(100dvh-220px)] overflow-auto overscroll-contain">
      <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th className={TH}>Car</th>
            <th className={TH}>Source</th>
            <SortHead label="Year" sortKey="year" active={sort.key} direction={sort.direction} onSort={sort.sortBy} />
            <SortHead label="Mileage" sortKey="km" active={sort.key} direction={sort.direction} onSort={sort.sortBy} end />
            <th className={TH}>Location</th>
            <th className={TH}>Damage</th>
            <SortHead label="Listed" sortKey="listed" active={sort.key} direction={sort.direction} onSort={sort.sortBy} />
            <SortHead label="Asking" sortKey="asking" active={sort.key} direction={sort.direction} onSort={sort.sortBy} end />
            <th className={cn(TH, 'text-end')}>Target</th>
            <SortHead label="Gap" sortKey="gap" active={sort.key} direction={sort.direction} onSort={sort.sortBy} end />
            <th className={TH}>Payback</th>
            <th className={TH}>Lead</th>
            <th className={TH}>Listing</th>
            <th className={cn(TH, 'w-[88px]')}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const check = checkFor(row);
            const days = daysListed(row.listed_on, today);
            const tone = check?.tone ? PAYBACK_COLORS[check.tone] : null;
            return (
              <tr key={row.id} onClick={() => onOpen(row)} className={cn('cursor-pointer transition-colors hover:bg-[#6EA4E7]/[0.06]', index % 2 === 1 && 'bg-[#FAFBFC]', moving.has(row.id) && 'opacity-60')}>
                <td className={TD}>
                  <div className="flex items-center gap-2.5">
                    <CarThumb src={row.group?.image_url ?? null} width={56} height={34} />
                    <div className="min-w-0">
                      <div className="max-w-[200px] truncate font-medium text-foreground">{carName(row)}</div>
                      <div className="max-w-[200px] truncate text-[12px] text-black/45">{[row.trim_package, row.transmission, row.fuel_type].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                  </div>
                </td>
                <td className={TD}><PlatformChip row={row} className="!shadow-none ring-1 ring-black/[0.06]" /></td>
                <td className={cn(TD, 'tabular-nums')}>{row.model_year}</td>
                <td className={cn(TD, 'text-end tabular-nums')}>{row.mileage_km !== null ? row.mileage_km.toLocaleString('en-US') : '—'}</td>
                <td className={TD}><div className="max-w-[160px] truncate">{[row.district, row.city].filter(Boolean).join(', ') || '—'}</div></td>
                <td className={TD}><DamageBadges row={row} className="flex-nowrap" /></td>
                <td className={cn(TD, 'text-black/60')}>{days === null ? '—' : days === 0 ? 'Today' : `${days}d ago`}</td>
                <td className={cn(TD, 'text-end font-semibold tabular-nums text-foreground')}>{row.asking_price !== null ? formatLira(row.asking_price) : '—'}</td>
                <td className={cn(TD, 'text-end tabular-nums text-black/60')}>{row.target_price !== null ? formatLira(row.target_price) : '—'}</td>
                <td className={cn(TD, 'text-end')}><GapPill asking={row.asking_price} target={row.target_price} /></td>
                <td className={TD}>
                  {check?.paybackMonths != null && tone ? (
                    <span className="inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-semibold tabular-nums" style={{ background: tone.soft, color: tone.ink }}>
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
                      {check.paybackMonths.toLocaleString('en-US', { maximumFractionDigits: 1 })} mo
                    </span>
                  ) : <span className="text-black/35">—</span>}
                </td>
                <td className={TD}><LeadSelect row={row} onMove={(stage) => onMove(row, stage)} disabled={moving.has(row.id)} /></td>
                <td className={TD}>
                  <span className={cn('inline-flex h-6 items-center rounded-full px-2 text-[11.5px] font-medium', row.listing_status === 'Sold' ? 'bg-black/[0.06] text-black/55' : 'bg-[#E7F6EC] text-[#166534]')}>{row.listing_status ?? 'Active'}</span>
                </td>
                <td className={TD}>
                  <div className="flex items-center justify-end gap-1">
                    <AddedBy profile={row.added_by ? people[row.added_by] : undefined} size={20} />
                    {row.listing_url && (
                      <a href={row.listing_url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} aria-label={`Open the listing for ${carName(row)}`} className="grid h-11 w-9 place-items-center rounded-lg text-black/45 hover:bg-black/[0.05] hover:text-brand-strong md:h-8">
                        <ExternalLinkIcon />
                      </a>
                    )}
                    <button type="button" aria-label={`Edit ${carName(row)}`} onClick={(event) => { event.stopPropagation(); onOpen(row); }} className="grid h-11 w-9 place-items-center rounded-lg text-black/45 hover:bg-black/[0.05] hover:text-brand-strong md:h-8">
                      <Pencil size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);
