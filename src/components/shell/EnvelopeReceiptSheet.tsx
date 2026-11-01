import React, { useState, useSyncExternalStore } from 'react';
import { clearEnvelopes, envelopeStore, type EnvelopeReceipt } from '../../lib/payments';
import { formatMoney } from '../../lib/money';
import { LicensePlate } from '../../pages/bookings/ui';
import { Check } from '../media/MediaIcons';
import { Button, Sheet, SheetBody, SheetFooter, SheetHeader, SheetTitle } from '../media/MediaUI';

const Receipt: React.FC<{ receipt: EnvelopeReceipt }> = ({ receipt }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(receipt.ref);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Blocked clipboard: the number is on screen, big enough to copy by hand.
    }
  };

  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/[0.04] p-4 text-center">
      <p className="text-[13px] font-medium text-black/55">Write this number on the envelope</p>
      <p className="mt-1 break-all font-mono text-[28px] font-bold tracking-tight text-foreground sm:text-[32px]">{receipt.ref}</p>
      <p className="mt-1 text-[20px] font-semibold tabular-nums text-foreground">{formatMoney(receipt.amount, receipt.currency)}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[13.5px] text-black/60">
        {receipt.plate && <LicensePlate plate={receipt.plate} />}
        {receipt.customer && <span>{receipt.customer}</span>}
      </div>
      <Button variant="outline" size="lg" className="mt-3 !h-11 px-4 md:!h-10" onClick={copy}>
        {copied ? <><Check size={14} strokeWidth={2.5} /> Copied</> : 'Copy number'}
      </Button>
    </div>
  );
};

/** Lives in the layout, because the form that took the cash closes when it saves. */
export const EnvelopeReceiptSheet: React.FC = () => {
  const receipts = useSyncExternalStore(envelopeStore.subscribe, envelopeStore.snapshot);
  if (receipts.length === 0) return null;
  return (
    <Sheet open onClose={clearEnvelopes} ariaLabel="Envelope created" maxWidthClass="sm:max-w-[440px]">
      <SheetHeader><SheetTitle>{receipts.length === 1 ? 'Envelope created' : `${receipts.length} envelopes created`}</SheetTitle></SheetHeader>
      <SheetBody>
        {receipts.map((receipt) => <Receipt key={receipt.ref} receipt={receipt} />)}
      </SheetBody>
      <SheetFooter>
        <Button size="lg" className="!h-11 px-5 md:!h-10" onClick={clearEnvelopes}>Done</Button>
      </SheetFooter>
    </Sheet>
  );
};
