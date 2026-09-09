import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../lib/media/tokens.css';
import { cn, tintedStyle } from '../lib/media/badgeColor';
import {
  formatCount,
  formatDate,
  formatDateTime,
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

// ── Local icons ───────────────────────────────────────────────────────────────
//
// MediaIcons carries no money or vehicle glyph. These two follow the same lucide
// geometry (24x24, currentColor, round caps) so they sit in the set cleanly.

const Banknote: React.FC<IconProps> = ({ size = 16, strokeWidth = 1.75, className }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true" focusable="false"
  >
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

const CarFront: React.FC<IconProps> = ({ size = 16, strokeWidth = 1.75, className }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true" focusable="false"
  >
    <path d="M5 17H3v-4l2-5h14l2 5v4h-2" />
    <path d="M5 13h14" />
    <circle cx="7.5" cy="17" r="1.5" />
    <circle cx="16.5" cy="17" r="1.5" />
  </svg>
);

/**
 * HGS tolls — read-only.
 *
 * An n8n workflow polls the HGS provider hourly and writes `hgs_transactions`;
 * nothing on this page writes back. The whole summary + car list arrives in one
 * `hgs_dashboard()` RPC, and a car's history is fetched the first time it is
 * expanded and then kept, so re-opening a car costs nothing.
 */

type Filter = 'all' | 'with-transits';

interface HistoryState {
  status: 'loading' | 'ready' | 'error';
  rows: HgsTransit[];
  message?: string;
}

// ── Direction badge ───────────────────────────────────────────────────────────

/**
 * `direction` holds the provider's full fee label — "KMO ASYA KESIMI GECIS
 * UCRETI", "KARAYOLLARI GEÇİŞ ÜCRETİ". The leading token is the part that
 * distinguishes them, so the pill shows that and the full label stays in the
 * tooltip rather than wrapping over three lines in every row.
 */
function shortDirection(direction: string): string {
  return direction.trim().split(/\s+/)[0] ?? direction;
}

const DIRECTION_COLORS = ['#6ea4e7', '#8b9d77', '#c99a5b', '#a888c4', '#5fa8a0', '#c47f8a'];

/** Stable colour per fee type, so the same label always reads the same tint. */
function directionColor(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  return DIRECTION_COLORS[hash % DIRECTION_COLORS.length];
}

const DirectionBadge: React.FC<{ direction: string | null }> = ({ direction }) => {
  if (!direction) return null;
  const code = shortDirection(direction);
  return (
    <span
      title={direction}
      className="inline-flex h-[20px] w-fit shrink-0 items-center whitespace-nowrap rounded-full border px-2 text-[11px] font-medium leading-none"
      style={tintedStyle(directionColor(code))}
    >
      {code}
    </span>
  );
};

// ── Summary cards ─────────────────────────────────────────────────────────────

const SummaryCard: React.FC<{
  label: string;
  value: string;
  hint?: string;
  Icon: React.FC<IconProps>;
  tone?: 'default' | 'warning';
}> = ({ label, value, hint, Icon, tone = 'default' }) => {
  const warning = tone === 'warning';
  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-colors',
        warning ? 'border-[#d99a3d]/25 bg-[#d99a3d]/[0.06]' : 'border-black/[0.07] bg-white',
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          size={14}
          strokeWidth={1.9}
          className={warning ? 'text-[#a6702a]' : 'text-[#6ea4e7]'}
        />
        <span
          className={cn(
            'text-[11px] font-medium uppercase tracking-[0.1em]',
            warning ? 'text-[#a6702a]' : 'text-black/45',
          )}
        >
          {label}
        </span>
      </div>
      <div
        className={cn(
          'mt-2 text-[22px] font-semibold tabular-nums tracking-[-0.02em] sm:text-[26px]',
          warning ? 'text-[#a6702a]' : 'text-[#0e0e10]',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[12px] text-black/40">{hint}</div>}
    </div>
  );
};

// ── Transit history ───────────────────────────────────────────────────────────

const TransitHistory: React.FC<{ state: HistoryState; onRetry: () => void }> = ({
  state,
  onRetry,
}) => {
  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 px-4 py-5 text-[12.5px] text-black/45">
        <Spinner size={13} />
        Loading transits…
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[12.5px] text-[#d4183d]">
          {state.message ?? 'Could not load this history.'}
        </span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (state.rows.length === 0) {
    return (
      <div className="px-4 py-5 text-[12.5px] text-black/40">No transits recorded.</div>
    );
  }

  return (
    <ul className="divide-y divide-black/[0.05]">
      {state.rows.map((transit) => (
        <li
          key={transit.id}
          className="grid gap-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_110px] sm:items-center sm:gap-4"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-[13px] text-[#0e0e10]">
              {transit.tollLocation ?? 'Unknown exit'}
            </span>
            <DirectionBadge direction={transit.direction} />
          </div>
          <span className="text-[12px] tabular-nums text-black/45 sm:text-right">
            {formatDateTime(transit.transitDatetime)}
          </span>
          <span className="text-[13px] font-semibold tabular-nums text-[#0e0e10] sm:text-right">
            {formatLira(transit.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
};

// ── Car row ───────────────────────────────────────────────────────────────────

const CarRow: React.FC<{
  car: HgsCar;
  expanded: boolean;
  history?: HistoryState;
  onToggle: (carId: number) => void;
  onRetry: (carId: number) => void;
}> = ({ car, expanded, history, onToggle, onRetry }) => {
  // Nothing to open for a subscribed car that has never passed a toll — showing
  // a chevron that reveals an empty panel is worse than showing no chevron.
  const openable = car.transitCount > 0;
  const panelId = `hgs-history-${car.carId}`;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-white transition-colors',
        expanded ? 'border-[#6ea4e7]/40 shadow-[0_1px_3px_rgb(0_0_0/0.05)]' : 'border-black/[0.07]',
      )}
    >
      <button
        type="button"
        disabled={!openable}
        onClick={() => onToggle(car.carId)}
        aria-expanded={openable ? expanded : undefined}
        aria-controls={openable && expanded ? panelId : undefined}
        className={cn(
          'flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors',
          'focus-visible:ring-[3px] focus-visible:ring-[#6ea4e7]/25',
          openable ? 'cursor-pointer hover:bg-black/[0.015]' : 'cursor-default',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[#0e0e10]">
              {car.plateNumber}
            </span>
            {car.hgsBarcode && (
              <span className="mt-0.5 truncate text-[11.5px] tabular-nums text-black/35">
                {car.hgsBarcode}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-black/45 sm:ml-auto">
            <span className="tabular-nums">
              {car.transitCount === 1 ? '1 transit' : `${formatCount(car.transitCount)} transits`}
            </span>
            <span aria-hidden="true" className="hidden text-black/15 sm:inline">
              ·
            </span>
            <span className="tabular-nums">
              {car.lastTransit ? `Last ${formatDate(car.lastTransit)}` : 'No transits yet'}
            </span>
          </div>
        </div>

        <span className="shrink-0 text-[14px] font-semibold tabular-nums text-[#0e0e10] sm:text-[15px]">
          {formatLira(car.totalAmount)}
        </span>

        {openable && (
          <ChevronDown
            size={16}
            strokeWidth={1.9}
            className={cn(
              'shrink-0 text-black/30 transition-transform duration-200',
              expanded && 'rotate-180 text-[#6ea4e7]',
            )}
          />
        )}
      </button>

      {expanded && openable && (
        <div id={panelId} className="border-t border-black/[0.06] bg-black/[0.012]">
          <TransitHistory
            state={history ?? { status: 'loading', rows: [] }}
            onRetry={() => onRetry(car.carId)}
          />
        </div>
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const HGSPage: React.FC = () => {
  const [data, setData] = useState<HgsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedCar, setExpandedCar] = useState<number | null>(null);
  const [histories, setHistories] = useState<Record<number, HistoryState>>({});

  // Every fetch here is fire-and-forget from a handler as well as from an effect,
  // so one mount flag guards them all rather than each growing its own token.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
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
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => {
    // A refresh must drop the cached histories too, otherwise the card totals
    // move while the rows below them stay on the previous hour's data.
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
        [carId]: {
          status: 'error',
          rows: [],
          message: err instanceof Error ? err.message : 'Could not load this history.',
        },
      }));
    }
  }, []);

  const toggleCar = useCallback((carId: number) => {
    setExpandedCar((current) => (current === carId ? null : carId));
  }, []);

  // Fetch the open car's history once. Re-collapsing and re-opening reads the
  // kept entry instead of re-querying; `refresh` is what clears it.
  useEffect(() => {
    if (expandedCar === null || histories[expandedCar]) return;
    void fetchHistory(expandedCar);
  }, [expandedCar, histories, fetchHistory]);

  const cars = data?.cars ?? [];

  const counts = useMemo(
    () => ({
      all: cars.length,
      'with-transits': cars.filter((car) => car.transitCount > 0).length,
    }),
    [cars],
  );

  const visibleCars = useMemo(
    () => (filter === 'all' ? cars : cars.filter((car) => car.transitCount > 0)),
    [cars, filter],
  );

  // The key folds in `loading` because the track is not mounted during the
  // skeleton pass: keyed on `filter` alone the hook measures nothing on mount,
  // never re-runs, and the pill stays invisible until the first filter click.
  const { trackRef, pillStyle } = useSlidingPill(loading ? 'loading' : filter);

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All cars' },
    { key: 'with-transits', label: 'With transits' },
  ];

  return (
    <div className="media-scope min-h-full bg-white px-5 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader
            eyebrow="Tolls"
            title="HGS"
            subtitle="Motorway transits and toll spend per vehicle, synced hourly."
          />
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading || refreshing}
            className="self-start"
          >
            {refreshing ? <Spinner size={12} /> : null}
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        {error && !loading && (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-[#d4183d]/20 bg-[#d4183d]/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} strokeWidth={1.9} className="mt-px text-[#d4183d]" />
              <div>
                <div className="text-[13px] font-medium text-[#d4183d]">
                  Could not load HGS data
                </div>
                <div className="mt-0.5 text-[12.5px] text-black/50">{error}</div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={refresh}>
              Try again
            </Button>
          </div>
        )}

        {/* ── Summary ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[104px] rounded-xl" />
              ))
            : data && (
                <>
                  <SummaryCard
                    label="Total spend"
                    value={formatLira(data.summary.totalAmount)}
                    hint="All recorded transits"
                    Icon={Banknote}
                  />
                  <SummaryCard
                    label="Transits"
                    value={formatCount(data.summary.transitCount)}
                    hint="Toll crossings logged"
                    Icon={Hash}
                  />
                  <SummaryCard
                    label="Cars on HGS"
                    value={formatCount(data.summary.carsWithHgs)}
                    hint="Active vehicles subscribed"
                    Icon={CarFront}
                  />
                  <SummaryCard
                    label="Without HGS"
                    value={formatCount(data.summary.carsWithoutHgs)}
                    hint="Active vehicles missing a barcode"
                    Icon={AlertTriangle}
                    tone={data.summary.carsWithoutHgs > 0 ? 'warning' : 'default'}
                  />
                </>
              )}
        </div>

        {/* ── Filter ──────────────────────────────────────────────────────── */}
        {!loading && data && (
          <div
            ref={trackRef}
            role="group"
            aria-label="Filter cars"
            className="relative inline-flex w-fit max-w-full items-center gap-0.5 self-start rounded-full border border-black/[0.06] bg-black/[0.02] p-1"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-1 h-8 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-black/[0.05]"
              style={pillStyle}
            />
            {filters.map(({ key, label }) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  data-pill-active={active}
                  aria-pressed={active}
                  onClick={() => setFilter(key)}
                  className={cn(
                    'relative z-[1] inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] tracking-[-0.006em] transition-colors duration-150 sm:px-3.5',
                    active ? 'font-semibold text-[#6ea4e7]' : 'font-medium text-black/55 hover:text-black/80',
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      'tabular-nums',
                      active ? 'text-[#6ea4e7]/60' : 'text-black/30',
                    )}
                  >
                    {formatCount(counts[key])}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Car list ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          {loading ? (
            Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[62px] rounded-xl" />
            ))
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
