import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from '../../components/media/MediaIcons';
import { toast } from '../../components/media/MediaToast';
import { Button, Spinner, Textarea } from '../../components/media/MediaUI';
import {
  bookingCar,
  bookingCountdown,
  buildActivity,
  focusBooking,
  formatDate,
  formatLira,
  rateCustomer,
  updateCustomer,
  type ActivityKind,
  type Customer,
  type CustomerProfile,
  type ProfileBooking,
  type ReviewStatus,
} from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import { formatTry } from '../../lib/payroll';
import { CarIcon, EmptyNote, Panel, PlateChip, StarIcon, StatusPill } from './ui';

const bookingLink = (booking: ProfileBooking) =>
  `/dashboard/bookings?q=${encodeURIComponent(booking.booking_number ?? '')}&month=${booking.start_date.slice(0, 7)}`;

// ── Overview ─────────────────────────────────────────────────────────────────

const CarPhoto: React.FC<{ src: string | null; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="grid aspect-[16/10] w-full shrink-0 place-items-center overflow-hidden rounded-xl bg-black/[0.03] text-black/25 sm:w-[200px]">
      {src && !failed
        ? <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        : <CarIcon size={30} />}
    </div>
  );
};

const FocusBookingCard: React.FC<{ booking: ProfileBooking; today: string }> = ({ booking, today }) => {
  const car = bookingCar(booking);
  const countdown = bookingCountdown(booking, today);
  return (
    <Panel title={booking.is_currently_active ? 'Current booking' : 'Next booking'}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <CarPhoto src={car.photo} alt={car.model ?? 'Car'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-medium text-foreground">{car.model ?? 'Car'}</span>
            <PlateChip plate={car.plate} />
          </div>
          <div className="mt-1.5 text-[13px] tabular-nums text-black/55">
            {formatDate(booking.start_date)} → {formatDate(booking.end_date)}
          </div>
          <div className={cn('mt-2 text-[14px] font-medium', countdown.endsWith('overdue') ? 'text-[#B91C1C]' : 'text-brand-strong')}>
            {countdown}
          </div>
          <Link to={bookingLink(booking)} className="mt-2 inline-flex min-h-[44px] items-center font-mono text-[12.5px] tabular-nums text-black/50 hover:text-brand-strong md:min-h-0">
            {booking.booking_number}
          </Link>
        </div>
      </div>
    </Panel>
  );
};

const ACTIVITY_COLORS: Record<ActivityKind, string> = {
  booking: 'bg-[#6EA4E7]',
  payment: 'bg-[#16A34A]',
  fine: 'bg-[#DC2626]',
  review: 'bg-[#F59E0B]',
};

export const OverviewTab: React.FC<{ profile: CustomerProfile; today: string }> = ({ profile, today }) => {
  const focus = focusBooking(profile.bookings, today);
  const activity = buildActivity(profile);

  return (
    <div className="flex flex-col gap-4">
      {focus ? <FocusBookingCard booking={focus} today={today} /> : (
        <Panel title="Current booking"><EmptyNote>No current or upcoming booking.</EmptyNote></Panel>
      )}
      <Panel title="Recent activity">
        {activity.length === 0 ? <EmptyNote>Nothing here yet.</EmptyNote> : (
          <ol className="flex flex-col">
            {activity.map((item) => (
              <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                <span className="relative flex w-2.5 shrink-0 justify-center">
                  <span className={cn('mt-[5px] h-2.5 w-2.5 rounded-full', ACTIVITY_COLORS[item.kind])} />
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                  <div className="min-w-0">
                    <div className="text-[13.5px] text-foreground">{item.title}</div>
                    <div className="truncate text-[12.5px] tabular-nums text-black/50">{item.detail}</div>
                  </div>
                  <time className="shrink-0 text-[12px] tabular-nums text-black/40">{formatDate(item.date)}</time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
};

// ── Bookings ─────────────────────────────────────────────────────────────────

export const BookingsTab: React.FC<{ bookings: ProfileBooking[] }> = ({ bookings }) => (
  <Panel title={`${bookings.length} ${bookings.length === 1 ? 'rental' : 'rentals'}`}>
    {bookings.length === 0 ? <EmptyNote>No bookings found for this customer.</EmptyNote> : (
      <ul className="flex flex-col">
        {bookings.map((booking) => {
          const car = bookingCar(booking);
          return (
            <li key={booking.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-black/[0.05] py-3 first:pt-0 last:border-b-0 last:pb-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <PlateChip plate={car.plate} />
                <span className="truncate text-[13.5px] font-medium text-foreground">{car.model ?? `Car #${booking.car_id}`}</span>
              </div>
              <div className="justify-self-end"><StatusPill status={booking.status} /></div>
              <div className="min-w-0 text-[12.5px] tabular-nums text-black/50">
                <Link to={bookingLink(booking)} className="font-mono hover:text-brand-strong">{booking.booking_number ?? `#${booking.id}`}</Link>
                {' · '}{formatDate(booking.start_date)} → {formatDate(booking.end_date)}
                {booking.insurance_type && ` · ${booking.insurance_type}`}
              </div>
              <div className="justify-self-end text-[13px] font-medium tabular-nums text-foreground">
                {booking.total_amount === null ? '—' : formatLira(Number(booking.total_amount))}
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </Panel>
);

// ── Fines & HGS ──────────────────────────────────────────────────────────────

const HGS_STEP = 20;

export const FinesHgsTab: React.FC<{ profile: CustomerProfile }> = ({ profile }) => {
  const { fines, hgs } = profile;
  const [shown, setShown] = useState(HGS_STEP);
  const fineTotal = fines.reduce((sum, fine) => sum + Number(fine.amount ?? 0), 0);
  const hgsTotal = hgs.reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
      <Panel title="Traffic fines" action={<span className="text-[13px] font-medium tabular-nums text-foreground">{formatLira(fineTotal)}</span>}>
        {fines.length === 0 ? <EmptyNote>No fines for this customer.</EmptyNote> : (
          <ul className="flex flex-col">
            {fines.map((fine) => {
              const file = fine.fine_image_url ?? fine.fine_pdf_url;
              return (
                <li key={fine.id} className="flex items-center gap-3 border-b border-black/[0.05] py-3 first:pt-0 last:border-b-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlateChip plate={fine.plate_number} />
                      <StatusPill status={fine.status} />
                    </div>
                    <div className="mt-1 truncate text-[12.5px] text-black/50">
                      {[formatDate(fine.violation_date), fine.location ?? fine.description].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="shrink-0 text-[13.5px] font-medium tabular-nums text-foreground">
                    {fine.amount === null ? '—' : formatLira(Number(fine.amount))}
                  </div>
                  {file && (
                    <a href={file} target="_blank" rel="noopener noreferrer" aria-label="Open fine" className="grid h-11 w-9 shrink-0 place-items-center rounded-lg text-black/45 hover:bg-black/[0.04] md:h-9">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="HGS" action={<span className="text-[13px] font-medium tabular-nums text-foreground">{formatLira(hgsTotal)}</span>}>
        {hgs.length === 0 ? <EmptyNote>No HGS passes for this customer.</EmptyNote> : (
          <>
            <ul className="flex flex-col">
              {hgs.slice(0, shown).map((row) => (
                <li key={row.id} className="flex items-center gap-3 border-b border-black/[0.05] py-2.5 first:pt-0 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-foreground">
                      {row.toll_location ?? ([row.entry_location, row.exit_location].filter(Boolean).join(' → ') || 'Toll pass')}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[12.5px] tabular-nums text-black/50">
                      <span className="font-mono">{row.plate_number}</span>
                      <span>{formatDate(row.transit_datetime)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-[13px] font-medium tabular-nums text-foreground">{formatTry(Number(row.amount))}</div>
                </li>
              ))}
            </ul>
            {shown < hgs.length && (
              <Button variant="secondary" size="lg" className="mt-3 !h-11 w-full md:!h-10" onClick={() => setShown((count) => count + HGS_STEP)}>
                Show more ({hgs.length - shown} left)
              </Button>
            )}
          </>
        )}
      </Panel>
    </div>
  );
};

// ── Notes & rating ───────────────────────────────────────────────────────────

const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending_review: 'Not rated yet',
  awaiting_send: 'Google review request is queued',
  sent: 'Google review request was sent',
  rejected: 'Not asked for a Google review',
};

const RatingStars: React.FC<{ value: number; busy: boolean; disabled: boolean; onRate: (rating: number) => void }> = ({
  value,
  busy,
  disabled,
  onRate,
}) => {
  const [hover, setHover] = useState(0);
  const lit = hover || value;
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Our rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled || busy}
          aria-label={`Rate ${star} of 5`}
          aria-pressed={star === value}
          onMouseEnter={() => { if (!disabled) setHover(star); }}
          onClick={() => onRate(star)}
          className={cn(
            'grid h-11 w-11 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30 disabled:cursor-not-allowed md:h-9 md:w-9',
            star <= lit ? 'text-[#F59E0B]' : 'text-black/20',
          )}
        >
          <StarIcon size={22} filled={star <= lit} />
        </button>
      ))}
      {busy && <Spinner size={14} className="ms-2" />}
    </div>
  );
};

export const NotesTab: React.FC<{
  profile: CustomerProfile;
  onCustomerSaved: (updated: Customer) => void;
  onRated: () => void;
}> = ({ profile, onCustomerSaved, onRated }) => {
  const { customer, review, raterName, bookings } = profile;
  const [notes, setNotes] = useState(customer.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [rating, setRating] = useState(false);

  const completed = bookings.find((booking) => booking.status === 'completed');
  const dirty = notes.trim() !== (customer.notes ?? '').trim();

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      onCustomerSaved(await updateCustomer(customer.id, { notes: notes.trim() || null }));
      toast.success('Notes saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  const onRate = async (stars: number) => {
    if (!completed) return;
    setRating(true);
    try {
      await rateCustomer({
        customerId: customer.id,
        rating: stars,
        bookingId: completed.id,
        currentStatus: review?.status,
      });
      toast.success(`Rated ${stars} of 5`);
      onRated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the rating.');
    } finally {
      setRating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
      <Panel title="Internal notes">
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={6}
          aria-label="Internal notes"
          placeholder="Anything the team should know about this customer."
        />
        <div className="mt-3 flex justify-end">
          <Button size="lg" className="!h-11 md:!h-10" disabled={!dirty || savingNotes} onClick={saveNotes}>
            {savingNotes && <Spinner size={13} />} Save notes
          </Button>
        </div>
      </Panel>

      <Panel title="Our rating">
        <RatingStars value={review?.our_rating ?? 0} busy={rating} disabled={!completed} onRate={onRate} />
        {!completed ? (
          <p className="mt-2 text-[12.5px] text-black/50">You can rate a customer after their first completed rental.</p>
        ) : review?.our_rating ? (
          <dl className="mt-3 flex flex-col gap-1.5 text-[12.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-black/45">Rated</dt>
              <dd className="text-right tabular-nums text-foreground">
                {formatDate(review.rated_at)}{raterName && ` by ${raterName}`}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-black/45">Google review</dt>
              <dd className="text-right text-foreground">{REVIEW_STATUS_LABELS[review.status]}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-[12.5px] text-black/50">5 stars queues a Google review request. Anything less doesn't.</p>
        )}
      </Panel>
    </div>
  );
};
