import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '../lib/media/tokens.css';
import { ConfirmDialog } from '../components/media/ConfirmDialog';
import { Pencil, Plus, Trash2 } from '../components/media/MediaIcons';
import { MediaToaster, toast } from '../components/media/MediaToast';
import { Button } from '../components/media/MediaUI';
import { PdfGlyph } from '../components/shared/FileDrop';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../components/shared/FilterTile';
import { isPdfUrl, Lightbox } from '../components/shared/Lightbox';
import { LoadError, PageHeader, SearchField, SkeletonRows } from '../components/shared/PageBits';
import { useShell } from '../components/shell/shellContext';
import { useUrlFilter } from '../hooks/useUrlFilter';
import { formatDate } from '../lib/customers';
import { cn } from '../lib/media/badgeColor';
import {
  CUSTODY_FILTERS,
  canDeleteExpense,
  canEditExpense,
  custodyTotals,
  deleteCustodyExpense,
  expenseErrorMessage,
  fetchMyCustody,
  inCustodyFilter,
  matchesCustodySearch,
  statusChip,
  withRunning,
  type CustodyMovement,
  type CustodyRow,
  type StatusTone,
} from '../lib/myCustody';
import { formatTry } from '../lib/payroll';
import { LicensePlate } from './bookings/ui';
import { ClockIcon, ReceiptIcon, WalletIcon } from './customers/ui';
import { ExpenseSheet } from './myCustody/ExpenseSheet';

/**
 * The signed-in admin's custody: company money they hold. Finance records money in;
 * the expenses are theirs to log here, and reach the accountant in Accounting ›
 * Staff custody like anyone else's. The same page as Team's My custody.
 */

const TONE: Record<StatusTone, string> = {
  blue: 'bg-[#6EA4E7]/15 text-brand-strong',
  amber: 'bg-[#F59E0B]/[0.16] text-[#92400E]',
  green: 'bg-[#16A34A]/10 text-[#15803D]',
  red: 'bg-[#DC2626]/10 text-[#B91C1C]',
  grey: 'bg-black/[0.06] text-black/55',
};

const signed = (value: number) => `${value < 0 ? '−' : ''}${formatTry(Math.abs(value))}`;

const StatusChip: React.FC<{ row: CustodyMovement }> = ({ row }) => {
  const chip = statusChip(row);
  return (
    <span title={row.review_status === 'rejected' ? row.review_note ?? undefined : undefined} className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium', TONE[chip.tone])}>
      {chip.label}
    </span>
  );
};

const Amount: React.FC<{ row: CustodyMovement }> = ({ row }) => (
  <span className={cn('whitespace-nowrap font-mono text-[13.5px] font-semibold tabular-nums', row.direction === 'IN' ? 'text-[#15803D]' : 'text-[#B91C1C]')}>
    {row.direction === 'IN' ? '+' : '−'}{formatTry(row.amount)}
  </span>
);

/** Who an expense was for. Money coming in was for nobody. */
const Target: React.FC<{ row: CustodyMovement }> = ({ row }) => {
  if (row.direction !== 'OUT') return null;
  if (row.car) return <LicensePlate plate={row.car.plate_number} />;
  if (row.expense_scope === 'company') return <span className="whitespace-nowrap rounded-md bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">Company</span>;
  return null;
};

