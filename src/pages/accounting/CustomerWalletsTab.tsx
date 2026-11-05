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
import { ReceiptIcon, UsersIcon, WalletIcon } from '../customers/ui';

const notify: Notify = (message, type) => (type === 'success' ? toast.success(message) : toast.error(message));

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

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
            <SearchField value={search} onChange={setSearch} placeholder="Search name or phone" className="w-full max-w-[420px]" />
          </div>

          <div className="mt-3">
            {visible.length === 0 ? (
              <p className="rounded-2xl border border-subtle bg-surface px-4 py-10 text-center text-[13.5px] text-black/45">
                {search.trim() || filter !== 'all' ? 'No customers match.' : 'No customer has money on record yet.'}
              </p>
            ) : (
              <ul className="overflow-hidden rounded-2xl border border-subtle bg-surface">
                {visible.map((row) => (
                  <li key={row.customerId} className="border-b border-subtle last:border-b-0">
                    <button
                      type="button"
                      onClick={() => openWallet(row.customerId)}
                      className="flex min-h-[60px] w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-black/[0.02] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[#6EA4E7]/30 sm:px-4"
                    >
                      <CustomerAvatar alt="" size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-foreground">{row.name}</span>
                        <span className="block truncate text-[12.5px] tabular-nums text-black/50">
                          {plural(row.bookings, 'booking')}{row.phone ? ` · ${row.phone}` : ''}
                        </span>
                      </span>
                      <WalletChip balance={row.balance} />
                    </button>
                  </li>
                ))}
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
