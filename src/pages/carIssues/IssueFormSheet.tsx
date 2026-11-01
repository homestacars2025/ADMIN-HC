import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Tag } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { PhotoGrid, UploadProgress } from '../../components/shared/FileDrop';
import { useShell } from '../../components/shell/shellContext';
import { FORM_TYPES, MAX_PHOTOS, createIssue, fetchStaffOptions, type IssueType } from '../../lib/carIssues';
import { formatDate, istanbulDate } from '../../lib/customers';
import { fetchBookingsOnCar, type BookingOnCar, type FineCar } from '../../lib/fines';
import { CarPicker } from '../bookings/CarPicker';
import { DateField } from '../bookings/DateRangeField';
import { BookingSheet, FOOTER_BUTTON, Field, FormCard, INPUT, Notice, PrimaryButton, SelectedRow } from '../bookings/ui';
import { CarIcon, FileIcon } from '../customers/ui';
import { LinkedCustomerField, type PickedCustomer } from '../fines/ui';
import { TypeCards } from './ui';

export const DESCRIPTION_HINT = 'What happened, where on the car, and how bad it is. If no customer is linked, say why (staff, parking, unknown).';

const bookingLabel = (booking: BookingOnCar) => `${booking.booking_number ?? `#${booking.id}`} · ${formatDate(booking.start_date)} → ${formatDate(booking.end_date)}`;

