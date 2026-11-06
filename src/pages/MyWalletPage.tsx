import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '../lib/media/tokens.css';
import { PdfGlyph } from '../components/shared/FileDrop';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../components/shared/FilterTile';
import { isPdfUrl, Lightbox } from '../components/shared/Lightbox';
import { LoadError, PageHeader, SkeletonRows } from '../components/shared/PageBits';
import { useShell } from '../components/shell/shellContext';
import { useUrlFilter } from '../hooks/useUrlFilter';
import { formatDate } from '../lib/customers';
import { cn } from '../lib/media/badgeColor';
import {
  ENTRY_LABELS,
  WALLET_FILTERS,
  fetchMyMonthlySalary,
  fetchMyWallet,
  inMyWalletFilter,
  myWalletTotals,
  withWalletRunning,
} from '../lib/myWallet';
import { formatTry, monthLabel, receiptLink, signedAmount, type EntryType, type WalletEntry } from '../lib/payroll';
import { ReceiptIcon, WalletIcon } from './customers/ui';

/**
 * The signed-in admin's pay, read-only: salary and bonuses in, advances and payouts
 * out. Company money they hold is My custody. The same page as Team's My wallet.
 */

const CHIP: Record<EntryType, string> = {
  salary: 'bg-[#16A34A]/10 text-[#15803D]',
  bonus: 'bg-[#7C3AED]/10 text-[#5B21B6]',
  advance: 'bg-[#F59E0B]/[0.16] text-[#92400E]',
  deduction: 'bg-[#DC2626]/10 text-[#B91C1C]',
  payout: 'bg-[#6EA4E7]/15 text-brand-strong',
};

/** What `admin_post_monthly_salaries` writes; anything else is someone's own words. */
const SALARY_NOTE = 'Monthly salary';

const signed = (value: number) => `${value < 0 ? '−' : ''}${formatTry(Math.abs(value))}`;

const Chip: React.FC<{ type: EntryType }> = ({ type }) => (
  <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium', CHIP[type])}>{ENTRY_LABELS[type]}</span>
);

const Amount: React.FC<{ entry: WalletEntry }> = ({ entry }) => {
  const value = signedAmount(entry);
  return <span className={cn('whitespace-nowrap font-mono text-[13.5px] font-semibold tabular-nums', value > 0 ? 'text-[#15803D]' : 'text-[#B91C1C]')}>{value > 0 ? '+' : '−'}{formatTry(Math.abs(value))}</span>;
};

/** Payroll receipts are private, so each opens through a short-lived link. */
const ReceiptButton: React.FC<{ path: string | null; onOpen: (path: string) => void }> = ({ path, onOpen }) => {
  if (!path) return <span className="text-black/25">—</span>;
  return (
    <button type="button" onClick={() => onOpen(path)} aria-label="Open receipt" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-subtle bg-black/[0.03] text-black/45 transition-opacity hover:opacity-80 xl:h-9 xl:w-9">
      {isPdfUrl(path) ? <PdfGlyph size={18} /> : <ReceiptIcon size={16} />}
    </button>
  );
};

const noteOf = (entry: WalletEntry) => (entry.note === SALARY_NOTE ? 'Monthly salary' : entry.note);

