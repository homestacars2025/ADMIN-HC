import React, { useEffect, useMemo, useState } from 'react';
import { LoadError, SearchField } from '../../components/shared/PageBits';
import { StatusImage } from '../../components/shared/StatusImage';
import { StatusTile } from '../../components/shared/StatusTile';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import { useUrlSort } from '../../hooks/useUrlSort';
import {
  addDays,
  DAILY_FILTERS,
  DAILY_SORTS,
  dayEnd,
  daySeries,
  dayStats,
  fetchDailyKm,
  firstDirection,
  HISTORY_START,
  HISTORY_START_LABEL,
  km,
  noGpsRows,
  OVER_KM,
  pastRows,
  signalTime,
  signalTone,
  sortDayRows,
  todayRows,
  visibleDayRows,
  type DailyKmRow,
  type DailySort,
  type DayRow,
  type Fleet,
} from '../../lib/carTracking';
import { cn } from '../../lib/media/badgeColor';
import { CarHistorySheet } from './CarHistorySheet';
import { CarLead, CARD, KmChart, OilBar, SignalAge, SortHeader, SortMenu, Sparkline, TileSkeleton, TileTriangle } from './ui';

const SORT_LABELS: Array<{ key: DailySort; label: string }> = [
  { key: 'km', label: 'Km driven' },
  { key: 'remaining', label: 'Oil remaining' },
  { key: 'signal', label: 'Last signal' },
  { key: 'end_km', label: 'End km' },
  { key: 'plate', label: 'Plate' },
  { key: 'model', label: 'Model' },
];
const DEFAULT_SORT = { key: 'km', direction: 'desc' } as const;

const NoHistory: React.FC<{ day: string }> = ({ day }) => (
  <div className={cn(CARD, 'mt-2 flex max-w-[1100px] flex-col items-center px-6 py-12 text-center')}>
    <StatusImage status="fleet" size={128} />
    <p className="mt-3 text-[16px] font-medium text-foreground">
      {day < HISTORY_START ? `History starts on ${HISTORY_START_LABEL}` : 'Nothing was saved for this day'}
    </p>
    <p className="mt-1 max-w-[380px] text-[13.5px] text-black/50">
      Every car's kilometres are saved at midnight, so each finished day appears here the next morning.
    </p>
  </div>
);

const KmValue: React.FC<{ row: DayRow; className?: string }> = ({ row, className }) => (
  row.tracked ? (
    <span className={cn('font-semibold tabular-nums leading-none text-foreground', row.km > OVER_KM && 'text-[#B91C1C]', row.km === 0 && 'text-black/30', className)}>
      {km(row.km)}<span className="ms-1 text-[12px] font-normal text-black/40">km</span>
    </span>
  ) : <span className="text-black/30">—</span>
);

const Signal: React.FC<{ row: DayRow; at: number; live: boolean }> = ({ row, at, live }) => {
  if (!row.tracked) return <span className="text-[13px] font-medium text-[#B45309]">No GPS</span>;
  if (live) return <SignalAge at={row.last_signal_at} now={at} />;
  return (
    <span className={cn('whitespace-nowrap text-[13px] tabular-nums', signalTone(row.last_signal_at, at) === 'ok' ? 'text-black/55' : 'font-medium text-[#B45309]')}>
      {signalTime(row.last_signal_at)}
    </span>
  );
};

interface RowProps {
  row: DayRow;
  days: ReturnType<typeof daySeries>;
  at: number;
  live: boolean;
  onOpen: () => void;
}

const TableRow: React.FC<RowProps> = ({ row, days, at, live, onOpen }) => (
  <tr onClick={row.tracked ? onOpen : undefined} className={cn('border-b border-subtle last:border-b-0', row.tracked && 'cursor-pointer hover:bg-black/[0.02]')}>
    <td className="px-2.5 py-2">
      {row.tracked
        ? <button type="button" aria-label={`${row.plate}, ${km(row.km)} km, open history`} className="block min-w-0 max-w-full text-start"><CarLead car={row} /></button>
        : <CarLead car={row} />}
    </td>
    <td className="whitespace-nowrap px-2.5 py-2 text-end text-[12.5px] tabular-nums text-black/50">
      {row.tracked ? `${km(row.start_km)} → ${km(row.end_km)}` : '—'}
    </td>
    <td className="whitespace-nowrap px-2.5 py-2 text-end text-[17px]"><KmValue row={row} /></td>
    <td className="px-2.5 py-2">{row.tracked && <Sparkline days={days} />}</td>
    <td className="w-[170px] px-2.5 py-2">{row.tracked ? <OilBar remaining={row.remaining} /> : <span className="text-black/30">—</span>}</td>
    <td className="px-2.5 py-2"><Signal row={row} at={at} live={live} /></td>
  </tr>
);

const Card: React.FC<RowProps> = ({ row, days, at, live, onOpen }) => {
  const body = (
    <>
      <span className="flex items-center justify-between gap-3">
        <CarLead car={row} />
        <KmValue row={row} className="shrink-0 text-[22px]" />
      </span>
      {row.tracked && <span className="mt-2.5 block"><OilBar remaining={row.remaining} /></span>}
      <span className="mt-2 flex items-center justify-between gap-3">
        {row.tracked && <Sparkline days={days} />}
        <span className="ms-auto"><Signal row={row} at={at} live={live} /></span>
      </span>
    </>
  );
  return (
    <li className={cn(CARD, 'min-w-0 overflow-hidden')}>
      {row.tracked
        ? <button type="button" onClick={onOpen} aria-label={`${row.plate}, ${km(row.km)} km, open history`} className="block w-full p-3.5 text-start transition-colors hover:bg-black/[0.02]">{body}</button>
        : <div className="p-3.5">{body}</div>}
    </li>
  );
};

