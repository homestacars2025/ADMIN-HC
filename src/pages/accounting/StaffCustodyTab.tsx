import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog, type ConfirmState } from '../../components/media/ConfirmDialog';
import { ArrowUpRight, Check, ChevronDown, X } from '../../components/media/MediaIcons';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button, Spinner } from '../../components/media/MediaUI';
import { CarThumb } from '../../components/shared/CarThumb';
import { PdfGlyph } from '../../components/shared/FileDrop';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../../components/shared/FilterTile';
import { isPdfUrl, Lightbox } from '../../components/shared/Lightbox';
import { LoadError, SearchField, SkeletonRows } from '../../components/shared/PageBits';
import { ReasonSheet } from '../../components/shared/ReasonSheet';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import { useCurrentProfile } from '../../hooks/useCurrentProfile';
import { signalTime } from '../../lib/carTracking';
import { formatDate, istanbulDate } from '../../lib/customers';
import {
  approveExpense,
  canUndo,
  employeeSummaries,
  fetchCustodyMovements,
  fetchSignatures,
  fetchSigners,
  fetchWalletBalances,
  inReviewFilter,
  isLegacy,
  postingLabel,
  postingTarget,
  rejectExpense,
  REVIEW_FILTERS,
  reviewStats,
  setSignature,
  sheetLink,
  signatureMap,
  signExpense,
  unapproveExpense,
  type EmployeeSummary,
  type PendingSummary,
  type ReconcileChoice,
  type ReviewExpense,
  type SignatureMap,
  type Signer,
  type WalletBalance,
} from '../../lib/expenseApprovals';
import { fetchFineCars, type FineCar } from '../../lib/fines';
import { cn } from '../../lib/media/badgeColor';
import { formatMoney } from '../../lib/money';
import { getAvatarProfiles, type ProfileOption } from '../../lib/notifications';
import { LicensePlate } from '../bookings/ui';
import { ClockIcon, ReceiptIcon, WalletIcon } from '../customers/ui';
import { ReconcileSheet } from './ReconcileSheet';

const expenses = (count: number) => (count === 1 ? '1 expense' : `${count} expenses`);

function statusPill(row: ReviewExpense): { label: string; className: string } {
  if (row.direction === 'IN') return { label: 'Received', className: 'bg-[#6EA4E7]/15 text-brand-strong' };
  if (isLegacy(row)) return { label: 'Approved (legacy)', className: 'bg-black/[0.06] text-black/55' };
  if (row.review_status === 'approved') return { label: 'Approved', className: 'bg-[#16A34A]/10 text-[#15803D]' };
  if (row.review_status === 'rejected') return { label: 'Rejected', className: 'bg-[#DC2626]/10 text-[#B91C1C]' };
  return { label: 'Waiting', className: 'bg-[#F59E0B]/[0.16] text-[#92400E]' };
}

const StatusPill: React.FC<{ row: ReviewExpense }> = ({ row }) => {
  const pill = statusPill(row);
  return (
    <span title={row.review_note ?? undefined} className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium', pill.className)}>
      {pill.label}
    </span>
  );
};

