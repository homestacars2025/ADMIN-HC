import React, { useEffect, useId, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { AlertTriangle } from '../../components/media/MediaIcons';
import { Button, Spinner } from '../../components/media/MediaUI';
import { formatDate } from '../../lib/customers';
import { deleteHgsBatch, hgsDeleteScope, type HgsDeleteResult, type WalletCardLine } from '../../lib/customerWallet';
import { formatInCurrency } from '../../lib/money';
import { INPUT } from '../bookings/ui';

/** Lira only, as HGS is charged and stored. */
const lira = (amount: number) => formatInCurrency(amount, 'TRY');

/**
 * Asks before `delete_customer_hgs_batch` removes a booking's HGS charges in one go:
 * all of them (`eventNo` null) or one portal batch. Shows how many, how much and which
 * days, takes an optional reason, and frees the portal transits for another Apply.
 */
export const DeleteHgsDialog: React.FC<{
  bookingId: number;
  bookingNumber: string;
  /** The batch; null deletes every HGS charge of the booking. */
  eventNo: number | null;
  /** When the batch was added, for its title. */
  addedAt?: string | null;
  /** The lines in scope: the booking's HGS lines, or the batch's. */
  lines: WalletCardLine[];
  onClose: () => void;
  onDeleted: (result: HgsDeleteResult) => void;
}> = ({ bookingId, bookingNumber, eventNo, addedAt, lines, onClose, onDeleted }) => {
  const scope = hgsDeleteScope(lines);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const reasonId = useId();

  useEffect(() => { cancelRef.current?.focus(); }, []);

  // Captured on window first, so Escape closes this and not the wallet sheet under it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      event.preventDefault();
      if (!pending) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pending, onClose]);

  const confirm = async () => {
    if (pending || scope.count === 0) return;
    setPending(true);
    setError(null);
    try {
      onDeleted(await deleteHgsBatch(bookingId, eventNo, reason));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The HGS entries were not deleted.');
      setPending(false);
    }
  };

  const days = !scope.first || !scope.last
    ? '—'
    : scope.first === scope.last ? formatDate(scope.first) : `${formatDate(scope.first)} → ${formatDate(scope.last)}`;

  return ReactDOM.createPortal(
    <div className="media-scope fixed inset-0 z-[10003] flex items-end justify-center p-3 sm:items-center sm:p-5">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" style={{ animation: 'm-fade-in 150ms ease-out' }} onClick={() => !pending && onClose()} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-[420px] rounded-2xl bg-white p-5 shadow-[0_24px_64px_-16px_rgb(0_0_0/0.3)] sm:p-6"
        style={{ animation: 'm-pop-in 160ms ease-out' }}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#d4183d]/[0.09]">
          <AlertTriangle size={20} strokeWidth={1.75} className="text-[#d4183d]" />
        </div>
        <h2 id={titleId} className="mt-4 text-[15px] font-semibold tracking-[-0.014em] text-black/85">
          {eventNo == null ? 'Delete all HGS entries of this booking?' : 'Delete this HGS batch?'}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-black/50">
          {eventNo == null
            ? <>Every HGS charge on <span className="font-mono text-black/70">{bookingNumber}</span>, from the portal and typed by hand.</>
            : <>The portal batch added {addedAt ? `on ${formatDate(addedAt)} ` : ''}to <span className="font-mono text-black/70">{bookingNumber}</span>.</>}
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-black/[0.03] p-3 text-[12px]">
          <div className="min-w-0">
            <dt className="text-black/45">Entries</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{scope.count}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-black/45">Total</dt>
            <dd className="mt-0.5 font-mono font-semibold tabular-nums text-[#B91C1C]">{lira(scope.total)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-black/45">Dates</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-foreground">{days}</dd>
          </div>
        </dl>

        <label htmlFor={reasonId} className="mt-4 block text-[12.5px] font-medium text-black/65">
          Reason <span className="font-normal text-black/40">(optional)</span>
        </label>
        <input
          id={reasonId}
          className={`${INPUT} mt-1.5`}
          value={reason}
          maxLength={300}
          disabled={pending}
          placeholder="e.g. charged to the wrong booking"
          onChange={(event) => setReason(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void confirm(); } }}
        />
        <p className="mt-2 text-[12px] leading-relaxed text-black/45">
          Their portal transits come back to "Add HGS from portal". Each line stays in Deleted entries.
        </p>

        {error && <p role="alert" className="mt-3 rounded-xl bg-[#DC2626]/[0.06] px-3 py-2 text-[12.5px] text-[#B91C1C]">{error}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} type="button" variant="outline" size="lg" className="!h-11 md:!h-10" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="button" variant="danger" size="lg" className="!h-11 md:!h-10" onClick={confirm} disabled={pending || scope.count === 0}>
            {pending && <Spinner size={13} />}
            {pending ? 'Deleting…' : `Delete ${scope.count} ${scope.count === 1 ? 'entry' : 'entries'}`}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
