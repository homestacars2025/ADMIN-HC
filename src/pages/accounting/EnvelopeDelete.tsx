import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, Trash2 } from '../../components/media/MediaIcons';
import { Button, Sheet, SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Spinner } from '../../components/media/MediaUI';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { ageLabel, deleteEnvelopes, ENVELOPE_LABELS, totalsByCurrency, type DeleteOutcome, type Envelope, type EnvelopeStatus } from '../../lib/cashEnvelopes';
import { formatDate, istanbulDate } from '../../lib/customers';
import { formatMoney } from '../../lib/money';
import type { ProfileOption } from '../../lib/notifications';
import { LicensePlate } from '../bookings/ui';

/**
 * Deleting envelopes, for admins clearing out test or wrong ones. The database
 * checks the admin too, and takes the customer payment line and the movements
 * with the envelope, so the confirm spells out exactly which ones go.
 */

const WARNING = 'This permanently deletes the envelope, its customer payment line and its money movements. This cannot be undone.';
/** An envelope admin already received has moved on to the safe and the admin account, so deleting it reaches further. */
export const WITH_ADMIN_WARNING = 'This envelope was already received by admin — deleting removes the payment from the customer wallet, the safe and the admin account.';
const FOOTER = '!h-11 md:!h-10';

export const ENVELOPE_STATUS_PILL: Record<EnvelopeStatus, string> = {
  with_employee: 'bg-[#F59E0B]/[0.16] text-[#92400E]',
  in_safe: 'bg-[#14B8A6]/15 text-[#115E59]',
  with_admin: 'bg-[#16A34A]/10 text-[#15803D]',
  cancelled: 'bg-black/[0.06] text-black/50',
};

