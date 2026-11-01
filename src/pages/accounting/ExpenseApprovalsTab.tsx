import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog, type ConfirmState } from '../../components/media/ConfirmDialog';
import { ArrowUpRight, Check, X } from '../../components/media/MediaIcons';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button, Spinner } from '../../components/media/MediaUI';
import { CarThumb } from '../../components/shared/CarThumb';
import { PdfGlyph } from '../../components/shared/FileDrop';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../../components/shared/FilterTile';
import { isPdfUrl, Lightbox } from '../../components/shared/Lightbox';
import { LoadError, SearchField, SkeletonRows } from '../../components/shared/PageBits';
import { ReasonSheet } from '../../components/shared/ReasonSheet';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import { formatDate, istanbulDate } from '../../lib/customers';
import {
  approveExpense,
  canUndo,
  fetchReviewExpenses,
  groupByEmployee,
  inReviewFilter,
  postingLabel,
  postingTarget,
  rejectExpense,
  REVIEW_FILTERS,
  reviewStats,
  sheetLink,
  unapproveExpense,
  type PendingSummary,
  type ReviewExpense,
} from '../../lib/expenseApprovals';
import { cn } from '../../lib/media/badgeColor';
import { formatMoney } from '../../lib/money';
import { getAvatarProfiles, type ProfileOption } from '../../lib/notifications';
import { LicensePlate } from '../bookings/ui';
import { ClockIcon, ReceiptIcon, WalletIcon } from '../customers/ui';

const PILLS = {
  pending: { label: 'Waiting', className: 'bg-[#F59E0B]/[0.16] text-[#92400E]' },
  approved: { label: 'Approved', className: 'bg-[#16A34A]/10 text-[#15803D]' },
  rejected: { label: 'Rejected', className: 'bg-[#DC2626]/10 text-[#B91C1C]' },
};

const expenses = (count: number) => (count === 1 ? '1 expense' : `${count} expenses`);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="max-w-full truncate rounded-full bg-black/[0.05] px-2 py-0.5 text-[12px] text-black/60">{children}</span>
);

