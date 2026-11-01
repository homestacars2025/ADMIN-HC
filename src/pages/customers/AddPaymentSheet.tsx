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
  bookingCar,
  customerName,
  focusBooking,
  formatDate,
  istanbulDate,
  type Customer,
  type PaymentType,
  type ProfileBooking,
} from '../../lib/customers';
import { parseAmount } from '../../lib/bookingForm';
import { useCurrency } from '../../lib/CurrencyContext';
import { envelopeReceipt, NEW_PAYMENT, paymentProblem, recordCustomerPayment, showEnvelopes, type PaymentChoice } from '../../lib/payments';
import { CurrencyField, PaymentAmount, PaymentMethod, usePaymentAccounts } from '../bookings/PaymentFields';

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
  const [choice, setChoice] = useState<PaymentChoice>(NEW_PAYMENT);
  const [description, setDescription] = useState('');
  const accounts = usePaymentAccounts();
  const { rates } = useCurrency();
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
    const value = parseAmount(amount);
    if (!booking) { setError('Choose the booking this payment belongs to.'); return; }
    if (value <= 0) { setError('Enter an amount above zero.'); return; }
    const problem = paymentProblem(choice, accounts, rates);
    if (problem) { setError(problem); return; }

    setSaving(true);
    setError(null);
    try {
      const result = await recordCustomerPayment({ bookingId: booking.id, type, amount: value, choice, note: description.trim() });
      showEnvelopes(envelopeReceipt(result, value, choice.currency, bookingCar(booking).plate ?? null, customerName(customer)));
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
                <Field label="Note">
                  <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional" className={FIELD} />
                </Field>
                <PaymentAmount label="Amount" required value={amount} currency={choice.currency} onChange={setAmount} />
                <Field label="Currency">
                  <CurrencyField value={choice.currency} onChange={(currency) => setChoice({ ...choice, currency })} />
                </Field>
                <PaymentMethod choice={choice} accounts={accounts} onChange={setChoice} />
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
