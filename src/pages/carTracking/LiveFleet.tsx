import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight } from '../../components/media/MediaIcons';
import { ComplianceTriangle } from '../../components/shared/ComplianceBits';
import { FilterTile, FilterTileRow } from '../../components/shared/FilterTile';
import { SearchField } from '../../components/shared/PageBits';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import {
  hasLiveSignal,
  isIgnitionOn,
  km,
  kmRemaining,
  LIVE_FILTERS,
  liveStats,
  visibleLiveCars,
  type TrackedCar,
} from '../../lib/carTracking';
import { cn } from '../../lib/media/badgeColor';
import { CarIcon, PlateChip } from '../customers/ui';
import { CARD, IgnitionDot, OilBar, OilEditor, SignalAge } from './ui';

type SortKey = 'plate' | 'model' | 'current_km' | 'today_km' | 'speed' | 'next_oil_change' | 'remaining' | 'signal';

const IgnitionIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 3v9M6.3 7.3a8 8 0 1 0 11.4 0" />
  </svg>
);

const COLUMNS: Array<{ key: SortKey; label: string; end?: boolean }> = [
  { key: 'plate', label: 'Plate' },
  { key: 'model', label: 'Model' },
  { key: 'current_km', label: 'Current km', end: true },
  { key: 'today_km', label: 'Today', end: true },
  { key: 'speed', label: 'Speed', end: true },
  { key: 'next_oil_change', label: 'Next oil change' },
  { key: 'remaining', label: 'Remaining' },
  { key: 'signal', label: 'Last signal' },
];

function sortValue(car: TrackedCar, key: SortKey): string | number | null {
  if (key === 'remaining') return kmRemaining(car);
  if (key === 'signal') return car.last_signal_at;
  if (key === 'plate') return car.plate;
  return car[key];
}

/** Empty cells stay last whichever way it's sorted. */
function sorted(cars: TrackedCar[], key: SortKey, direction: 1 | -1): TrackedCar[] {
  return [...cars].sort((a, b) => {
    const first = sortValue(a, key);
    const second = sortValue(b, key);
    if (first === null) return second === null ? 0 : 1;
    if (second === null) return -1;
    if (typeof first === 'string') return direction * first.localeCompare(String(second));
    return direction * (first - Number(second));
  });
}

const Speed: React.FC<{ car: TrackedCar; now: number }> = ({ car, now }) => {
  if (!hasLiveSignal(car.last_signal_at, now)) return <span title={`Last reported ${car.speed} km/h`} className="text-black/30">—</span>;
  return <span className={car.speed > 0 ? 'font-medium text-foreground' : 'text-black/40'}>{car.speed} km/h</span>;
};

const FleetCard: React.FC<{ car: TrackedCar; now: number; onOil: (value: number | null) => void }> = ({ car, now, onOil }) => (
  <li className={cn(CARD, 'min-w-0 p-3.5')}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <PlateChip plate={car.plate} />
        <p className="mt-1 truncate text-[13px] text-black/60">{car.model ?? <span className="text-[#B45309]">Not linked to a car</span>}</p>
      </div>
      <IgnitionDot car={car} live={isIgnitionOn(car, now)} now={now} />
    </div>
    <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px] tabular-nums">
      <div className="min-w-0"><dt className="text-[11.5px] text-black/45">Current km</dt><dd className="truncate text-foreground">{km(car.current_km)}</dd></div>
      <div className="min-w-0"><dt className="text-[11.5px] text-black/45">Today</dt><dd className="truncate font-medium text-foreground">{km(car.today_km)} km</dd></div>
      <div className="min-w-0"><dt className="text-[11.5px] text-black/45">Speed</dt><dd className="truncate"><Speed car={car} now={now} /></dd></div>
    </dl>
    <div className="mt-2.5"><OilBar remaining={kmRemaining(car)} /></div>
    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
      <span className="flex items-center gap-1.5 text-[12px] text-black/45">Oil at <OilEditor car={car} onSaved={onOil} /></span>
      <SignalAge at={car.last_signal_at} now={now} />
    </div>
  </li>
);

