import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, StickyNote, Tag } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { FuelRangeInput } from '../../components/shared/FuelRangeInput';
import { CustomerAvatar } from '../../components/shared/PersonAvatar';
import { formatDays, formatShortRange, friendlyBookingError, rangeDays, type CarChoice } from '../../lib/bookingForm';
import { checkCustomerBan, formatDate, istanbulDate, type BanMatch } from '../../lib/customers';
import { FUEL_RANGE_LABEL } from '../../lib/fuelRange';
import { cn } from '../../lib/media/badgeColor';
import { printReplacementSheet, type ReplacementSheet as PrintableSheet } from '../../lib/printReplacementSheet';
import { supabase } from '../../lib/supabase';
import { BanAlert, CarIcon } from '../customers/ui';
import { CarPicker, useBusyCars } from './CarPicker';
import { DateRangeField } from './DateRangeField';
import { BookingSheet, FOOTER_BUTTON, Field, FormCard, INPUT, LicensePlate, Notice, PrimaryButton, SelectedRow, SummaryBar } from './ui';

type Joined<T> = T | T[] | null;

const one = <T,>(value: Joined<T> | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

interface CarRow {
  id: number;
  plate_number: string;
  is_active: boolean;
  model_group: Joined<{ name: string }>;
}

interface BookingRow {
  id: number;
  booking_number: string;
  start_date: string;
  end_date: string;
  customer_id: string | null;
  customers: Joined<{ first_name: string; last_name: string }>;
}

interface CarBooking extends Omit<BookingRow, 'customers'> {
  customer_name: string;
}

export const ReplacementSheet: React.FC<{
  onClose: () => void;
  onSaved: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}> = ({ onClose, onSaved, showToast }) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [banMatch, setBanMatch] = useState<BanMatch | null>(null);

  const [cars, setCars] = useState<CarChoice[]>([]);

  // Step 1 — the original car. Step 2 — a booking on that car, loaded once it's picked.
  const [originalCarId, setOriginalCarId] = useState('');
  const [carBookings, setCarBookings] = useState<CarBooking[]>([]);
  const [carBookingsLoading, setCarBookingsLoading] = useState(false);
  const [carBookingsError, setCarBookingsError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState('');

  const [replacementCarId, setReplacementCarId] = useState('');
  const [startDate, setStartDate] = useState(() => istanbulDate());
  const [endDate, setEndDate] = useState('');
  const [kmAtHandover, setKmAtHandover] = useState('');
  const [fuelAtHandover, setFuelAtHandover] = useState('');
  const [notes, setNotes] = useState('');

  const busyCars = useBusyCars(startDate, endDate);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('cars').select('id, plate_number, is_active, model_group(name)').order('plate_number');
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      setCars(((data ?? []) as unknown as CarRow[]).map((car) => ({
        id: car.id,
        plate_number: car.plate_number,
        model: one(car.model_group)?.name ?? '—',
        inactive: !car.is_active,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Every booking on the chosen car, regardless of status or date. The replacement
  // is often arranged before the original booking is active, so filtering by
  // is_currently_active here would hide the booking we need.
  useEffect(() => {
    if (!originalCarId) { setCarBookings([]); setCarBookingsError(null); return undefined; }
    let cancelled = false;
    setCarBookingsLoading(true);
    setCarBookingsError(null);
    (async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_number, start_date, end_date, customer_id, customers(first_name, last_name)')
        .eq('car_id', Number(originalCarId))
        .order('start_date', { ascending: false });
      if (cancelled) return;
      if (error) {
        setCarBookingsError(error.message);
        setCarBookings([]);
        setCarBookingsLoading(false);
        return;
      }
      setCarBookings(((data ?? []) as unknown as BookingRow[]).map(({ customers, ...booking }) => {
        const customer = one(customers);
        return { ...booking, customer_name: customer ? `${customer.first_name} ${customer.last_name}`.trim() : '—' };
      }));
      setCarBookingsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [originalCarId]);

  const originalCar = cars.find((car) => String(car.id) === originalCarId) ?? null;
  const chosenCar = cars.find((car) => String(car.id) === replacementCarId) ?? null;
  const selectedBooking = useMemo(() => carBookings.find((booking) => String(booking.id) === bookingId) ?? null, [carBookings, bookingId]);

  // Only active cars can be handed out, and never the car being replaced.
  const replacementCars = useMemo(
    () => cars.filter((car) => !car.inactive && car.id !== originalCar?.id),
    [cars, originalCar],
  );

  // Show a ban as soon as the booking is picked, rather than after the form is filled in.
  useEffect(() => {
    const customerId = selectedBooking?.customer_id;
    if (!customerId) { setBanMatch(null); return undefined; }
    let cancelled = false;
    checkCustomerBan(customerId)
      .then((match) => { if (!cancelled) setBanMatch(match); })
      .catch(() => { /* Submit checks again, and reports a failure there. */ });
    return () => { cancelled = true; };
  }, [selectedBooking]);

  const pickOriginalCar = (id: string) => {
    setOriginalCarId(id);
    setBookingId('');
    setBanMatch(null);
    setFormError(null);
    if (id === replacementCarId) setReplacementCarId('');
  };

  // Default the return date to the chosen booking's end date.
  const pickBooking = (booking: CarBooking) => {
    setBookingId(String(booking.id));
    setEndDate(booking.end_date);
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    setFormError(null);

    if (!originalCar) { setFormError('Select the original car by plate.'); return; }
    if (!selectedBooking) { setFormError('Select the original booking — the sheet must be tied to a customer.'); return; }
    if (!replacementCarId) { setFormError('Select a replacement car.'); return; }
    if (!startDate || !endDate) { setFormError('Handover and return dates are both required.'); return; }
    if (endDate < startDate) { setFormError('The return date cannot be before the handover date.'); return; }

    savingRef.current = true;
    setSaving(true);
    const stop = () => { savingRef.current = false; setSaving(false); };

    // A replacement sheet never touches `bookings`, so the database rule can't catch this.
    if (selectedBooking.customer_id) {
      try {
        const ban = await checkCustomerBan(selectedBooking.customer_id);
        setBanMatch(ban);
        if (ban) { stop(); return; }
      } catch {
        stop();
        setFormError("Couldn't check whether this customer is banned. Try again.");
        return;
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    const carId = Number(replacementCarId);

    // Step 1 — block the replacement car's calendar.
    // booking_id MUST stay null: it is UNIQUE, and the original booking already
    // owns its own booked_* row. Pointing it at the original booking would collide.
    const { data: blockData, error: blockError } = await supabase
      .from('car_calendar')
      .insert({
        car_id: carId,
        start_date: startDate,
        end_date: endDate,
        block_type: 'replacement',
        booking_id: null,
        created_by: user?.id ?? null,
        notes: `Replacement for booking ${selectedBooking.booking_number}`,
      })
      .select('id')
      .single();

    if (blockError) {
      stop();
      setFormError(friendlyBookingError(blockError.message));
      return;
    }

    const blockId = (blockData as { id: number }).id;

    // Step 2 — the sheet record, linked back to the block it just created.
    const { data: sheetData, error: sheetError } = await supabase
      .from('replacement_sheets')
      .insert({
        created_by: user?.id ?? null,
        original_booking_id: selectedBooking.id,
        customer_id: selectedBooking.customer_id,   // uuid — never cast
        original_car_id: originalCar.id,            // from the plate choice, not the booking
        replacement_car_id: carId,
        start_date: startDate,
        end_date: endDate,
        km_at_handover: kmAtHandover.trim() ? Number(kmAtHandover) : null,
        fuel_at_handover: fuelAtHandover.trim() || null,
        notes: notes.trim() || null,
        calendar_block_id: blockId,
      })
      .select('sheet_number')
      .single();

    // Step 3 — roll the block back so a failed sheet never leaves an orphan
    // block sitting on the calendar.
    if (sheetError) {
      const { error: rollbackError } = await supabase.from('car_calendar').delete().eq('id', blockId);
      stop();
      setFormError(friendlyBookingError(sheetError.message));
      showToast(
        rollbackError
          ? `Sheet failed and the calendar block could not be rolled back — remove block #${blockId} manually`
          : 'Replacement sheet failed — the calendar block was rolled back',
        'error',
      );
      return;
    }

    stop();

    const printable: PrintableSheet = {
      sheet_number: (sheetData as { sheet_number: string | null }).sheet_number ?? '—',
      customer_id: selectedBooking.customer_id ?? '',
      customer_name: selectedBooking.customer_name,
      original_booking_number: selectedBooking.booking_number,
      original_plate: originalCar.plate_number,
      original_model: originalCar.model,
      replacement_plate: chosenCar?.plate_number ?? '—',
      replacement_model: chosenCar?.model ?? null,
      start_date: startDate,
      end_date: endDate,
      km_at_handover: kmAtHandover.trim() ? Number(kmAtHandover) : null,
      fuel_at_handover: fuelAtHandover.trim() || null,
      notes: notes.trim() || null,
    };

    showToast('Replacement sheet created', 'success');
    onSaved();
    onClose();
    await printReplacementSheet(printable);
  };

  const days = rangeDays(startDate, endDate);
  const dirty = Boolean(originalCarId || replacementCarId || endDate || kmAtHandover || fuelAtHandover || notes);
  const blocked = loading || Boolean(loadError) || Boolean(banMatch) || !originalCar || carBookingsLoading || !selectedBooking;

  const summary = (
    <SummaryBar
      headline={<>
        {originalCar && <LicensePlate plate={originalCar.plate_number} />}
        {chosenCar && <><span className="text-black/40">→</span><LicensePlate plate={chosenCar.plate_number} /></>}
        {days > 0 && <span className="truncate">{formatDays(days)}</span>}
      </>}
      items={[
        { label: 'Original car', value: originalCar ? <LicensePlate plate={originalCar.plate_number} /> : '—' },
        { label: 'Replacement', value: chosenCar ? <LicensePlate plate={chosenCar.plate_number} /> : '—' },
        { label: 'Dates', value: formatShortRange(startDate, endDate) },
        { label: 'Days', value: days || '—' },
      ]}
    />
  );

  return (
    <BookingSheet
      label="Replacement car"
      title="Replacement car"
      subtitle="Hand a substitute vehicle to a customer and block its calendar"
      summary={summary}
      dirty={dirty}
      saving={saving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(requestClose) => (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={requestClose}>Cancel</Button>
          <span className="flex-1 max-sm:hidden" />
          <PrimaryButton saving={saving} disabled={blocked}>Create and print</PrimaryButton>
        </div>
      )}
    >
      {loading && <p className="py-10 text-center text-[13px] text-black/45">Loading cars…</p>}
      {loadError && <Notice tone="red">{loadError}</Notice>}

      {!loading && !loadError && (
        <>
          <FormCard icon={<CarIcon size={15} />} title="Original car">
            {originalCar ? (
              <SelectedRow action="Change" onAction={() => pickOriginalCar('')}>
                <span className="flex min-w-0 items-center gap-2">
                  <LicensePlate plate={originalCar.plate_number} />
                  <span className="truncate">{originalCar.model}{originalCar.inactive ? ' · inactive' : ''}</span>
                </span>
              </SelectedRow>
            ) : (
              <CarPicker label="Original car" required cars={cars} value={originalCarId} onChange={pickOriginalCar} />
            )}

            {originalCar && (
              <Field label="Original booking / customer" required span>
                {carBookingsLoading ? (
                  <p className="py-2 text-[13px] text-black/45">Loading bookings…</p>
                ) : carBookingsError ? (
                  <Notice tone="red">{carBookingsError}</Notice>
                ) : carBookings.length === 0 ? (
                  <Notice tone="amber">No bookings found for this car — a replacement sheet must be tied to a booking's customer.</Notice>
                ) : (
                  <div role="radiogroup" aria-label="Original booking" className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
                    {carBookings.map((booking) => {
                      const selected = String(booking.id) === bookingId;
                      return (
                        <button
                          key={booking.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => pickBooking(booking)}
                          className={cn(
                            'flex min-h-[52px] w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40',
                            selected ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.09]' : 'border-[#E5E7EB] bg-white hover:bg-black/[0.02]',
                          )}
                        >
                          <CustomerAvatar size={34} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium text-foreground">{booking.customer_name}</span>
                            <span className="block truncate text-[12px] tabular-nums text-black/50">
                              <span className="font-mono">{booking.booking_number}</span> · {formatDate(booking.start_date)} → {formatDate(booking.end_date)}
                            </span>
                          </span>
                          {selected && <Check size={15} className="shrink-0 text-brand-strong" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Field>
            )}
          </FormCard>

          <FormCard icon={<CalendarDays size={15} />} title="Dates">
            <DateRangeField
              label="Handover and return"
              required
              start={startDate}
              end={endDate}
              onChange={(start, end) => { setStartDate(start); setEndDate(end); }}
            />
          </FormCard>

          <FormCard icon={<CarIcon size={15} />} title="Replacement car">
            <CarPicker
              label="Replacement car"
              required
              pinRecent
              cars={replacementCars}
              value={replacementCarId}
              busy={busyCars}
              hint={busyCars ? undefined : 'Pick the dates to see which cars are free.'}
              onChange={setReplacementCarId}
            />
          </FormCard>

          <FormCard icon={<Tag size={15} />} title="Handover condition">
            <Field label="KM at handover">
              <input type="number" min="0" aria-label="KM at handover" value={kmAtHandover} onChange={(event) => setKmAtHandover(event.target.value)} placeholder="e.g. 48250" className={INPUT} />
            </Field>
            <Field label={FUEL_RANGE_LABEL}>
              <FuelRangeInput value={fuelAtHandover} onChange={setFuelAtHandover} className={INPUT} />
            </Field>
          </FormCard>

          <FormCard icon={<StickyNote size={15} />} title="Notes">
            <Field label="Notes" span>
              <textarea
                aria-label="Notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="Why the original car was withdrawn…"
                className={cn(INPUT, '!h-auto resize-y py-2.5')}
              />
            </Field>
          </FormCard>
        </>
      )}

      {banMatch && <BanAlert match={banMatch} />}
      {formError && <Notice tone="red">{formError}</Notice>}
    </BookingSheet>
  );
};
