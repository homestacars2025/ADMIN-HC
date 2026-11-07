import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from '../components/media/MediaIcons';
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
  carParam,
  carsWithoutTransits,
  fetchCarTransits,
  fetchHgsData,
  formatChange,
  formatCount,
  HGS_FILTERS,
  HGS_SORTS,
  hgsRows,
  hgsSummary,
  istanbulDay,
  inHgsFilter,
  matchesHgsSearch,
  parseDayRange,
  rangeChip,
  rangeSentence,
  sortHgsRows,
  syncedAgo,
  windowDays,
  windowKey,
  type CarRange,
  type DayRange,
  type HgsCarInfo,
  type HgsData,
  type HgsPeriod,
  type HgsRow,
  type HgsSort,
  type HgsWindow,
} from '../lib/hgs';
import { cn } from '../lib/media/badgeColor';
import { formatMoney } from '../lib/money';
import { currentMonth, monthLabel, shiftMonth } from '../lib/payroll';
import { Segmented } from './bookings/ui';
import { WalletIcon } from './customers/ui';
import { BarcodeSheet, HgsCarRow, HgsListHeader, NoTransitsBanner, hgsRowId, type HistoryState } from './hgs/HgsParts';
import { DatesIcon, RangePicker } from './hgs/RangePicker';
import { StatementSheet } from './hgs/StatementSheet';