const MyWalletPage: React.FC = () => {
  const { profile } = useShell();
  const userId = profile?.id ?? null;
  const { filter, toggle, clear } = useUrlFilter(WALLET_FILTERS);
  const [rows, setRows] = useState<WalletEntry[] | null>(null);
  const [salary, setSalary] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setError(null);
    Promise.all([fetchMyWallet(userId), fetchMyMonthlySalary(userId)])
      .then(([entries, monthly]) => {
        if (cancelled) return;
        setRows(entries);
        setSalary(monthly);
      })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); });
    return () => { cancelled = true; };
  }, [userId, reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const totals = useMemo(() => myWalletTotals(rows ?? []), [rows]);
  const visible = useMemo(() => withWalletRunning(rows ?? []).filter((row) => inMyWalletFilter(row, filter)).reverse(), [rows, filter]);

  const openReceipt = async (path: string) => {
    try {
      setReceipt(await receiptLink(path));
    } catch {
      setError("Couldn't open the receipt.");
    }
  };

  return (
    <div className="media-scope mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <PageHeader
        eyebrow="Account"
        title="My wallet"
        subtitle={salary !== null ? `Your salary and bonuses, and what the company has paid you. Monthly salary: ${formatTry(salary)}.` : 'Your salary and bonuses, and what the company has paid you.'}
      />

      {error && !rows ? (
        <LoadError message={`Couldn't load your wallet: ${error}`} onRetry={refresh} />
      ) : !rows ? (
        <>
          <FilterTileSkeleton split count={3} />
          <div className="mt-4 max-w-[1100px] rounded-2xl border border-subtle bg-surface"><SkeletonRows count={6} /></div>
        </>
      ) : (
        <>
          <FilterTileRow split label="Filter the movements">
            <FilterTile split mono wide tone={totals.balance < 0 ? 'red' : 'blue'} icon={<WalletIcon size={22} />} label="Balance" value={signed(totals.balance)} sub="what the company owes you" active={filter === 'all'} onClick={clear} />
            <FilterTile split mono wide tone="green" icon={<ReceiptIcon size={22} />} label="Earned" value={formatTry(totals.earned)} sub="salary and bonuses" active={filter === 'earned'} onClick={() => toggle('earned')} />
            <FilterTile split mono wide tone="slate" icon={<ReceiptIcon size={22} />} label="Paid to me" value={formatTry(totals.paid)} sub="advances, deductions, payouts" active={filter === 'paid'} onClick={() => toggle('paid')} />
          </FilterTileRow>

          <section className="mt-5 max-w-[1100px] overflow-hidden rounded-2xl border border-subtle bg-surface">
            {visible.length === 0 ? (
              <p className="px-5 py-12 text-center text-[13.5px] text-black/45">{rows.length === 0 ? 'No movements yet.' : 'No movements match this filter.'}</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto xl:block">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-subtle text-[11.5px] font-medium text-black/45">
                        <th scope="col" className="px-4 py-2.5 text-start font-medium">Date</th>
                        <th scope="col" className="px-3 py-2.5 text-start font-medium">Type</th>
                        <th scope="col" className="px-3 py-2.5 text-start font-medium">Month</th>
                        <th scope="col" className="px-3 py-2.5 text-start font-medium">Note</th>
                        <th scope="col" className="px-3 py-2.5 text-end font-medium">Amount</th>
                        <th scope="col" className="px-3 py-2.5 text-center font-medium">Receipt</th>
                        <th scope="col" className="px-4 py-2.5 text-end font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => (
                        <tr key={row.id} className="border-b border-subtle last:border-b-0">
                          <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-black/65">{formatDate(row.created_at)}</td>
                          <td className="px-3 py-2.5"><Chip type={row.entry_type} /></td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-black/70">{monthLabel(row.month)}</td>
                          <td className="max-w-[280px] truncate px-3 py-2.5 text-black/55">{noteOf(row) || '—'}</td>
                          <td className="px-3 py-2.5 text-end"><Amount entry={row} /></td>
                          <td className="px-3 py-1.5"><div className="flex justify-center"><ReceiptButton path={row.receipt_url} onOpen={openReceipt} /></div></td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-end font-mono tabular-nums text-black/55">{signed(row.running)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="divide-y divide-subtle xl:hidden">
                  {visible.map((row) => (
                    <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Chip type={row.entry_type} />
                        <div className="mt-1 text-[13px] text-black/70">{monthLabel(row.month)}</div>
                        {noteOf(row) && <div className="mt-0.5 truncate text-[12.5px] text-black/50">{noteOf(row)}</div>}
                        <div className="mt-1 text-[12px] tabular-nums text-black/45">{formatDate(row.created_at)}</div>
                      </div>
                      <div className="shrink-0 text-end">
                        <Amount entry={row} />
                        <div className="mt-1 font-mono text-[12px] tabular-nums text-black/45">{signed(row.running)}</div>
                      </div>
                      {row.receipt_url && <ReceiptButton path={row.receipt_url} onOpen={openReceipt} />}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      {receipt && <Lightbox items={[{ url: receipt, label: 'Receipt' }]} onClose={() => setReceipt(null)} />}
    </div>
  );
};

export default MyWalletPage;
