import React, { useEffect, useMemo, useState } from 'react';
import { CustomerAvatar } from '../../components/shared/PersonAvatar';
import { bookingsCovering, fetchBookingsOnCar, type BookingOnCar, type FineDocument, type FineStatus } from '../../lib/fines';
import { formatDate } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import { Field, Notice, SelectedRow } from '../bookings/ui';
import { CustomerPicker } from '../customers/CustomerPicker';
import { BannedBadge } from '../customers/ui';

const STATUS: Record<FineStatus, { label: string; className: string; dot: string }> = {
  unpaid: { label: 'Unpaid', className: 'bg-[#DC2626]/[0.1] text-[#B91C1C]', dot: 'bg-[#DC2626]' },
  paid: { label: 'Paid', className: 'bg-[#16A34A]/[0.1] text-[#15803D]', dot: 'bg-[#16A34A]' },
};

export const FineStatusPill: React.FC<{ status: FineStatus }> = ({ status }) => {
  const config = STATUS[status] ?? STATUS.unpaid;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none', config.className)}>
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      {config.label}
    </span>
  );
};

const DOCUMENT_ICON: Record<FineDocument['key'], React.ReactNode> = {
  image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
  pdf: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" /><path d="M14 2v6h6" /></>,
  receipt: <><path d="M5 3v18l2.5-1.5L10 21l2-1.5 2 1.5 2.5-1.5L19 21V3l-2.5 1.5L14 3l-2 1.5L10 3 7.5 4.5 5 3z" /><path d="M9 9h6M9 13h6" /></>,
};

export const DocumentIcons: React.FC<{ documents: FineDocument[]; onOpen: (index: number) => void }> = ({ documents, onOpen }) => (
  <span className="flex shrink-0 items-center">
    {documents.map((document, index) => (
      <button
        key={document.key}
        type="button"
        title={document.label}
        aria-label={`Open ${document.label}`}
        onClick={(event) => { event.stopPropagation(); onOpen(index); }}
        className="grid h-11 w-9 place-items-center rounded-lg text-brand-strong transition-colors hover:bg-[#6EA4E7]/[0.12] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{DOCUMENT_ICON[document.key]}</svg>
      </button>
    ))}
  </span>
);

export interface PickedCustomer {
  id: string;
  name: string;
  banned: boolean;
}

/**
 * Suggests whoever had the car on the day, or finds anyone by search. Banned
 * customers can be picked here: a fine or a damaged car is theirs all the same.
 */
export const LinkedCustomerField: React.FC<{
  carId: number | null;
  day: string;
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer | null) => void;
  emptyHint?: string;
}> = ({ carId, day, value, onChange, emptyHint = 'Leave this empty for a fine with no customer.' }) => {
  const [bookings, setBookings] = useState<BookingOnCar[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setBookings([]);
    setFailed(false);
    if (!carId) return undefined;
    let cancelled = false;
    fetchBookingsOnCar(carId)
      .then((rows) => { if (!cancelled) setBookings(rows); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [carId]);

  const suggestions = useMemo(() => bookingsCovering(bookings, day), [bookings, day]);

  if (value) {
    return (
      <Field label="Customer" span>
        <SelectedRow action="Change" onAction={() => onChange(null)}>
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <CustomerAvatar size={26} />
            <span className="min-w-0 truncate font-medium">{value.name}</span>
            {value.banned && <BannedBadge />}
          </span>
        </SelectedRow>
      </Field>
    );
  }

  return (
    <Field label="Customer" span hint={emptyHint}>
      {failed && <Notice tone="amber">Couldn't load this car's bookings, so there's no suggestion. Search below.</Notice>}
      {suggestions.length > 0 && (
        <ul className="mb-2 grid gap-2">
          {suggestions.map((booking) => (
            <li key={booking.id} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[#6EA4E7]/40 bg-[#6EA4E7]/[0.06] p-2.5">
              <CustomerAvatar size={34} />
              <span className="min-w-0 flex-1 basis-[150px]">
                <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-foreground">
                  {booking.customer_name}
                  {booking.is_banned && <BannedBadge />}
                </span>
                <span className="block text-[12px] tabular-nums text-black/50">
                  Had this car · {booking.booking_number ?? `#${booking.id}`} · {formatDate(booking.start_date)} → {formatDate(booking.end_date)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onChange({ id: booking.customer_id as string, name: booking.customer_name, banned: booking.is_banned })}
                className="h-11 shrink-0 rounded-[10px] bg-surface px-3 text-[12.5px] font-semibold text-brand-strong shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9"
              >
                Use this customer
              </button>
            </li>
          ))}
        </ul>
      )}
      <CustomerPicker allowBanned onSelect={(row) => onChange({ id: row.id, name: row.full_name, banned: row.is_banned })} />
    </Field>
  );
};