export const IssueFormSheet: React.FC<{
  cars: FineCar[];
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ cars, onClose, onSaved }) => {
  const { profile } = useShell();
  const today = useMemo(() => istanbulDate(), []);
  const choices = useMemo(() => cars.filter((car) => !car.inactive), [cars]);

  const [carId, setCarId] = useState('');
  const [type, setType] = useState<IssueType>('damage');
  const [bookings, setBookings] = useState<BookingOnCar[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingId, setBookingId] = useState('');
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [description, setDescription] = useState('');
  const [discoveredAt, setDiscoveredAt] = useState(today);
  const [discoveredBy, setDiscoveredBy] = useState('');
  const [staff, setStaff] = useState<Array<{ id: string; full_name: string }>>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [errors, setErrors] = useState<{ car?: string; photos?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const savingRef = useRef(false);

  useEffect(() => { if (profile?.id) setDiscoveredBy((current) => current || profile.id); }, [profile?.id]);

  useEffect(() => {
    let cancelled = false;
    fetchStaffOptions()
      .then((rows) => { if (!cancelled) setStaff(rows); })
      .catch(() => { /* The field still offers the person signed in. */ });
    return () => { cancelled = true; };
  }, []);

  const linkBooking = (booking: BookingOnCar) => {
    setBookingId(String(booking.id));
    if (booking.customer_id) setCustomer({ id: booking.customer_id, name: booking.customer_name, banned: booking.is_banned });
  };

  // A booking covering today is linked straight away, and it can still be changed.
  useEffect(() => {
    setBookingId('');
    setCustomer(null);
    setBookings([]);
    if (!carId) return undefined;
    let cancelled = false;
    setBookingsLoading(true);
    fetchBookingsOnCar(Number(carId))
      .then((rows) => {
        if (cancelled) return;
        setBookings(rows);
        const current = rows.find((row) => row.status !== 'cancelled' && row.start_date <= today && row.end_date >= today);
        if (current) linkBooking(current);
      })
      .catch(() => { if (!cancelled) setBookings([]); })
      .finally(() => { if (!cancelled) setBookingsLoading(false); });
    return () => { cancelled = true; };
  }, [carId, today]);

  const lastBooking = useMemo(() => bookings.find((row) => row.status !== 'cancelled' && row.start_date <= today) ?? null, [bookings, today]);
  const linked = bookings.find((row) => String(row.id) === bookingId) ?? null;

  // A booking can only be linked to the customer it belongs to.
  const visibleBookings = useMemo(
    () => (customer ? bookings.filter((row) => row.customer_id === customer.id) : bookings),
    [bookings, customer],
  );

  const changeCustomer = (next: PickedCustomer | null) => {
    setCustomer(next);
    if (next && linked && linked.customer_id !== next.id) setBookingId('');
  };

  const changeBooking = (id: string) => {
    const picked = bookings.find((row) => String(row.id) === id);
    if (picked) linkBooking(picked);
    else setBookingId('');
  };

  const dirty = Boolean(carId || photos.length || description.trim());

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const next = {
      car: carId ? undefined : 'Choose the car.',
      photos: photos.length > 0 ? undefined : 'Add at least one damage photo.',
    };
    setErrors(next);
    if (next.car || next.photos) {
      requestAnimationFrame(() => document.querySelector('[role=dialog] [data-field-error], [role=dialog] [role=alert]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const car = cars.find((item) => String(item.id) === carId);
      await createIssue({
        car_id: Number(carId),
        plate_number: car?.plate_number ?? '',
        booking_id: bookingId ? Number(bookingId) : null,
        customer_id: customer?.id ?? null,
        type,
        description,
        discovered_at: discoveredAt,
        discovered_by: discoveredBy || null,
      }, photos, (label, done, total) => setProgress({ label, done, total }));
      onSaved('Issue logged.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The issue wasn't saved. Try again.");
      savingRef.current = false;
      setSaving(false);
      setProgress(null);
    }
  };

  const people = staff.some((person) => person.id === discoveredBy) || !profile?.id
    ? staff
    : [{ id: profile.id, full_name: profile.full_name ?? 'You' }, ...staff];

  return (
    <BookingSheet
      narrow
      label="New issue"
      title="New issue"
      subtitle="Log a damage, accident or mechanical problem"
      summary={progress ? <UploadProgress {...progress} /> : undefined}
      dirty={dirty}
      saving={saving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(requestClose) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={requestClose}>Cancel</Button>
          <PrimaryButton saving={saving}>Save issue</PrimaryButton>
        </div>
      )}
    >
      <FormCard icon={<CarIcon size={15} />} title="Car">
        <CarPicker label="Car" required cars={choices} value={carId} error={errors.car} onChange={(id) => { setCarId(id); setErrors((current) => ({ ...current, car: undefined })); }} />
        {carId && !bookingsLoading && (linked ? (
          <SelectedRow action="Unlink" onAction={() => setBookingId('')}>
            <span className="font-medium">{linked.customer_name}</span>
            <span className="text-black/50"> · {bookingLabel(linked)}</span>
          </SelectedRow>
        ) : lastBooking && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[#6EA4E7]/40 bg-[#6EA4E7]/[0.06] p-2.5 sm:col-span-2">
            <span className="min-w-0 flex-1 basis-[170px]">
              <span className="block text-[13.5px] font-medium text-foreground">{lastBooking.customer_name}</span>
              <span className="block text-[12px] tabular-nums text-black/50">Last booking · {bookingLabel(lastBooking)}</span>
            </span>
            <button type="button" onClick={() => linkBooking(lastBooking)} className="h-11 shrink-0 rounded-[10px] bg-surface px-3 text-[12.5px] font-semibold text-brand-strong shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9">
              Link to this booking
            </button>
          </div>
        ))}
        {carId && (
          <>
            <Field
              label="Booking"
              span
              hint={!bookingsLoading && visibleBookings.length === 0 ? (customer ? 'This customer has no bookings for this car.' : 'No bookings for this car.') : undefined}
            >
              <select aria-label="Booking" value={bookingId} disabled={bookingsLoading} onChange={(event) => changeBooking(event.target.value)} className={INPUT}>
                <option value="">{bookingsLoading ? 'Loading…' : 'No booking'}</option>
                {visibleBookings.map((booking) => <option key={booking.id} value={booking.id}>{bookingLabel(booking)}</option>)}
              </select>
            </Field>
            <LinkedCustomerField carId={null} day="" value={customer} onChange={changeCustomer} emptyHint="Leave this empty if no customer was involved." />
          </>
        )}
      </FormCard>

      <FormCard icon={<Tag size={15} />} title="Issue type">
        <TypeCards types={FORM_TYPES} value={type} onChange={setType} />
      </FormCard>

      <FormCard icon={<FileIcon size={15} />} title="Description">
        <Field label="Description" span>
          <textarea aria-label="Description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={DESCRIPTION_HINT} className={`${INPUT} !h-auto resize-y py-2.5`} />
        </Field>
      </FormCard>

      <FormCard icon={<CarIcon size={15} />} title="Damage photos">
        <PhotoGrid
          label="Damage photos"
          required
          files={photos}
          max={MAX_PHOTOS}
          disabled={saving}
          error={errors.photos}
          onChange={(next) => { setPhotos(next); setErrors((current) => ({ ...current, photos: undefined })); }}
        />
      </FormCard>

      <FormCard icon={<CalendarDays size={15} />} title="Date and discovered by">
        <DateField label="Discovered date" value={discoveredAt} onChange={setDiscoveredAt} />
        <Field label="Discovered by">
          <select aria-label="Discovered by" value={discoveredBy} onChange={(event) => setDiscoveredBy(event.target.value)} className={INPUT}>
            {people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
          </select>
        </Field>
      </FormCard>

      {formError && <Notice tone="red">{formError}</Notice>}
    </BookingSheet>
  );
};
