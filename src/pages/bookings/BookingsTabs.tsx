import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { CarThumb } from '../../components/shared/CarThumb';
import { CustomerAvatar } from '../../components/shared/PersonAvatar';
import {
  BOOKING_TABS,
  bookingProgress,
  rentalDays,
  sheetIsOpen,
  type BookingExtension,
  type BookingSort,
  type BookingTab,
  type ReplacementSheetRow,
} from '../../lib/bookingTabs';
import { cn } from '../../lib/media/badgeColor';
import { formatMoney } from '../../lib/money';
import { formatDate } from '../../lib/customers';
import { printReplacementSheet } from '../../lib/printReplacementSheet';
import type { Booking, BookingStatus } from '../../types';
import { SortHeader, SortMenu, type SortState } from '../carTracking/ui';
import { BannedBadge } from '../customers/ui';
import { LicensePlate } from './ui';

const CARD = 'surface-depth rounded-2xl border border-[#EBEBEB] bg-white';
const MONO = 'font-mono tabular-nums';
const TABLE_WRAP = 'surface-depth overflow-x-auto rounded-2xl border border-[#EBEBEB] bg-white';
const ROW = 'border-b border-black/[0.05] last:border-b-0';

const dayLabel = (days: number) => (days === 1 ? '1 day' : `${days} days`);

/** A big white tile for this page's three tabs: full width, 3D art, and it still filters. */
export const BigTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  caption: string;
  active?: boolean;
  onClick?: () => void;
}> = ({ icon, label, value, caption, active = false, onClick }) => {
  const body = (
    <>
      {active && <span aria-hidden="true" className="absolute end-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-[#6EA4E7] text-white"><Check size={12} strokeWidth={3} /></span>}
      <span className="flex min-w-0 items-center gap-2.5 pe-5">
        <span className="shrink-0 [&>*]:!h-10 [&>*]:!w-10 lg:[&>*]:!h-14 lg:[&>*]:!w-14">{icon}</span>
        <span className="line-clamp-2 min-w-0 text-[13px] font-medium leading-tight text-black/60 lg:text-[13.5px]">{label}</span>
      </span>
      <span className="mt-auto flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
        <span className={cn('font-semibold leading-none text-foreground', MONO)} style={{ fontSize: `min(40px, calc(100cqi / (${value.length} * 0.62)))` }}>{value}</span>
        <span className="min-w-0 truncate text-[12px] text-black/50">{caption}</span>
      </span>
    </>
  );
  const frame = cn(
    'surface-depth relative flex h-[132px] min-w-0 flex-col rounded-2xl bg-white text-start [container-type:inline-size] lg:h-[140px]',
    active ? 'border-2 border-[#6EA4E7] p-[13px]' : 'border border-[#EBEBEB] p-3.5',
  );
  if (!onClick) return <div className={frame}>{body}</div>;
  return <button type="button" aria-pressed={active} onClick={onClick} className={cn(frame, !active && 'transition-colors hover:border-[#6EA4E7]/60')}>{body}</button>;
};

export const BigTileRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div role="group" aria-label="Filter the list" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">{children}</div>
);

export const BigTileSkeleton: React.FC<{ count: number }> = ({ count }) => (
  <div aria-hidden="true" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
    {Array.from({ length: count }, (_, index) => <div key={index} className="h-[132px] animate-pulse rounded-2xl bg-black/[0.05] lg:h-[140px]" />)}
  </div>
);

const TAB_LABELS: Record<BookingTab, string> = { bookings: 'Bookings', extensions: 'Extensions', replacements: 'Replacement sheets' };