const Receipt: React.FC<{ url: string | null; onOpen: () => void }> = ({ url, onOpen }) => {
  if (!url) return <span className="whitespace-nowrap rounded-full bg-[#F59E0B]/[0.16] px-2 py-0.5 text-[11.5px] font-medium text-[#92400E]">No receipt</span>;
  return (
    <button type="button" onClick={onOpen} aria-label="Open receipt" className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-subtle bg-black/[0.03] text-black/40 transition-opacity hover:opacity-80">
      {isPdfUrl(url) ? <PdfGlyph size={20} /> : <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
    </button>
  );
};

const ExpenseRow: React.FC<{
  row: ReviewExpense;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
  onUndo: () => void;
  onReceipt: () => void;
}> = ({ row, selected, onSelect, onApprove, onReject, onUndo, onReceipt }) => {
  const pending = row.review_status === 'pending';
  const target = postingTarget(row);
  const link = sheetLink(row);
  const blocked = target.kind === 'car' && !row.investor_id;

  return (
    <li className="border-t border-subtle px-3 py-3 sm:px-4">
      <div className="flex items-start gap-2 sm:gap-3">
        <label className={cn('-ms-1.5 -mt-1.5 grid h-11 w-11 shrink-0 place-items-center', pending ? 'cursor-pointer' : 'invisible')}>
          <input type="checkbox" checked={selected} disabled={!pending} aria-label={`Select expense ${formatMoney(row.amount)}`} onChange={(event) => onSelect(event.target.checked)} className="h-[18px] w-[18px] accent-[#4ba6ea]" />
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {row.plate ? (
              <>
                <CarThumb src={row.image} width={44} height={32} />
                <LicensePlate plate={row.plate} />
              </>
            ) : <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">Company</span>}
            {row.category && <Chip>{row.category}</Chip>}
            {row.supplier && <Chip>{row.supplier}</Chip>}
          </div>
          <p className="mt-1.5 break-words text-[13.5px] text-foreground">{row.description || '—'}</p>
          <p className="mt-0.5 text-[12.5px] tabular-nums text-black/50">
            {formatDate(row.transaction_date)}
            {row.model ? ` · ${row.model}` : ''}
          </p>
          {pending && (
            <p className={cn('mt-1 text-[12.5px]', blocked ? 'font-medium text-[#B91C1C]' : 'text-black/55')}>
              {blocked ? "This car has no investor, so it can't be posted" : `Will post to ${postingLabel(target)}`}
            </p>
          )}
          {row.review_status === 'rejected' && row.review_note && (
            <p className="mt-1 break-words text-[12.5px] text-[#B91C1C]">Reason: {row.review_note}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-[16px] font-semibold tabular-nums text-foreground sm:text-[17px]">{formatMoney(row.amount)}</span>
          <Receipt url={row.receipt_url} onOpen={onReceipt} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 ps-9 sm:ps-11">
        <span className={cn('me-auto rounded-full px-2 py-0.5 text-[12px] font-medium', PILLS[row.review_status].className)}>{PILLS[row.review_status].label}</span>
        {pending && (
          <>
            <Button variant="outline" size="lg" className="!h-11 px-3 text-[#B91C1C] md:!h-9" onClick={onReject}><X size={14} /> Reject</Button>
            <Button size="lg" className="!h-11 px-3 md:!h-9" disabled={blocked} onClick={onApprove}><Check size={14} strokeWidth={2.5} /> Approve</Button>
          </>
        )}
        {link && (
          <Link to={link} className="inline-flex min-h-[44px] items-center gap-1 text-[13px] font-medium text-[#15803D] hover:underline md:min-h-[36px]">
            Posted <ArrowUpRight size={13} />
          </Link>
        )}
        {row.review_status === 'approved' && !link && !canUndo(row) && <span className="text-[12px] text-black/40">Recorded before approvals</span>}
        {canUndo(row) && (
          <Button variant="ghost" size="lg" className="!h-11 px-3 md:!h-9" onClick={onUndo}>Undo approval</Button>
        )}
      </div>
    </li>
  );
};

export const ExpenseApprovalsTab: React.FC<{ onPending: (summary: PendingSummary) => void }> = ({ onPending }) => {
  const { filter, toggle, clear } = useUrlFilter(REVIEW_FILTERS);
  const [rows, setRows] = useState<ReviewExpense[]>([]);
  const [people, setPeople] = useState<Record<string, ProfileOption>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejecting, setRejecting] = useState<ReviewExpense | null>(null);
  const [undoing, setUndoing] = useState<ConfirmState | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchReviewExpenses()
      .then(async (loaded) => {
        const profiles = await getAvatarProfiles(Array.from(new Set(loaded.map((row) => row.employee_id))));
        if (cancelled) return;
        setRows(loaded);
        setPeople(profiles);
      })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const month = istanbulDate().slice(0, 7);
  const stats = useMemo(() => reviewStats(rows, month), [rows, month]);
  const { count: pendingCount, total: pendingTotal } = stats.pending;

  useEffect(() => {
    if (!loading) onPending({ count: pendingCount, total: pendingTotal });
  }, [loading, pendingCount, pendingTotal, onPending]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!inReviewFilter(row, filter, month)) return false;
      if (!query) return true;
      return [row.plate, row.model, row.description, row.category, row.supplier, people[row.employee_id]?.full_name]
        .some((text) => text?.toLowerCase().includes(query));
    });
  }, [rows, filter, month, search, people]);
  const groups = useMemo(() => groupByEmployee(visible), [visible]);

  const patch = useCallback((id: number, change: Partial<ReviewExpense>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }, []);

  const approveMany = useCallback(async (targets: ReviewExpense[]) => {
    const now = new Date().toISOString();
    targets.forEach((row) => patch(row.id, { review_status: 'approved', reviewed_at: now }));
    setSelected(new Set());
    const failures: string[] = [];
    // One at a time: each locks its row and writes to the sheets.
    for (const row of targets) {
      try {
        const posting = await approveExpense(row.id);
        patch(row.id, { posted_car_tx_id: posting.car_tx_id, posted_company_expense_id: posting.company_expense_id });
      } catch (failure) {
        patch(row.id, { review_status: row.review_status, reviewed_at: row.reviewed_at });
        failures.push(failure instanceof Error ? failure.message : 'Try again.');
      }
    }
    if (failures.length === 0) toast.success(targets.length === 1 ? 'Approved and posted.' : `${targets.length} expenses approved and posted.`);
    else if (targets.length === 1) toast.error(`Couldn't approve: ${failures[0]}`);
    else toast.error(`${targets.length - failures.length} approved, ${failures.length} failed: ${failures[0]}`);
  }, [patch]);

  const bulkApprove = async () => {
    setBulkBusy(true);
    await approveMany(rows.filter((row) => selected.has(row.id) && row.review_status === 'pending'));
    setBulkBusy(false);
  };

  const askUndo = (row: ReviewExpense) => setUndoing({
    title: 'Undo this approval?',
    description: `${formatMoney(row.amount)} goes back to waiting for approval.`,
    consequence: 'The entry on the sheet is deleted, and so are its rows on the supplier sheet.',
    confirmLabel: 'Undo approval',
    pendingLabel: 'Undoing…',
    onConfirm: async () => {
      await unapproveExpense(row.id);
      patch(row.id, { review_status: 'pending', reviewed_at: null, posted_car_tx_id: null, posted_company_expense_id: null });
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

  const pendingIn = (groupRows: ReviewExpense[]) => groupRows.filter((row) => row.review_status === 'pending');
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const toggleRows = (ids: number[], on: boolean) => setSelected((current) => {
    const next = new Set(current);
    ids.forEach((id) => { if (on) next.add(id); else next.delete(id); });
    return next;
  });

  return (
    <div className="media-scope">
      {error && <LoadError message={`Couldn't load the expenses: ${error}`} onRetry={() => { setLoading(true); setReload((value) => value + 1); }} />}

      {loading ? <FilterTileSkeleton /> : (
        <FilterTileRow label="Filter expenses">
          <FilterTile tone="blue" icon={<WalletIcon size={15} />} label="All" value={formatMoney(stats.all.total)} sub={expenses(stats.all.count)} active={filter === 'all'} onClick={clear} />
          <FilterTile tone="amber" icon={<ClockIcon size={15} />} label="Waiting" value={formatMoney(stats.pending.total)} sub={`${stats.pending.count} to review`} active={filter === 'pending'} onClick={() => toggle('pending')} />
          <FilterTile tone="green" icon={<Check size={15} strokeWidth={2.5} />} label="Approved this month" value={formatMoney(stats.approved.total)} sub={expenses(stats.approved.count)} active={filter === 'approved'} onClick={() => toggle('approved')} />
          <FilterTile tone="red" icon={<X size={15} strokeWidth={2.5} />} label="Rejected" value={formatMoney(stats.rejected.total)} sub={expenses(stats.rejected.count)} active={filter === 'rejected'} onClick={() => toggle('rejected')} />
          <FilterTile tone="neutral" icon={<ReceiptIcon size={15} />} label="Without receipt" value={String(stats.noReceipt.count)} sub={formatMoney(stats.noReceipt.total)} active={filter === 'no_receipt'} onClick={() => toggle('no_receipt')} />
        </FilterTileRow>
      )}

      <SearchField value={search} onChange={setSearch} placeholder="Search staff, plate, supplier, description…" className="mt-4 max-w-[1100px]" />

      <div className="mt-4 flex max-w-[1100px] flex-col gap-4">
        {loading ? <div className="rounded-xl border border-subtle bg-surface"><SkeletonRows /></div>
          : !error && groups.length === 0 ? (
            <p className="rounded-xl border border-subtle bg-surface px-4 py-10 text-center text-[13.5px] text-black/45">
              {rows.length === 0 ? 'No expenses yet.' : filter === 'pending' ? 'Nothing is waiting for approval.' : 'No expenses match this view.'}
            </p>
          ) : groups.map((group) => {
            const person = people[group.employeeId];
            const waiting = pendingIn(group.rows);
            const allPicked = waiting.length > 0 && waiting.every((row) => selected.has(row.id));
            return (
              <section key={group.employeeId} aria-label={person?.full_name ?? 'Staff'} className="overflow-hidden rounded-xl border border-subtle bg-surface">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:px-4">
                  <StaffAvatar profile={person} size={36} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[14px] font-medium text-foreground">{person?.full_name || 'Unknown'}</h2>
                    <p className="text-[12.5px] tabular-nums text-black/50">
                      {group.pendingTotal > 0 ? `${formatMoney(group.pendingTotal)} waiting · ` : ''}{expenses(group.rows.length)}
                    </p>
                  </div>
                  {waiting.length > 1 && (
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[12.5px] text-black/55 md:min-h-[32px]">
                      <input type="checkbox" checked={allPicked} className="h-[18px] w-[18px] accent-[#4ba6ea]" onChange={(event) => toggleRows(waiting.map((row) => row.id), event.target.checked)} />
                      Select all
                    </label>
                  )}
                </header>
                <ul>
                  {group.rows.map((row) => (
                    <ExpenseRow
                      key={row.id}
                      row={row}
                      selected={selected.has(row.id)}
                      onSelect={(on) => toggleRows([row.id], on)}
                      onApprove={() => approveMany([row])}
                      onReject={() => setRejecting(row)}
                      onUndo={() => askUndo(row)}
                      onReceipt={() => setReceipt(row.receipt_url)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
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
            setSelected((current) => { const next = new Set(current); next.delete(rejecting.id); return next; });
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