const ReceiptThumb: React.FC<{ url: string | null; onOpen: (url: string) => void }> = ({ url, onOpen }) => {
  if (!url) return <span className="text-black/25">—</span>;
  return (
    <button type="button" onClick={() => onOpen(url)} aria-label="Open receipt" className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-subtle bg-black/[0.03] text-black/40 transition-opacity hover:opacity-80 xl:h-9 xl:w-9">
      {isPdfUrl(url) ? <PdfGlyph size={18} /> : <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
    </button>
  );
};

const ICON_ACTION = 'grid h-11 w-11 shrink-0 place-items-center rounded-[9px] text-black/45 transition-colors hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/35 md:h-8 md:w-8';

const RowActions: React.FC<{ row: CustodyMovement; userId: string; onEdit: () => void; onDelete: () => void }> = ({ row, userId, onEdit, onDelete }) => (
  <span className="flex justify-end">
    {canEditExpense(row, userId) && <button type="button" className={ICON_ACTION} aria-label="Edit expense" title="Edit" onClick={onEdit}><Pencil size={14} /></button>}
    {canDeleteExpense(row, userId) && <button type="button" className={cn(ICON_ACTION, 'hover:bg-[#DC2626]/[0.07] hover:text-[#B91C1C]')} aria-label="Delete expense" title="Delete" onClick={onDelete}><Trash2 size={14} /></button>}
  </span>
);

const Description: React.FC<{ row: CustodyMovement }> = ({ row }) => (
  <>
    <div className="truncate text-[13.5px] font-medium text-foreground">{row.category ?? (row.direction === 'IN' ? 'Money from finance' : 'Expense')}</div>
    {(row.description || row.supplier) && (
      <div className="truncate text-[12px] text-black/50">{[row.description, row.supplier?.name].filter(Boolean).join(' · ')}</div>
    )}
    {row.review_status === 'rejected' && row.review_note && row.direction === 'OUT' && <div className="mt-0.5 text-[12px] text-[#B91C1C]">Rejected: {row.review_note}</div>}
  </>
);

const MyCustodyPage: React.FC = () => {
  const { profile } = useShell();
  const userId = profile?.id ?? null;
  const { filter, toggle, clear } = useUrlFilter(CUSTODY_FILTERS);
  const [rows, setRows] = useState<CustodyMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CustodyMovement | null>(null);
  const [deleting, setDeleting] = useState<CustodyMovement | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setError(null);
    fetchMyCustody(userId)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); });
    return () => { cancelled = true; };
  }, [userId, reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  const totals = useMemo(() => custodyTotals(rows ?? []), [rows]);
  // The running balance is worked out over everything first, so a filtered row
  // still shows what the balance really was at that point. Newest on top.
  const visible: CustodyRow[] = useMemo(
    () => withRunning(rows ?? []).filter((row) => inCustodyFilter(row, filter) && matchesCustodySearch(row, query)).reverse(),
    [rows, filter, query],
  );

  const saved = (edited: boolean) => {
    setAdding(false);
    setEditing(null);
    clear();
    setQuery('');
    toast.success(edited ? 'Changes saved, back in review' : 'Expense recorded');
    refresh();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteCustodyExpense(deleting.id);
      toast.success('Expense deleted');
    } catch (failure) {
      toast.error(expenseErrorMessage(failure instanceof Error ? failure.message : undefined));
    }
    setDeleteBusy(false);
    setDeleting(null);
    refresh();
  };

  const loading = rows === null && !error;
  const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? '' : 's'}`;

  return (
    <div className="media-scope mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <MediaToaster />
      <PageHeader
        eyebrow="Account"
        title="My custody"
        subtitle="Company money you received from finance, and what you spent from it."
        action={(
          <Button size="lg" className="!h-11 px-4 md:!h-10" disabled={!rows || !userId} onClick={() => setAdding(true)}>
            <Plus size={15} /> Add expense
          </Button>
        )}
      />

      {error && !rows ? (
        <LoadError message={`Couldn't load your custody: ${error}`} onRetry={refresh} />
      ) : loading ? (
        <>
          <FilterTileSkeleton split count={4} />
          <div className="mt-4 max-w-[1100px] rounded-2xl border border-subtle bg-surface"><SkeletonRows count={6} /></div>
        </>
      ) : rows && (
        <>
          <FilterTileRow split label="Filter the movements">
            <FilterTile split mono wide tone={totals.balance < 0 ? 'red' : 'blue'} icon={<WalletIcon size={22} />} label="Balance" value={signed(totals.balance)} sub="what you hold now" active={filter === 'all'} onClick={clear} />
            <FilterTile split mono wide tone="green" icon={<ReceiptIcon size={22} />} label="Received" value={formatTry(totals.received)} sub="from finance" active={filter === 'in'} onClick={() => toggle('in')} />
            <FilterTile split mono wide tone="red" icon={<ReceiptIcon size={22} />} label="Spent" value={formatTry(totals.spent)} sub={count(rows.filter((row) => row.direction === 'OUT').length, 'expense')} active={filter === 'out'} onClick={() => toggle('out')} />
            <FilterTile split mono tone="amber" icon={<ClockIcon size={22} />} label="Pending" value={String(totals.pending.count)} sub={formatTry(totals.pending.total)} active={filter === 'pending'} onClick={() => toggle('pending')} />
          </FilterTileRow>

          <div className="mb-3 mt-5 max-w-[1100px]">
            <SearchField value={query} onChange={setQuery} placeholder="Search category, note, supplier or plate" className="sm:max-w-[360px]" />
          </div>

          <section className="max-w-[1100px] overflow-hidden rounded-2xl border border-subtle bg-surface">
            {visible.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[14px] font-medium text-black/65">{rows.length === 0 ? 'No movements yet' : 'Nothing matches'}</p>
                <p className="mt-1 text-[13px] text-black/45">{rows.length === 0 ? 'Money from finance and your expenses show up here.' : 'Clear the search or the filter to see everything.'}</p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto xl:block">
                  <table className="w-full min-w-[900px] border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-subtle text-[11.5px] font-medium text-black/45">
                        <th scope="col" className="px-4 py-2.5 text-start font-medium">Date</th>
                        <th scope="col" className="px-3 py-2.5 text-start font-medium">What</th>
                        <th scope="col" className="px-3 py-2.5 text-start font-medium">On</th>
                        <th scope="col" className="px-3 py-2.5 text-end font-medium">Amount</th>
                        <th scope="col" className="px-3 py-2.5 text-start font-medium">Status</th>
                        <th scope="col" className="px-3 py-2.5 text-center font-medium">Receipt</th>
                        <th scope="col" className="px-3 py-2.5 text-end font-medium">Balance</th>
                        <th scope="col" className="w-20 px-3 py-2.5"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => (
                        <tr key={row.id} className="border-b border-subtle last:border-b-0">
                          <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-black/65">{formatDate(row.transaction_date)}</td>
                          <td className="max-w-[280px] px-3 py-2.5"><Description row={row} /></td>
                          <td className="px-3 py-2.5"><Target row={row} /></td>
                          <td className="px-3 py-2.5 text-end"><Amount row={row} /></td>
                          <td className="px-3 py-2.5"><StatusChip row={row} /></td>
                          <td className="px-3 py-1.5"><div className="flex justify-center"><ReceiptThumb url={row.receipt_url} onOpen={setReceipt} /></div></td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-end font-mono tabular-nums text-black/55">{signed(row.running)}</td>
                          <td className="px-2 py-1">{userId && <RowActions row={row} userId={userId} onEdit={() => setEditing(row)} onDelete={() => setDeleting(row)} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="divide-y divide-subtle xl:hidden">
                  {visible.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Description row={row} />
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <StatusChip row={row} />
                          <Target row={row} />
                        </div>
                        <div className="mt-1 text-[12px] tabular-nums text-black/45">{formatDate(row.transaction_date)}</div>
                      </div>
                      <div className="shrink-0 text-end">
                        <Amount row={row} />
                        <div className="mt-1 font-mono text-[12px] tabular-nums text-black/45">{signed(row.running)}</div>
                      </div>
                      {row.receipt_url && <ReceiptThumb url={row.receipt_url} onOpen={setReceipt} />}
                      {userId && (canEditExpense(row, userId) || canDeleteExpense(row, userId)) && (
                        <div className="-mb-2 -mt-1 w-full"><RowActions row={row} userId={userId} onEdit={() => setEditing(row)} onDelete={() => setDeleting(row)} /></div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      {(adding || editing) && userId && (
        <ExpenseSheet
          key={editing?.id ?? 'new'}
          userId={userId}
          balance={totals.balance}
          expense={editing ?? undefined}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={saved}
        />
      )}

      <ConfirmDialog
        state={deleting ? {
          title: 'Delete this expense?',
          description: "The amount goes back to your balance. This can't be undone.",
          confirmLabel: 'Delete',
          pendingLabel: 'Deleting…',
          onConfirm: confirmDelete,
        } : null}
        pending={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />

      {receipt && <Lightbox items={[{ url: receipt, label: 'Receipt' }]} onClose={() => setReceipt(null)} />}
    </div>
  );
};

export default MyCustodyPage;
