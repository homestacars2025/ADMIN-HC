import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../lib/media/tokens.css';
import { cn } from '../lib/media/badgeColor';
import {
  formatCount,
  formatDate,
  formatLira,
  getCarTransits,
  getHgsDashboard,
  type HgsCar,
  type HgsDashboard,
  type HgsTransit,
} from '../lib/hgs';
import {
  AlertTriangle,
  ChevronDown,
  Hash,
  SearchX,
  type IconProps,
} from '../components/media/MediaIcons';
import { PageHeader, useSlidingPill } from '../components/media/MediaShared';
import { Button, Skeleton, Spinner } from '../components/media/MediaUI';

/**
 * HGS tolls — read-only.
 *
 * An n8n workflow writes `hgs_transactions`; nothing here writes back. The
 * summary and the car rollup arrive in one `hgs_dashboard()` RPC, and a car's
 * transits are fetched the first time it is expanded and then kept.
 *
 * Sorting and the per-car date filter are pure view state over data already in
 * memory — neither triggers a request.
 */

// ── Local icons (MediaIcons carries no money / vehicle / arrow glyph) ─────────

const mk = (paths: React.ReactNode): React.FC<IconProps> => ({ size = 16, strokeWidth = 1.75, className }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true" focusable="false"
  >{paths}</svg>
);

const Banknote = mk(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>);
const CarFront = mk(<><path d="M5 17H3v-4l2-5h14l2 5v4h-2" /><path d="M5 13h14" /><circle cx="7.5" cy="17" r="1.5" /><circle cx="16.5" cy="17" r="1.5" /></>);
const ArrowRight = mk(<path d="M5 12h14M13 6l6 6-6 6" />);

// ── Sorting ───────────────────────────────────────────────────────────────────

type SortCol = 'plate' | 'model' | 'transits' | 'last' | 'amount';
type SortDir = 'asc' | 'desc';
/** `null` means no explicit sort — the RPC order, which is spend descending. */
type SortState = { col: SortCol; dir: SortDir } | null;

const SortGlyph: React.FC<{ state: 'off' | 'asc' | 'desc' }> = ({ state }) => (
  <span className="ml-1 inline-flex flex-col leading-none" aria-hidden="true">
    <svg width="8" height="5" viewBox="0 0 8 5" className={cn('-mb-px', state === 'asc' ? 'text-primary' : 'text-black/20')}>
      <path d="M4 0l4 5H0z" fill="currentColor" />
    </svg>
    <svg width="8" height="5" viewBox="0 0 8 5" className={state === 'desc' ? 'text-primary' : 'text-black/20'}>
      <path d="M4 5L0 0h8z" fill="currentColor" />
    </svg>
  </span>
);

const SortableHeader: React.FC<{
  col: SortCol;
  label: string;
  sort: SortState;
  onSort: (col: SortCol) => void;
  align?: 'start' | 'end';
}> = ({ col, label, sort, onSort, align = 'start' }) => {
  const active = sort?.col === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      aria-label={`Sort by ${label}`}
      className={cn(
        'inline-flex items-center rounded-md py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        align === 'end' ? 'justify-end' : 'justify-start',
        active ? 'text-primary' : 'text-black/40 hover:text-black/65',
      )}
    >
      {label}
      <SortGlyph state={active ? sort!.dir : 'off'} />
    </button>
  );
};

/** asc → desc → off. The third click returns to the default spend order. */
function nextSort(current: SortState, col: SortCol): SortState {
  if (current?.col !== col) return { col, dir: 'asc' };
  if (current.dir === 'asc') return { col, dir: 'desc' };
  return null;
}

// ── Date range ────────────────────────────────────────────────────────────────

interface Range { from: string; to: string }
const ALL_RANGE: Range = { from: '', to: '' };

