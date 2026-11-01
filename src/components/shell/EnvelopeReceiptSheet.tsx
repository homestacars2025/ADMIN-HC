import React, { useRef, useState, useSyncExternalStore } from 'react';
import { envelopeLines, envelopeStore, envelopeText, finishEnvelope, type EnvelopeReceipt } from '../../lib/payments';
import { cn } from '../../lib/media/badgeColor';
import { Check } from '../media/MediaIcons';
import { Button, Sheet, SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../media/MediaUI';

const NEVER_CLOSES = () => {};

const CopyButton: React.FC<{ text: string; label: string; idle?: string; className?: string }> = ({ text, label, idle = 'Copy', className }) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1800);
  };

  return (
    <Button variant="outline" size="lg" aria-label={label} className={cn('!h-11 shrink-0 px-3 text-[12.5px] md:!h-9', className)} onClick={copy}>
      {state === 'copied' ? <><Check size={14} strokeWidth={2.5} /> Copied</> : state === 'failed' ? "Couldn't copy" : idle}
    </Button>
  );
};

const Receipt: React.FC<{ receipt: EnvelopeReceipt; waiting: number }> = ({ receipt, waiting }) => (
  <>
    <SheetHeader>
      <SheetTitle>New envelope</SheetTitle>
      <SheetDescription>
        Write this information on the envelope and put it in safe {receipt.safe}.
        {waiting > 0 && ` ${waiting === 1 ? '1 more envelope' : `${waiting} more envelopes`} after this one.`}
      </SheetDescription>
    </SheetHeader>
    <SheetBody>
      <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/[0.04] p-4 text-center">
        <p className="text-[13px] font-medium text-black/55">Envelope number</p>
        <p className="mt-1 break-all font-mono text-[28px] font-bold tracking-tight text-foreground sm:text-[32px]">{receipt.ref}</p>
        <CopyButton text={receipt.ref} label={`Copy ${receipt.ref}`} className="mt-2" />
      </div>
      <dl className="divide-y divide-black/[0.06]">
        {envelopeLines(receipt).map((line) => (
          <div key={line.label} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <dt className="text-[12px] text-black/45">{line.label}</dt>
              <dd className="break-words text-[14.5px] font-medium text-foreground">{line.value || '—'}</dd>
            </div>
            {line.value && <CopyButton text={line.value} label={`Copy ${line.label.toLowerCase()}`} />}
          </div>
        ))}
      </dl>
    </SheetBody>
    <SheetFooter>
      <CopyButton text={envelopeText(receipt)} label="Copy all" idle="Copy all" />
      <Button size="lg" className="!h-11 flex-1 px-4 md:!h-10" onClick={finishEnvelope}>
        I wrote it on the envelope <Check size={14} strokeWidth={2.5} />
      </Button>
    </SheetFooter>
  </>
);

/** Lives in the layout, because the form that took the cash closes when it saves. */
export const EnvelopeReceiptSheet: React.FC = () => {
  const receipts = useSyncExternalStore(envelopeStore.subscribe, envelopeStore.snapshot);
  if (receipts.length === 0) return null;
  return (
    <Sheet open blocking onClose={NEVER_CLOSES} ariaLabel="New envelope" maxWidthClass="sm:max-w-[440px]">
      <Receipt key={receipts[0].ref} receipt={receipts[0]} waiting={receipts.length - 1} />
    </Sheet>
  );
};