export const Receipt: React.FC<{ row: ReviewExpense; onOpen: (url: string) => void }> = ({ row, onOpen }) => {
  const url = row.receipt_url;
  if (!url) {
    if (row.direction === 'IN') return <span className="text-black/25">—</span>;
    return <span className="whitespace-nowrap rounded-full bg-[#F59E0B]/[0.16] px-2 py-0.5 text-[11.5px] font-medium text-[#92400E]">No receipt</span>;
  }
  return (
    <button type="button" onClick={() => onOpen(url)} aria-label="Open receipt" className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-subtle bg-black/[0.03] text-black/40 transition-opacity hover:opacity-80 xl:h-9 xl:w-9">
      {isPdfUrl(url) ? <PdfGlyph size={18} /> : <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
    </button>
  );
};

const CarCell: React.FC<{ row: ReviewExpense }> = ({ row }) => {
  if (row.direction === 'IN') return <span className="text-black/25">—</span>;
  if (!row.plate) return <span className="whitespace-nowrap rounded-md bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">Company</span>;
  return (
    <span className="flex items-center gap-2" title={row.model ?? undefined}>
      <CarThumb src={row.image} width={44} height={28} />
      <LicensePlate plate={row.plate} />
    </span>
  );
};

/** A signed cell is that person in color with a check. Only your own cell can be pressed. */
export const SignatureCell: React.FC<{ signer: Signer; signedAt: string | undefined; mine: boolean; onToggle: () => void }> = ({ signer, signedAt, mine, onToggle }) => {
  const name = signer.full_name ?? 'Signer';
  const title = signedAt ? `${name} signed ${signalTime(signedAt)}` : `${name} hasn't signed`;
  const face = signedAt ? (
    <span className="relative block">
      <StaffAvatar profile={{ ...signer, id: signer.profile_id }} alt="" size={28} />
      <span className="absolute -bottom-1 -end-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-[#16A34A] text-white"><Check size={9} strokeWidth={3.5} /></span>
    </span>
  ) : <span className="block h-7 w-7 rounded-full border-2 border-dashed border-black/15" />;

  if (!mine) return <span title={title} className="grid h-11 w-11 place-items-center xl:h-9 xl:w-9">{face}</span>;
  return (
    <button
      type="button"
      title={title}
      aria-pressed={Boolean(signedAt)}
      aria-label={signedAt ? 'Remove my signature' : 'Sign this expense'}
      onClick={onToggle}
      className="grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-primary/10 xl:h-9 xl:w-9"
    >
      {face}
    </button>
  );
};

interface RowActions {
  onReconcile: (row: ReviewExpense) => void;
  onReject: (row: ReviewExpense) => void;
  onUndo: (row: ReviewExpense) => void;
  onReceipt: (url: string) => void;
  onSign: (row: ReviewExpense) => void;
  onSelect: (row: ReviewExpense, on: boolean) => void;
}

const Actions: React.FC<{ row: ReviewExpense } & RowActions> = ({ row, onReconcile, onReject, onUndo }) => {
  const link = sheetLink(row);
  if (row.direction === 'IN') return null;
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {row.review_status === 'pending' && (
        <>
          <Button variant="ghost" size="lg" className="!h-11 px-2 text-[#B91C1C] xl:!h-8" aria-label="Reject" onClick={() => onReject(row)}><X size={14} /></Button>
          <Button size="lg" className="!h-11 px-3 xl:!h-8" onClick={() => onReconcile(row)}>Reconcile</Button>
        </>
      )}
      {link && <Link to={link} className="inline-flex min-h-[44px] items-center gap-1 whitespace-nowrap text-[13px] font-medium text-[#15803D] hover:underline xl:min-h-[32px]">Posted <ArrowUpRight size={13} /></Link>}
      {canUndo(row) && !link && <span className="whitespace-nowrap text-[12px] text-black/45">Not posted</span>}
      {canUndo(row) && <Button variant="ghost" size="lg" className="!h-11 px-2 xl:!h-8" onClick={() => onUndo(row)}>Undo approval</Button>}
    </span>
  );
};

const Amount: React.FC<{ row: ReviewExpense }> = ({ row }) => (
  <span className={cn('whitespace-nowrap font-semibold tabular-nums', row.direction === 'IN' ? 'text-[#15803D]' : 'text-foreground')}>
    {row.direction === 'IN' ? '+' : ''}{formatMoney(row.amount)}
  </span>
);

const PickBox: React.FC<{ row: ReviewExpense; selected: boolean; onSelect: RowActions['onSelect'] }> = ({ row, selected, onSelect }) => (
  row.direction === 'OUT' && row.review_status === 'pending' ? (
    <label className="-m-1.5 grid h-11 w-11 cursor-pointer place-items-center xl:h-8 xl:w-8">
      <input type="checkbox" checked={selected} aria-label={`Select expense ${formatMoney(row.amount)}`} onChange={(event) => onSelect(row, event.target.checked)} className="h-[18px] w-[18px] accent-[#4ba6ea]" />
    </label>
  ) : null
);