/** Local calendar days — a HGS transit carries a date, never a time. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function preset(kind: 'this' | 'last' | '3m'): Range {
  const now = new Date();
  if (kind === 'this') return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
  if (kind === 'last') {
    return {
      from: isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: isoDay(new Date(now.getFullYear(), now.getMonth(), 0)),   // day 0 = last day of previous month
    };
  }
  return { from: isoDay(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: isoDay(now) };
}

const QUICK: Array<{ key: string; label: string; make: () => Range }> = [
  { key: 'this', label: 'This month',    make: () => preset('this') },
  { key: 'last', label: 'Last month',    make: () => preset('last') },
  { key: '3m',   label: 'Last 3 months', make: () => preset('3m') },
  { key: 'all',  label: 'All',           make: () => ALL_RANGE },
];

const DateRangeFilter: React.FC<{ value: Range; onChange: (r: Range) => void }> = ({ value, onChange }) => {
  const dateInput =
    'h-8 rounded-lg border border-input bg-background px-2 text-[12.5px] text-foreground outline-none ' +
    'transition-colors focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20';
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-black/[0.06] bg-black/[0.012] p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK.map((q) => {
          const r = q.make();
          const active = value.from === r.from && value.to === r.to;
          return (
            <button
              key={q.key}
              type="button"
              onClick={() => onChange(r)}
              className={cn(
                'h-7 rounded-full px-2.5 text-[11.5px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white text-black/55 ring-1 ring-black/[0.07] hover:text-black/80',
              )}
            >
              {q.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11.5px] text-black/45">
          From
          <input type="date" value={value.from} max={value.to || undefined}
                 onChange={(e) => onChange({ ...value, from: e.target.value })} className={dateInput} />
        </label>
        <label className="flex items-center gap-1.5 text-[11.5px] text-black/45">
          To
          <input type="date" value={value.to} min={value.from || undefined}
                 onChange={(e) => onChange({ ...value, to: e.target.value })} className={dateInput} />
        </label>
      </div>
    </div>
  );
};

// ── Stat card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string; value: string; hint: string;
  Icon: React.FC<IconProps>; tone?: 'default' | 'warning';
}> = ({ label, value, hint, Icon, tone = 'default' }) => {
  const warn = tone === 'warning';
  return (
    <div className={cn(
      'flex h-full flex-col rounded-xl border p-4 transition-colors',
      warn ? 'border-amber-500/25 bg-amber-500/[0.06]' : 'border-black/[0.07] bg-white',
    )}>
      <div className="flex items-center gap-1.5">
        <span className={cn(
          'grid size-6 shrink-0 place-items-center rounded-md',
          warn ? 'bg-amber-500/15 text-amber-700' : 'bg-primary/10 text-primary',
        )}>
          <Icon size={13} strokeWidth={1.9} />
        </span>
        <span className={cn('text-[11px] font-medium uppercase tracking-[0.1em]', warn ? 'text-amber-700' : 'text-black/40')}>
          {label}
        </span>
      </div>
      <div className={cn(
        'mt-auto pt-3 text-[22px] font-semibold tabular-nums tracking-[-0.02em] sm:text-[25px]',
        warn ? 'text-amber-700' : 'text-foreground',
      )}>
        {value}
      </div>
      <div className="mt-0.5 text-[11.5px] text-black/35">{hint}</div>
    </div>
  );
};

// ── Transit table ─────────────────────────────────────────────────────────────

const TransitTable: React.FC<{ rows: HgsTransit[] }> = ({ rows }) => {
  if (rows.length === 0) {
    return <div className="rounded-lg border border-dashed border-black/[0.09] px-3 py-6 text-center text-[12px] text-black/30">
      No transits in this range.
    </div>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-black/[0.06] bg-white">
      <div className="hidden grid-cols-[104px_minmax(0,1fr)_110px] gap-3 border-b border-black/[0.06] bg-black/[0.015] px-3 py-2 sm:grid">
        {['Date', 'Route', 'Amount'].map((h, i) => (
          <span key={h} className={cn('text-[10.5px] font-medium uppercase tracking-[0.08em] text-black/40', i === 2 && 'text-right')}>{h}</span>
        ))}
      </div>
      <ul className="divide-y divide-black/[0.04]">
        {rows.map((t) => (
          <li key={t.id} className="grid gap-1 px-3 py-2 sm:grid-cols-[104px_minmax(0,1fr)_110px] sm:items-center sm:gap-3">
            <span className="text-[12px] tabular-nums text-black/55">{formatDate(t.transitDatetime)}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px] text-foreground">
              <span className="truncate">{t.entryLocation ?? '—'}</span>
              <ArrowRight size={12} strokeWidth={2} className="shrink-0 text-black/25" />
              <span className="truncate">{t.exitLocation ?? t.tollLocation ?? '—'}</span>
            </span>
            <span className={cn(
              'text-[12.5px] font-semibold tabular-nums sm:text-right',
              t.amount < 0 ? 'text-destructive' : 'text-foreground',
            )}>
              {formatLira(t.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ── Car row ───────────────────────────────────────────────────────────────────

interface HistoryState {
  status: 'loading' | 'ready' | 'error';
  rows: HgsTransit[];
  message?: string;
}

/** Shared by the header strip and every row, so the columns line up. */
const GRID = 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_78px_112px_128px]';

