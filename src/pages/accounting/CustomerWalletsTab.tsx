import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../../components/shared/FilterTile';
import { LoadError, SearchField, SkeletonRows } from '../../components/shared/PageBits';
import { CustomerAvatar } from '../../components/shared/PersonAvatar';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import {
  WALLET_FILTERS,
  fetchWalletSummaries,
  formatWalletMoney,
  inWalletFilter,
  matchesWalletSearch,
  walletTotals,
  type WalletFilter,
  type WalletSummary,
} from '../../lib/customerWallet';
import { CustomerWalletSheet, TransferIcon, WalletChip, type Notify } from '../customers/CustomerWallet';
import { LicensePlate } from '../bookings/ui';
import { BannedBadge, ReceiptIcon, UsersIcon, WalletIcon } from '../customers/ui';

const notify: Notify = (message, type) => (type === 'success' ? toast.success(message) : toast.error(message));

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const PLATES_SHOWN = 3;

const CustomerCard: React.FC<{ row: WalletSummary; onOpen: () => void }> = ({ row, onOpen }) => {
  const extra = row.plates.length - PLATES_SHOWN;
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className="surface-depth flex h-full min-h-[76px] w-full items-start gap-3 rounded-2xl border border-subtle bg-surface px-3.5 py-3 text-start transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_10px_28px_-14px_rgba(16,24,40,0.28)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/30"
      >
        <CustomerAvatar alt="" size={40} />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate text-[14.5px] font-semibold text-foreground">{row.name}</span>
            {row.banned && <BannedBadge reason={row.banReason} />}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px] text-black/50">
            <span className="tabular-nums">{plural(row.bookings, 'booking')}</span>
            {row.onRoad && <span className="rounded-full bg-[#6EA4E7]/[0.14] px-2 py-0.5 text-[11px] font-medium text-brand-strong">On the road now</span>}
          </span>
          {row.plates.length > 0 && (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-black/50">
              {row.plates.slice(0, PLATES_SHOWN).map((plate) => <LicensePlate key={plate} plate={plate} />)}
              {extra > 0 && <span className="tabular-nums">+{extra}</span>}
            </span>
          )}
        </span>
        <WalletChip balance={row.balance} />
      </button>
    </li>
  );
};

/** Every customer with money on record. One tap opens their wallet, a second moves a balance. */
export const CustomerWalletsTab: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { filter, toggle, clear } = useUrlFilter<WalletFilter>(WALLET_FILTERS);
  const [rows, setRows] = useState<WalletSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const openId = params.get('wallet');

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchWalletSummaries()
      .then((result) => { if (!cancelled) setRows(result); })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); });
    return () => { cancelled = true; };
  }, [reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  // The open wallet is in the URL, so a refresh or the back button keeps it.
  const openWallet = (customerId: string | null) => {
    const next = new URLSearchParams(params);
    if (customerId) next.set('wallet', customerId);
    else next.delete('wallet');
    setParams(next);
  };

  const matched = useMemo(() => (rows ?? []).filter((row) => matchesWalletSearch(row, search)), [rows, search]);
  const totals = useMemo(() => walletTotals(matched), [matched]);
  const visible = useMemo(() => matched.filter((row) => inWalletFilter(row, filter)), [matched, filter]);

  return (
    <div className="media-scope">
      <MediaToaster />
      <p className="mb-4 text-[13.5px] text-black/50">Each customer's money across all their bookings. Open one to see every booking and move a balance between them.</p>

      {error && !rows ? (
        <LoadError message={`Couldn't load the customer wallets: ${error}`} onRetry={refresh} />
      ) : !rows ? (
        <>
          <FilterTileSkeleton split count={4} />
          <div className="mt-4 rounded-2xl border border-subtle bg-surface"><SkeletonRows count={6} /></div>
        </>
      ) : (
        <>
          <FilterTileRow split label="Filter the list">
            <FilterTile split mono tone="blue" icon={<UsersIcon size={22} />} label="All" value={String(totals.all)} sub="with money on record" active={filter === 'all'} onClick={clear} />
            <FilterTile split mono wide tone="red" icon={<ReceiptIcon size={22} />} label="Owe us" value={formatWalletMoney(totals.owesTotal)} sub={plural(totals.owesCount, 'customer')} active={filter === 'owes'} onClick={() => toggle('owes')} />
            <FilterTile split mono wide tone="green" icon={<WalletIcon size={22} />} label="In credit" value={formatWalletMoney(totals.creditTotal)} sub={plural(totals.creditCount, 'customer')} active={filter === 'credit'} onClick={() => toggle('credit')} />
            <FilterTile split mono tone="slate" icon={<TransferIcon size={22} />} label="Settled" value={String(totals.settledCount)} sub="nothing open" active={filter === 'settled'} onClick={() => toggle('settled')} />
          </FilterTileRow>

          <div className="mt-4">
            <SearchField value={search} onChange={setSearch} placeholder="Search name, phone or plate" className="w-full max-w-[420px]" />
          </div>

          <div className="mt-3">
            {visible.length === 0 ? (
              <p className="rounded-2xl border border-subtle bg-surface px-4 py-10 text-center text-[13.5px] text-black/45">
                {search.trim() || filter !== 'all' ? 'No customers match.' : 'No customer has money on record yet.'}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((row) => <CustomerCard key={row.customerId} row={row} onOpen={() => openWallet(row.customerId)} />)}
              </ul>
            )}
          </div>
        </>
      )}

      {openId && (
        <CustomerWalletSheet
          customerId={openId}
          refreshKey={reload}
          notify={notify}
          onChanged={refresh}
          onClose={() => openWallet(null)}
        />
      )}
    </div>
  );
};