export const DailyReport: React.FC<{ fleet: Fleet; day: string; today: string; now: number }> = ({ fleet, day, today, now }) => {
  const { filter, toggle, clear } = useUrlFilter(DAILY_FILTERS);
  const sort = useUrlSort(DAILY_SORTS, DEFAULT_SORT, firstDirection);
  const wide = useMediaQuery('(min-width: 1280px)');
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState<DailyKmRow[]>([]);
  const [loadedDay, setLoadedDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [picked, setPicked] = useState<DayRow | null>(null);

  const isToday = day === today;
  const weekStart = addDays(day, -6);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchDailyKm(weekStart, day)
      .then((rows) => {
        if (cancelled) return;
        setHistory(rows);
        setLoadedDay(day);
      })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); });
    return () => { cancelled = true; };
  }, [day, weekStart, reload]);

  const loading = !isToday && loadedDay !== day && !error;
  const at = isToday ? now : dayEnd(day);
  const rows = useMemo(
    () => (isToday ? todayRows(fleet) : loadedDay === day ? pastRows(history, day, fleet) : []),
    [isToday, fleet, loadedDay, day, history],
  );
  const stats = useMemo(() => dayStats(rows, at), [rows, at]);
  const noGps = useMemo(() => noGpsRows(fleet), [fleet]);
  const visible = useMemo(
    () => sortDayRows(visibleDayRows([...rows, ...noGps], filter, at, search), sort.key, sort.direction),
    [rows, noGps, filter, at, search, sort.key, sort.direction],
  );
  const liveRows = useMemo(() => new Map(todayRows(fleet).map((row) => [row.car_id, row])), [fleet]);

  const rowProps = (row: DayRow): RowProps => ({
    row,
    at,
    live: isToday,
    days: daySeries(history, row.car_id, weekStart, day, isToday ? row : null),
    onOpen: () => setPicked(row),
  });

  return (
    <>
      {error && <LoadError message={`Couldn't load the history: ${error}`} onRetry={() => setReload((value) => value + 1)} />}

      {loading ? <div className="mt-3"><TileSkeleton count={6} /></div>
        : !error && rows.length === 0 ? <NoHistory day={day} />
          : rows.length > 0 && (
            <>
              <div role="group" aria-label="Filter the day" className="status-tiles six mt-3">
                <StatusTile accent="#4ba6ea" art={<StatusImage status="fleet" size={72} />} label="Total km" value={km(stats.total)} sub={isToday ? `${stats.cars} of ${stats.cars + noGps.length} cars` : `${stats.cars} cars`} active={filter === 'all'} onClick={clear} />
                <StatusTile accent="#22c55e" art={<StatusImage status="working" size={72} />} label="Moved" value={String(stats.moved)} sub="cars" active={filter === 'moved'} onClick={() => toggle('moved')} />
                <StatusTile accent="#9ca3af" art={<StatusImage status="parking" size={72} />} label="Idle" value={String(stats.idle)} sub="0 km" active={filter === 'idle'} onClick={() => toggle('idle')} />
                <StatusTile accent="#f59e0b" art={<TileTriangle tone="amber" />} label="No signal > 24h" value={String(stats.noSignal)} sub="cars" active={filter === 'no_signal'} onClick={() => toggle('no_signal')} />
                <StatusTile accent="#ef4444" art={<TileTriangle tone="red" />} label={`Over ${OVER_KM} km`} value={String(stats.over)} sub="cars" active={filter === 'over_500'} onClick={() => toggle('over_500')} />
                <StatusTile accent="#f59e0b" art={<TileTriangle tone="amber" />} label="No GPS" value={String(noGps.length)} sub="no tracker" active={filter === 'no_gps'} onClick={() => toggle('no_gps')} />
              </div>

              <SearchField value={search} onChange={setSearch} placeholder="Search plate or model…" className="mt-4 max-w-[1100px]" />
              <KmChart rows={visible} onPick={setPicked} />

              {!wide && <SortMenu columns={SORT_LABELS} sort={sort} />}

              {visible.length === 0 ? (
                <p className={cn(CARD, 'mt-4 max-w-[1100px] px-4 py-10 text-center text-[13.5px] text-black/45')}>No cars match this view.</p>
              ) : wide ? (
                <div className={cn(CARD, 'mt-4 max-w-[1100px] overflow-x-auto')}>
                  <table className="w-full min-w-[900px] text-[13px]">
                    <thead>
                      <tr className="border-b border-subtle">
                        <SortHeader columns={[{ key: 'plate', label: 'Plate' }, { key: 'model', label: 'Model' }]} sort={sort} />
                        <SortHeader columns={[{ key: 'end_km', label: 'Start → end km' }]} sort={sort} end />
                        <SortHeader columns={[{ key: 'km', label: 'Km driven' }]} sort={sort} end />
                        <th scope="col" className="px-2.5 py-1.5 text-start text-[11.5px] font-medium text-black/45">7 days</th>
                        <SortHeader columns={[{ key: 'remaining', label: 'Remaining' }]} sort={sort} />
                        <SortHeader columns={[{ key: 'signal', label: 'Last signal' }]} sort={sort} />
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => <TableRow key={row.key} {...rowProps(row)} />)}
                    </tbody>
                  </table>
                </div>
              ) : (
                <ul className="mt-3 grid max-w-[1100px] grid-cols-1 gap-3 md:grid-cols-2">
                  {visible.map((row) => <Card key={row.key} {...rowProps(row)} />)}
                </ul>
              )}
            </>
          )}

      {picked && (
        <CarHistorySheet
          car={picked}
          live={liveRows.get(picked.car_id) ?? null}
          today={today}
          onClose={() => setPicked(null)}
        />
      )}
    </>
  );
};