export const PillTabs: React.FC<{ active: BookingTab; counts: Record<BookingTab, number | null>; onChange: (tab: BookingTab) => void }> = ({ active, counts, onChange }) => (
  <div role="tablist" aria-label="Bookings views" className="surface-depth inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-[#EBEBEB] bg-white p-1">
    {BOOKING_TABS.map((tab) => (
      <button
        key={tab}
        type="button"
        role="tab"
        aria-selected={active === tab}
        onClick={() => onChange(tab)}
        className={cn(
          'min-h-[44px] whitespace-nowrap rounded-full px-4 text-[13.5px] font-medium transition-colors md:min-h-[38px]',
          active === tab ? 'bg-[#6EA4E7] text-white' : 'text-black/60 hover:bg-black/[0.04]',
        )}
      >
        {TAB_LABELS[tab]}
        {counts[tab] !== null && <span className={cn('ms-1.5', MONO, active === tab ? 'text-white/85' : 'text-black/40')}>· {counts[tab]}</span>}
      </button>
    ))}
  </div>
);

const STATUS_PILL: Record<BookingStatus, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-[#16A34A]/10 text-[#15803D]' },
  pending: { label: 'Pending', className: 'bg-[#F59E0B]/[0.16] text-[#92400E]' },
  cancelled: { label: 'Cancelled', className: 'bg-[#DC2626]/10 text-[#B91C1C]' },
  completed: { label: 'Completed', className: 'bg-black/[0.06] text-black/55' },
};

const StatusPill: React.FC<{ status: BookingStatus }> = ({ status }) => (
  <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium', STATUS_PILL[status].className)}>{STATUS_PILL[status].label}</span>
);

/** A chip you can press, because these two flags are still set from the list. */
const FlagChip: React.FC<{ label: string; on: boolean; bookingNumber: string; onToggle: () => void }> = ({ label, on, bookingNumber, onToggle }) => (
  <button
    type="button"
    aria-pressed={on}
    aria-label={`${label} for ${bookingNumber}`}
    onClick={(event) => { event.stopPropagation(); onToggle(); }}
    className={cn(
      'inline-flex min-h-[44px] items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium transition-colors xl:min-h-[28px]',
      on ? 'bg-[#16A34A]/10 text-[#15803D] hover:bg-[#16A34A]/15' : 'bg-black/[0.05] text-black/50 hover:bg-black/[0.08]',
    )}
  >
    {on ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={2.5} />} {label}
  </button>
);

