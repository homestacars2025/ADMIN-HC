import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../lib/media/tokens.css';
import { MediaToaster, toast } from '../components/media/MediaToast';
import { Button } from '../components/media/MediaUI';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../components/shared/FilterTile';
import { Icon3D } from '../components/shared/Icon3D';
import MonthNav from '../components/shared/MonthNav';
import { LoadError, PageHeader, SearchField, SkeletonRows } from '../components/shared/PageBits';
import { StatusImage, type StatusArt } from '../components/shared/StatusImage';
import { useUrlFilter } from '../hooks/useUrlFilter';
import { istanbulDate } from '../lib/customers';
import {
  CALENDAR_SORTS,
  daysInMonth,
  fetchConflicts,
  fetchFleetMonth,
  fetchUtilization,
  fleetUtilization,
  highSeverityBars,
  matchesCalendarSearch,
  placeBars,
  shiftCalendarMonth,
  sortCars,
  statusCounts,
  type CalendarBar,
  type CalendarCar,
  type CalendarConflict,
  type CalendarSort,
  type FleetMonth,
  type Utilization,
} from '../lib/fleetCalendar';
import { CAR_STATUSES, FLEET_STATUS, barBackground, carStatusToken, type CarStatus } from '../lib/fleetStatus';
import { cn } from '../lib/media/badgeColor';
import { supabase } from '../lib/supabase';
import { LicensePlate, Segmented } from './bookings/ui';
import { BlockPopup, SelectionActionMenu, type ActionMenuState, type BlockPopupState, type EditableBlockType } from './calendar/CalendarActions';
import { BarPopover, CarHistoryDrawer, CarStatusChip, FleetUtilizationChip, Legend, UtilizationRing, type PopoverState } from './calendar/FleetParts';

/**
 * The Fleet Calendar: one row per active car, one bar per booking or block across its
 * days, coloured by status from the palette the Bookings tiles use. The database's own
 * checks sit on top as a list of issues, and a car's whole history opens from its row.
 * Picking a range of empty days still offers a booking or a block, as before.
 */

const COL_W = 40;
const LANE_H = 30;
const BAR_H = 26;
const ROW_PAD = 12;
const LEFT_W = 212;
const LEFT_W_PHONE = 172;

const SORT_LABELS: Record<CalendarSort, string> = { model: 'Model', util_desc: 'Highest use', util_asc: 'Lowest use' };

const ART: Record<CarStatus, React.ReactNode> = {
  working: <StatusImage status="working" size={56} />,
  pending: <Icon3D name="pending" />,
  parking: <StatusImage status="parking" size={56} />,
  maintenance: <StatusImage status={'maintenance' as StatusArt} size={56} />,
  selling: <StatusImage status="selling" size={56} />,
  replacement: <StatusImage status="replacement" size={56} />,
};

const pad = (value: number) => String(value).padStart(2, '0');

function useNarrow(): boolean {
  const query = '(max-width: 639px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const onChange = () => setNarrow(list.matches);
    list.addEventListener?.('change', onChange);
    return () => list.removeEventListener?.('change', onChange);
  }, []);
  return narrow;
}

