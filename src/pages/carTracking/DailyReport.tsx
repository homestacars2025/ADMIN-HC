import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Minus } from '../../components/media/MediaIcons';
import { ComplianceTriangle } from '../../components/shared/ComplianceBits';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../../components/shared/FilterTile';
import { LoadError, SearchField } from '../../components/shared/PageBits';
import { StatusImage } from '../../components/shared/StatusImage';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import {
  addDays,
  DAILY_FILTERS,
  dayEnd,
  daySeries,
  dayStats,
  fetchDailyKm,
  HISTORY_START,
  HISTORY_START_LABEL,
  km,
  OVER_KM,
  pastRows,
  signalTime,
  signalTone,
  todayRows,
  visibleDayRows,
  type DailyKmRow,
  type DayRow,
  type Fleet,
} from '../../lib/carTracking';
import { cn } from '../../lib/media/badgeColor';
import { CarIcon, PlateChip } from '../customers/ui';
import { CarHistorySheet } from './CarHistorySheet';
import { CARD, KmChart, SignalAge, Sparkline } from './ui';

const LIST_GRID = 'xl:grid-cols-[116px_minmax(110px,1fr)_176px_96px_78px_104px]';

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

const CarRow: React.FC<{ row: DayRow; days: ReturnType<typeof daySeries>; at: number; live: boolean; onOpen: () => void }> = ({ row, days, at, live, onOpen }) => (
  <li className="border-b border-subtle last:border-b-0">
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${row.plate}, ${km(row.km)} km, open history`}
      className={cn('grid min-h-[44px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 text-start transition-colors hover:bg-black/[0.02]', LIST_GRID)}
    >
      <span className="col-start-1 row-start-1 min-w-0 xl:col-auto xl:row-auto">
        <PlateChip plate={row.plate} />
      </span>
      <span className="col-start-1 row-start-2 truncate text-[13px] text-black/60 xl:col-auto xl:row-auto">
        {row.model ?? <span className="text-[#B45309]">Not linked to a car</span>}
      </span>
      <span className="col-start-1 row-start-3 text-[12.5px] tabular-nums text-black/50 xl:col-auto xl:row-auto">
        {km(row.start_km)} → {km(row.end_km)}
      </span>
      <span className={cn('col-start-2 row-start-1 text-end text-[20px] font-semibold tabular-nums leading-none text-foreground xl:col-auto xl:row-auto xl:text-[18px]', row.km > OVER_KM && 'text-[#B91C1C]', row.km === 0 && 'text-black/30')}>
        {km(row.km)}<span className="ms-1 text-[12px] font-normal text-black/40">km</span>
      </span>
      <span className="col-start-2 row-start-3 justify-self-end xl:col-auto xl:row-auto xl:justify-self-center">
        <Sparkline days={days} />
      </span>
      <span className="col-start-2 row-start-2 text-end text-[12.5px] xl:col-auto xl:row-auto">
        {live ? <SignalAge at={row.last_signal_at} now={at} /> : (
          <span className={cn('whitespace-nowrap tabular-nums', signalTone(row.last_signal_at, at) === 'ok' ? 'text-black/55' : 'font-medium text-[#B45309]')}>
            {signalTime(row.last_signal_at)}
          </span>
        )}
      </span>
    </button>
  </li>
);

export const DailyReport: React.FC<{ fleet: Fleet; day: string; today: string; now: number }> = ({ fleet, day, today, now }) => {
  const { filter, toggle, clear } = useUrlFilter(DAILY_FILTERS);
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
  const visible = useMemo(() => visibleDayRows(rows, filter, at, search), [rows, filter, at, search]);
  const liveRows = useMemo(() => new Map(todayRows(fleet).map((row) => [row.plate, row])), [fleet]);

  const retry = () => setReload((value) => value + 1);

  return (
    <>
      {error && <LoadError message={`Couldn't load the history: ${error}`} onRetry={retry} />}

      {loading ? <div className="mt-2"><FilterTileSkeleton /></div>
        : !error && rows.length === 0 ? <NoHistory day={day} />
          : rows.length > 0 && (
            <>
              <div className="mt-2">
                <FilterTileRow label="Filter the day">
                  <FilterTile tone="blue" icon={<CarIcon size={15} />} label="Total km" value={`${km(stats.total)} km`} sub={`${stats.cars} cars`} active={filter === 'all'} onClick={clear} />
                  <FilterTile tone="green" icon={<ArrowUpRight size={15} />} label="Moved" value={String(stats.moved)} sub="cars" active={filter === 'moved'} onClick={() => toggle('moved')} />
                  <FilterTile tone="neutral" icon={<Minus size={15} />} label="Idle" value={String(stats.idle)} sub="0 km" active={filter === 'idle'} onClick={() => toggle('idle')} />
                  <FilterTile tone="amber" bareIcon icon={<ComplianceTriangle tone="amber" size={32} />} label="No signal > 24h" value={String(stats.noSignal)} sub="cars" active={filter === 'no_signal'} onClick={() => toggle('no_signal')} />
                  <FilterTile tone="red" bareIcon icon={<ComplianceTriangle tone="red" size={32} />} label={`Over ${OVER_KM} km`} value={String(stats.over)} sub="cars" active={filter === 'over_500'} onClick={() => toggle('over_500')} />
                </FilterTileRow>
              </div>

              <SearchField value={search} onChange={setSearch} placeholder="Search plate or model…" className="mt-4 max-w-[1100px]" />
              <KmChart rows={visible} onPick={setPicked} />

              <section aria-label="Cars" className={cn(CARD, 'mt-4 max-w-[1100px] overflow-hidden')}>
                <div aria-hidden="true" className={cn('hidden gap-x-3 border-b border-subtle px-4 py-2 text-[11.5px] font-medium text-black/45 xl:grid', LIST_GRID)}>
                  <span>Plate</span>
                  <span>Model</span>
                  <span>Start → end km</span>
                  <span className="text-end">Km driven</span>
                  <span className="text-center">7 days</span>
                  <span className="text-end">Last signal</span>
                </div>
                {visible.length === 0 ? (
                  <p className="px-4 py-10 text-center text-[13.5px] text-black/45">No cars match this view.</p>
                ) : (
                  <ul>
                    {visible.map((row) => (
                      <CarRow
                        key={row.key}
                        row={row}
                        at={at}
                        live={isToday}
                        days={daySeries(history, row.car_id, weekStart, day, isToday ? row : null)}
                        onOpen={() => setPicked(row)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

      {picked && (
        <CarHistorySheet
          car={picked}
          live={liveRows.get(picked.plate) ?? null}
          today={today}
          onClose={() => setPicked(null)}
        />
      )}
    </>
  );
};
