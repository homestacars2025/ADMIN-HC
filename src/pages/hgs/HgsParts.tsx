import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Sheet, SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Spinner } from '../../components/media/MediaUI';
import { ChevronDown, X } from '../../components/media/MediaIcons';
import { CarThumb } from '../../components/shared/CarThumb';
import { ComplianceTriangle, TONE_CLASSES } from '../../components/shared/ComplianceBits';
import { formatCount, formatDay, formatTime, rangeChip, saveHgsBarcode, type DayRange, type HgsCarInfo, type HgsRoad, type HgsRow, type HgsTransitDetail } from '../../lib/hgs';
import { cn } from '../../lib/media/badgeColor';
import { formatMoney } from '../../lib/money';
import { LicensePlate } from '../bookings/ui';
import { DatesIcon, RangePicker } from './RangePicker';

// ── Cars with no HGS data ─────────────────────────────────────────────────────

/** Chips shown before "+N more": fewer on a phone, where they stack. */
const CHIPS_DESKTOP = 12;
const CHIPS_PHONE = 5;

const chipClass = 'flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#92400E]/10 bg-white/85 p-1 pe-2 transition-colors hover:border-[#92400E]/30 hover:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:min-h-0';

/** `when` is "this month", "in October 2026" or "yet", after "no HGS transits". */
export const NoTransitsBanner: React.FC<{ cars: HgsCarInfo[]; when: string; onPick: (car: HgsCarInfo) => void; onMore: () => void }> = ({ cars, when, onPick, onMore }) => {
  if (cars.length === 0) return null;
  const many = cars.length !== 1;
  const more = (shown: number, className: string) => cars.length > shown && (
    <li className={className}>
      <button type="button" onClick={onMore} className={cn(chipClass, 'px-2.5 text-[12.5px] font-medium text-[#92400E]')}>+{cars.length - shown} more</button>
    </li>
  );
  return (
    <div role="alert" className={cn('mb-4 flex max-w-[1100px] items-start gap-3 rounded-2xl border px-3.5 py-3 sm:px-4', TONE_CLASSES.amber.panel)}>
      <ComplianceTriangle tone="amber" size={44} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug text-[#92400E] sm:text-[14px]">
          {cars.length} {many ? 'cars have' : 'car has'} no HGS transits {when} — check {many ? 'their' : 'its'} HGS
        </p>
        <ul className="mt-2 flex flex-wrap items-center gap-1.5">
          {cars.slice(0, CHIPS_DESKTOP).map((car, index) => (
            <li key={car.id} className={cn(index >= CHIPS_PHONE && 'hidden sm:block')}>
              <button type="button" onClick={() => onPick(car)} aria-label={`Show ${car.plate}`} className={chipClass}>
                <CarThumb src={car.image} width={34} height={24} />
                <LicensePlate plate={car.plate} />
                <span className="max-w-[160px] truncate text-[12px] text-black/55">{car.model ?? '—'}</span>
                {!car.barcode && <span className="rounded-full bg-black/[0.06] px-1.5 py-px text-[10.5px] font-medium text-black/55">No barcode</span>}
              </button>
            </li>
          ))}
          {more(CHIPS_PHONE, 'sm:hidden')}
          {more(CHIPS_DESKTOP, 'hidden sm:block')}
        </ul>
      </div>
    </div>
  );
};

export const BarcodeSheet: React.FC<{ car: HgsCarInfo; onClose: () => void; onSaved: (carId: number, barcode: string) => void }> = ({ car, onClose, onSaved }) => {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(car.id, await saveHgsBarcode(car.id, value));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Try again.');
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} ariaLabel={`HGS barcode for ${car.plate}`} maxWidthClass="sm:max-w-[440px]">
      <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>HGS barcode</SheetTitle>
          <SheetDescription>The 10-digit number on the HGS sticker.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="flex items-center gap-2.5">
            <CarThumb src={car.image} width={56} height={36} />
            <span className="min-w-0">
              <LicensePlate plate={car.plate} />
              <span className="mt-0.5 block truncate text-[12.5px] text-black/55">{car.model ?? '—'}</span>
            </span>
          </div>
          <label className="block text-[13px] font-medium text-foreground">
            Barcode
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              value={value}
              maxLength={14}
              placeholder="10 digits"
              onChange={(event) => setValue(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 font-mono text-[15px] font-normal tabular-nums tracking-[0.04em] outline-none placeholder:text-black/25 focus:border-[#6EA4E7] focus:ring-[3px] focus:ring-[#6EA4E7]/25 md:h-10"
            />
          </label>
          {error && <p role="alert" className="text-[13px] text-[#B91C1C]">{error}</p>}
          <Link to={`/dashboard/cars?car=${car.id}`} className="self-start text-[13px] font-medium text-[#3A74C2] hover:underline">
            Open in Cars
          </Link>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" size="lg" className="!h-11 md:!h-10" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="submit" size="lg" className="!h-11 md:!h-10" disabled={saving || !value.trim()}>
            {saving && <Spinner size={13} />} Save barcode
          </Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
};

// ── A car ─────────────────────────────────────────────────────────────────────

export interface HistoryState {
  status: 'loading' | 'ready' | 'error';
  rows: HgsTransitDetail[];
  message?: string;
}

/** Car, barcode, transits, last, amount with its share. The header strip uses it too. */
const ROW_GRID = 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_92px_116px_minmax(150px,1fr)]';

export const HgsListHeader: React.FC = () => (
  // The end padding stands in for each row's Dates button.
  <div className={cn('hidden gap-x-4 px-4 pb-1.5 ps-11 pe-[104px] text-[11.5px] font-medium text-black/45 lg:grid', ROW_GRID)}>
    <span>Car</span>
    <span>Barcode</span>
    <span className="text-end">Transits</span>
    <span className="text-end">Last transit</span>
    <span className="text-end">Amount</span>
  </div>
);

const ShareBar: React.FC<{ share: number }> = ({ share }) => (
  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-black/[0.05]" aria-hidden="true">
    <span className="block h-full rounded-full bg-[#6EA4E7]" style={{ width: `${Math.min(100, share * 100)}%` }} />
  </span>
);

const sharePercent = (share: number) => (share > 0 && share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);

export const hgsRowId = (key: string) => `hgs-row-${key.replace(/[^a-z0-9]/gi, '-')}`;

export const HgsCarRow: React.FC<{
  row: HgsRow;
  expanded: boolean;
  history?: HistoryState;
  periodLabel: string;
  /** The car's own range, when it has one. */
  ownRange: DayRange | null;
  /** The days the row covers now, where a Custom range starts. */
  fallback: DayRange;
  today: string;
  onToggle: (row: HgsRow) => void;
  onRetry: (row: HgsRow) => void;
  onAddBarcode: (row: HgsRow) => void;
  onRange: (row: HgsRow, range: DayRange | null) => void;
  onStatement: (row: HgsRow) => void;
}> = ({ row, expanded, history, periodLabel, ownRange, fallback, today, onToggle, onRetry, onAddBarcode, onRange, onStatement }) => {
  // A car with no transit opens too, to say so and to reach its barcode.
  const openable = row.transits > 0 || row.carId !== null;
  const panelId = `hgs-${row.key.replace(/[^a-z0-9]/gi, '-')}`;
  return (
    <li id={hgsRowId(row.key)} className={cn('scroll-mt-24 overflow-hidden rounded-2xl border bg-white transition-[border-color,box-shadow]', expanded ? 'border-[#6EA4E7]/45 shadow-[0_2px_10px_rgb(15_23_42/0.06)]' : 'border-[#EBEBEB] hover:border-black/[0.14]')}>
      <div className="flex items-center">
        <button
          type="button"
          disabled={!openable}
          onClick={() => onToggle(row)}
          aria-expanded={openable ? expanded : undefined}
          aria-controls={openable && expanded ? panelId : undefined}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 py-3 pe-2 ps-3 text-start sm:ps-4',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[#6EA4E7]/35',
            openable ? 'cursor-pointer hover:bg-black/[0.012]' : 'cursor-default',
          )}
        >
          <ChevronDown size={15} strokeWidth={2} className={cn('shrink-0 transition-transform duration-200', !openable && 'invisible', expanded ? 'rotate-180 text-[#3A74C2]' : 'text-black/30')} />
          <span className={cn('grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5', ROW_GRID)}>
            <span className="flex min-w-0 items-center gap-2.5">
              <CarThumb src={row.image} width={56} height={36} />
              <span className="min-w-0">
                <LicensePlate plate={row.plate} />
                <span className="mt-0.5 block truncate text-[12.5px] text-black/55">{row.model ?? '—'}</span>
              </span>
            </span>

            <span className="col-start-2 row-start-1 text-end lg:hidden">
              <span className={cn('block font-mono text-[15px] font-semibold tabular-nums', row.amount > 0 ? 'text-foreground' : 'text-black/30')}>{formatMoney(row.amount)}</span>
              <span className="block text-[11.5px] tabular-nums text-black/45">{sharePercent(row.share)} of spend</span>
            </span>

            <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-black/50 lg:contents">
              <span className="truncate font-mono tabular-nums text-black/40 lg:text-[12.5px]">{row.barcode ?? 'No barcode'}</span>
              <span className="tabular-nums lg:flex lg:flex-col lg:items-end lg:gap-0.5 lg:text-[13px] lg:text-black/70">
                <span>{formatCount(row.transits)}<span className="lg:hidden"> {row.transits === 1 ? 'transit' : 'transits'}</span></span>
                {row.privateRoad > 0 && <span className="ms-1.5 whitespace-nowrap rounded-full bg-[#7C3AED]/10 px-1.5 py-px text-[11px] font-medium text-[#5B21B6] lg:ms-0">{formatCount(row.privateRoad)} private</span>}
              </span>
              <span className="tabular-nums lg:text-end lg:text-[13px] lg:text-black/60"><span className="lg:hidden">Last </span>{formatDay(row.last)}</span>
            </span>

            <span className="col-span-2 lg:hidden"><ShareBar share={row.share} /></span>

            <span className="hidden min-w-0 lg:block">
              <span className="flex items-baseline justify-end gap-2">
                <span className="text-[11.5px] tabular-nums text-black/40">{sharePercent(row.share)}</span>
                <span className={cn('font-mono text-[14.5px] font-semibold tabular-nums', row.amount > 0 ? 'text-foreground' : 'text-black/30')}>{formatMoney(row.amount)}</span>
              </span>
              <span className="mt-1.5 block"><ShareBar share={row.share} /></span>
            </span>
          </span>
        </button>
        <span className="flex shrink-0 items-center pe-2.5 sm:pe-3">
          <RangePicker
            label={`Dates for ${row.plate}`}
            value={ownRange}
            fallback={fallback}
            today={today}
            onChange={(range) => onRange(row, range)}
            className={cn(
              'inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-[10px] border px-2 text-[12.5px] font-medium transition-colors sm:px-2.5 md:h-8 lg:w-[84px]',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/35',
              ownRange ? 'border-[#6EA4E7]/50 bg-[#6EA4E7]/10 text-[#3A74C2]' : 'border-[#E5E7EB] bg-white text-black/55 hover:border-black/20 hover:text-black/75',
            )}
          >
            <DatesIcon />
            <span className="hidden sm:inline">Dates</span>
          </RangePicker>
        </span>
      </div>
      {ownRange && (
        <div className="-mt-1.5 flex pb-2.5 pe-3 ps-[35px] sm:ps-[39px]">
          <button
            type="button"
            aria-label={`Clear dates for ${row.plate}`}
            onClick={() => onRange(row, null)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-1 text-[12px] font-medium tabular-nums text-[#3A74C2] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/35 md:min-h-0"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6EA4E7]/[0.12] py-1 pe-1.5 ps-2.5 hover:bg-[#6EA4E7]/20">
              {rangeChip(ownRange, today)}
              <X size={12} strokeWidth={2.4} />
            </span>
          </button>
        </div>
      )}

      {expanded && openable && (
        <div id={panelId} className="border-t border-[#EBEBEB] bg-[#FAFAFA] px-3 py-3 sm:px-4">
          {row.transits === 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span className="text-[13px] text-black/55">No HGS transits {periodLabel}.</span>
              <span className="flex flex-wrap items-center gap-2">
                {!row.barcode && <Button variant="outline" size="lg" className="!h-11 md:!h-9" onClick={() => onAddBarcode(row)}>Add barcode</Button>}
                {row.carId !== null && (
                  <Link to={`/dashboard/cars?car=${row.carId}`} className="inline-flex min-h-[44px] items-center px-1 text-[13px] font-medium text-[#3A74C2] hover:underline md:min-h-0">Open in Cars</Link>
                )}
              </span>
            </div>
          )}
          {row.transits > 0 && history?.status === 'loading' && (
            <ul aria-hidden="true" className="flex flex-col gap-2">
              {Array.from({ length: Math.min(4, row.transits) }, (_, index) => <li key={index} className="h-10 animate-pulse rounded-lg bg-black/[0.05]" />)}
            </ul>
          )}
          {row.transits > 0 && history?.status === 'error' && (
            <div className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span className="text-[13px] text-[#B91C1C]">{history.message ?? 'Could not load these transits.'}</span>
              <Button variant="outline" size="lg" className="!h-11 md:!h-9" onClick={() => onRetry(row)}>Try again</Button>
            </div>
          )}
          {row.transits > 0 && history?.status === 'ready' && <TransitList rows={history.rows} periodLabel={periodLabel} onStatement={() => onStatement(row)} />}
        </div>
      )}
    </li>
  );
};

// ── A car's transits ──────────────────────────────────────────────────────────

/** Private roads are the bridges and private gates the bank feed never had. */
const ROAD_BADGE: Record<HgsRoad, { label: string; className: string }> = {
  private: { label: 'Private road', className: 'bg-[#7C3AED]/10 text-[#5B21B6]' },
  public: { label: 'Public road', className: 'bg-black/[0.05] text-black/55' },
};

const RoadBadge: React.FC<{ type: HgsRoad | null }> = ({ type }) => {
  if (!type) return null;
  const badge = ROAD_BADGE[type];
  return <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[11px] font-medium', badge.className)}>{badge.label}</span>;
};

const TRANSIT_GRID = 'sm:grid-cols-[150px_minmax(0,1.4fr)_minmax(0,1fr)_100px]';

const TransitList: React.FC<{ rows: HgsTransitDetail[]; periodLabel: string; onStatement: () => void }> = ({ rows, periodLabel, onStatement }) => {
  if (rows.length === 0) return <p className="py-3 text-center text-[13px] text-black/45">No transits {periodLabel}.</p>;
  return (
    <>
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-[12.5px] text-black/50">{formatCount(rows.length)} {rows.length === 1 ? 'transit' : 'transits'} {periodLabel}</span>
      <Button variant="outline" size="lg" className="!h-11 shrink-0 px-3 md:!h-8" onClick={onStatement}>Export PDF</Button>
    </div>
    <div className="overflow-hidden rounded-xl border border-[#EBEBEB] bg-white">
      <div className={cn('hidden gap-x-3 border-b border-[#EBEBEB] px-3 py-2 text-[11.5px] font-medium text-black/45 sm:grid', TRANSIT_GRID)}>
        <span>Date</span>
        <span>Where</span>
        <span>Booking</span>
        <span className="text-end">Amount</span>
      </div>
      <ul className="divide-y divide-[#F1F1F1]">
        {rows.map((transit) => (
          <li key={transit.id} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2.5', TRANSIT_GRID)}>
            <span className="text-[12.5px] tabular-nums text-black/60">
              {formatDay(transit.at ?? transit.day)}
              {transit.at && <span className="ms-1.5 text-black/40">{formatTime(transit.at)}</span>}
            </span>
            <span className="col-start-2 row-start-1 text-end font-mono text-[13px] font-semibold tabular-nums text-foreground sm:col-start-4">{formatMoney(transit.amount)}</span>
            <span className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-foreground">
                <span className="min-w-0 truncate">
                  {transit.entry && <>{transit.entry} <span className="text-black/35">→</span> </>}
                  {transit.exit ?? <span className="text-black/30">—</span>}
                </span>
                <RoadBadge type={transit.roadType} />
              </span>
              {transit.road && <span className="block truncate text-[11.5px] text-black/45">{transit.road}</span>}
            </span>
            <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 text-[12.5px] sm:col-span-1 sm:col-start-3 sm:row-start-1">
              {transit.bookingNumber
                ? <Link to={`/dashboard/bookings?${new URLSearchParams({ ...(transit.bookingMonth ? { month: transit.bookingMonth } : {}), q: transit.bookingNumber })}`} className="font-mono tabular-nums text-[#3A74C2] hover:underline">{transit.bookingNumber}</Link>
                : null}
              {transit.customerName && transit.customerId
                ? <Link to={`/dashboard/customers/${transit.customerId}`} className="truncate text-[#3A74C2] hover:underline">{transit.customerName}</Link>
                : null}
              {!transit.bookingNumber && !transit.customerName && <span className="text-black/30">Not linked</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
    </>
  );
};
