import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from '../../components/media/MediaIcons';
import { Button, Sheet, SheetBody, SheetHeader, SheetTitle } from '../../components/media/MediaUI';
import { CarIcon3D, Icon3D } from '../../components/shared/Icon3D';
import { ComplianceTriangle, FineImage } from '../../components/shared/ComplianceBits';
import { StatusImage } from '../../components/shared/StatusImage';
import { formatDate, istanbulDate } from '../../lib/customers';
import {
  CONFLICT_LABELS,
  HISTORY_FILTERS,
  barDays,
  fetchCarHistory,
  historySummary,
  inHistoryFilter,
  parseStamp,
  type CalendarBar,
  type CalendarCar,
  type CalendarConflict,
  type ConflictKind,
  type HistoryFilter,
  type HistoryItem,
} from '../../lib/fleetCalendar';
import { FLEET_STATUS, FLEET_STATUS_ORDER, bookingStatusKey, carStatusToken, type StatusToken } from '../../lib/fleetStatus';
import { cn } from '../../lib/media/badgeColor';
import { formatMoney } from '../../lib/money';
import { LicensePlate, Segmented } from '../bookings/ui';

// ── Status ───────────────────────────────────────────────────────────────────

export const TokenChip: React.FC<{ token: Pick<StatusToken, 'label' | 'to' | 'ink' | 'chip'>; className?: string }> = ({ token, className }) => (
  <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-medium', className)} style={{ background: token.to, color: token.ink }}>
    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: token.chip }} />
    {token.label}
  </span>
);

export const CarStatusChip: React.FC<{ status: string }> = ({ status }) => <TokenChip token={carStatusToken(status)} />;

/** The seven bar colours, in the order they're explained. */
export const Legend: React.FC = () => (
  <ul aria-label="Colours" className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
    {FLEET_STATUS_ORDER.map((key) => (
      <li key={key} className="flex items-center gap-1.5 text-[12px] text-black/55">
        <span aria-hidden="true" className="h-3 w-5 rounded-[5px] border" style={{ background: `linear-gradient(145deg, ${FLEET_STATUS[key].from}, ${FLEET_STATUS[key].to})`, borderColor: FLEET_STATUS[key].chip }} />
        {key === 'booked' ? 'Working / Booked' : key === 'parking' ? 'Parking (free)' : FLEET_STATUS[key].label}
      </li>
    ))}
  </ul>
);

const range = (from: string | null, to: string | null) => (from && to && from !== to ? `${formatDate(from)} → ${formatDate(to)}` : formatDate(from ?? to));

// ── Issues ───────────────────────────────────────────────────────────────────

const SEVERITY: Record<CalendarConflict['severity'], { dot: string; text: string; label: string }> = {
  high: { dot: 'bg-[#DC2626]', text: 'text-[#B91C1C]', label: 'High' },
  medium: { dot: 'bg-[#F59E0B]', text: 'text-[#92400E]', label: 'Medium' },
  low: { dot: 'bg-black/30', text: 'text-black/55', label: 'Low' },
};

