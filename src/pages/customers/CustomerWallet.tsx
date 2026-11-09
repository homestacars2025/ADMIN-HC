import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronRight, Lock, Pencil, Plus, Trash2 } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { CustomerAvatar } from '../../components/shared/PersonAvatar';
import { useCurrency } from '../../lib/CurrencyContext';
import { formatDate } from '../../lib/customers';
import {
  balanceLabel,
  balanceToMove,
  defaultTarget,
  deleteLedgerLine,
  fetchWallet,
  formatWalletMoney,
  hgsGroupSummary,
  moveBookingBalance,
  moveTargets,
  roundMoney,
  signedMoveAmount,
  walletTone,
  type HgsGroup,
  type LineKind,
  type Wallet,
  type WalletCard,
  type WalletCardLine,
  type WalletTone,
} from '../../lib/customerWallet';
import { cn } from '../../lib/media/badgeColor';
import { useCurrentProfile } from '../../hooks/useCurrentProfile';
import { useMoney } from '../../hooks/useMoney';
import { RateNote } from '../../components/shared/Money';
import { deletedMessage, deleteFailedMessage } from '../../lib/cashEnvelopes';
import { DeleteEnvelopesDialog, EnvelopeStatusChip } from '../accounting/EnvelopeDelete';
import { AddPortalHgsSheet } from './AddPortalHgsSheet';
import { AddCustomerTxModal, EditTxModal, printLedgerInvoice, type CustomerLedgerEntry } from '../accounting/CustomerLedgerForms';
import { BookingSheet, Field, FOOTER_BUTTON, INPUT, LicensePlate, PrimaryButton } from '../bookings/ui';
import { BannedBadge, CarIcon, EmptyNote, ReceiptIcon, RoadIcon, StatusPill } from './ui';

export type Notify = (message: string, type: 'success' | 'error') => void;

const TONE_TEXT: Record<WalletTone, string> = {
  credit: 'text-[#15803D]',
  owes: 'text-[#B91C1C]',
  settled: 'text-black/45',
};

const TONE_CHIP: Record<WalletTone, string> = {
  credit: 'bg-[#16A34A]/10 text-[#15803D]',
  owes: 'bg-[#DC2626]/10 text-[#B91C1C]',
  settled: 'bg-black/[0.05] text-black/50',
};

const TONE_DOT: Record<WalletTone, string> = {
  credit: 'bg-[#16A34A]',
  owes: 'bg-[#DC2626]',
  settled: 'bg-black/20',
};

/** ↔, for a balance moved between two bookings. */
export const TransferIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8h15l-3.5-3.5M20 16H5l3.5 3.5" />
  </svg>
);

/** "Owes $120.00" in the top-bar currency; "Settled" at zero. */
const useBalanceLabel = () => {
  const { format } = useMoney();
  return (balance: number) => {
    const tone = walletTone(balance);
    return tone === 'settled' ? 'Settled' : `${tone === 'credit' ? 'Credit' : 'Owes'} ${format(Math.abs(balance))}`;
  };
};

export const WalletChip: React.FC<{ balance: number; className?: string }> = ({ balance, className }) => {
  const label = useBalanceLabel();
  return (
    <span className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[12px] font-medium tabular-nums', TONE_CHIP[walletTone(balance)], className)}>
      {label(balance)}
    </span>
  );
};