const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { filter, toggle, clear } = useUrlFilter(CAR_STATUSES);
  const today = istanbulDate();
  const thisMonth = today.slice(0, 7);
  const requested = params.get('month');
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : thisMonth;
  const days = daysInMonth(month);
  const narrow = useNarrow();
  const leftW = narrow ? LEFT_W_PHONE : LEFT_W;
  const requestedSort = params.get('sort') as CalendarSort | null;
  const sort: CalendarSort = requestedSort && CALENDAR_SORTS.includes(requestedSort) ? requestedSort : 'model';

  const [data, setData] = useState<FleetMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [conflicts, setConflicts] = useState<CalendarConflict[]>([]);
  const [utilization, setUtilization] = useState<Map<number, Utilization>>(new Map());
  const [query, setQuery] = useState('');
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [historyCar, setHistoryCar] = useState<CalendarCar | null>(null);
  const closeTimer = useRef<number | null>(null);

  // Picking a range of empty days, as the calendar always has.
  const [selCarId, setSelCarId] = useState<number | null>(null);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const [blockPopup, setBlockPopup] = useState<BlockPopupState | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);
  const blockPopupRef = useRef<HTMLDivElement>(null);

  const resetSelection = useCallback(() => {
    setSelCarId(null); setSelStart(null); setHoverDay(null); setActionMenu(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPopover(null);
    resetSelection();
    fetchFleetMonth(month)
      .then((next) => { if (!cancelled) setData(next); })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); });
    return () => { cancelled = true; };
  }, [month, reload, resetSelection]);

  // Conflicts (for the red outline) and utilization are live: read again on a new month,
  // after a change, and on coming back to the tab. Neither stops the calendar if it fails.
  useEffect(() => {
    let cancelled = false;
    setUtilization(new Map());
    const read = () => {
      fetchConflicts(month)
        .then((rows) => { if (!cancelled) setConflicts(rows); })
        .catch(() => { if (!cancelled) setConflicts([]); });
      fetchUtilization(month)
        .then((rows) => { if (!cancelled) setUtilization(rows); })
        .catch(() => { if (!cancelled) setUtilization(new Map()); });
    };
    read();
    window.addEventListener('focus', read);
    return () => { cancelled = true; window.removeEventListener('focus', read); };
  }, [month, reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  const setSort = (next: CalendarSort) => {
    const updated = new URLSearchParams(params);
    if (next === 'model') updated.delete('sort'); else updated.set('sort', next);
    setParams(updated);
  };

  const setMonth = (next: string) => {
    const updated = new URLSearchParams(params);
    if (next === thisMonth) updated.delete('month'); else updated.set('month', next);
    setParams(updated);
  };

  const barsByCar = useMemo(() => {
    const map = new Map<number, CalendarBar[]>();
    (data?.bars ?? []).forEach((bar) => { const list = map.get(bar.carId); if (list) list.push(bar); else map.set(bar.carId, [bar]); });
    return map;
  }, [data]);
  const counts = useMemo(() => statusCounts(data?.cars ?? []), [data]);
  const flagged = useMemo(() => highSeverityBars(conflicts, data?.bars ?? []), [conflicts, data]);
  const visible = useMemo(
    () => sortCars((data?.cars ?? []).filter((car) => (filter === 'all' || car.status === filter) && matchesCalendarSearch(car, barsByCar.get(car.id) ?? [], query)), utilization, sort),
    [data, filter, query, barsByCar, utilization, sort],
  );
  const fleetRate = useMemo(() => fleetUtilization(utilization), [utilization]);

  const dayMeta = useMemo(() => Array.from({ length: days }, (_, index) => {
    const date = `${month}-${pad(index + 1)}`;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return { day: index + 1, date, weekend: weekday === 0 || weekday === 6, abbr: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2) };
  }), [month, days]);
  const todayIndex = month === thisMonth ? Number(today.slice(8, 10)) - 1 : -1;
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  // ── Popover ──────────────────────────────────────────────────────────────
  const cancelClose = () => { if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setPopover((current) => (current?.pinned ? current : null)), 160);
  };
  useEffect(() => () => cancelClose(), []);

  const showBar = (bar: CalendarBar, car: CalendarCar, element: HTMLElement, pinned: boolean) => {
    cancelClose();
    const box = element.getBoundingClientRect();
    setPopover((current) => (current?.pinned && !pinned && current.bar.key !== bar.key ? current : { bar, car, rect: { left: box.left, top: box.top, bottom: box.bottom, width: box.width }, pinned }));
  };

  useEffect(() => {
    if (!popover?.pinned) return undefined;
    const onDown = () => setPopover(null);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [popover?.pinned]);

  useEffect(() => {
    if (!actionMenu) return undefined;
    const onDown = (event: MouseEvent) => { if (!actionMenuRef.current?.contains(event.target as Node)) resetSelection(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [actionMenu, resetSelection]);

  useEffect(() => {
    if (!blockPopup) return undefined;
    const onDown = (event: MouseEvent) => { if (!blockPopupRef.current?.contains(event.target as Node)) setBlockPopup(null); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [blockPopup]);

  const openBooking = (number: string, start: string) => navigate(`/dashboard/bookings?${new URLSearchParams({ month: start.slice(0, 7), q: number })}`);

  const openHistory = (car: CalendarCar) => { setPopover(null); setHistoryCar(car); };

  const editBlock = (bar: CalendarBar) => {
    if (!bar.block || !popover) return;
    const car = popover.car;
    setPopover(null);
    setBlockPopup({
      entry: { id: bar.block.id, block_type: bar.block.type, start_date: bar.start, end_date: bar.end, booking_id: null, customer_name: null },
      car: { plate_number: car.plate, model_name: car.model },
      x: popover.rect.left + popover.rect.width / 2,
      y: popover.rect.bottom,
    });
  };

  // ── Picking days ─────────────────────────────────────────────────────────
  const pickDay = (car: CalendarCar, day: number) => {
    setPopover(null);
    if (selCarId !== car.id || selStart === null) { setSelCarId(car.id); setSelStart(day); setActionMenu(null); return; }
    if (day === selStart) { resetSelection(); return; }
    if (day < selStart) { setSelStart(day); return; }
    setActionMenu({ car: { id: car.id, plate_number: car.plate, model_name: car.model }, startDay: selStart, endDay: day });
  };

  const selectionFor = (carId: number): { min: number; max: number } | null => {
    if (selCarId !== carId || selStart === null) return null;
    if (actionMenu) return { min: actionMenu.startDay, max: actionMenu.endDay };
    const end = hoverDay !== null && hoverDay > selStart ? hoverDay : selStart;
    return { min: selStart, max: end };
  };

  const dateOf = (day: number) => `${month}-${pad(day)}`;

  const addBooking = () => {
    if (!actionMenu) return;
    navigate(`/dashboard/bookings?car_id=${actionMenu.car.id}&start_date=${dateOf(actionMenu.startDay)}&end_date=${dateOf(actionMenu.endDay)}`);
    resetSelection();
  };

  const addBlock = async (blockType: EditableBlockType) => {
    if (!actionMenu) return;
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from('car_calendar').insert({
      car_id: actionMenu.car.id,
      start_date: dateOf(actionMenu.startDay),
      end_date: dateOf(actionMenu.endDay),
      block_type: blockType,
      created_by: user?.id ?? null,
      booking_id: null,
    });
    setSubmitting(false);
    if (insertError) { toast.error(`Failed to save: ${insertError.message}`); return; }
    resetSelection();
    toast.success(`${FLEET_STATUS[blockType].label} block added`);
    refresh();
  };

  const saveBlock = async (id: number, values: { block_type: string; start_date: string; end_date: string }) => {
    setBlockSaving(true);
    const { error: updateError } = await supabase.from('car_calendar').update(values).eq('id', id);
    setBlockSaving(false);
    if (updateError) { toast.error(`Failed to update: ${updateError.message}`); return; }
    setBlockPopup(null);
    toast.success('Block updated');
    refresh();
  };

  const deleteBlock = async (id: number) => {
    setBlockSaving(true);
    const { error: deleteError } = await supabase.from('car_calendar').delete().eq('id', id);
    setBlockSaving(false);
    if (deleteError) { toast.error(`Failed to delete: ${deleteError.message}`); return; }
    setBlockPopup(null);
    toast.success('Block deleted');
    refresh();
  };

  const loading = data === null && !error;
  const gridW = days * COL_W;

  return (
    <div className="media-scope mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <MediaToaster />
      <PageHeader
        eyebrow="Fleet"
        title="Fleet Calendar"
        subtitle={data ? `${data.cars.length} ${data.cars.length === 1 ? 'car' : 'cars'} · ${monthLabel}` : monthLabel}
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <FleetUtilizationChip rate={fleetRate} />
            <MonthNav label={monthLabel} justify="flex-end" onPrev={() => setMonth(shiftCalendarMonth(month, -1))} onNext={() => setMonth(shiftCalendarMonth(month, 1))} />
            {month !== thisMonth && <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-9" onClick={() => setMonth(thisMonth)}>Today</Button>}
          </div>
        )}
      />

      {error && !data ? (
        <LoadError message={`Couldn't load the calendar: ${error}`} onRetry={refresh} />
      ) : loading ? (
        <>
          <FilterTileSkeleton count={7} />
          <div className="mt-4 rounded-2xl border border-subtle bg-surface"><SkeletonRows count={8} /></div>
        </>
      ) : data && (
        <>
          <FilterTileRow columns={7} label="Filter the cars">
            <FilterTile mono tone="blue" bareIcon icon={<StatusImage status="fleet" size={56} />} label="All" value={String(data.cars.length)} sub="active cars" active={filter === 'all'} onClick={clear} />
            {CAR_STATUSES.map((status) => {
              const token = carStatusToken(status);
              return (
                <FilterTile key={status} mono tone={token.tile} bareIcon icon={ART[status]} label={token.label} value={String(counts[status])} sub={counts[status] === 1 ? 'car' : 'cars'} active={filter === status} onClick={() => toggle(status)} />
              );
            })}
          </FilterTileRow>

          <div className="mb-3 mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchField value={query} onChange={setQuery} placeholder="Search plate, model or customer" className="w-full sm:w-[340px]" />
              <Segmented ariaLabel="Sort cars" value={sort} onChange={setSort} options={CALENDAR_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }))} />
            </div>
            <Legend />
          </div>

          <div className="overflow-hidden rounded-2xl border border-subtle bg-surface">
            <div className="max-h-[calc(100dvh-180px)] overflow-auto overscroll-contain" onScroll={() => { if (popover && !popover.pinned) setPopover(null); }}>
              <div style={{ width: leftW + gridW }} className="relative select-none">
                {/* Days */}
                <div className="sticky top-0 z-30 flex border-b border-subtle bg-surface">
                  <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-subtle bg-surface px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-black/40" style={{ width: leftW }}>
                    {visible.length} {visible.length === 1 ? 'car' : 'cars'}
                  </div>
                  {dayMeta.map((meta, index) => (
                    <div key={meta.day} className={cn('flex shrink-0 flex-col items-center justify-center gap-0.5 py-1.5', meta.weekend && 'bg-black/[0.025]')} style={{ width: COL_W }}>
                      <span className="text-[10px] font-medium uppercase text-black/40">{meta.abbr}</span>
                      <span className={cn('grid h-6 w-6 place-items-center rounded-full text-[12.5px] font-semibold tabular-nums', index === todayIndex ? 'bg-[#DC2626] text-white' : meta.weekend ? 'text-black/40' : 'text-foreground')}>{meta.day}</span>
                    </div>
                  ))}
                </div>

                {visible.length === 0 && (
                  <div className="px-6 py-16 text-center" style={{ width: leftW + gridW, maxWidth: '100%' }}>
                    <p className="text-[14px] font-medium text-black/65">No cars match</p>
                    <p className="mt-1 text-[13px] text-black/45">Clear the search or the filter to see every car.</p>
                  </div>
                )}

                {visible.map((car) => {
                  const { placed, lanes } = placeBars(barsByCar.get(car.id) ?? [], month);
                  const height = ROW_PAD * 2 + BAR_H + (lanes - 1) * LANE_H;
                  const selection = selectionFor(car.id);
                  return (
                    <div key={car.id} id={`cal-row-${car.id}`} className="flex border-b border-subtle last:border-b-0" style={{ minHeight: height }}>
                      <button
                        type="button"
                        onClick={() => openHistory(car)}
                        aria-label={`History of ${car.plate}`}
                        className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-subtle bg-surface px-3 py-2 text-start transition-colors hover:bg-[#F7F9FC] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[#6EA4E7]/35"
                        style={{ width: leftW }}
                      >
                        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                          <LicensePlate plate={car.plate} />
                          <span className="w-full truncate text-[12.5px] text-black/55">{car.model}</span>
                          <CarStatusChip status={car.status} />
                        </span>
                        <UtilizationRing value={utilization.get(car.id)} />
                      </button>
                      <div className="relative shrink-0" style={{ width: gridW, height }}>
                        {dayMeta.map((meta, index) => {
                          const selected = selection ? meta.day >= selection.min && meta.day <= selection.max : false;
                          return (
                            <div
                              key={meta.day}
                              role="presentation"
                              onClick={() => pickDay(car, meta.day)}
                              onMouseEnter={() => { if (selCarId === car.id && selStart !== null && !actionMenu) setHoverDay(meta.day); }}
                              className={cn('absolute inset-y-0 cursor-pointer border-r border-black/[0.035]', meta.weekend && 'bg-black/[0.025]', selected && '!bg-[#6EA4E7]/[0.16]')}
                              style={{ left: index * COL_W, width: COL_W }}
                            />
                          );
                        })}
                        {todayIndex >= 0 && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-[5] w-[2px] -translate-x-1/2 bg-[#DC2626]/80" style={{ left: (todayIndex + 0.5) * COL_W }} />}
                        {placed.map(({ bar, from, to, cutStart, cutEnd, lane }) => {
                          const token = FLEET_STATUS[bar.status];
                          const label = bar.booking ? bar.booking.customer ?? bar.booking.number : `${token.label}${bar.block?.notes ? ` · ${bar.block.notes}` : ''}`;
                          const conflicted = flagged.has(bar.key);
                          return (
                            <button
                              key={bar.key}
                              id={`cal-bar-${bar.key}`}
                              type="button"
                              aria-label={`${label}, ${token.label}, ${bar.start} to ${bar.end}`}
                              onMouseEnter={(event) => showBar(bar, car, event.currentTarget, false)}
                              onMouseLeave={scheduleClose}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => showBar(bar, car, event.currentTarget, true)}
                              className={cn(
                                'absolute z-10 flex items-center overflow-hidden whitespace-nowrap px-2 text-start text-[12px] font-medium shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition-[filter] hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/50',
                              )}
                              style={{
                                left: from * COL_W,
                                width: Math.max((to - from) * COL_W, 8),
                                top: ROW_PAD + lane * LANE_H,
                                height: BAR_H,
                                background: barBackground(token),
                                color: token.ink,
                                border: `1px solid ${token.chip}`,
                                borderRadius: `${cutStart ? 2 : 9}px ${cutEnd ? 2 : 9}px ${cutEnd ? 2 : 9}px ${cutStart ? 2 : 9}px`,
                                outline: conflicted ? '2px solid #DC2626' : undefined,
                                outlineOffset: conflicted ? 1 : undefined,
                              }}
                            >
                              <span className="min-w-0 truncate">{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-black/40">Tap a car for its history, a bar for its details, or two empty days to add a booking or a block.</p>
        </>
      )}

      {popover && (
        <BarPopover
          state={popover}
          conflicted={flagged.has(popover.bar.key)}
          onOpenBooking={(bar) => bar.booking && openBooking(bar.booking.number, bar.start)}
          onEditBlock={editBlock}
          onHistory={openHistory}
          onClose={() => setPopover(null)}
          onHold={cancelClose}
          onRelease={() => { if (!popover.pinned) scheduleClose(); }}
        />
      )}

      {historyCar && <CarHistoryDrawer car={historyCar} onClose={() => setHistoryCar(null)} onOpenBooking={openBooking} />}

      {blockPopup && (
        <BlockPopup state={blockPopup} popupRef={blockPopupRef} submitting={blockSaving} onSave={saveBlock} onDelete={deleteBlock} onDismiss={() => setBlockPopup(null)} />
      )}

      {actionMenu && (
        <SelectionActionMenu
          state={actionMenu}
          year={Number(month.slice(0, 4))}
          month={Number(month.slice(5, 7)) - 1}
          menuRef={actionMenuRef}
          submitting={submitting}
          onBooking={addBooking}
          onBlock={(type) => void addBlock(type)}
          onDismiss={resetSelection}
        />
      )}
    </div>
  );
};

export default CalendarPage;
