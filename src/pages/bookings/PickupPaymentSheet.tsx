import React, { useState } from 'react';
import { Button, Sheet, SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Spinner } from '../../components/media/MediaUI';
import { parseAmount } from '../../lib/bookingForm';
import { useCurrency } from '../../lib/CurrencyContext';
import { formatMoney } from '../../lib/money';
import { envelopeReceipt, NEW_PAYMENT, paymentProblem, recordCustomerPayment, showEnvelopes, type PaymentChoice } from '../../lib/payments';
import { Field } from './ui';
import { CurrencyField, PaymentAmount, PaymentMethod, usePaymentAccounts } from './PaymentFields';

/** Opens once a pickup's charges are posted, for whatever the customer pays there and then. */
export const PickupPaymentSheet: React.FC<{
  bookingId: number;
  charged: number;
  onClose: () => void;
  onSaved: () => void;
}> = ({ bookingId, charged, onClose, onSaved }) => {
  const [amount, setAmount] = useState(String(charged));
  const [choice, setChoice] = useState<PaymentChoice>(NEW_PAYMENT);
  const accounts = usePaymentAccounts();
  const { rates } = useCurrency();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const value = parseAmount(amount);
  const problem = value > 0 ? paymentProblem(choice, accounts.list, rates) : null;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || problem) return;
    if (value <= 0) { onClose(); return; }

    setSaving(true);
    setError(null);
    try {
      const result = await recordCustomerPayment({ bookingId, type: 'payment', amount: value, choice, note: 'Pickup settlement' });
      showEnvelopes(envelopeReceipt(result));
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the payment.');
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} ariaLabel="Pickup settlement">
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <SheetHeader className="pe-14">
          <SheetTitle>Pickup settlement</SheetTitle>
          <SheetDescription>{formatMoney(charged)} was charged to the customer's wallet. Record what they paid now.</SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PaymentAmount label="Amount" value={amount} currency={choice.currency} onChange={setAmount} />
            <Field label="Currency">
              <CurrencyField value={choice.currency} onChange={(currency) => setChoice({ ...choice, currency })} />
            </Field>
            {value > 0 && <PaymentMethod choice={choice} accounts={accounts} onChange={setChoice} />}
          </div>
          {error && <p role="alert" className="rounded-lg bg-[#DC2626]/[0.07] px-3 py-2 text-[12.5px] text-[#B91C1C]">{error}</p>}
        </SheetBody>

        <SheetFooter>
          <Button variant="secondary" size="lg" className="!h-11 md:!h-10" disabled={saving} onClick={onClose}>Not paid yet</Button>
          <Button type="submit" size="lg" className="!h-11 md:!h-10" disabled={saving || Boolean(problem)}>
            {saving && <Spinner size={13} />} Record payment
          </Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
};
