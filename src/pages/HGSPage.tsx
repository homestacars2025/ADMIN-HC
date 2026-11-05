import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../lib/media/tokens.css';
import { Button, Spinner } from '../components/media/MediaUI';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../components/shared/FilterTile';
import { Icon3D } from '../components/shared/Icon3D';
import MonthNav from '../components/shared/MonthNav';
import { LoadError, PageHeader, SearchField, SkeletonRows } from '../components/shared/PageBits';
import { StatusImage } from '../components/shared/StatusImage';
import { useUrlFilter } from '../hooks/useUrlFilter';
import {
  ALL_TIME,
  carsWithoutTransits,
  fetchCarTransits,
  fetchHgsData,
  formatChange,
  formatCount,
  HGS_FILTERS,
  HGS_SORTS,
  hgsRows,
  hgsSummary,
  inHgsFilter,
  matchesHgsSearch,
  sortHgsRows,
  syncedAgo,
  type HgsCarInfo,
  type HgsData,
  type HgsPeriod,
  type HgsRow,
  type HgsSort,
} from '../lib/hgs';
import { cn } from '../lib/media/badgeColor';
import { formatMoney } from '../lib/money';
import { currentMonth, monthLabel, shiftMonth } from '../lib/payroll';
import { Segmented } from './bookings/ui';
import { WalletIcon } from './customers/ui';
import { BarcodeSheet, HgsCarRow, HgsListHeader, NoTransitsBanner, hgsRowId, type HistoryState } from './hgs/HgsParts';

/**
 * HGS tolls, from the portal files finance uploads per car. Every transit loads once,
 * so the month switcher, the tiles and the rows are worked out in memory. A car's own
 * rows, with the booking on the car that day, load when it is opened, and are kept per
 * car and period until the next refresh.
 */

const SORT_LABELS: Record<HgsSort, string> = { amount: 'Amount', transits: 'Transits', last: 'Last' };

const CalendarIcon: React.FC = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
  </svg>
);

const HGSPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const thisMonth = currentMonth().slice(0, 7);
  const requestedMonth = params.get('month');
  const allTime = requestedMonth === ALL_TIME;
  const month = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : thisMonth;
  const period: HgsPeriod = allTime ? ALL_TIME : month;
  const requestedSort = params.get('sort') as HgsSort | null;
  const sort: HgsSort = requestedSort && HGS_SORTS.includes(requestedSort) ? requestedSort : 'amount';
  const { filter, toggle, clear } = useUrlFilter(HGS_FILTERS);

  const [data, setData] = useState<HgsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [histories, setHistories] = useState<Record<string, HistoryState>>({});
  const [editing, setEditing] = useState<HgsCarInfo | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHgsData()
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
        setNow(Date.now());
      })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); })
      .finally(() => { if (!cancelled) setRefreshing(false); });
    return () => { cancelled = true; };
  }, [reload]);

  // "Last upload" keeps counting while the page is open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setHistories({});
    setReload((value) => value + 1);
  }, []);

  const setParam = (key: string, value: string | null) => {
    const updated = new URLSearchParams(params);
    if (value === null) updated.delete(key);
    else updated.set(key, value);
    setParams(updated);
  };
  const setPeriod = (next: HgsPeriod) => { setExpanded(null); setParam('month', next === thisMonth ? null : next); };
  const moveMonth = (by: number) => setPeriod(shiftMonth(`${month}-01`, by).slice(0, 7));

  const idleCars = useMemo(() => (data ? carsWithoutTransits(data, period) : []), [data, period]);
  const summary = useMemo(() => (data ? hgsSummary(data, period, thisMonth) : null), [data, period, thisMonth]);
  const rows = useMemo(() => (data ? hgsRows(data, period) : []), [data, period]);
  const visible = useMemo(
    () => sortHgsRows(rows.filter((row) => inHgsFilter(row, filter) && matchesHgsSearch(row, query)), sort),
    [rows, filter, query, sort],
  );
  const usedCars = useMemo(() => rows.filter((row) => row.transits > 0).length, [rows]);

  const periodLabel = allTime ? 'all time' : `in ${monthLabel(`${month}-01`)}`;
  const bannerWhen = allTime ? 'yet' : month === thisMonth ? 'this month' : periodLabel;
  const historyKey = (row: HgsRow) => `${row.key}|${period}`;

  const loadHistory = useCallback(async (row: HgsRow, key: string) => {
    setHistories((current) => ({ ...current, [key]: { status: 'loading', rows: [] } }));
    try {
      const transits = await fetchCarTransits(row, period);
      setHistories((current) => ({ ...current, [key]: { status: 'ready', rows: transits } }));
    } catch (failure) {
      setHistories((current) => ({ ...current, [key]: { status: 'error', rows: [], message: failure instanceof Error ? failure.message : undefined } }));
    }
  }, [period]);

  const toggleRow = (row: HgsRow) => {
    const opening = expanded !== row.key;
    setExpanded(opening ? row.key : null);
    if (opening && row.transits > 0 && !histories[historyKey(row)]) void loadHistory(row, historyKey(row));
  };

  // A chip in the banner shows that car's row, open, wherever the list was.
  const showCar = (car: HgsCarInfo) => {
    setQuery('');
    if (filter === 'used') clear();
    setExpanded(`car:${car.id}`);
    setScrollTo(`car:${car.id}`);
  };

  useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(hgsRowId(scrollTo))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setScrollTo(null);
  }, [scrollTo, visible]);

  const addBarcode = (row: HgsRow) => {
    const car = data?.cars.find((item) => item.id === row.carId);
    if (car) setEditing(car);
  };

  const barcodeSaved = (carId: number, barcode: string) => {
    setEditing(null);
    setData((current) => current && { ...current, cars: current.cars.map((car) => (car.id === carId ? { ...car, barcode } : car)) });
  };

  const loading = data === null && !error;

  return (
    <div className="media-scope mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <PageHeader
        eyebrow="Finance"
        title="HGS"
        subtitle="Motorway and private-road tolls per car, from the HGS portal files."
        action={(
          <div className="flex items-center gap-3">
            <span className="text-[12.5px] text-black/45">Last upload: {data ? syncedAgo(data.lastSync, now) : '…'}</span>
            <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-10" disabled={loading || refreshing} onClick={refresh}>
              {refreshing && <Spinner size={13} />} {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        )}
      />

      <div className="mb-4 flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
        <div className={cn(allTime && 'opacity-60')}>
          <MonthNav label={monthLabel(`${month}-01`)} justify="flex-start" onPrev={() => moveMonth(-1)} onNext={() => moveMonth(1)} />
        </div>
        <Button variant={allTime ? 'default' : 'outline'} size="lg" aria-pressed={allTime} className="!h-11 px-3 md:!h-10" onClick={() => setPeriod(allTime ? thisMonth : ALL_TIME)}>
          All time
        </Button>
      </div>

      {error && <LoadError message={`Couldn't load HGS: ${error}`} onRetry={refresh} />}

      {data && <NoTransitsBanner cars={idleCars} when={bannerWhen} onPick={showCar} />}

      {loading && <FilterTileSkeleton split count={4} />}
      {summary && (
        <FilterTileRow split label="Filter the cars">
          <FilterTile
            split mono wide tone="blue" icon={<WalletIcon size={22} />}
            label="Total spend" value={formatMoney(summary.spend)} sub={periodLabel}
            active={filter === 'all'} onClick={clear}
          />
          <FilterTile
            split mono tone="green" bareIcon icon={<Icon3D name="total" />}
            label="Transits" value={formatCount(summary.transits)} sub={`${usedCars} ${usedCars === 1 ? 'car' : 'cars'} used it`}
            active={filter === 'used'} onClick={() => toggle('used')}
          />
          <FilterTile
            split mono tone="slate" bareIcon icon={<StatusImage status="fleet" size={56} />}
            label="Cars on HGS" value={formatCount(summary.carsOnHgs)} sub={`Without transits: ${formatCount(summary.idle)}`}
            active={filter === 'idle'} onClick={() => toggle('idle')}
          />
          <FilterTile
            split mono wide tone="amber" icon={<CalendarIcon />}
            label="This month" value={formatMoney(summary.thisMonth.spend)}
            sub={formatChange(summary.thisMonth.change, monthLabel(`${summary.thisMonth.previous}-01`).split(' ')[0])}
          />
        </FilterTileRow>
      )}

      <div className="mb-3 mt-5 flex max-w-[1100px] flex-col gap-2 sm:flex-row sm:items-center">
        <SearchField value={query} onChange={setQuery} placeholder="Search plate, barcode or model" className="sm:max-w-[340px] sm:flex-1" />
        <div className="flex items-center gap-2 sm:ms-auto">
          <span className="text-[12.5px] text-black/45">Sort</span>
          <Segmented ariaLabel="Sort cars" value={sort} onChange={(next) => setParam('sort', next === 'amount' ? null : next)} options={HGS_SORTS.map((key) => ({ value: key, label: SORT_LABELS[key] }))} />
        </div>
      </div>

      <div className="max-w-[1100px]">
        {loading ? (
          <div className="overflow-hidden rounded-2xl border border-[#EBEBEB] bg-white"><SkeletonRows count={6} /></div>
        ) : data && visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 px-6 py-12 text-center">
            <p className="text-[14px] font-medium text-black/65">
              {query ? 'No car matches that search' : filter === 'used' ? `No car passed a toll ${periodLabel}` : filter === 'idle' ? `Every active car has HGS transits ${periodLabel}` : 'No active cars'}
            </p>
            <p className="mt-1 text-[13px] text-black/45">
              {query || filter !== 'all' ? 'Clear the search or the filter to see every car.' : 'Active cars show up here.'}
            </p>
          </div>
        ) : data && (
          <>
            <HgsListHeader />
            <ul className="flex flex-col gap-2">
              {visible.map((row) => (
                <HgsCarRow
                  key={row.key}
                  row={row}
                  expanded={expanded === row.key}
                  history={histories[historyKey(row)]}
                  periodLabel={periodLabel}
                  onToggle={toggleRow}
                  onRetry={(target) => void loadHistory(target, historyKey(target))}
                  onAddBarcode={addBarcode}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {editing && <BarcodeSheet car={editing} onClose={() => setEditing(null)} onSaved={barcodeSaved} />}
    </div>
  );
};

export default HGSPage;