const Period: React.FC<{ booking: Booking; today: string }> = ({ booking, today }) => {
  const progress = bookingProgress(booking, today);
  return (
    <span className="block min-w-0">
      <span className={cn('block whitespace-nowrap text-[12.5px] text-foreground', MONO)}>{formatDate(booking.start_date)} → {formatDate(booking.end_date)}</span>
      <span className="mt-0.5 flex items-center gap-2 text-[12px] text-black/50">
        {dayLabel(rentalDays(booking))}
        {progress !== null && (
          <span role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${progress}% through the rental`} className="h-1.5 w-20 overflow-hidden rounded-full bg-black/[0.07]">
            <span className="block h-full rounded-full bg-[#6EA4E7]" style={{ width: `${progress}%` }} />
          </span>
        )}
      </span>
    </span>
  );
};

const IconButton: React.FC<{ title: string; hover: string; onClick: () => void; children: React.ReactNode }> = ({ title, hover, onClick, children }) => (
  <button type="button" title={title} aria-label={title} onClick={(event) => { event.stopPropagation(); onClick(); }} className={cn('grid h-11 w-11 place-items-center rounded-lg text-black/40 transition-colors xl:h-8 xl:w-8', hover)}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  </button>
);

const PrintGlyph = () => <><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" rx="1" /></>;

interface BookingActions {
  onToggle: (id: number, field: 'kabis_reported' | 'invoice_issued', current: boolean) => void;
  onEdit: (booking: Booking) => void;
  onDelete: (booking: Booking) => void;
  onPrint: (booking: Booking) => void;
  onExtend: (booking: Booking) => void;
}

const Actions: React.FC<{ booking: Booking; actions: BookingActions }> = ({ booking, actions }) => (
  <span className="inline-flex items-center gap-0.5">
    {/* A cancelled booking has nothing to extend. */}
    {booking.status !== 'cancelled' && (
      <IconButton title="Extend booking" hover="hover:bg-[#16A34A]/10 hover:text-[#15803D]" onClick={() => actions.onExtend(booking)}>
        <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" />
      </IconButton>
    )}
    <IconButton title="Print contract" hover="hover:bg-[#8B5CF6]/10 hover:text-[#5B21B6]" onClick={() => actions.onPrint(booking)}><PrintGlyph /></IconButton>
    <IconButton title="Edit" hover="hover:bg-[#6EA4E7]/15 hover:text-[#3A74C2]" onClick={() => actions.onEdit(booking)}>
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </IconButton>
    <IconButton title="Delete" hover="hover:bg-[#DC2626]/10 hover:text-[#B91C1C]" onClick={() => actions.onDelete(booking)}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </IconButton>
  </span>
);

const CustomerCell: React.FC<{ booking: Booking; size?: number }> = ({ booking, size = 28 }) => (
  <Link to={`/dashboard/customers/${booking.customer_id}`} className="inline-flex min-w-0 max-w-full items-center gap-2 text-[13px] text-foreground hover:text-[#3A74C2]">
    <CustomerAvatar size={size} />
    <span className="truncate">{booking.customer_name}</span>
    {booking.customer_banned && <BannedBadge />}
  </Link>
);

const CarCell: React.FC<{ image?: string | null; plate: string | null; model: string | null }> = ({ image, plate, model }) => (
  <span className="flex min-w-0 items-center gap-2.5">
    <CarThumb src={image ?? null} width={56} height={36} />
    <span className="min-w-0">
      {plate && <LicensePlate plate={plate} />}
      <span className="mt-0.5 block truncate text-[12px] text-black/50">{model ?? '—'}</span>
    </span>
  </span>
);

type BookingSortState = SortState<BookingSort>;

export const BookingList: React.FC<{ rows: Booking[]; wide: boolean; today: string; sort: BookingSortState; actions: BookingActions }> = ({ rows, wide, today, sort, actions }) => (wide ? (
  <div className={TABLE_WRAP}>
    <table className="w-full min-w-[980px] text-[13px]">
      <thead>
        <tr className="border-b border-black/[0.06]">
          <SortHeader columns={[{ key: 'booking_number', label: 'Booking' }]} sort={sort} />
          <th scope="col" className="px-2.5 py-1.5 text-start text-[11.5px] font-medium text-black/45">Car</th>
          <th scope="col" className="px-2.5 py-1.5 text-start text-[11.5px] font-medium text-black/45">Customer</th>
          <SortHeader columns={[{ key: 'start_date', label: 'Start' }, { key: 'end_date', label: 'End' }]} sort={sort} />
          <th scope="col" className="px-2.5 py-1.5 text-start text-[11.5px] font-medium text-black/45">KABIS</th>
          <th scope="col" className="px-2.5 py-1.5 text-start text-[11.5px] font-medium text-black/45">Invoice</th>
          <th scope="col"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((booking) => (
          <tr key={booking.id} className={cn(ROW, 'hover:bg-black/[0.015]')}>
            <td className="px-2.5 py-2">
              <span className={cn('block whitespace-nowrap text-[12.5px] font-semibold text-foreground', MONO)}>{booking.booking_number}</span>
              <span className="mt-0.5 block"><StatusPill status={booking.status} /></span>
            </td>
            <td className="px-2.5 py-2"><CarCell image={booking.car_image} plate={booking.plate_number} model={booking.car_model} /></td>
            <td className="max-w-[200px] px-2.5 py-2"><CustomerCell booking={booking} /></td>
            <td className="px-2.5 py-2"><Period booking={booking} today={today} /></td>
            <td className="px-2.5 py-2"><FlagChip label="KABIS" on={booking.kabis_reported} bookingNumber={booking.booking_number} onToggle={() => actions.onToggle(booking.id, 'kabis_reported', booking.kabis_reported)} /></td>
            <td className="px-2.5 py-2"><FlagChip label="Invoice" on={booking.invoice_issued} bookingNumber={booking.booking_number} onToggle={() => actions.onToggle(booking.id, 'invoice_issued', booking.invoice_issued)} /></td>
            <td className="px-2 py-1 text-end"><Actions booking={booking} actions={actions} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
) : (
  <>
    <SortMenu columns={[{ key: 'booking_number', label: 'Booking' }, { key: 'start_date', label: 'Start' }, { key: 'end_date', label: 'End' }]} sort={sort} />
    <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
      {rows.map((booking) => (
        <li key={booking.id} className={cn(CARD, 'min-w-0 p-3.5')}>
          <div className="flex items-center justify-between gap-2">
            <span className={cn('truncate text-[13px] font-semibold text-foreground', MONO)}>{booking.booking_number}</span>
            <StatusPill status={booking.status} />
          </div>
          <div className="mt-2"><CarCell image={booking.car_image} plate={booking.plate_number} model={booking.car_model} /></div>
          <div className="mt-2 min-w-0"><CustomerCell booking={booking} /></div>
          <div className="mt-2"><Period booking={booking} today={today} /></div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
            <span className="flex gap-1.5">
              <FlagChip label="KABIS" on={booking.kabis_reported} bookingNumber={booking.booking_number} onToggle={() => actions.onToggle(booking.id, 'kabis_reported', booking.kabis_reported)} />
              <FlagChip label="Invoice" on={booking.invoice_issued} bookingNumber={booking.booking_number} onToggle={() => actions.onToggle(booking.id, 'invoice_issued', booking.invoice_issued)} />
            </span>
            <Actions booking={booking} actions={actions} />
          </div>
        </li>
      ))}
    </ul>
  </>
));

const ExtensionBadge: React.FC<{ no: number }> = ({ no }) => (
  <span className={cn('inline-block whitespace-nowrap rounded-full bg-[#8B5CF6]/[0.12] px-2 py-0.5 text-[11.5px] font-medium text-[#5B21B6]', MONO)}>Extension #{no}</span>
);

const LegacyChip: React.FC = () => <span className="inline-block rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-black/50">Legacy</span>;

const ExtensionPeriod: React.FC<{ row: BookingExtension }> = ({ row }) => (
  <>
    <span className={cn('block whitespace-nowrap text-[12.5px] text-foreground', MONO)}>{row.period_start || row.period_end ? `${formatDate(row.period_start)} → ${formatDate(row.period_end)}` : '—'}</span>
    {row.days !== null && <span className="block text-[12px] text-black/50">{dayLabel(row.days)}</span>}
  </>
);

const EnteredBy: React.FC<{ row: BookingExtension }> = ({ row }) => (
  <>
    <span className="block truncate text-[12.5px] text-foreground">{row.created_by_name ?? '—'}</span>
    <span className={cn('block text-[12px] text-black/50', MONO)}>{formatDate(row.created_at)}</span>
  </>
);

export const ExtensionList: React.FC<{ rows: BookingExtension[]; wide: boolean; onOpen: (row: BookingExtension) => void }> = ({ rows, wide, onOpen }) => (wide ? (
  <div className={TABLE_WRAP}>
    <table className="w-full min-w-[900px] text-[13px]">
      <thead>
        <tr className="border-b border-black/[0.06] text-[11.5px] text-black/45">
          {['Extension', 'Car', 'Customer', 'Period'].map((label) => <th key={label} scope="col" className="px-2.5 py-2 text-start font-medium">{label}</th>)}
          <th scope="col" className="px-2.5 py-2 text-end font-medium">Amount</th>
          <th scope="col" className="px-2.5 py-2 text-start font-medium">Entered by</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.event_id} onClick={() => onOpen(row)} className={cn(ROW, 'cursor-pointer hover:bg-black/[0.015]')}>
            <td className="px-2.5 py-2">
              <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(row); }} className="block text-start">
                <ExtensionBadge no={row.event_no} />
                <span className={cn('mt-0.5 block whitespace-nowrap text-[12.5px] font-semibold text-foreground', MONO)}>{row.booking_number}</span>
              </button>
            </td>
            <td className="px-2.5 py-2">
              <span className="block">{row.plate && <LicensePlate plate={row.plate} />}</span>
              <span className="mt-0.5 block max-w-[170px] truncate text-[12px] text-black/50">{row.car_model ?? '—'}</span>
            </td>
            <td className="max-w-[190px] truncate px-2.5 py-2 text-foreground">{row.customer_name || '—'}</td>
            <td className="px-2.5 py-2"><ExtensionPeriod row={row} /></td>
            <td className={cn('whitespace-nowrap px-2.5 py-2 text-end font-semibold', MONO, row.rental_amount === 0 ? 'text-[#92400E]' : 'text-foreground')}>{formatMoney(row.rental_amount)}</td>
            <td className="max-w-[170px] px-2.5 py-2">
              <EnteredBy row={row} />
              {row.is_legacy && <span className="mt-0.5 block"><LegacyChip /></span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
) : (
  <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
    {rows.map((row) => (
      <li key={row.event_id} className="min-w-0">
        <button type="button" onClick={() => onOpen(row)} className={cn(CARD, 'block w-full p-3.5 text-start')}>
          <span className="flex items-center justify-between gap-2">
            <ExtensionBadge no={row.event_no} />
            <span className={cn('text-[15px] font-semibold', MONO, row.rental_amount === 0 ? 'text-[#92400E]' : 'text-foreground')}>{formatMoney(row.rental_amount)}</span>
          </span>
          <span className={cn('mt-1 block truncate text-[12.5px] font-semibold text-foreground', MONO)}>{row.booking_number}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-black/50">
            {row.plate && <LicensePlate plate={row.plate} />}
            <span className="truncate">{row.car_model ?? '—'}</span>
          </span>
          <span className="mt-1.5 block truncate text-[13px] text-foreground">{row.customer_name || '—'}</span>
          <span className="mt-1.5 block"><ExtensionPeriod row={row} /></span>
          <span className="mt-1.5 flex items-end justify-between gap-2">
            <span className="min-w-0"><EnteredBy row={row} /></span>
            {row.is_legacy && <LegacyChip />}
          </span>
        </button>
      </li>
    ))}
  </ul>
));

const toPrintable = (row: ReplacementSheetRow) => ({ ...row, customer_id: row.customer_id ?? '' });

const SheetCard: React.FC<{ row: ReplacementSheetRow; today: string }> = ({ row, today }) => {
  const [printing, setPrinting] = useState(false);
  const open = sheetIsOpen(row, today);
  return (
    <li className={cn(CARD, 'flex min-w-0 flex-col p-4')}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('truncate text-[13.5px] font-semibold text-foreground', MONO)}>{row.sheet_number}</span>
        <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium', open ? 'bg-[#16A34A]/10 text-[#15803D]' : 'bg-black/[0.06] text-black/50')}>{open ? 'Open' : 'Closed'}</span>
      </div>
      <p className="mt-1.5 truncate text-[13.5px] text-foreground">{row.customer_name}</p>
      {row.original_booking_number && <p className={cn('truncate text-[12px] text-black/50', MONO)}>{row.original_booking_number}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-black/50">
        {row.original_plate ? <LicensePlate plate={row.original_plate} /> : <span>—</span>}
        <span aria-label="replaced by" className="text-[#3A74C2]">→</span>
        <LicensePlate plate={row.replacement_plate} />
      </div>
      <p className="mt-1 truncate text-[12px] text-black/50">{[row.original_model, row.replacement_model].filter(Boolean).join(' → ')}</p>
      <p className={cn('mt-2 text-[12.5px] text-foreground', MONO)}>{formatDate(row.start_date)} → {formatDate(row.end_date)}</p>
      <p className="text-[12px] text-black/50">{dayLabel(rentalDays(row))}</p>
      <div className="mt-auto flex justify-end pt-2">
        <Button
          variant="outline"
          size="lg"
          className="!h-11 px-3 md:!h-9"
          disabled={printing}
          onClick={async () => {
            setPrinting(true);
            try { await printReplacementSheet(toPrintable(row)); } finally { setPrinting(false); }
          }}
        >
          Reprint
        </Button>
      </div>
    </li>
  );
};

export const SheetList: React.FC<{ rows: ReplacementSheetRow[]; today: string }> = ({ rows, today }) => (
  <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
    {rows.map((row) => <SheetCard key={row.id} row={row} today={today} />)}
  </ul>
);
