import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { useCurrency } from '../../lib/CurrencyContext';
import {
  formatDays,
  friendlyBookingError,
  parseAmount,
  toTry,
  usdLedgerNote,
  type BookingCurrency,
} from '../../lib/bookingForm';
import {
  appendLedgerNote,
  checkCustomerBan,
  daysBetween,
  fetchCustomerBalance,
  formatDate,
  formatLira,
  type BanMatch,
} from '../../lib/customers';
import { supabase } from '../../lib/supabase';
import type { Booking } from '../../types';
import { BanAlert, BalancePill, UsersIcon, WalletIcon } from '../customers/ui';
import { useBusyCars } from './CarPicker';
import { EndDateField } from './DateRangeField';
import { BookingSheet, FOOTER_BUTTON, FormCard, LicensePlate, MoneyField, Notice, PrimaryButton } from './ui';

interface ExtendResult {
  new_end_date: string;
  new_balance: number;
}

const nextDay = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const Timeline: React.FC<{ start: string; currentEnd: string; newEnd: string }> = ({ start, currentEnd, newEnd }) => {
  const current = Math.max(daysBetween(start, currentEnd), 1);
  const added = daysBetween(currentEnd, newEnd);
  return (
    <div className="sm:col-span-2">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        <span className="bg-black/[0.12]" style={{ flex: current }} />
        <span className="bg-[#6EA4E7]" style={{ flex: added }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[12px] tabular-nums text-black/55">
        <span>{formatDate(start)}</span>
        <span className="font-semibold text-brand-strong">+{formatDays(added)}</span>
        <span>{formatDate(newEnd)}</span>
      </div>
    </div>
  );
};

const SummaryLine: React.FC<{ label: string; children: React.ReactNode; strong?: boolean }> = ({ label, children, strong }) => (
  <>
    <dt className={strong ? 'font-semibold text-foreground' : 'text-black/55'}>{label}</dt>
    <dd className={`text-right tabular-nums text-foreground ${strong ? 'font-semibold' : ''}`}>{children}</dd>
  </>
);

/**
 * Extends a booking on the same car. The end date and both ledger rows are
 * written together by the `extend_booking` RPC. A USD note is added afterwards
 * because the RPC builds its own descriptions.
 */
export const ExtendSheet: React.FC<{
  booking: Booking;
  onClose: () => void;
  onSaved: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}> = ({ booking, onClose, onSaved, showToast }) => {
  const { rates } = useCurrency();
  const usdRate = rates.find((rate) => rate.currency === 'USD')?.rate_to_try ?? null;

  const [newEndDate, setNewEndDate] = useState('');
  const [rentalAmount, setRentalAmount] = useState('');
  const [rentalCurrency, setRentalCurrency] = useState<BookingCurrency>('TRY');
  const [paidAmount, setPaidAmount] = useState('');
  const [paidCurrency, setPaidCurrency] = useState<BookingCurrency>('TRY');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [banMatch, setBanMatch] = useState<BanMatch | null>(null);
  const [oldBalance, setOldBalance] = useState<number | null>(null);

  const firstDay = nextDay(booking.end_date);
  const customerId = String(booking.customer_id);
  const busyCars = useBusyCars(newEndDate ? firstDay : '', newEndDate, booking.id);
  const carBusy = Boolean(busyCars?.has(booking.car_id));

  useEffect(() => {
    let cancelled = false;
    checkCustomerBan(customerId)
      .then((match) => { if (!cancelled) setBanMatch(match); })
      .catch(() => { /* Submit checks again, and reports a failure there. */ });
    fetchCustomerBalance(customerId)
      .then((balance) => { if (!cancelled) setOldBalance(balance); })
      .catch(() => { /* The summary shows a dash, and nothing depends on it. */ });
    return () => { cancelled = true; };
  }, [customerId]);

  const rental = toTry(parseAmount(rentalAmount), rentalCurrency, usdRate);
  const paid = toTry(parseAmount(paidAmount), paidCurrency, usdRate);
  const newBalance = oldBalance === null ? null : oldBalance + rental - paid;

  const needsRate = (rentalCurrency === 'USD' && parseAmount(rentalAmount) > 0) || (paidCurrency === 'USD' && parseAmount(paidAmount) > 0);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    setFormError(null);

    const rentalNumber = Number(rentalAmount);
    const paidNumber = paidAmount.trim() === '' ? 0 : Number(paidAmount);

    if (!newEndDate) { setFormError('Pick the new end date'); return; }
    if (newEndDate <= booking.end_date) { setFormError(`New end date must be after ${formatDate(booking.end_date)}`); return; }
    if (!rentalAmount.trim() || Number.isNaN(rentalNumber) || rentalNumber <= 0) { setFormError('Rental amount must be greater than 0'); return; }
    if (Number.isNaN(paidNumber) || paidNumber < 0) { setFormError('Paid amount cannot be negative'); return; }
    if (needsRate && !usdRate) { setFormError("Today's USD rate hasn't loaded. Reload, or enter the amounts in TRY."); return; }

    savingRef.current = true;
    setSaving(true);
    const stop = () => { savingRef.current = false; setSaving(false); };

    // Extending keeps the same customer_id, so the database rule doesn't run here.
    try {
      const ban = await checkCustomerBan(customerId);
      setBanMatch(ban);
      if (ban) { stop(); return; }
    } catch {
      stop();
      setFormError("Couldn't check whether this customer is banned. Try again.");
      return;
    }

    // Attribution is best-effort: an expired session should not block the
    // extension, so a missing user id is passed through as null.
    const { data: { user } } = await supabase.auth.getUser();
    const rentalTry = toTry(rentalNumber, rentalCurrency, usdRate);
    const paidTry = toTry(paidNumber, paidCurrency, usdRate);

    const { data, error } = await supabase.rpc('extend_booking', {
      p_booking_id: booking.id,
      p_new_end_date: newEndDate,
      p_rental_amount: rentalTry,
      p_paid_amount: paidTry,
      p_created_by: user?.id ?? null,
    });

    if (error) {
      stop();
      const message = friendlyBookingError(error.message);
      setFormError(message);
      showToast(message, 'error');
      return;
    }

    const notes = [
      ...(rentalCurrency === 'USD' ? [appendLedgerNote(booking.id, 'rental', rentalTry, usdLedgerNote(rentalNumber, usdRate as number))] : []),
      ...(paidCurrency === 'USD' && paidNumber > 0 ? [appendLedgerNote(booking.id, 'payment', paidTry, usdLedgerNote(paidNumber, usdRate as number))] : []),
    ];
    const noted = await Promise.allSettled(notes);
    stop();

    // The function returns TABLE(...), so supabase-js hands back an array.
    const result = (Array.isArray(data) ? data[0] : data) as ExtendResult | undefined;
    const endLabel = formatDate(result?.new_end_date ?? newEndDate);
    if (noted.some((outcome) => outcome.status === 'rejected')) {
      showToast(`Extended to ${endLabel}, but the USD note wasn't added to the ledger`, 'error');
    } else {
      showToast(`Extended to ${endLabel}`, 'success');
    }
    onSaved();
    onClose();
  };

  const dirty = Boolean(newEndDate || rentalAmount || paidAmount);
  const blocked = Boolean(banMatch) || !newEndDate || !rentalAmount.trim();

  return (
    <BookingSheet
      label="Extend booking"
      title="Extend booking"
      subtitle={booking.customer_name}
      badge={<span className="rounded-md bg-black/[0.05] px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums text-black/60">{booking.booking_number}</span>}
      dirty={dirty}
      saving={saving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(requestClose) => (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={requestClose}>Cancel</Button>
          <span className="flex-1 max-sm:hidden" />
          <PrimaryButton saving={saving} disabled={blocked}>Extend booking</PrimaryButton>
        </div>
      )}
    >
      {banMatch && <BanAlert match={banMatch} />}

      <FormCard icon={<UsersIcon size={15} />} title="Current booking">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px] sm:col-span-2">
          <dt className="text-black/50">Customer</dt>
          <dd className="min-w-0 truncate text-foreground">{booking.customer_name}</dd>
          <dt className="text-black/50">Car</dt>
          <dd className="flex min-w-0 items-center gap-2 text-foreground">
            <LicensePlate plate={booking.plate_number} />
            <span className="truncate">{booking.car_model}</span>
          </dd>
          <dt className="text-black/50">Dates</dt>
          <dd className="tabular-nums text-foreground">{formatDate(booking.start_date)} → {formatDate(booking.end_date)}</dd>
        </dl>
      </FormCard>

      <FormCard icon={<CalendarDays size={15} />} title="Extension">
        <EndDateField
          label="New end date"
          required
          anchor={booking.end_date}
          min={firstDay}
          value={newEndDate}
          onChange={(day) => { setNewEndDate(day); setFormError(null); }}
        />
        {newEndDate && <Timeline start={booking.start_date} currentEnd={booking.end_date} newEnd={newEndDate} />}
        {carBusy && <Notice tone="red" span>This car is already booked during the extension.</Notice>}
      </FormCard>

      <FormCard icon={<WalletIcon size={15} />} title="Amount">
        <MoneyField label="Rental amount" required span value={rentalAmount} currency={rentalCurrency} rate={usdRate} onChange={setRentalAmount} onCurrency={setRentalCurrency} />
        <MoneyField label="Paid amount" span value={paidAmount} currency={paidCurrency} rate={usdRate} onChange={setPaidAmount} onCurrency={setPaidCurrency} />
      </FormCard>

      <FormCard icon={<WalletIcon size={15} />} title="Summary">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[13px] sm:col-span-2">
          <SummaryLine label="Old balance">{oldBalance === null ? '—' : <BalancePill balance={oldBalance} />}</SummaryLine>
          <SummaryLine label="Extension charge">{formatLira(rental)}</SummaryLine>
          <SummaryLine label="Paid now">{formatLira(paid)}</SummaryLine>
          <SummaryLine label="New balance" strong>{newBalance === null ? '—' : <BalancePill balance={newBalance} />}</SummaryLine>
        </dl>
      </FormCard>

      {formError && <Notice tone="red">{formError}</Notice>}
    </BookingSheet>
  );
};