/**
 * HGS tolls, from the portal files finance uploads per car. Every transit loads once,
 * so the month switcher, the tiles and the rows are worked out in memory. A car's own
 * rows, with the booking on the car that day, load when it is opened, and are kept per
 * car and period until the next refresh.
 *
 * A range of days (`?from=&to=`) takes the month's place for the whole page, and one car
 * can have its own (`?car=&cfrom=&cto=`), which wins for that car only.
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
  const [fromParam, toParam] = [params.get('from'), params.get('to')];
  const pageRange = useMemo(() => parseDayRange(fromParam, toParam), [fromParam, toParam]);
  const pageWindow: HgsWindow = pageRange ?? period;
  const [carValue, carFrom, carTo] = [params.get('car'), params.get('cfrom'), params.get('cto')];
  const carRange = useMemo<CarRange | null>(() => {
    const range = parseDayRange(carFrom, carTo);
    return carValue && range ? { car: carValue, range } : null;
  }, [carValue, carFrom, carTo]);
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
  const [statementFor, setStatementFor] = useState<HgsRow | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [linkedCar, setLinkedCar] = useState(carValue);

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

  const setParam = (changes: Record<string, string | null>) => {
    const updated = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === null) updated.delete(key);
      else updated.set(key, value);
    });
    setParams(updated);
  };
  // The month switcher and All time take over from a range of days.
  const setPeriod = (next: HgsPeriod) => { setExpanded(null); setParam({ month: next === thisMonth ? null : next, from: null, to: null }); };
  const moveMonth = (by: number) => setPeriod(shiftMonth(`${month}-01`, by).slice(0, 7));
  const setPageRange = (range: DayRange | null) => setParam(range ? { month: null, from: range.from, to: range.to } : { month: null, from: null, to: null });
  const setCarRange = (row: HgsRow, range: DayRange | null) => setParam(range ? { car: carParam(row), cfrom: range.from, cto: range.to } : { car: null, cfrom: null, cto: null });

  const today = istanbulDay(new Date(now).toISOString());
  const idleCars = useMemo(() => (data ? carsWithoutTransits(data, pageWindow) : []), [data, pageWindow]);
  const summary = useMemo(() => (data ? hgsSummary(data, pageWindow, thisMonth) : null), [data, pageWindow, thisMonth]);
  const pageRows = useMemo(() => (data ? hgsRows(data, pageWindow) : []), [data, pageWindow]);
  const rows = useMemo(() => (data && carRange ? hgsRows(data, pageWindow, carRange) : pageRows), [data, pageWindow, carRange, pageRows]);
  const visible = useMemo(
    () => sortHgsRows(rows.filter((row) => inHgsFilter(row, filter) && matchesHgsSearch(row, query)), sort),
    [rows, filter, query, sort],
  );
  // The tiles count the page's period; a car's own range only changes its row.
  const usedCars = useMemo(() => pageRows.filter((row) => row.transits > 0).length, [pageRows]);

  const labelOf = useCallback((target: HgsWindow) => {
    if (typeof target !== 'string') return rangeSentence(target, today);
    return target === ALL_TIME ? 'all time' : `in ${monthLabel(`${target}-01`)}`;
  }, [today]);
  const periodLabel = labelOf(pageWindow);
  const bannerWhen = pageRange ? periodLabel : allTime ? 'yet' : month === thisMonth ? 'this month' : periodLabel;
  const ownRange = useCallback((row: HgsRow) => (carRange && carParam(row) === carRange.car ? carRange.range : null), [carRange]);
  const rowWindow = useCallback((row: HgsRow): HgsWindow => ownRange(row) ?? pageWindow, [ownRange, pageWindow]);
  const historyKey = useCallback((row: HgsRow) => `${row.key}|${windowKey(rowWindow(row))}`, [rowWindow]);

  const loadHistory = useCallback(async (row: HgsRow, target: HgsWindow, key: string) => {
    setHistories((current) => ({ ...current, [key]: { status: 'loading', rows: [] } }));
    try {
      const transits = await fetchCarTransits(row, target);
      setHistories((current) => ({ ...current, [key]: { status: 'ready', rows: transits } }));
    } catch (failure) {
      setHistories((current) => ({ ...current, [key]: { status: 'error', rows: [], message: failure instanceof Error ? failure.message : undefined } }));
    }
  }, []);

  // The open car's transits load once per period, and again when its range changes.
  const openRow = rows.find((row) => row.key === expanded) ?? null;
  const openKey = openRow ? historyKey(openRow) : null;
  useEffect(() => {
    if (!openRow || !openKey || openRow.transits === 0 || histories[openKey]) return;
    void loadHistory(openRow, rowWindow(openRow), openKey);
  }, [openRow, openKey, histories, loadHistory, rowWindow]);

  const toggleRow = (row: HgsRow) => setExpanded(expanded === row.key ? null : row.key);

  // A statement starts from the row's days; for all time, from its first to its last transit.
  const statementRange = (row: HgsRow): DayRange => {
    const days = windowDays(rowWindow(row));
    if (days) return days;
    const listed = (histories[historyKey(row)]?.rows ?? []).map((transit) => transit.day).filter(Boolean).sort();
    return listed.length > 0 ? { from: listed[0], to: listed[listed.length - 1] } : { from: today, to: today };
  };

  // A shared link with a car's range opens that car, once the list is there.
  useEffect(() => {
    if (!linkedCar || !data) return;
    const row = rows.find((item) => carParam(item) === linkedCar);
    if (row) {
      setExpanded(row.key);
      setScrollTo(row.key);
    }
    setLinkedCar(null);
  }, [linkedCar, data, rows]);

  // A chip in the banner shows that car's row, open, wherever the list was.
  const showCar = (car: HgsCarInfo) => {
    setQuery('');
    if (filter === 'used') clear();
    setExpanded(`car:${car.id}`);
    setScrollTo(`car:${car.id}`);
  };

  useEffect(() => {
    if (!scrollTo) return;
    const row = document.getElementById(hgsRowId(scrollTo));
    row?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    row?.querySelector('button')?.focus({ preventScroll: true });
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
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn((allTime || pageRange) && 'opacity-60')}>
            <MonthNav label={monthLabel(`${month}-01`)} justify="flex-start" onPrev={() => moveMonth(-1)} onNext={() => moveMonth(1)} />
          </div>
          <span className="flex items-center gap-1">
            <RangePicker
              label="Date range"
              value={pageRange}
              fallback={windowDays(period) ?? { from: today, to: today }}
              today={today}
              onChange={setPageRange}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-[10px] border-[1.5px] px-3 text-[13px] font-medium tabular-nums transition-colors md:h-9',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/35',
                pageRange ? 'border-[#6EA4E7]/60 bg-[#6EA4E7]/10 text-[#3A74C2]' : 'border-[#E5E7EB] bg-white text-black/60 hover:border-[#4ba6ea] hover:text-[#3A74C2]',
              )}
            >
              <DatesIcon />
              {pageRange ? rangeChip(pageRange, today) : <>From <span aria-hidden="true">→</span> To</>}
            </RangePicker>
            {pageRange && (
              <button type="button" aria-label="Clear date range" onClick={() => setPageRange(null)} className="grid h-11 w-11 place-items-center rounded-[10px] text-black/45 hover:bg-black/[0.04] hover:text-black/70 md:h-9 md:w-9">
                <X size={15} />
              </button>
            )}
          </span>
        </div>
        <Button variant={allTime ? 'default' : 'outline'} size="lg" aria-pressed={allTime} className="!h-11 px-3 md:!h-10" onClick={() => setPeriod(allTime ? thisMonth : ALL_TIME)}>
          All time
        </Button>
      </div>

      {error && <LoadError message={`Couldn't load HGS: ${error}`} onRetry={refresh} />}

      {data && <NoTransitsBanner cars={idleCars} when={bannerWhen} onPick={showCar} onMore={() => { if (filter !== 'idle') toggle('idle'); }} />}

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
          <Segmented ariaLabel="Sort cars" value={sort} onChange={(next) => setParam({ sort: next === 'amount' ? null : next })} options={HGS_SORTS.map((key) => ({ value: key, label: SORT_LABELS[key] }))} />
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
                  periodLabel={labelOf(rowWindow(row))}
                  ownRange={ownRange(row)}
                  fallback={windowDays(rowWindow(row)) ?? { from: today, to: today }}
                  today={today}
                  onToggle={toggleRow}
                  onRetry={(target) => void loadHistory(target, rowWindow(target), historyKey(target))}
                  onAddBarcode={addBarcode}
                  onRange={setCarRange}
                  onStatement={setStatementFor}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {statementFor && <StatementSheet row={statementFor} range={statementRange(statementFor)} today={today} onClose={() => setStatementFor(null)} />}
      {editing && <BarcodeSheet car={editing} onClose={() => setEditing(null)} onSaved={barcodeSaved} />}
    </div>
  );
};

export default HGSPage;
