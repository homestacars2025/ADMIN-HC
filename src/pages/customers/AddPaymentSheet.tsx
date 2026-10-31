import React, { useState } from 'react';
import {
  Button,
  Field,
  Input,
  Select,
  Sheet,
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
} from '../../components/media/MediaUI';
import {
  addCustomerPayment,
  bookingCar,
  customerName,
  focusBooking,
  formatDate,
  istanbulDate,
  type Customer,
  type PaymentType,
  type ProfileBooking,
} from '../../lib/customers';

const TYPES: Array<{ value: PaymentType; label: string }> = [
  { value: 'payment', label: 'Payment' },
  { value: 'deposit', label: 'Deposit' },
];

const FIELD = '!h-11 md:!h-10';
const SELECT_FIELD = `${FIELD} text-[13px]`;

/** Money received from the customer, written to the ledger as an IN row against a booking. */
export const AddPaymentSheet: React.FC<{
  customer: Customer;
  bookings: ProfileBooking[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ customer, bookings, onClose, onSaved }) => {
  const today = istanbulDate();
  const [bookingId, setBookingId] = useState(() => String((focusBooking(bookings, today) ?? bookings[0])?.id ?? ''));
  const [type, setType] = useState<PaymentType>('payment');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const options = bookings.map((booking) => {
    const car = bookingCar(booking);
    return {
      value: String(booking.id),
      label: [booking.booking_number ?? `#${booking.id}`, car.plate, formatDate(booking.start_date)].filter(Boolean).join(' · '),
    };
  });

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const booking = bookings.find((item) => String(item.id) === bookingId);
    const value = Number(amount.replace(',', '.'));
    if (!booking) { setError('Choose the booking this payment belongs to.'); return; }
    if (!Number.isFinite(value) || value <= 0) { setError('Enter an amount above zero.'); return; }
    if (!date || date > today) { setError("The date can't be in the future."); return; }

    setSaving(true);
    setError(null);
    try {
      await addCustomerPayment({
        customerId: customer.id,
        bookingId: booking.id,
        carId: booking.car_id,
        type,
        amount: value,
        date,
        description: description.trim(),
      });
      onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the payment.');
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} ariaLabel="Add payment">
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <SheetHeader className="pe-14">
          <SheetTitle>Add payment</SheetTitle>
          <SheetDescription>{customerName(customer)}</SheetDescription>
        </SheetHeader>

        <SheetBody>
          {bookings.length === 0 ? (
            <p className="text-[13.5px] text-black/55">
              Every ledger entry belongs to a booking, and this customer has none yet. Create a booking first.
            </p>
          ) : (
            <>
              <Field label="Booking">
                <Select value={bookingId} options={options} onChange={setBookingId} ariaLabel="Booking" className={SELECT_FIELD} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Type">
                  <Select value={type} options={TYPES} onChange={(value) => setType(value as PaymentType)} ariaLabel="Type" className={SELECT_FIELD} />
                </Field>
                <Field label="Amount (₺)">
                  <Input
                    autoFocus
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ''))}
                    placeholder="0"
                    className={`${FIELD} tabular-nums`}
                  />
                </Field>
                <Field label="Date">
                  <Input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} className={FIELD} />
                </Field>
                <Field label="Note">
                  <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional" className={FIELD} />
                </Field>
              </div>
            </>
          )}
          {error && <p role="alert" className="rounded-lg bg-[#DC2626]/[0.07] px-3 py-2 text-[12.5px] text-[#B91C1C]">{error}</p>}
        </SheetBody>

        <SheetFooter>
          <Button variant="secondary" size="lg" className="!h-11 md:!h-10" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="lg" className="!h-11 md:!h-10" disabled={saving || bookings.length === 0}>
            {saving && <Spinner size={13} />} Add payment
          </Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
};