const scrollToBooking = (bookingId: number) => {
  const card = document.getElementById(`wallet-booking-${bookingId}`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.focus({ preventScroll: true });
};

// ── Lines ────────────────────────────────────────────────────────────────────

const KIND_ICON: Record<LineKind, React.ReactNode> = {
  rental: <CarIcon size={14} />,
  deposit: <Lock size={13} />,
  payment: <ArrowDown size={14} />,
  hgs: <RoadIcon size={14} />,
  transfer: <TransferIcon size={14} />,
  refund: <ArrowUp size={14} />,
  other: <ReceiptIcon size={14} />,
};

const ICON_ACTION =
  'grid h-11 w-11 shrink-0 place-items-center rounded-[9px] text-black/45 transition-colors hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/35 disabled:opacity-40 md:h-8 md:w-8';

interface LineActions {
  onEdit: (line: WalletCardLine) => void;
  /** Asks first, on the line itself. */
  onDelete: (line: WalletCardLine) => Promise<void>;
  /** Admins only: deletes the payment's envelope, which takes the line and its money movements with it. */
  onDeleteEnvelope?: (line: WalletCardLine) => void;
}

/** An HGS pass reads by its route, dated with its time and toll when the line has them. */
function lineText(line: WalletCardLine): { title: React.ReactNode; detail: string } {
  if (line.hgs) {
    const when = [formatDate(line.hgs.day), line.hgs.time].filter(Boolean).join(' ');
    return { title: line.hgs.route ?? 'HGS', detail: [when, line.hgs.toll].filter(Boolean).join(' · ') };
  }
  const detail = line.kind === 'transfer' ? line.note : line.description;
  return { title: line.label, detail: [formatDate(line.created_at), detail].filter(Boolean).join(' · ') };
}

/** "+$120.00" or "−$120.00": the amount's own sign comes from IN or OUT. */
const useSignedMoney = () => {
  const { format } = useMoney();
  return (amount: number, received: boolean) => `${received ? '+' : '−'}${format(Math.abs(amount))}`;
};

const LineRow: React.FC<LineActions & { line: WalletCardLine; nested?: boolean }> = ({ line, nested, onEdit, onDelete, onDeleteEnvelope }) => {
  const signedMoney = useSignedMoney();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const received = line.direction === 'IN';
  const transfer = line.kind === 'transfer';
  const peer = line.peer;
  const text = lineText(line);
  const remove = async () => {
    setBusy(true);
    try { await onDelete(line); } finally { setBusy(false); setConfirming(false); }
  };
  return (
    <li className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5', nested && 'ps-4 sm:ps-11')}>
      <span className={cn(
        'grid shrink-0 place-items-center rounded-full',
        nested ? 'h-6 w-6' : 'h-8 w-8',
        transfer ? 'bg-[#6EA4E7]/[0.14] text-brand-strong' : received ? 'bg-[#16A34A]/10 text-[#15803D]' : 'bg-[#DC2626]/[0.08] text-[#B91C1C]',
      )}>
        {KIND_ICON[line.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-foreground">
          {transfer && peer?.bookingNumber ? (
            <>
              {peer.direction === 'to' ? 'Moved to ' : 'Moved from '}
              {peer.bookingId !== null ? (
                <button
                  type="button"
                  onClick={() => scrollToBooking(peer.bookingId as number)}
                  className="font-mono text-brand-strong underline-offset-2 hover:underline"
                >
                  {peer.bookingNumber}
                </button>
              ) : <span className="font-mono">{peer.bookingNumber}</span>}
            </>
          ) : text.title}
        </div>
        <div className="truncate text-[12px] tabular-nums text-black/50">{text.detail}</div>
      </div>
      <div className={cn('shrink-0 font-mono text-[13.5px] font-medium tabular-nums', received ? 'text-[#15803D]' : 'text-[#B91C1C]')}>
        {signedMoney(line.amount, received)}
      </div>
      <div className="flex shrink-0 items-center">
        {confirming ? (
          <span role="group" aria-label="Delete this line?" className="inline-flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-[#B91C1C]">Delete?</span>
            <Button type="button" variant="danger" size="sm" className="!h-11 px-3 md:!h-8" disabled={busy} onClick={remove}>{busy ? '…' : 'Yes'}</Button>
            <Button type="button" variant="secondary" size="sm" className="!h-11 px-3 md:!h-8" disabled={busy} onClick={() => setConfirming(false)}>No</Button>
          </span>
        ) : line.editable ? (
          <>
            <button type="button" className={ICON_ACTION} aria-label="Edit transaction" title="Edit" onClick={() => onEdit(line)}><Pencil size={14} /></button>
            <button type="button" className={cn(ICON_ACTION, 'hover:bg-[#DC2626]/[0.07] hover:text-[#B91C1C]')} aria-label="Delete transaction" title="Delete" onClick={() => setConfirming(true)}><Trash2 size={14} /></button>
          </>
        ) : line.envelope ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono text-[11.5px] font-semibold text-black/60" title="Paid in with this envelope">{line.envelope.ref}</span>
            <EnvelopeStatusChip status={line.envelope.status} className="!px-1.5 !text-[11px]" />
            {onDeleteEnvelope && (
              <button
                type="button"
                className={cn(ICON_ACTION, 'hover:bg-[#DC2626]/[0.07] hover:text-[#B91C1C]')}
                aria-label={`Delete envelope ${line.envelope.ref}`}
                title="Delete the envelope and this payment"
                onClick={() => onDeleteEnvelope(line)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </span>
        ) : (
          <span
            title={transfer ? 'Half of a balance move. Move it back to undo it.' : 'Recorded with an account. Reverse it in Cash & Envelopes.'}
            className="px-1 text-[11.5px] text-black/40"
          >
            Recorded
          </span>
        )}
      </div>
    </li>
  );
};

/** Every HGS line of a booking as one row, its passes underneath on demand. */
const HgsGroupRow: React.FC<LineActions & { group: HgsGroup; open: boolean; onToggle: () => void }> = ({ group, open, onToggle, onEdit, onDelete, onDeleteEnvelope }) => {
  const signedMoney = useSignedMoney();
  const { format } = useMoney();
  const received = group.net > 0;
  return (
    <li className="py-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? group.key : undefined}
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl py-2 text-start transition-colors hover:bg-black/[0.02] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/35"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#DC2626]/[0.08] text-[#B91C1C]">{KIND_ICON.hgs}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-foreground">HGS</span>
          <span className="block text-[12px] tabular-nums text-black/50 sm:truncate">{hgsGroupSummary(group)}</span>
        </span>
        <span className={cn('shrink-0 font-mono text-[13.5px] font-medium tabular-nums', group.net === 0 ? 'text-black/45' : received ? 'text-[#15803D]' : 'text-[#B91C1C]')}>
          {group.net === 0 ? format(0) : signedMoney(Math.abs(group.net), received)}
        </span>
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center text-black/40 md:h-8 md:w-[72px] md:justify-items-end md:pe-2">
          <ChevronRight size={15} strokeWidth={2} className={cn('transition-transform duration-200', open && 'rotate-90')} />
        </span>
      </button>
      {open && (
        <ul id={group.key} aria-label="HGS passes" className="mb-1 divide-y divide-black/[0.04] rounded-xl bg-black/[0.018]">
          {group.lines.map((line) => <LineRow key={line.id} nested line={line} onEdit={onEdit} onDelete={onDelete} onDeleteEnvelope={onDeleteEnvelope} />)}
        </ul>
      )}
    </li>
  );
};

const LINES_SHOWN = 6;

// ── A booking ────────────────────────────────────────────────────────────────

const SOFT_BUTTON = '!h-11 flex-1 px-3.5 sm:flex-none md:!h-9';

const BookingCard: React.FC<LineActions & {
  card: WalletCard;
  canMove: boolean;
  onMove: () => void;
  onAdd: () => void;
  /** Charges the car's portal transits for the booking's days. */
  onAddHgs: () => void;
  /** With the HGS passes when they're open on screen. */
  onPrint: (hgsDetails: boolean) => void;
}> = ({ card, canMove, onMove, onAdd, onAddHgs, onPrint, onEdit, onDelete, onDeleteEnvelope }) => {
  const [all, setAll] = useState(false);
  const [hgsOpen, setHgsOpen] = useState(false);
  const tone = walletTone(card.balance);
  const entries = all ? card.entries : card.entries.slice(0, LINES_SHOWN);
  return (
    <li className="relative ps-6">
      <span aria-hidden="true" className={cn('absolute start-0 top-[22px] h-3 w-3 rounded-full ring-4 ring-[var(--surface)]', TONE_DOT[tone])} />
      <article
        id={`wallet-booking-${card.id}`}
        tabIndex={-1}
        aria-labelledby={`wallet-booking-${card.id}-title`}
        className="surface-depth scroll-mt-4 rounded-2xl border border-subtle bg-surface p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/30 sm:p-5"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={`wallet-booking-${card.id}-title`} className="font-mono text-[13.5px] font-semibold tabular-nums text-foreground">{card.bookingNumber}</h3>
              {card.active ? (
                <span className="rounded-full bg-[#6EA4E7]/[0.14] px-2 py-0.5 text-[11px] font-medium text-brand-strong">On the road</span>
              ) : card.status && card.status !== 'confirmed' && <StatusPill status={card.status} />}
            </div>
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <LicensePlate plate={card.plate} />
              {card.model && <span className="truncate text-[13px] text-black/60">{card.model}</span>}
            </div>
            <div className="mt-1 text-[12.5px] tabular-nums text-black/50">{formatDate(card.startDate)} → {formatDate(card.endDate)}</div>
          </div>
          <WalletChip balance={card.balance} />
        </header>

        {card.lines.length === 0 ? (
          <p className="mt-3 rounded-xl bg-black/[0.025] px-3 py-3 text-[12.5px] text-black/45">No money recorded on this booking yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-black/[0.05]">
            {entries.map((entry) => (entry.kind === 'hgs'
              ? <HgsGroupRow key={entry.group.key} group={entry.group} open={hgsOpen} onToggle={() => setHgsOpen((value) => !value)} onEdit={onEdit} onDelete={onDelete} onDeleteEnvelope={onDeleteEnvelope} />
              : <LineRow key={entry.line.id} line={entry.line} onEdit={onEdit} onDelete={onDelete} onDeleteEnvelope={onDeleteEnvelope} />))}
          </ul>
        )}
        {card.entries.length > LINES_SHOWN && (
          <button
            type="button"
            onClick={() => setAll((value) => !value)}
            className="mt-1 min-h-[44px] text-[12.5px] font-medium text-brand-strong hover:underline md:min-h-[32px]"
          >
            {all ? 'Show fewer entries' : `Show all ${card.entries.length} entries`}
          </button>
        )}

        {card.carNotes.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1">
            {card.carNotes.map((note) => (
              <li key={note.key} className="flex items-center gap-1.5 text-[12px] text-black/55">
                <CarIcon size={13} />
                <span className="min-w-0 truncate">{note.text}{note.date && ` on ${formatDate(note.date)}`}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-subtle pt-3">
          {canMove && (
            <Button type="button" variant="secondary" size="lg" className={SOFT_BUTTON} onClick={onMove}>
              <TransferIcon size={14} /> Move balance
            </Button>
          )}
          <Button type="button" variant="secondary" size="lg" className={SOFT_BUTTON} onClick={onAdd}>
            <Plus size={14} /> Add Transaction
          </Button>
          {card.status !== 'cancelled' && (
            <Button type="button" variant="secondary" size="lg" className={SOFT_BUTTON} onClick={onAddHgs} title="HGS güncelle: charge this booking's portal transits">
              <Plus size={14} /> Add HGS
            </Button>
          )}
          {card.lines.length > 0 && (
            <Button type="button" variant="secondary" size="lg" className={SOFT_BUTTON} onClick={() => onPrint(hgsOpen)}>
              <PrinterIcon /> Print invoice
            </Button>
          )}
        </div>
      </article>
    </li>
  );
};

const PrinterIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z" />
  </svg>
);

// ── The wallet ───────────────────────────────────────────────────────────────

const WalletSkeleton: React.FC = () => (
  <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading wallet">
    <div className="h-[104px] animate-pulse rounded-[20px] bg-black/[0.04]" />
    {[0, 1].map((index) => <div key={index} className="h-[180px] animate-pulse rounded-2xl bg-black/[0.04]" />)}
  </div>
);

export const WalletHero: React.FC<{ wallet: Wallet; action?: React.ReactNode }> = ({ wallet, action }) => {
  const { format } = useMoney();
  const tone = walletTone(wallet.total);
  const count = wallet.cards.length;
  return (
    <section aria-label="Wallet balance" className="surface-depth flex flex-col gap-4 rounded-[20px] border border-subtle bg-surface p-4 sm:flex-row sm:items-center sm:p-6">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <CustomerAvatar alt={wallet.name} size={52} style={{ border: '1px solid var(--border-subtle)' }} />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-[16px] font-medium tracking-[-0.01em] text-foreground">{wallet.name}</span>
            {wallet.customer.is_banned && <BannedBadge reason={wallet.customer.ban_reason} />}
          </div>
          <div className="text-[12.5px] text-black/50">Across {count} {count === 1 ? 'booking' : 'bookings'}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 sm:justify-end">
        <div className="sm:text-end">
          <div className="text-[12px] text-black/45">Total balance</div>
          <div className={cn('text-[26px] font-semibold leading-tight tracking-[-0.02em] tabular-nums sm:text-[32px]', TONE_TEXT[tone])}>
            {tone === 'settled' ? 'Settled' : <>{tone === 'credit' ? 'Credit' : 'Owes'} <span className="font-mono">{format(Math.abs(wallet.total))}</span></>}
          </div>
          <RateNote className="mt-0.5" />
        </div>
        {action}
      </div>
    </section>
  );
};

/** Shapes a wallet line for the old Edit form, which takes a ledger row. */
const asLedgerEntry = (line: WalletCardLine, customerId: string) => ({
  id: line.id,
  booking_id: line.booking_id,
  customer_id: customerId,
  car_id: line.car_id,
  type: line.type,
  description: line.description,
  amount: line.amount,
  direction: line.direction,
  created_at: line.created_at ?? new Date().toISOString(),
  created_by: null,
  transaction_type: null,
  pay_method: line.pay_method ?? null,
  customers: null,
  bookings: null,
}) as unknown as CustomerLedgerEntry;

/**
 * One customer's money: a single total, then each booking with its own balance
 * and lines, each line editable through the ledger's own forms. Loads itself, and
 * again whenever `refreshKey` changes.
 */
export const CustomerWalletView: React.FC<{
  customerId: string;
  refreshKey?: number;
  notify: Notify;
  /** After anything changed. The parent refreshes, which bumps `refreshKey`. */
  onChanged: () => void;
  onAddPayment?: () => void;
  /** So a sheet this view sits in leaves Esc to a form open over it. */
  onCoverChange?: (covered: boolean) => void;
}> = ({ customerId, refreshKey = 0, notify, onChanged, onAddPayment, onCoverChange }) => {
  const { fmt } = useCurrency();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [moving, setMoving] = useState<WalletCard | null>(null);
  const [adding, setAdding] = useState<WalletCard | null>(null);
  const [editing, setEditing] = useState<WalletCardLine | null>(null);
  const [envelopeLine, setEnvelopeLine] = useState<WalletCardLine | null>(null);
  const [portalHgs, setPortalHgs] = useState<WalletCard | null>(null);
  const { profile } = useCurrentProfile();
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchWallet(customerId)
      .then((result) => {
        if (cancelled) return;
        if (result) setWallet(result);
        else setError("This customer doesn't exist.");
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Couldn't load the wallet.");
      });
    return () => { cancelled = true; };
  }, [customerId, refreshKey, attempt]);

  const covered = moving !== null || adding !== null || editing !== null || envelopeLine !== null || portalHgs !== null;
  useEffect(() => { onCoverChange?.(covered); }, [covered, onCoverChange]);

  const deleteLine = useCallback(async (line: WalletCardLine) => {
    try {
      await deleteLedgerLine(line.id);
      notify('Transaction deleted', 'success');
      onChanged();
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : 'The transaction was not deleted.', 'error');
    }
  }, [notify, onChanged]);

  if (error && !wallet) {
    return (
      <div role="alert" className="rounded-2xl border border-subtle bg-surface p-8 text-center">
        <p className="text-[14px] text-foreground">Couldn't load the wallet.</p>
        <p className="mt-1 text-[12.5px] text-black/45">{error}</p>
        <Button type="button" size="lg" className="mt-4 !h-11 md:!h-10" onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
      </div>
    );
  }
  if (!wallet) return <WalletSkeleton />;

  const [firstName, ...lastNames] = wallet.name.split(' ');
  const print = (card: WalletCard, hgsDetails: boolean) => printLedgerInvoice({
    bookingNumber: card.bookingNumber,
    first_name: wallet.customer.first_name ?? firstName,
    last_name: wallet.customer.last_name ?? lastNames.join(' '),
    phone: wallet.customer.phone ?? null,
    nationality: wallet.customer.nationality ?? null,
    id_number: wallet.customer.id_number ?? null,
    entries: card.lines.map((line) => ({ ...line, created_at: line.created_at ?? '' })),
    totalIn: card.lines.filter((line) => line.direction === 'IN').reduce((sum, line) => sum + line.amount, 0),
    totalOut: card.lines.filter((line) => line.direction === 'OUT').reduce((sum, line) => sum + line.amount, 0),
  }, { plate_number: card.plate ?? '—', model_name: card.model ?? '—' }, fmt, { hgsDetails });

  return (
    <div className="flex flex-col gap-4">
      <WalletHero
        wallet={wallet}
        action={onAddPayment && (
          <Button type="button" size="lg" className="!h-11 px-4 md:!h-10" onClick={onAddPayment}><Plus size={14} /> Add payment</Button>
        )}
      />

      {wallet.cards.length === 0 ? (
        <div className="rounded-2xl border border-subtle bg-surface"><EmptyNote>No bookings for this customer yet.</EmptyNote></div>
      ) : (
        <ol aria-label="Bookings, newest first" className="relative flex flex-col gap-3 before:absolute before:bottom-6 before:start-[5px] before:top-6 before:w-px before:bg-black/[0.08]">
          {wallet.cards.map((card) => (
            <BookingCard
              key={card.id}
              card={card}
              canMove={walletTone(card.balance) !== 'settled' && moveTargets(wallet, card.id).length > 0}
              onMove={() => setMoving(card)}
              onAdd={() => setAdding(card)}
              onAddHgs={() => setPortalHgs(card)}
              onPrint={(hgsDetails) => print(card, hgsDetails)}
              onEdit={setEditing}
              onDelete={deleteLine}
              onDeleteEnvelope={isAdmin ? setEnvelopeLine : undefined}
            />
          ))}
        </ol>
      )}

      {portalHgs && (
        <AddPortalHgsSheet
          card={portalHgs}
          onClose={() => setPortalHgs(null)}
          onPosted={(message) => { notify(message, 'success'); onChanged(); }}
        />
      )}

      {envelopeLine?.envelope && (
        <DeleteEnvelopesDialog
          envelopes={[{
            ...envelopeLine.envelope,
            booking_number: wallet.cards.find((card) => card.lines.some((line) => line.id === envelopeLine.id))?.bookingNumber ?? null,
            customer: wallet.name,
          }]}
          onClose={() => setEnvelopeLine(null)}
          onDone={(outcome) => {
            setEnvelopeLine(null);
            const success = deletedMessage(outcome.deleted);
            const failure = deleteFailedMessage(outcome.failed);
            if (success) notify(success, 'success');
            if (failure) notify(failure, 'error');
            if (outcome.deleted.length > 0) onChanged();
          }}
        />
      )}

      {moving && (
        <MoveBalanceSheet
          from={moving}
          targets={moveTargets(wallet, moving.id)}
          initialTargetId={defaultTarget(moveTargets(wallet, moving.id))?.id ?? null}
          onClose={() => setMoving(null)}
          onMoved={(message) => { notify(message, 'success'); onChanged(); }}
        />
      )}
      {adding && (
        <AddCustomerTxModal
          customerName={wallet.name}
          customerId={wallet.customerId}
          carId={adding.carId}
          bookingId={adding.id}
          bookingLabel={`${adding.bookingNumber} · ${formatDate(adding.startDate)} → ${formatDate(adding.endDate)}`}
          carPlate={adding.plate ?? undefined}
          onClose={() => setAdding(null)}
          onSaved={() => { notify('Transaction added', 'success'); onChanged(); }}
        />
      )}
      {editing && (
        <EditTxModal
          entry={asLedgerEntry(editing, wallet.customerId)}
          onClose={() => setEditing(null)}
          onSaved={() => { notify('Transaction updated', 'success'); onChanged(); }}
        />
      )}
    </div>
  );
};

// ── Move balance ─────────────────────────────────────────────────────────────

const plainAmount = (value: number) => String(roundMoney(Math.abs(value)));

export const MoveBalanceSheet: React.FC<{
  from: WalletCard;
  targets: WalletCard[];
  initialTargetId: number | null;
  onClose: () => void;
  onMoved: (message: string) => void;
}> = ({ from, targets, initialTargetId, onClose, onMoved }) => {
  const startTarget = targets.some((card) => card.id === initialTargetId) ? initialTargetId : targets[0]?.id ?? null;
  const [targetId, setTargetId] = useState<number | null>(startTarget);
  const [amount, setAmount] = useState(plainAmount(from.balance));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tone = walletTone(from.balance);
  const target = targets.find((card) => card.id === targetId) ?? null;
  const check = signedMoveAmount(from.balance, amount);
  const dirty = amount !== plainAmount(from.balance) || note.trim() !== '' || targetId !== startTarget;
  const preview = useMemo(() => (check.ok && target ? {
    from: roundMoney(from.balance - check.amount),
    to: roundMoney(target.balance + check.amount),
  } : null), [check, from.balance, target]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (saving) return;
    if (!target) { setError('Choose the booking to move it to.'); return; }
    if (!check.ok) { setError(check.error); return; }
    setSaving(true);
    setError(null);
    try {
      await moveBookingBalance({ fromId: from.id, toId: target.id, amount: check.amount, note });
      onMoved(`Moved ${formatWalletMoney(Math.abs(check.amount))} to ${target.bookingNumber}`);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The balance was not moved. Try again.');
      setSaving(false);
    }
  };

  return (
    <BookingSheet
      narrow
      label="Move balance"
      title="Move balance"
      badge={<span className="rounded-md bg-black/[0.05] px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums text-foreground">{from.bookingNumber}</span>}
      subtitle={[from.plate, `${formatDate(from.startDate)} → ${formatDate(from.endDate)}`].filter(Boolean).join(' · ')}
      dirty={dirty}
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
      footer={(requestClose) => (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" size="lg" className={cn(FOOTER_BUTTON, 'flex-1 px-4 sm:flex-none')} onClick={requestClose}>Cancel</Button>
          <PrimaryButton saving={saving} disabled={!target || !check.ok}>
            {check.ok ? `Move ${formatWalletMoney(Math.abs(check.amount))}` : 'Move'}
          </PrimaryButton>
        </div>
      )}
    >
      <section className="surface-depth rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
        <div className="text-[12.5px] text-black/50">Balance</div>
        <div className={cn('mt-0.5 text-[26px] font-semibold leading-tight tracking-[-0.02em] tabular-nums', TONE_TEXT[tone])}>
          {formatWalletMoney(Math.abs(from.balance))}
          <span className="ms-2 text-[14px] font-medium">{tone === 'credit' ? 'credit' : 'owes'}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-black/50">
          {tone === 'credit' ? 'Money the customer has with us on this booking.' : 'What the customer still owes on this booking.'}
        </p>
      </section>

      <fieldset className="surface-depth min-w-0 rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
        <legend className="sr-only">Move it to</legend>
        <div aria-hidden="true" className="mb-2.5 text-[13px] font-semibold text-foreground">Move it to</div>
        <div className="flex flex-col gap-2">
          {targets.map((card) => {
            const checked = card.id === targetId;
            return (
              <label
                key={card.id}
                className={cn(
                  'flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                  checked ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.07]' : 'border-subtle hover:bg-black/[0.02]',
                )}
              >
                <input
                  type="radio"
                  name="move-target"
                  value={card.id}
                  checked={checked}
                  onChange={() => { setTargetId(card.id); setError(null); }}
                  className="h-4 w-4 shrink-0 accent-[#4ba6ea]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{card.bookingNumber}</span>
                    {card.active && <span className="rounded-full bg-[#6EA4E7]/[0.14] px-2 py-0.5 text-[11px] font-medium text-brand-strong">On the road</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] tabular-nums text-black/50">
                    {[card.plate, `${formatDate(card.startDate)} → ${formatDate(card.endDate)}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <WalletChip balance={card.balance} />
              </label>
            );
          })}
        </div>
      </fieldset>

      <section className="surface-depth grid grid-cols-1 gap-3.5 rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
        <Field label="Amount" hint={`Up to ${formatWalletMoney(Math.abs(from.balance))}`}>
          <div className="relative">
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[14px] text-black/40">₺</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              aria-label="Amount"
              value={amount}
              onChange={(event) => { setAmount(event.target.value); setError(null); }}
              className={cn(INPUT, 'ps-7 tabular-nums')}
            />
          </div>
        </Field>
        <Field label="Note">
          <input
            type="text"
            aria-label="Note"
            value={note}
            maxLength={200}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional"
            className={INPUT}
          />
        </Field>
        {preview && target && (
          <dl className="grid grid-cols-1 gap-1.5 rounded-xl bg-black/[0.025] px-3 py-2.5 text-[12.5px] sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 sm:block">
              <dt className="font-mono text-black/50">{from.bookingNumber}</dt>
              <dd className={cn('font-medium tabular-nums', TONE_TEXT[walletTone(preview.from)])}>{balanceLabel(preview.from)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2 sm:block">
              <dt className="font-mono text-black/50">{target.bookingNumber}</dt>
              <dd className={cn('font-medium tabular-nums', TONE_TEXT[walletTone(preview.to)])}>{balanceLabel(preview.to)}</dd>
            </div>
          </dl>
        )}
        {error && <p role="alert" className="text-[12.5px] text-[#B91C1C]">{error}</p>}
      </section>
    </BookingSheet>
  );
};

// ── The nudge after a new booking or an extension ────────────────────────────

/**
 * "HOM-… still has ₺X — move it to this booking?" Shows nothing while it loads,
 * or if the wallet can't be read: it's a suggestion, and the wallet itself
 * reports its own errors.
 */
export const BalanceToMoveBanner: React.FC<{
  customerId: string;
  bookingId: number;
  notify: Notify;
  onDismiss: () => void;
  className?: string;
}> = ({ customerId, bookingId, notify, onDismiss, className }) => {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [reload, setReload] = useState(0);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWallet(customerId)
      .then((result) => { if (!cancelled) setWallet(result); })
      .catch(() => { if (!cancelled) setWallet(null); });
    return () => { cancelled = true; };
  }, [customerId, reload]);

  const source = wallet ? balanceToMove(wallet, bookingId) : null;
  const target = wallet?.cards.find((card) => card.id === bookingId) ?? null;
  if (!wallet || !source || !target) return null;

  const amount = formatWalletMoney(Math.abs(source.balance));
  const targets = moveTargets(wallet, source.id);
  return (
    <div role="status" className={cn('surface-depth flex flex-col gap-3 rounded-2xl border border-[#6EA4E7]/35 bg-[#6EA4E7]/[0.07] p-3.5 sm:flex-row sm:items-center sm:p-4', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#6EA4E7]/[0.18] text-brand-strong"><TransferIcon size={16} /></span>
        <p className="min-w-0 text-[13.5px] leading-snug text-foreground">
          <span className="font-mono font-semibold">{source.bookingNumber}</span>
          {walletTone(source.balance) === 'credit' ? ` still has a credit of ${amount}` : ` still owes ${amount}`}
          {' — move it to '}
          <span className="font-mono font-semibold">{target.bookingNumber}</span>?
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="secondary" size="lg" className="!h-11 flex-1 px-4 sm:flex-none md:!h-10" onClick={onDismiss}>Later</Button>
        <Button type="button" size="lg" className="!h-11 flex-1 px-4 sm:flex-none md:!h-10" disabled={targets.length === 0} onClick={() => setMoving(true)}>Move</Button>
      </div>
      {moving && (
        <MoveBalanceSheet
          from={source}
          targets={targets}
          initialTargetId={bookingId}
          onClose={() => setMoving(false)}
          onMoved={(message) => { notify(message, 'success'); setReload((value) => value + 1); }}
        />
      )}
    </div>
  );
};

/** The wallet in a side sheet, for Accounting's list of customers. */
export const CustomerWalletSheet: React.FC<{
  customerId: string;
  refreshKey: number;
  notify: Notify;
  onChanged: () => void;
  onClose: () => void;
}> = ({ customerId, refreshKey, notify, onChanged, onClose }) => {
  const [moveOpen, setMoveOpen] = useState(false);
  return (
    <BookingSheet
      wide
      label="Customer wallet"
      title="Wallet"
      paused={moveOpen}
      dirty={false}
      saving={false}
      onClose={onClose}
      onSubmit={(event) => event.preventDefault()}
      footer={(requestClose) => (
        <div className="flex items-center justify-end gap-2">
          <Link
            to={`/dashboard/customers/${customerId}`}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-[10px] px-4 text-[13px] font-semibold text-brand-strong hover:bg-[#6EA4E7]/[0.08] sm:flex-none md:h-10"
          >
            Open customer
          </Link>
          <Button type="button" size="lg" className={cn(FOOTER_BUTTON, 'flex-1 px-4 sm:flex-none')} onClick={requestClose}>Done</Button>
        </div>
      )}
    >
      <CustomerWalletView customerId={customerId} refreshKey={refreshKey} notify={notify} onChanged={onChanged} onCoverChange={setMoveOpen} />
    </BookingSheet>
  );
};