/** What the database finds wrong this month. Hidden when there's nothing. */
export const ConflictsPanel: React.FC<{ conflicts: CalendarConflict[]; onPick: (conflict: CalendarConflict) => void }> = ({ conflicts, onPick }) => {
  const [open, setOpen] = useState(true);
  if (conflicts.length === 0) return null;
  const high = conflicts.some((conflict) => conflict.severity === 'high');
  const count = conflicts.length;
  return (
    <section className={cn('mb-4 max-w-[1100px] overflow-hidden rounded-2xl border', high ? 'border-[#DC2626]/30 bg-[#DC2626]/[0.04]' : 'border-[#F59E0B]/40 bg-[#F59E0B]/[0.06]')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="calendar-issues"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2 text-start sm:px-4"
      >
        <ComplianceTriangle tone={high ? 'red' : 'amber'} size={32} className="shrink-0" />
        <span className={cn('min-w-0 flex-1 text-[14px] font-semibold', high ? 'text-[#B91C1C]' : 'text-[#92400E]')}>
          {count} {count === 1 ? 'issue' : 'issues'} this month
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-black/40 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul id="calendar-issues" className="max-h-[260px] divide-y divide-black/[0.05] overflow-y-auto border-t border-black/[0.06] bg-white/70">
          {conflicts.map((conflict, index) => (
            <li key={`${conflict.kind}-${conflict.bookingId}-${conflict.otherRef}-${index}`}>
              <button type="button" onClick={() => onPick(conflict)} className="flex min-h-[48px] w-full flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2 text-start transition-colors hover:bg-white sm:px-4">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', SEVERITY[conflict.severity].dot)} />
                  <span className={cn('text-[12px] font-semibold', SEVERITY[conflict.severity].text)}>{CONFLICT_LABELS[conflict.kind as ConflictKind] ?? conflict.kind}</span>
                </span>
                <LicensePlate plate={conflict.plate} />
                {conflict.bookingNumber && <span className="font-mono text-[12.5px] tabular-nums text-black/70">{conflict.bookingNumber}{conflict.otherRef && conflict.kind === 'double_booking' ? ` + ${conflict.otherRef}` : ''}</span>}
                <span className="text-[12px] tabular-nums text-black/50">{range(conflict.from, conflict.to)}</span>
                <span className="basis-full text-[12.5px] text-black/60 sm:basis-auto">{conflict.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// ── A bar's popover ──────────────────────────────────────────────────────────

export interface PopoverState {
  bar: CalendarBar;
  car: CalendarCar;
  rect: { left: number; top: number; bottom: number; width: number };
  pinned: boolean;
}

/** Below the bar, or above it when there's no room, and never off the screen. */
export const BarPopover: React.FC<{
  state: PopoverState;
  conflicted: boolean;
  onOpenBooking: (bar: CalendarBar) => void;
  onEditBlock: (bar: CalendarBar) => void;
  onHistory: (car: CalendarCar) => void;
  onClose: () => void;
  onHold: () => void;
  onRelease: () => void;
}> = ({ state, conflicted, onOpenBooking, onEditBlock, onHistory, onClose, onHold, onRelease }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const { bar, car, rect } = state;
  const token = FLEET_STATUS[bar.status];

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    const width = box?.width ?? 288;
    const height = box?.height ?? 200;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    const below = rect.bottom + 8;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 8) : below;
    setPosition({ left, top });
  }, [rect]);

  useEffect(() => {
    if (!state.pinned) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.pinned, onClose]);

  const days = barDays(bar);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={bar.booking ? `Booking ${bar.booking.number}` : `${token.label} block`}
      onMouseEnter={onHold}
      onMouseLeave={onRelease}
      onMouseDown={(event) => event.stopPropagation()}
      className="fixed z-[1200] w-[288px] max-w-[calc(100vw-16px)] rounded-2xl border border-subtle bg-white p-4 shadow-[0_12px_40px_rgba(0,0,0,0.16)]"
      style={{ left: position?.left ?? -9999, top: position?.top ?? -9999 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <TokenChip token={bar.booking ? { ...token, label: bar.status === 'booked' ? 'Booked' : token.label } : token} />
          <div className="mt-1.5 truncate text-[14px] font-semibold text-foreground">{bar.booking ? bar.booking.customer ?? 'No customer' : token.label}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-black/55">
            <LicensePlate plate={car.plate} />
            {bar.booking && <span className="font-mono tabular-nums">{bar.booking.number}</span>}
          </div>
        </div>
        {state.pinned && (
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-black/45 hover:bg-black/[0.04] md:h-8 md:w-8"><X size={15} /></button>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="text-black/45">From → to</dt>
        <dd className="text-end tabular-nums text-foreground">{formatDate(bar.start)} → {formatDate(bar.end)}</dd>
        <dt className="text-black/45">Days</dt>
        <dd className="text-end tabular-nums text-foreground">{days}</dd>
        <dt className="text-black/45">Status</dt>
        <dd className="text-end text-foreground">{bar.booking ? (bar.booking.status ?? '—').replace(/^\w/, (c) => c.toUpperCase()) : token.label}</dd>
        {bar.block?.notes && (<><dt className="text-black/45">Note</dt><dd className="truncate text-end text-foreground">{bar.block.notes}</dd></>)}
      </dl>
      {conflicted && <p className="mt-2 rounded-lg bg-[#DC2626]/[0.06] px-2 py-1.5 text-[12px] font-medium text-[#B91C1C]">In a high-severity conflict this month.</p>}
      <div className="mt-3 flex gap-2">
        {bar.booking
          ? <Button size="lg" className="!h-11 flex-1 px-3 md:!h-9" onClick={() => onOpenBooking(bar)}>Open booking</Button>
          : <Button size="lg" className="!h-11 flex-1 px-3 md:!h-9" onClick={() => onEditBlock(bar)}>Edit block</Button>}
        <Button variant="outline" size="lg" className="!h-11 flex-1 px-3 md:!h-9" onClick={() => onHistory(car)}>Car history</Button>
      </div>
    </div>
  );
};

// ── Car history ──────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<HistoryFilter | 'all', string> = { all: 'All', bookings: 'Bookings', operations: 'Operations', issues: 'Issues', fines: 'Fines' };

const OPERATION_LABELS: Record<string, string> = {
  DELIVERY: 'Delivery', PICKUP: 'Pickup', CAR_WASH: 'Car wash', OIL_CHANGE: 'Oil change', MAINTENANCE: 'Maintenance', INSPECTION: 'Inspection', TRANSFER: 'Transfer',
};

const words = (value: string | null) => (value ? value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null);

/** A 3D picture for each kind of event. */
const HistoryArt: React.FC<{ item: HistoryItem }> = ({ item }) => {
  const size = 40;
  switch (item.kind) {
    case 'booking': return <Icon3D name={bookingStatusKey(item.status) === 'completed' ? 'completed' : bookingStatusKey(item.status) === 'pending' ? 'pending' : 'confirmed'} size={size} />;
    case 'extension': return <Icon3D name="total" size={size} />;
    case 'operation':
      if (item.title === 'DELIVERY' || item.title === 'PICKUP') return <CarIcon3D name="key" size={size} />;
      if (item.title === 'MAINTENANCE' || item.title === 'OIL_CHANGE') return <StatusImage status="maintenance" size={size} />;
      return <CarIcon3D name="info" size={size} />;
    case 'replacement': return <StatusImage status="replacement" size={size} />;
    case 'maintenance': return <StatusImage status="maintenance" size={size} />;
    case 'selling': return <StatusImage status="selling" size={size} />;
    case 'issue': return <ComplianceTriangle tone={item.status === 'resolved' || item.status === 'closed' ? 'amber' : 'red'} size={size} />;
    case 'fine': return <FineImage size={size} />;
    case 'car_change': return <StatusImage status="fleet" size={size} />;
    default: return <CarIcon3D name="documents" size={size} />;
  }
};

function historyTitle(item: HistoryItem): string {
  switch (item.kind) {
    case 'booking': return `Booking ${item.title ?? ''}`.trim();
    case 'extension': return `Extension ${(item.title?.split(' · ')[1] ?? '').replace(/^Ext\s*/, '')}`.trim();
    case 'operation': return OPERATION_LABELS[item.title ?? ''] ?? words(item.title) ?? 'Operation';
    case 'replacement': case 'maintenance': case 'selling': return `${FLEET_STATUS[item.kind].label} block`;
    case 'issue': return words(item.title) ?? 'Issue';
    case 'fine': return 'Fine';
    case 'car_change': return 'Car changed';
    default: return words(item.kind) ?? 'Event';
  }
}

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Istanbul' });

/** An operation has a time; shown in Istanbul, where it happened. */
function stamp(at: string): string {
  if (at.length <= 10) return formatDate(at);
  const date = new Date(parseStamp(at));
  return Number.isNaN(date.getTime()) ? formatDate(at) : `${formatDate(istanbulDate(date))} ${TIME.format(date)}`;
}

function historyLines(item: HistoryItem): string[] {
  const when = item.end && item.end !== item.at.slice(0, 10) ? `${formatDate(item.at)} → ${formatDate(item.end)}` : formatDate(item.at);
  switch (item.kind) {
    case 'booking': return [[item.customer, when].filter(Boolean).join(' · ')];
    case 'extension': return [[item.title?.split(' · ')[0], when, item.amount !== null ? formatMoney(item.amount) : null].filter(Boolean).join(' · ')];
    case 'operation': return [
      [stamp(item.at), item.km !== null ? `${item.km.toLocaleString('en-GB')} km` : null, item.fuel !== null ? `fuel ${item.fuel}` : null, item.by ? `by ${item.by}` : null].filter(Boolean).join(' · '),
      ...(item.note ? [item.note] : []),
    ];
    case 'replacement': case 'maintenance': case 'selling': return [[when, item.title && item.title !== item.kind ? item.title : null].filter(Boolean).join(' · ')];
    case 'issue': return [[when, words(item.status)].filter(Boolean).join(' · '), ...(item.note ? [item.note] : [])];
    case 'fine': return [[when, item.amount !== null ? formatMoney(item.amount) : null, words(item.status), item.customer].filter(Boolean).join(' · '), ...(item.title && item.title !== 'Fine' ? [item.title] : [])];
    case 'car_change': return [[item.title, `${item.fromCar ?? '—'} → ${item.toCar ?? '—'}`, when].filter(Boolean).join(' · ')];
    default: return [when];
  }
}

const Figure: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0 rounded-xl bg-black/[0.03] px-3 py-2">
    <div className="truncate text-[11.5px] text-black/45">{label}</div>
    <div className="font-mono text-[16px] font-semibold tabular-nums text-foreground">{value}</div>
  </div>
);

/** Everything that ever happened to one car, newest first. */
export const CarHistoryDrawer: React.FC<{ car: CalendarCar; onClose: () => void; onOpenBooking: (number: string, start: string) => void }> = ({ car, onClose, onOpenBooking }) => {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<HistoryFilter | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchCarHistory(car.id)
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); });
    return () => { cancelled = true; };
  }, [car.id, attempt]);

  const year = Number(new Date().toISOString().slice(0, 4));
  const summary = useMemo(() => historySummary(items ?? [], year), [items, year]);
  const shown = useMemo(() => (items ?? []).filter((item) => inHistoryFilter(item, filter)), [items, filter]);

  return (
    <Sheet open onClose={onClose} ariaLabel={`History of ${car.plate}`} maxWidthClass="sm:max-w-[520px]">
      <SheetHeader>
        <SheetTitle>Car history</SheetTitle>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <LicensePlate plate={car.plate} />
          <span className="text-[13px] text-black/55">{car.model}</span>
          <CarStatusChip status={car.status} />
        </div>
      </SheetHeader>
      <SheetBody>
        {error && !items ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#DC2626]/25 bg-[#DC2626]/[0.05] px-3 py-2.5 text-[13px] text-[#B91C1C]">
            Couldn't load the history: {error}
            <Button variant="outline" size="lg" className="!h-11 md:!h-9" onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
          </div>
        ) : !items ? (
          <ul aria-hidden="true" className="flex flex-col gap-3">{[0, 1, 2, 3].map((index) => <li key={index} className="h-14 animate-pulse rounded-xl bg-black/[0.05]" />)}</ul>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Figure label="Bookings" value={String(summary.bookings)} />
              <Figure label={`Days rented ${year}`} value={String(summary.daysThisYear)} />
              <Figure label="Current km" value={summary.km === null ? '—' : summary.km.toLocaleString('en-GB')} />
            </div>
            <div className="-mx-1 overflow-x-auto px-1">
              <Segmented ariaLabel="Show" value={filter} onChange={setFilter} options={(['all', ...HISTORY_FILTERS] as Array<HistoryFilter | 'all'>).map((value) => ({ value, label: FILTER_LABELS[value] }))} />
            </div>
            {shown.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-black/45">{items.length === 0 ? 'Nothing recorded for this car yet.' : 'Nothing of this kind.'}</p>
            ) : (
              <ol className="relative flex flex-col">
                <span aria-hidden="true" className="absolute bottom-3 start-[19px] top-3 w-px bg-black/[0.08]" />
                {shown.map((item, index) => (
                  <li key={`${item.kind}-${item.refId}-${index}`} className="relative flex gap-3 py-2">
                    <span className="relative z-[1] grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white">
                      <HistoryArt item={item} />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13.5px] font-medium text-foreground">{historyTitle(item)}</span>
                        {item.kind === 'booking' && item.status && <TokenChip token={{ ...FLEET_STATUS[bookingStatusKey(item.status)], label: words(item.status) ?? '' }} />}
                      </div>
                      {historyLines(item).map((line, lineIndex) => (
                        <div key={lineIndex} className={cn('text-[12.5px] tabular-nums', lineIndex === 0 ? 'text-black/55' : 'text-black/45')}>{line}</div>
                      ))}
                      {item.kind === 'booking' && item.title && (
                        <button type="button" onClick={() => onOpenBooking(item.title as string, item.at)} className="mt-0.5 inline-flex min-h-[44px] items-center text-[12.5px] font-medium text-brand-strong hover:underline md:min-h-0">
                          Open booking
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </SheetBody>
    </Sheet>
  );
};