export const EnvelopeStatusChip: React.FC<{ status: EnvelopeStatus; className?: string }> = ({ status, className }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ${ENVELOPE_STATUS_PILL[status]} ${className ?? ''}`}>
    {ENVELOPE_LABELS[status]}
  </span>
);

/** What the confirm needs; the wallet has fewer facts than Cash & Envelopes, and the missing ones read as a dash. */
export type DeletableEnvelope = Pick<Envelope, 'id' | 'ref' | 'status' | 'amount' | 'currency'>
  & Partial<Pick<Envelope, 'counted_amount' | 'booking_number' | 'customer' | 'created_by' | 'created_at'>>;

const personName = (people: Record<string, ProfileOption>, id: string | null | undefined) => (id ? people[id]?.full_name ?? null : null);
const envelopeAmount = (envelope: DeletableEnvelope) => formatMoney(envelope.counted_amount ?? envelope.amount, envelope.currency);

export const DeleteIconButton: React.FC<{ envelope: Pick<Envelope, 'ref'>; onClick: () => void }> = ({ envelope, onClick }) => (
  <button
    type="button"
    title="Delete"
    aria-label={`Delete ${envelope.ref}`}
    onClick={onClick}
    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-black/40 transition-colors hover:bg-[#d4183d]/[0.08] hover:text-[#d4183d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4183d]/40 xl:h-8 xl:w-8"
  >
    <Trash2 size={16} />
  </button>
);

const Facts: React.FC<{ envelope: DeletableEnvelope; people: Record<string, ProfileOption> }> = ({ envelope, people }) => (
  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
    <dt className="text-black/45">Booking</dt>
    <dd className="truncate font-mono text-black/75">{envelope.booking_number ?? '—'}</dd>
    <dt className="text-black/45">Customer</dt>
    <dd className="truncate text-black/75">{envelope.customer ?? '—'}</dd>
    <dt className="text-black/45">Created by</dt>
    <dd className="truncate text-black/75">{personName(people, envelope.created_by) ?? '—'}</dd>
    <dt className="text-black/45">Date</dt>
    <dd className="tabular-nums text-black/75">{envelope.created_at ? formatDate(istanbulDate(envelope.created_at)) : '—'}</dd>
    <dt className="text-black/45">Status</dt>
    <dd><EnvelopeStatusChip status={envelope.status} className="!text-[11.5px]" /></dd>
  </dl>
);

export const DeleteEnvelopesDialog: React.FC<{
  envelopes: DeletableEnvelope[];
  people?: Record<string, ProfileOption>;
  onClose: () => void;
  onDone: (outcome: DeleteOutcome) => void;
}> = ({ envelopes, people = {}, onClose, onDone }) => {
  const [reason, setReason] = useState('');
  const received = envelopes.filter((envelope) => envelope.status === 'with_admin').length;
  const [done, setDone] = useState<number | null>(null);
  const pending = done !== null;
  const single = envelopes.length === 1;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pending, onClose]);

  const confirm = async () => {
    setDone(0);
    onDone(await deleteEnvelopes(envelopes, reason.trim() || null, setDone));
  };

  const title = single ? `Delete ${envelopes[0].ref}?` : `Delete ${envelopes.length} envelopes?`;
  const totals = totalsByCurrency(envelopes.map((envelope) => ({ currency: envelope.currency, amount: envelope.counted_amount ?? envelope.amount })));

  return ReactDOM.createPortal(
    <div className="media-scope fixed inset-0 z-[10003] flex items-end justify-center p-3 sm:items-center sm:p-5">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" style={{ animation: 'm-fade-in 150ms ease-out' }} onClick={() => !pending && onClose()} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[calc(100dvh-24px)] w-full max-w-[440px] flex-col rounded-2xl bg-white p-5 shadow-[0_24px_64px_-16px_rgb(0_0_0/0.3)] sm:p-6"
        style={{ animation: 'm-pop-in 160ms ease-out' }}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#d4183d]/[0.09]">
            <AlertTriangle size={20} strokeWidth={1.75} className="text-[#d4183d]" />
          </span>
          <p className="text-[15px] font-semibold tracking-[-0.014em] text-black/85">{title}</p>
        </div>

        <ul className="mt-4 min-h-0 flex-1 divide-y divide-black/[0.06] overflow-y-auto rounded-xl border border-black/[0.08]">
          {envelopes.map((envelope) => (
            <li key={envelope.id} className="px-3 py-2.5">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="font-mono text-[13px] font-semibold text-foreground">{envelope.ref}</span>
                <span className="whitespace-nowrap text-[14px] font-semibold tabular-nums text-foreground">{envelopeAmount(envelope)}</span>
              </div>
              <Facts envelope={envelope} people={people} />
            </li>
          ))}
        </ul>
        {!single && (
          <p className="mt-2 text-end text-[12.5px] text-black/55">
            Total <span className="font-semibold tabular-nums text-foreground">{totals.map((row) => formatMoney(row.total, row.currency)).join(' · ') || formatMoney(0)}</span>
          </p>
        )}

        {received > 0 && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-[#d4183d]/25 bg-[#d4183d]/[0.06] px-3 py-2.5 text-[13px] font-medium leading-relaxed text-[#9F1239]">
            <AlertTriangle size={15} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>
              {single || received === envelopes.length ? '' : `${received} of these ${envelopes.length} envelopes ${received === 1 ? 'was' : 'were'} already received by admin. `}
              {single ? WITH_ADMIN_WARNING : received === envelopes.length ? WITH_ADMIN_WARNING.replace('This envelope was', 'These envelopes were') : 'Deleting removes their payments from the customer wallet, the safe and the admin account.'}
            </span>
          </div>
        )}

        <p className="mt-3 text-[13px] leading-relaxed text-black/60">{WARNING}</p>

        <label className="mt-3 block text-[13px] font-medium text-foreground">
          Reason <span className="font-normal text-black/40">(optional)</span>
          <input
            value={reason}
            disabled={pending}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Test envelope, wrong amount…"
            className="mt-1.5 h-11 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-normal outline-none placeholder:text-black/30 focus:border-[#6EA4E7] focus:ring-[3px] focus:ring-[#6EA4E7]/25 md:h-10"
          />
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" size="lg" className={FOOTER} onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="danger" size="lg" className={`${FOOTER} px-4`} onClick={confirm} disabled={pending}>
            {pending ? <><Spinner size={13} /> {single ? 'Deleting…' : `Deleting ${Math.min(done + 1, envelopes.length)} of ${envelopes.length}…`}</> : 'Delete'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const EnvelopeDetailSheet: React.FC<{
  envelope: Envelope;
  people: Record<string, ProfileOption>;
  accountName: string | null;
  now: number;
  canDelete: boolean;
  onClose: () => void;
  onDelete: () => void;
}> = ({ envelope, people, accountName, now, canDelete, onClose, onDelete }) => {
  const holder = personName(people, envelope.holder_profile_id);
  const rows: Array<[string, React.ReactNode]> = [
    ['Status', `${ENVELOPE_LABELS[envelope.status]} · ${ageLabel(envelope.created_at, now)}`],
    ['Staff', holder ? <span className="flex items-center justify-end gap-2"><StaffAvatar profile={people[envelope.holder_profile_id ?? '']} size={22} />{holder}</span> : '—'],
    ['Account', accountName ?? '—'],
    ['Booking', envelope.booking_number ? <span className="font-mono">{envelope.booking_number}</span> : '—'],
    ['Customer', envelope.customer && envelope.customer_id ? <Link to={`/dashboard/customers/${envelope.customer_id}`} className="text-primary hover:underline">{envelope.customer}</Link> : envelope.customer ?? '—'],
    ['Car', envelope.plate ? <LicensePlate plate={envelope.plate} /> : '—'],
    ['Created by', personName(people, envelope.created_by) ?? '—'],
    ['Created', formatDate(istanbulDate(envelope.created_at))],
  ];
  if (envelope.counted_amount !== null) rows.push(['Counted', formatMoney(envelope.counted_amount, envelope.currency)]);
  if (envelope.difference) rows.push(['Difference', `${envelope.difference > 0 ? '+' : ''}${formatMoney(envelope.difference, envelope.currency)}${envelope.difference_note ? ` · ${envelope.difference_note}` : ''}`]);
  if (envelope.note) rows.push(['Note', envelope.note]);

  return (
    <Sheet open onClose={onClose} ariaLabel={`Envelope ${envelope.ref}`} maxWidthClass="sm:max-w-[440px]">
      <SheetHeader>
        <SheetTitle><span className="font-mono">{envelope.ref}</span></SheetTitle>
        <SheetDescription>Envelope details</SheetDescription>
      </SheetHeader>
      <SheetBody>
        <div className="rounded-xl bg-black/[0.03] p-4 text-center">
          <p className="text-[26px] font-semibold tabular-nums text-foreground">{formatMoney(envelope.amount, envelope.currency)}</p>
        </div>
        <dl className="divide-y divide-black/[0.06] text-[13.5px]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex min-h-[44px] items-center justify-between gap-4 py-2">
              <dt className="shrink-0 text-black/50">{label}</dt>
              <dd className="min-w-0 break-words text-end text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </SheetBody>
      <SheetFooter>
        <Button variant="outline" size="lg" className={FOOTER} onClick={onClose}>Close</Button>
        {canDelete && (
          <Button variant="danger" size="lg" className={`${FOOTER} px-4`} onClick={onDelete}>
            <Trash2 size={15} /> Delete
          </Button>
        )}
      </SheetFooter>
    </Sheet>
  );
};
