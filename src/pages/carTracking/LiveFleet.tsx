import React, { useMemo, useState } from 'react';
import { ArrowUpRight } from '../../components/media/MediaIcons';
import { FilterTile, FilterTileRow } from '../../components/shared/FilterTile';
import { SearchField } from '../../components/shared/PageBits';
import { StatusImage } from '../../components/shared/StatusImage';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import { useUrlSort } from '../../hooks/useUrlSort';
import {
  firstDirection,
  hasLiveSignal,
  isIgnitionOn,
  km,
  kmRemaining,
  LIVE_FILTERS,
  LIVE_SORTS,
  liveStats,
  sortLiveCars,
  visibleLiveCars,
  type LiveSort,
  type TrackedCar,
} from '../../lib/carTracking';
import { cn } from '../../lib/media/badgeColor';
import { CarLead, CARD, IgnitionDot, OilBar, OilEditor, SignalAge, SortHeader, SortMenu, TileTriangle } from './ui';

const SORT_LABELS: Array<{ key: LiveSort; label: string }> = [
  { key: 'remaining', label: 'Remaining km' },
  { key: 'today_km', label: 'Km today' },
  { key: 'current_km', label: 'Current km' },
  { key: 'speed', label: 'Speed' },
  { key: 'next_oil_change', label: 'Next oil change' },
  { key: 'signal', label: 'Last signal' },
  { key: 'plate', label: 'Plate' },
  { key: 'model', label: 'Model' },
];
const DEFAULT_SORT = { key: 'remaining', direction: 'asc' } as const;

const IgnitionIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 3v9M6.3 7.3a8 8 0 1 0 11.4 0" />
  </svg>
);

const Dash: React.FC = () => <span className="text-black/30">—</span>;

const Speed: React.FC<{ car: TrackedCar; now: number }> = ({ car, now }) => {
  if (!hasLiveSignal(car.last_signal_at, now)) return <span title={`Last reported ${car.speed} km/h`} className="text-black/30">—</span>;
  return <span className={car.speed > 0 ? 'font-medium text-foreground' : 'text-black/40'}>{car.speed} km/h</span>;
};

const Signal: React.FC<{ car: TrackedCar; now: number }> = ({ car, now }) => (
  car.tracked ? <SignalAge at={car.last_signal_at} now={now} /> : <span className="text-[13px] font-medium text-[#B45309]">No GPS</span>
);

const FleetCard: React.FC<{ car: TrackedCar; now: number; onOil: (value: number | null) => void }> = ({ car, now, onOil }) => (
  <li className={cn(CARD, 'min-w-0 p-3.5')}>
    <div className="flex items-center justify-between gap-3">
      <CarLead car={car} />
      {car.tracked
        ? <span className="shrink-0 text-[22px] font-semibold tabular-nums leading-none text-foreground">{km(car.today_km)}<span className="ms-1 text-[12px] font-normal text-black/40">km</span></span>
        : <Dash />}
    </div>
    {car.tracked && (
      <>
        <div className="mt-2.5"><OilBar remaining={kmRemaining(car)} /></div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 text-[13px] tabular-nums">
          <IgnitionDot car={car} live={isIgnitionOn(car, now)} now={now} />
          <Speed car={car} now={now} />
          <span className="text-black/50">{km(car.current_km)} km</span>
        </div>
      </>
    )}
    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
      {car.tracked && <span className="flex items-center gap-1.5 text-[12px] text-black/45">Oil at <OilEditor car={car} onSaved={onOil} /></span>}
      <span className="ms-auto"><Signal car={car} now={now} /></span>
    </div>
  </li>
);