const CarRow: React.FC<{
  car: HgsCar;
  expanded: boolean;
  history?: HistoryState;
  onToggle: (carId: number) => void;
  onRetry: (carId: number) => void;
}> = ({ car, expanded, history, onToggle, onRetry }) => {
  const openable = car.transitCount > 0;
  const panelId = `hgs-history-${car.carId}`;

  const [range, setRange] = useState<Range>(ALL_RANGE);
  const [showDetails, setShowDetails] = useState(false);

  // String compare on the ISO day. Anything timezone-aware here would shift the
  // boundary by a day, because a transit carries a date and no time.
  const inRange = useMemo(() => {
    const rows = history?.rows ?? [];
    if (!range.from && !range.to) return rows;
    return rows.filter((t) => {
      const day = (t.transitDatetime || '').slice(0, 10);
      if (range.from && day < range.from) return false;
      if (range.to && day > range.to) return false;
      return true;
    });
  }, [history, range]);

  const rangeTotal = useMemo(() => inRange.reduce((sum, t) => sum + t.amount, 0), [inRange]);
  const ranged = Boolean(range.from || range.to);

  return (
    <div className={cn(
      'overflow-hidden rounded-xl border bg-white transition-all duration-200',
      expanded ? 'border-primary/35 shadow-[0_1px_3px_rgb(0_0_0/0.05)]' : 'border-black/[0.07] hover:border-black/[0.12]',
    )}>
      <button
        type="button"
        disabled={!openable}
        onClick={() => onToggle(car.carId)}
        aria-expanded={openable ? expanded : undefined}
        aria-controls={openable && expanded ? panelId : undefined}
        className={cn(
          'grid w-full min-h-[56px] grid-cols-2 items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors', GRID,
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/25',
          openable ? 'cursor-pointer hover:bg-black/[0.015]' : 'cursor-default',
        )}
      >
        <span className="col-span-2 flex min-w-0 items-center gap-2 lg:col-span-1">
          <ChevronDown
            size={14} strokeWidth={2}
            className={cn(
              'shrink-0 transition-transform duration-200',
              !openable && 'invisible',
              expanded ? 'rotate-180 text-primary' : 'text-black/25',
            )}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold tracking-[-0.008em] text-black/85">{car.plateNumber}</span>
            {car.hgsBarcode && <span className="truncate text-[11px] tabular-nums text-black/30">{car.hgsBarcode}</span>}
          </span>
        </span>

        <span className="col-span-2 truncate pl-6 text-[12px] text-black/50 lg:col-span-1 lg:pl-0 lg:text-[12.5px]">
          {car.modelGroup ?? '—'}
        </span>

        <span className="pl-6 text-[12px] tabular-nums text-black/50 lg:pl-0 lg:text-right">
          <span className="lg:hidden">Transits </span>{formatCount(car.transitCount)}
        </span>
        <span className="text-[12px] tabular-nums text-black/45 lg:text-right">{formatDate(car.lastTransit)}</span>
        <span className="col-span-2 pl-6 text-[13px] font-semibold tabular-nums text-foreground lg:col-span-1 lg:pl-0 lg:text-right">
          {formatLira(car.totalAmount)}
        </span>
      </button>

      {expanded && openable && (
        <div id={panelId} className="border-t border-black/[0.06] bg-black/[0.008] px-4 py-3">
          {history?.status === 'loading' && (
            <div className="flex items-center gap-2 py-4 text-[12.5px] text-black/45">
              <Spinner size={13} /> Loading transits…
            </div>
          )}

          {history?.status === 'error' && (
            <div className="flex flex-col items-start gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[12.5px] text-destructive">{history.message ?? 'Could not load this history.'}</span>
              <Button variant="outline" size="sm" onClick={() => onRetry(car.carId)}>Try again</Button>
            </div>
          )}

          {history?.status === 'ready' && (
            <div className="flex flex-col gap-3">
              <DateRangeFilter value={range} onChange={(r) => { setRange(r); setShowDetails(false); }} />

              <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-primary/20 bg-primary/[0.05] px-4 py-3">
                <span className="text-[12px] text-black/50">
                  {formatCount(inRange.length)} {inRange.length === 1 ? 'transit' : 'transits'}
                  {ranged ? ' in range' : ' in total'}
                </span>
                <span className={cn(
                  'text-[19px] font-semibold tabular-nums tracking-[-0.02em]',
                  rangeTotal < 0 ? 'text-destructive' : 'text-foreground',
                )}>
                  {formatLira(rangeTotal)}
                </span>
              </div>

              <Button
                variant="outline" size="sm" className="self-start"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
              >
                <ChevronDown size={13} strokeWidth={2}
                             className={cn('transition-transform duration-200', showDetails && 'rotate-180')} />
                {showDetails ? 'Hide details' : 'Show details'}
              </Button>

              {showDetails && <TransitTable rows={inRange} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'with-transits';

const HGSPage: React.FC = () => {
  const [data, setData] = useState<HgsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortState>(null);
  const [expandedCar, setExpandedCar] = useState<number | null>(null);
  const [histories, setHistories] = useState<Record<number, HistoryState>>({});

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      const dashboard = await getHgsDashboard();
      if (!mounted.current) return;
      setData(dashboard);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : 'Could not load HGS data.');
    } finally {
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => { void load(false); }, [load]);

  const refresh = useCallback(() => {
    setHistories({});
    setExpandedCar(null);
    void load(true);
  }, [load]);

  const fetchHistory = useCallback(async (carId: number) => {
    setHistories((prev) => ({ ...prev, [carId]: { status: 'loading', rows: [] } }));
    try {
      const rows = await getCarTransits(carId);
      if (!mounted.current) return;
      setHistories((prev) => ({ ...prev, [carId]: { status: 'ready', rows } }));
    } catch (err) {
      if (!mounted.current) return;
      setHistories((prev) => ({
        ...prev,
        [carId]: { status: 'error', rows: [], message: err instanceof Error ? err.message : 'Could not load this history.' },
      }));
    }
  }, []);

  const toggleCar = useCallback((carId: number) => {
    setExpandedCar((current) => (current === carId ? null : carId));
  }, []);

  useEffect(() => {
    if (expandedCar === null || histories[expandedCar]) return;
    void fetchHistory(expandedCar);
  }, [expandedCar, histories, fetchHistory]);

  const cars = data?.cars ?? [];

  const counts = useMemo(() => ({
    all: cars.length,
    'with-transits': cars.filter((c) => c.transitCount > 0).length,
  }), [cars]);

  const visibleCars = useMemo(() => {
    const base = filter === 'all' ? cars : cars.filter((c) => c.transitCount > 0);
    if (!sort) return base;   // RPC order — spend descending

    const sign = sort.dir === 'asc' ? 1 : -1;
    const value = (c: HgsCar): string | number => {
      switch (sort.col) {
        case 'plate':    return c.plateNumber;
        case 'model':    return c.modelGroup ?? '';
        case 'transits': return c.transitCount;
        case 'last':     return c.lastTransit ?? '';
        default:         return c.totalAmount;
      }
    };
    // Copied before sorting: `cars` is the fetched array and must not be mutated.
    return [...base].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * sign;
    });
  }, [cars, filter, sort]);

  const onSort = useCallback((col: SortCol) => setSort((cur) => nextSort(cur, col)), []);

  const { trackRef, pillStyle } = useSlidingPill(loading ? 'loading' : filter);

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All cars' },
    { key: 'with-transits', label: 'With transits' },
  ];

  return (
    <div className="media-scope min-h-full bg-white px-5 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader eyebrow="Tolls" title="HGS" subtitle="Motorway transits and toll spend per vehicle, synced hourly." />
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading || refreshing} className="self-start">
            {refreshing ? <Spinner size={12} /> : null}
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        {error && !loading && (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} strokeWidth={1.9} className="mt-px text-destructive" />
              <div>
                <div className="text-[13px] font-medium text-destructive">Could not load HGS data</div>
                <div className="mt-0.5 text-[12.5px] text-black/50">{error}</div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={refresh}>Try again</Button>
          </div>
        )}

        {/* ── Summary ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)
            : data && (
                <>
                  <StatCard label="Total spend" value={formatLira(data.summary.totalAmount)} hint="All recorded transits" Icon={Banknote} />
                  <StatCard label="Transits" value={formatCount(data.summary.transitCount)} hint="Toll crossings logged" Icon={Hash} />
                  <StatCard label="Cars on HGS" value={formatCount(data.summary.carsWithHgs)} hint="Active vehicles subscribed" Icon={CarFront} />
                  <StatCard
                    label="Without HGS" value={formatCount(data.summary.carsWithoutHgs)}
                    hint="Active vehicles missing a barcode" Icon={AlertTriangle}
                    tone={data.summary.carsWithoutHgs > 0 ? 'warning' : 'default'}
                  />
                </>
              )}
        </div>

        {/* ── Filter ──────────────────────────────────────────────────────── */}
        {!loading && data && (
          <div className="flex flex-wrap items-center gap-3">
            <div
              ref={trackRef} role="group" aria-label="Filter cars"
              className="relative inline-flex w-fit max-w-full items-center gap-0.5 rounded-full border border-black/[0.06] bg-black/[0.02] p-1"
            >
              <span
                aria-hidden="true" style={pillStyle}
                className="pointer-events-none absolute left-0 top-1 h-8 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.07)] ring-1 ring-black/[0.05]"
              />
              {filters.map(({ key, label }) => {
                const active = filter === key;
                return (
                  <button
                    key={key} type="button" data-pill-active={active} aria-pressed={active}
                    onClick={() => setFilter(key)}
                    className={cn(
                      'relative z-[1] inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] tracking-[-0.008em] transition-colors duration-150 sm:px-3.5',
                      active ? 'font-semibold text-primary' : 'font-medium text-black/55 hover:text-black/80',
                    )}
                  >
                    {label}
                    <span className={cn('tabular-nums', active ? 'text-primary/60' : 'text-black/30')}>{formatCount(counts[key])}</span>
                  </button>
                );
              })}
            </div>

            {sort && (
              <button
                type="button" onClick={() => setSort(null)}
                className="text-[11.5px] text-black/40 underline-offset-2 transition-colors hover:text-black/70 hover:underline"
              >
                Clear sort
              </button>
            )}
          </div>
        )}

        {/* ── Column headers — lg only; rows stack into cards below that ──── */}
        {!loading && data && visibleCars.length > 0 && (
          <div className={cn('hidden items-center gap-x-3 px-4 lg:grid', GRID)}>
            <SortableHeader col="plate"    label="Plate"       sort={sort} onSort={onSort} />
            <SortableHeader col="model"    label="Model group" sort={sort} onSort={onSort} />
            <SortableHeader col="transits" label="Transits"    sort={sort} onSort={onSort} align="end" />
            <SortableHeader col="last"     label="Last"        sort={sort} onSort={onSort} align="end" />
            <SortableHeader col="amount"   label="Amount"      sort={sort} onSort={onSort} align="end" />
          </div>
        )}

        {/* ── Car list ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          {loading ? (
            Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[62px] rounded-xl" />)
          ) : visibleCars.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-black/10 px-6 py-12 text-center">
              <SearchX size={22} strokeWidth={1.6} className="text-black/25" />
              <div className="text-[13.5px] font-medium text-black/60">
                {filter === 'with-transits' ? 'No car has any transits yet' : 'No cars on HGS'}
              </div>
              <div className="max-w-[340px] text-[12.5px] text-black/40">
                {filter === 'with-transits'
                  ? 'Transits appear here once the hourly sync picks up a toll crossing.'
                  : 'Add an HGS barcode to an active car for it to show up here.'}
              </div>
            </div>
          ) : (
            visibleCars.map((car) => (
              <CarRow
                key={car.carId}
                car={car}
                expanded={expandedCar === car.carId}
                history={histories[car.carId]}
                onToggle={toggleCar}
                onRetry={fetchHistory}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default HGSPage;