const Signatures: React.FC<{ row: ReviewExpense; signers: Signer[]; signed: SignatureMap; me: string | null; onSign: RowActions['onSign'] }> = ({ row, signers, signed, me, onSign }) => (
  <>
    {signers.map((signer) => (
      <SignatureCell
        key={signer.profile_id}
        signer={signer}
        signedAt={signed.get(row.id)?.get(signer.profile_id)}
        mine={signer.profile_id === me}
        onToggle={() => onSign(row)}
      />
    ))}
  </>
);

interface ListProps extends RowActions {
  rows: ReviewExpense[];
  signers: Signer[];
  signed: SignatureMap;
  me: string | null;
  selected: Set<number>;
}

const MovementTable: React.FC<ListProps> = ({ rows, signers, signed, me, selected, ...actions }) => (
  <div className="overflow-x-auto border-t border-subtle">
    {/* Fixed widths, so every employee's columns line up down the page. */}
    <table className="w-full table-fixed text-[13px]" style={{ minWidth: 960 + signers.length * 44 }}>
      <colgroup>
        <col style={{ width: 36 }} />
        <col style={{ width: 84 }} />
        <col style={{ width: 164 }} />
        <col style={{ width: 76 }} />
        <col style={{ width: 92 }} />
        <col />
        <col style={{ width: 92 }} />
        <col style={{ width: 62 }} />
        <col style={{ width: 118 }} />
        {signers.map((signer) => <col key={signer.profile_id} style={{ width: 44 }} />)}
        <col style={{ width: 156 }} />
      </colgroup>
      <thead>
        <tr className="border-b border-subtle text-[11.5px] text-black/45">
          <th scope="col"><span className="sr-only">Select</span></th>
          {['Date', 'Car', 'Category', 'Supplier', 'Description'].map((label) => <th key={label} scope="col" className="px-2 py-1.5 text-start font-medium">{label}</th>)}
          <th scope="col" className="px-2 py-1.5 text-end font-medium">Amount</th>
          <th scope="col" className="px-2 py-1.5 text-start font-medium">Receipt</th>
          <th scope="col" className="px-2 py-1.5 text-start font-medium">Status</th>
          {signers.map((signer) => (
            <th key={signer.profile_id} scope="col" title={signer.full_name ?? undefined} className="px-0.5 py-1.5">
              <span className="sr-only">{signer.full_name}</span>
              <span className="grid place-items-center"><StaffAvatar profile={{ ...signer, id: signer.profile_id }} alt="" size={24} /></span>
            </th>
          ))}
          <th scope="col"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-subtle last:border-b-0">
            <td className="ps-2"><PickBox row={row} selected={selected.has(row.id)} onSelect={actions.onSelect} /></td>
            <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-black/60">{formatDate(row.transaction_date)}</td>
            <td className="px-2 py-1.5"><CarCell row={row} /></td>
            <td className="px-2 py-1.5 text-black/60">{row.category ?? '—'}</td>
            <td className="truncate px-2 py-1.5 text-black/60" title={row.supplier ?? undefined}>{row.supplier ?? '—'}</td>
            <td className="px-2 py-1.5">
              <span className="block truncate text-foreground" title={row.description ?? undefined}>{row.description || '—'}</span>
              {row.review_status === 'rejected' && row.review_note && <span className="block truncate text-[12px] text-[#B91C1C]" title={row.review_note}>{row.review_note}</span>}
            </td>
            <td className="px-2 py-1.5 text-end"><Amount row={row} /></td>
            <td className="px-2 py-1.5"><Receipt row={row} onOpen={actions.onReceipt} /></td>
            <td className="px-2 py-1.5"><StatusPill row={row} /></td>
            {signers.map((signer) => (
              <td key={signer.profile_id} className="px-0.5">
                {row.direction === 'OUT' && (
                  <span className="grid place-items-center">
                    <SignatureCell signer={signer} signedAt={signed.get(row.id)?.get(signer.profile_id)} mine={signer.profile_id === me} onToggle={() => actions.onSign(row)} />
                  </span>
                )}
              </td>
            ))}
            <td className="px-2 py-1.5"><Actions row={row} {...actions} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const MovementCards: React.FC<ListProps> = ({ rows, signers, signed, me, selected, ...actions }) => (
  <ul className="border-t border-subtle">
    {rows.map((row) => {
      const pending = row.direction === 'OUT' && row.review_status === 'pending';
      return (
        <li key={row.id} className="border-b border-subtle px-3 py-3 last:border-b-0">
          <div className="flex items-start gap-2">
            <PickBox row={row} selected={selected.has(row.id)} onSelect={actions.onSelect} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><CarCell row={row} /><StatusPill row={row} /></div>
              <p className="mt-1.5 break-words text-[13.5px] text-foreground">{row.description || '—'}</p>
              <p className="mt-0.5 text-[12.5px] tabular-nums text-black/50">
                {[formatDate(row.transaction_date), row.category, row.supplier].filter(Boolean).join(' · ')}
              </p>
              {pending && <p className="mt-1 text-[12.5px] text-black/55">Goes to {postingLabel(postingTarget(row))}</p>}
              {row.review_status === 'rejected' && row.review_note && <p className="mt-1 break-words text-[12.5px] text-[#B91C1C]">Reason: {row.review_note}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 text-[15px]">
              <Amount row={row} />
              <Receipt row={row} onOpen={actions.onReceipt} />
            </div>
          </div>
          {row.direction === 'OUT' && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center"><Signatures row={row} signers={signers} signed={signed} me={me} onSign={actions.onSign} /></span>
              <Actions row={row} {...actions} />
            </div>
          )}
        </li>
      );
    })}
  </ul>
);

const Figure: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone }) => (
  <span className="min-w-0">
    <span className="block text-[11.5px] text-black/45">{label}</span>
    <span className={cn('block truncate text-[14px] font-semibold tabular-nums text-foreground', tone)}>{value}</span>
  </span>
);