export const LiveFleet: React.FC<{
  cars: TrackedCar[];
  now: number;
  onOil: (id: number, value: number | null) => void;
}> = ({ cars, now, onOil }) => {
  const { filter, toggle, clear } = useUrlFilter(LIVE_FILTERS);
  const wide = useMediaQuery('(min-width: 1280px)');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: 'plate', direction: 1 });

  const stats = useMemo(() => liveStats(cars, now), [cars, now]);
  const visible = useMemo(
    () => sorted(visibleLiveCars(cars, filter, now, search), sort.key, sort.direction),
    [cars, filter, now, search, sort],
  );

  const sortBy = (key: SortKey) => setSort((current) => (
    current.key === key ? { key, direction: current.direction === 1 ? -1 : 1 } : { key, direction: 1 }
  ));

  return (
    <>
      <div className="mt-2">
        <FilterTileRow label="Filter the fleet" six>
          <FilterTile tone="blue" icon={<CarIcon size={15} />} label="All cars" value={String(stats.cars)} sub="tracked" active={filter === 'all'} onClick={clear} />
          <FilterTile tone="green" icon={<ArrowUpRight size={15} />} label="Moving now" value={String(stats.moving)} sub="cars" active={filter === 'moving'} onClick={() => toggle('moving')} />
          <FilterTile tone="teal" icon={<IgnitionIcon />} label="Ignition on" value={String(stats.ignition)} sub="cars" active={filter === 'ignition'} onClick={() => toggle('ignition')} />
          <FilterTile tone="amber" bareIcon icon={<ComplianceTriangle tone="amber" size={32} />} label="Oil change due" value={String(stats.oilDue)} sub="1,000 km or less" active={filter === 'oil_due'} onClick={() => toggle('oil_due')} />
          <FilterTile tone="red" bareIcon icon={<ComplianceTriangle tone="red" size={32} />} label="Overdue oil" value={String(stats.oilOver)} sub="cars" active={filter === 'oil_over'} onClick={() => toggle('oil_over')} />
          <FilterTile tone="amber" bareIcon icon={<ComplianceTriangle tone="amber" size={32} />} label="No signal > 24h" value={String(stats.noSignal)} sub="cars" active={filter === 'no_signal'} onClick={() => toggle('no_signal')} />
        </FilterTileRow>
      </div>

      <SearchField value={search} onChange={setSearch} placeholder="Search plate or model…" className="mt-4 max-w-[1100px]" />

      {visible.length === 0 ? (
        <p className={cn(CARD, 'mt-4 max-w-[1100px] px-4 py-10 text-center text-[13.5px] text-black/45')}>
          {cars.length === 0 ? 'No tracking data found.' : 'No cars match this view.'}
        </p>
      ) : wide ? (
        <div className={cn(CARD, 'mt-4 max-w-[1100px] overflow-x-auto')}>
          <table className="w-full min-w-[980px] text-[13px]">
            <thead>
              <tr className="border-b border-subtle">
                {COLUMNS.slice(0, 4).map((column) => <Heading key={column.key} column={column} sort={sort} onSort={sortBy} />)}
                <th scope="col" className="px-3 py-2 text-start text-[11.5px] font-medium text-black/45">Ignition</th>
                {COLUMNS.slice(4).map((column) => <Heading key={column.key} column={column} sort={sort} onSort={sortBy} />)}
              </tr>
            </thead>
            <tbody>
              {visible.map((car) => (
                <tr key={car.id} className="border-b border-subtle last:border-b-0">
                  <td className="px-3 py-2"><PlateChip plate={car.plate} /></td>
                  <td className="max-w-[150px] truncate px-3 py-2 text-black/60">{car.model ?? <span className="text-[#B45309]">Not linked</span>}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-foreground">{km(car.current_km)}</td>
                  <td className={cn('px-3 py-2 text-end tabular-nums', car.today_km > 0 ? 'font-medium text-foreground' : 'text-black/30')}>{km(car.today_km)}</td>
                  <td className="px-3 py-2"><IgnitionDot car={car} live={isIgnitionOn(car, now)} now={now} /></td>
                  <td className="whitespace-nowrap px-3 py-2 text-end tabular-nums"><Speed car={car} now={now} /></td>
                  <td className="px-3 py-1"><OilEditor car={car} onSaved={(value) => onOil(car.id, value)} /></td>
                  <td className="w-[170px] px-3 py-2"><OilBar remaining={kmRemaining(car)} /></td>
                  <td className="px-3 py-2"><SignalAge at={car.last_signal_at} now={now} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="mt-4 grid max-w-[1100px] grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((car) => <FleetCard key={car.id} car={car} now={now} onOil={(value) => onOil(car.id, value)} />)}
        </ul>
      )}
    </>
  );
};

const Heading: React.FC<{
  column: { key: SortKey; label: string; end?: boolean };
  sort: { key: SortKey; direction: 1 | -1 };
  onSort: (key: SortKey) => void;
}> = ({ column, sort, onSort }) => {
  const active = sort.key === column.key;
  const Arrow = sort.direction === 1 ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none'}
      className={cn('px-3 py-2 text-[11.5px] font-medium', column.end ? 'text-end' : 'text-start')}
    >
      <button type="button" onClick={() => onSort(column.key)} className={cn('inline-flex items-center gap-1 whitespace-nowrap', active ? 'text-primary' : 'text-black/45 hover:text-foreground')}>
        {column.label}
        {active && <Arrow size={11} />}
      </button>
    </th>
  );
};