export const LiveFleet: React.FC<{
  cars: TrackedCar[];
  noGps: TrackedCar[];
  now: number;
  onOil: (id: number, value: number | null) => void;
}> = ({ cars, noGps, now, onOil }) => {
  const { filter, toggle, clear } = useUrlFilter(LIVE_FILTERS);
  const sort = useUrlSort(LIVE_SORTS, DEFAULT_SORT, firstDirection);
  const wide = useMediaQuery('(min-width: 1280px)');
  const [search, setSearch] = useState('');

  const stats = useMemo(() => liveStats(cars, now), [cars, now]);
  const visible = useMemo(
    () => sortLiveCars(visibleLiveCars([...cars, ...noGps], filter, now, search), sort.key, sort.direction),
    [cars, noGps, filter, now, search, sort.key, sort.direction],
  );

  return (
    <>
      <div className="mt-3">
        <FilterTileRow label="Filter the fleet" columns={7}>
          <FilterTile tone="blue" bareIcon icon={<StatusImage status="fleet" size={32} />} label="All cars" value={String(stats.cars + noGps.length)} sub={`${stats.cars} tracked`} active={filter === 'all'} onClick={clear} />
          <FilterTile tone="blue" icon={<ArrowUpRight size={15} />} label="Moving now" value={String(stats.moving)} sub="cars" active={filter === 'moving'} onClick={() => toggle('moving')} />
          <FilterTile tone="green" icon={<IgnitionIcon />} label="Ignition on" value={String(stats.ignition)} sub="cars" active={filter === 'ignition'} onClick={() => toggle('ignition')} />
          <FilterTile tone="amber" bareIcon icon={<TileTriangle tone="amber" />} label="Oil change due" value={String(stats.oilDue)} sub="1,000 km or less" active={filter === 'oil_due'} onClick={() => toggle('oil_due')} />
          <FilterTile tone="red" bareIcon icon={<TileTriangle tone="red" />} label="Overdue oil" value={String(stats.oilOver)} sub="cars" active={filter === 'oil_over'} onClick={() => toggle('oil_over')} />
          <FilterTile tone="amber" bareIcon icon={<TileTriangle tone="amber" />} label="No signal > 24h" value={String(stats.noSignal)} sub="cars" active={filter === 'no_signal'} onClick={() => toggle('no_signal')} />
          <FilterTile tone="amber" bareIcon icon={<TileTriangle tone="amber" />} label="No GPS" value={String(noGps.length)} sub="no tracker" active={filter === 'no_gps'} onClick={() => toggle('no_gps')} />
        </FilterTileRow>
      </div>

      <SearchField value={search} onChange={setSearch} placeholder="Search plate or model…" className="mt-4 max-w-[1100px]" />

      {!wide && <SortMenu columns={SORT_LABELS} sort={sort} />}

      {visible.length === 0 ? (
        <p className={cn(CARD, 'mt-4 max-w-[1100px] px-4 py-10 text-center text-[13.5px] text-black/45')}>
          {cars.length === 0 && noGps.length === 0 ? 'No tracking data found.' : 'No cars match this view.'}
        </p>
      ) : wide ? (
        <div className={cn(CARD, 'mt-4 max-w-[1100px] overflow-x-auto')}>
          <table className="w-full min-w-[960px] text-[13px]">
            <thead>
              <tr className="border-b border-subtle">
                <SortHeader columns={[{ key: 'plate', label: 'Plate' }, { key: 'model', label: 'Model' }]} sort={sort} />
                <SortHeader columns={[{ key: 'current_km', label: 'Current km' }]} sort={sort} end />
                <SortHeader columns={[{ key: 'today_km', label: 'Today' }]} sort={sort} end />
                <th scope="col" className="px-2.5 py-1.5 text-start text-[11.5px] font-medium text-black/45">Ignition</th>
                <SortHeader columns={[{ key: 'speed', label: 'Speed' }]} sort={sort} end />
                <SortHeader columns={[{ key: 'next_oil_change', label: 'Next oil change' }]} sort={sort} />
                <SortHeader columns={[{ key: 'remaining', label: 'Remaining' }]} sort={sort} />
                <SortHeader columns={[{ key: 'signal', label: 'Last signal' }]} sort={sort} />
              </tr>
            </thead>
            <tbody>
              {visible.map((car) => (
                <tr key={car.id} className="border-b border-subtle last:border-b-0">
                  <td className="px-2.5 py-2"><CarLead car={car} /></td>
                  <td className="px-2.5 py-2 text-end tabular-nums text-foreground">{car.tracked ? km(car.current_km) : <Dash />}</td>
                  <td className={cn('px-2.5 py-2 text-end tabular-nums', car.today_km > 0 ? 'font-medium text-foreground' : 'text-black/30')}>{car.tracked ? km(car.today_km) : <Dash />}</td>
                  <td className="px-2.5 py-2">{car.tracked ? <IgnitionDot car={car} live={isIgnitionOn(car, now)} now={now} /> : <Dash />}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-end tabular-nums">{car.tracked ? <Speed car={car} now={now} /> : <Dash />}</td>
                  <td className="px-2.5 py-1">{car.tracked ? <OilEditor car={car} onSaved={(value) => onOil(car.id, value)} /> : <Dash />}</td>
                  <td className="w-[170px] px-2.5 py-2">{car.tracked ? <OilBar remaining={kmRemaining(car)} /> : <Dash />}</td>
                  <td className="px-2.5 py-2"><Signal car={car} now={now} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="mt-3 grid max-w-[1100px] grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((car) => <FleetCard key={car.id} car={car} now={now} onOil={(value) => onOil(car.id, value)} />)}
        </ul>
      )}
    </>
  );
};