const EmployeeSection: React.FC<{
  summary: EmployeeSummary;
  person: ProfileOption | undefined;
  name: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ summary, person, name, open, onToggle, children }) => (
  <section aria-label={name} className="overflow-hidden rounded-xl border border-subtle bg-surface">
    <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-[44px] w-full flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-start transition-colors hover:bg-black/[0.02] sm:px-4">
      <span className="flex min-w-[150px] flex-1 items-center gap-2.5">
        <StaffAvatar profile={person} size={36} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium text-foreground">{name}</span>
          {summary.pending > 0 && <span className="block text-[12px] font-medium text-[#92400E]">{summary.pending} waiting</span>}
        </span>
      </span>
      <span className="grid grid-cols-3 gap-4 sm:gap-6">
        <Figure label="Balance" value={formatMoney(summary.balance)} tone={summary.balance < 0 ? 'text-[#B91C1C]' : undefined} />
        <Figure label="Received" value={formatMoney(summary.received)} />
        <Figure label="Spent" value={formatMoney(summary.spent)} />
      </span>
      <ChevronDown size={15} className={cn('shrink-0 text-black/35 transition-transform', open && 'rotate-180')} />
    </button>
    {open && children}
  </section>
);

export const StaffCustodyTab: React.FC<{
  action?: React.ReactNode;
  /** Bumped after money is added to someone's custody from outside the tab. */
  refresh?: number;
  onPending: (summary: PendingSummary) => void;
}> = ({ action, refresh = 0, onPending }) => {
  const { filter, toggle, clear } = useUrlFilter(REVIEW_FILTERS);
  const { profile } = useCurrentProfile();
  const me = profile?.id ?? null;
  const wide = useMediaQuery('(min-width: 1280px)');
  const [rows, setRows] = useState<ReviewExpense[]>([]);
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [signed, setSigned] = useState<SignatureMap>(new Map());
  const [people, setPeople] = useState<Record<string, ProfileOption>>({});
  const [cars, setCars] = useState<FineCar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState<Set<string> | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reconciling, setReconciling] = useState<ReviewExpense | null>(null);
  const [rejecting, setRejecting] = useState<ReviewExpense | null>(null);
  const [undoing, setUndoing] = useState<ConfirmState | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([fetchCustodyMovements(), fetchWalletBalances(), fetchSigners(), fetchSignatures(), fetchFineCars()])
      .then(async ([movements, walletRows, signerRows, signatureRows, carRows]) => {
        const ids = new Set([...movements.map((row) => row.employee_id), ...walletRows.map((row) => row.employee_id)]);
        const profiles = await getAvatarProfiles(Array.from(ids));
        if (cancelled) return;
        setRows(movements);
        setBalances(walletRows);
        setSigners(signerRows);
        setSigned(signatureMap(signatureRows));
        setCars(carRows);
        setPeople(profiles);
        // Decided once. Reading it from `pending` would close a section under your
        // cursor the moment you approve that person's last expense.
        setOpened((current) => current ?? new Set(employeeSummaries(movements, walletRows, istanbulDate().slice(0, 7)).filter((row) => row.pending > 0).map((row) => row.employeeId)));
      })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload, refresh]);

  const month = istanbulDate().slice(0, 7);
  const context = useMemo(() => ({ month, me, signatures: signed }), [month, me, signed]);
  const outgoing = useMemo(() => rows.filter((row) => row.direction === 'OUT'), [rows]);
  const stats = useMemo(() => reviewStats(rows, context), [rows, context]);
  const { count: pendingCount, total: pendingTotal } = stats.pending;
  const summaries = useMemo(() => employeeSummaries(rows, balances, month), [rows, balances, month]);

  useEffect(() => {
    if (!loading) onPending({ count: pendingCount, total: pendingTotal });
  }, [loading, pendingCount, pendingTotal, onPending]);

  const nameOf = useCallback((id: string) => people[id]?.full_name || balances.find((row) => row.employee_id === id)?.full_name || 'Unknown', [people, balances]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!inReviewFilter(row, filter, context)) return false;
      if (!query) return true;
      return [row.plate, row.model, row.description, row.category, row.supplier, nameOf(row.employee_id)]
        .some((text) => text?.toLowerCase().includes(query));
    });
  }, [rows, filter, context, search, nameOf]);

  const narrowed = filter !== 'all' || search.trim() !== '';
  const groups = useMemo(() => summaries.filter((summary) => (
    narrowed ? visible.some((row) => row.employee_id === summary.employeeId) : true
  )), [summaries, narrowed, visible]);

  const isOpen = (summary: EmployeeSummary) => narrowed || Boolean(opened?.has(summary.employeeId));
  const toggleOpen = (summary: EmployeeSummary) => setOpened((current) => {
    const next = new Set(current);
    if (next.has(summary.employeeId)) next.delete(summary.employeeId);
    else next.add(summary.employeeId);
    return next;
  });

  const patch = useCallback((id: number, change: Partial<ReviewExpense>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }, []);

  const markSigned = useCallback((id: number, at: string | null) => {
    if (me) setSigned((current) => setSignature(current, id, me, at));
  }, [me]);

  const approve = useCallback(async (row: ReviewExpense, choice?: ReconcileChoice) => {
    const now = new Date().toISOString();
    const hadSignature = me ? signed.get(row.id)?.get(me) : undefined;
    patch(row.id, { review_status: 'approved', reviewed_at: now });
    markSigned(row.id, hadSignature ?? now);
    try {
      const posting = await approveExpense(row.id, choice);
      patch(row.id, {
        posted_car_tx_id: posting.car_tx_id,
        posted_company_expense_id: posting.company_expense_id,
        posted_car_id: posting.car_tx_id === null ? null : choice?.carId ?? row.car_id,
        review_note: choice?.note ?? row.review_note,
      });
    } catch (failure) {
      patch(row.id, { review_status: row.review_status, reviewed_at: row.reviewed_at });
      markSigned(row.id, hadSignature ?? null);
      throw failure;
    }
  }, [me, signed, patch, markSigned]);

  const bulkApprove = async () => {
    const targets = rows.filter((row) => selected.has(row.id) && row.review_status === 'pending');
    setBulkBusy(true);
    setSelected(new Set());
    const failures: string[] = [];
    // One at a time: each locks its row and writes to the sheets.
    for (const row of targets) {
      try {
        await approve(row);
      } catch (failure) {
        failures.push(failure instanceof Error ? failure.message : 'Try again.');
      }
    }
    setBulkBusy(false);
    if (failures.length === 0) toast.success(`${expenses(targets.length)} approved and posted.`);
    else toast.error(`${targets.length - failures.length} approved, ${failures.length} failed: ${failures[0]}`);
  };

  const sign = async (row: ReviewExpense) => {
    if (!me) return;
    const before = signed.get(row.id)?.get(me);
    markSigned(row.id, before ? null : new Date().toISOString());
    try {
      await signExpense(row.id, !before);
    } catch (failure) {
      markSigned(row.id, before ?? null);
      toast.error(`Couldn't save your signature: ${failure instanceof Error ? failure.message : 'try again'}`);
    }
  };

  const askUndo = (row: ReviewExpense) => setUndoing({
    title: 'Undo this approval?',
    description: `${formatMoney(row.amount)} goes back to waiting for approval.`,
    consequence: 'The entry on the sheet is deleted, and so are its rows on the supplier sheet.',
    confirmLabel: 'Undo approval',
    pendingLabel: 'Undoing…',
    onConfirm: async () => {
      await unapproveExpense(row.id);
      patch(row.id, { review_status: 'pending', reviewed_at: null, posted_car_tx_id: null, posted_company_expense_id: null, posted_car_id: null });
      toast.success('Approval undone.');
    },
  });

  const confirmUndo = async () => {
    if (!undoing) return;
    setUndoPending(true);
    try {
      await undoing.onConfirm();
    } catch (failure) {
      toast.error(`Couldn't undo: ${failure instanceof Error ? failure.message : 'try again'}`);
    } finally {
      setUndoPending(false);
      setUndoing(null);
    }
  };

  const select = (row: ReviewExpense, on: boolean) => setSelected((current) => {
    const next = new Set(current);
    if (on) next.add(row.id);
    else next.delete(row.id);
    return next;
  });

  const selectedRows = rows.filter((row) => selected.has(row.id));
  const List = wide ? MovementTable : MovementCards;

  return (
    <div className="media-scope">
      {error && <LoadError message={`Couldn't load staff custody: ${error}`} onRetry={() => { setLoading(true); setReload((value) => value + 1); }} />}

      {loading ? <FilterTileSkeleton count={6} columns={6} /> : (
        <FilterTileRow label="Filter expenses" columns={6}>
          <FilterTile tone="blue" icon={<WalletIcon size={15} />} label="All" value={formatMoney(outgoing.reduce((sum, row) => sum + row.amount, 0))} sub={expenses(outgoing.length)} active={filter === 'all'} onClick={clear} />
          <FilterTile tone="amber" icon={<ClockIcon size={15} />} label="Pending" value={formatMoney(stats.pending.total)} sub={`${stats.pending.count} to review`} active={filter === 'pending'} onClick={() => toggle('pending')} />
          <FilterTile tone="violet" icon={<Check size={15} strokeWidth={2.5} />} label="Unsigned by me" value={String(stats.unsigned.count)} sub={formatMoney(stats.unsigned.total)} active={filter === 'unsigned'} onClick={() => toggle('unsigned')} />
          <FilterTile tone="green" icon={<Check size={15} strokeWidth={2.5} />} label="Approved this month" value={formatMoney(stats.approved.total)} sub={expenses(stats.approved.count)} active={filter === 'approved'} onClick={() => toggle('approved')} />
          <FilterTile tone="red" icon={<X size={15} strokeWidth={2.5} />} label="Rejected" value={formatMoney(stats.rejected.total)} sub={expenses(stats.rejected.count)} active={filter === 'rejected'} onClick={() => toggle('rejected')} />
          <FilterTile tone="neutral" icon={<ReceiptIcon size={15} />} label="No receipt" value={String(stats.noReceipt.count)} sub={formatMoney(stats.noReceipt.total)} active={filter === 'no_receipt'} onClick={() => toggle('no_receipt')} />
        </FilterTileRow>
      )}

      <div className="mt-4 flex max-w-[1100px] flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="Search staff, plate, supplier, description…" className="min-w-[220px] flex-1" />
        {action}
      </div>

      <div className="mt-4 flex max-w-[1100px] flex-col gap-3">
        {loading ? <div className="rounded-xl border border-subtle bg-surface"><SkeletonRows /></div>
          : !error && groups.length === 0 ? (
            <p className="rounded-xl border border-subtle bg-surface px-4 py-10 text-center text-[13.5px] text-black/45">
              {filter === 'pending' ? 'Nothing is waiting for approval.' : filter === 'unsigned' ? "You've signed everything." : rows.length === 0 ? 'No custody movements yet.' : 'Nothing matches this view.'}
            </p>
          ) : groups.map((summary) => (
            <EmployeeSection
              key={summary.employeeId}
              summary={summary}
              person={people[summary.employeeId]}
              name={nameOf(summary.employeeId)}
              open={isOpen(summary)}
              onToggle={() => toggleOpen(summary)}
            >
              <List
                rows={visible.filter((row) => row.employee_id === summary.employeeId).sort((a, b) => (a.review_status === 'pending' ? 0 : 1) - (b.review_status === 'pending' ? 0 : 1))}
                signers={signers}
                signed={signed}
                me={me}
                selected={selected}
                onReconcile={setReconciling}
                onReject={setRejecting}
                onUndo={askUndo}
                onReceipt={setReceipt}
                onSign={sign}
                onSelect={select}
              />
            </EmployeeSection>
          ))}
      </div>

      {selectedRows.length > 0 && (
        <div className="sticky bottom-3 z-20 mt-4 flex max-w-[1100px] flex-wrap items-center justify-between gap-2 rounded-xl border border-subtle bg-white px-4 py-2.5 shadow-lg">
          <span className="text-[13.5px] tabular-nums text-foreground">
            {selectedRows.length} selected · <span className="font-semibold">{formatMoney(selectedRows.reduce((sum, row) => sum + row.amount, 0))}</span>
          </span>
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="lg" className="!h-11 px-3 md:!h-9" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button size="lg" className="!h-11 px-3 md:!h-9" disabled={bulkBusy} onClick={bulkApprove}>
              {bulkBusy ? <Spinner size={13} /> : <Check size={14} strokeWidth={2.5} />} Approve selected
            </Button>
          </span>
        </div>
      )}

      {reconciling && (
        <ReconcileSheet
          row={reconciling}
          cars={cars}
          onClose={() => setReconciling(null)}
          onConfirm={async (choice) => {
            await approve(reconciling, choice);
            setReconciling(null);
            toast.success(choice.target === 'other' ? 'Approved. Nothing was posted.' : 'Approved and posted.');
          }}
        />
      )}
      {rejecting && (
        <ReasonSheet
          title="Reject this expense?"
          description={`${formatMoney(rejecting.amount)} · ${rejecting.description ?? ''}`}
          label="Reason"
          confirmLabel="Reject expense"
          onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            await rejectExpense(rejecting.id, reason);
            patch(rejecting.id, { review_status: 'rejected', reviewed_at: new Date().toISOString(), review_note: reason });
            select(rejecting, false);
            setRejecting(null);
            toast.success('Expense rejected.');
          }}
        />
      )}
      <ConfirmDialog state={undoing} pending={undoPending} onCancel={() => setUndoing(null)} onConfirm={confirmUndo} />
      {receipt && <Lightbox items={[{ url: receipt, label: 'Receipt' }]} onClose={() => setReceipt(null)} />}
      <MediaToaster />
    </div>
  );
};
