import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from '../../components/media/MediaIcons';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button, Switch } from '../../components/media/MediaUI';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../../components/shared/FilterTile';
import { LoadError, SearchField, SkeletonRows } from '../../components/shared/PageBits';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import {
  ACCOUNT_FILTERS,
  fetchCashAccounts,
  formatIban,
  inAccountFilter,
  KIND_LABELS,
  setAccountActive,
  type AccountKind,
  type CashAccount,
} from '../../lib/cashAccounts';
import { cn } from '../../lib/media/badgeColor';
import { balancesOf, fetchAccountBalances, type AccountBalance, type CurrencyTotal } from '../../lib/cashEnvelopes';
import { CURRENCY_SYMBOLS, formatMoney } from '../../lib/money';
import { AccountFormSheet } from '../cashAccounts/AccountFormSheet';
import { WalletIcon } from '../customers/ui';

const KIND_PATHS: Record<AccountKind, React.ReactNode> = {
  safe: <><path d="M4 4h16v16H4z" /><circle cx="12" cy="12" r="3.5" /><path d="M12 8.5V7M12 17v-1.5M4 20v1M20 20v1" /></>,
  bank: <path d="M3 10h18L12 4zM5 10v8M10 10v8M14 10v8M19 10v8M3 20h18" />,
  pos: <><path d="M7 3h10v18H7z" /><path d="M10 7h4M10 12h.01M14 12h.01M10 16h.01M14 16h.01" /></>,
  gateway: <><path d="M3 6h18v12H3z" /><path d="M3 10h18M7 15h4" /></>,
  custody: <><circle cx="12" cy="8" r="4" /><path d="M5 21c.8-4 3.5-6 7-6s6.2 2 7 6" /></>,
  other: <><circle cx="6" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" /></>,
};

const KindIcon: React.FC<{ kind: AccountKind; size?: number }> = ({ kind, size = 18 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {KIND_PATHS[kind]}
  </svg>
);

const accountWord = (count: number) => (count === 1 ? 'account' : 'accounts');

const AccountRow: React.FC<{ account: CashAccount; balances: CurrencyTotal[]; onEdit: () => void; onActive: (on: boolean) => void }> = ({ account, balances, onEdit, onActive }) => (
  <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-subtle px-4 py-3 last:border-b-0 xl:grid-cols-[minmax(0,1.3fr)_120px_130px_minmax(0,1.2fr)_120px_92px]">
    <div className="flex min-w-0 items-center gap-3">
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', account.is_active ? 'bg-primary/10 text-primary' : 'bg-black/[0.05] text-black/40')}><KindIcon kind={account.kind} /></span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-foreground">{account.name}</span>
        <span className="block truncate font-mono text-[11.5px] text-black/45">{account.code}</span>
      </span>
    </div>
    <span className="col-start-2 row-start-1 flex items-center gap-1 justify-self-end xl:hidden">
      <Switch checked={account.is_active} onChange={onActive} ariaLabel={`${account.name} active`} activeClass="bg-primary" />
    </span>
    <span className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-black/60 xl:contents">
      <span>{KIND_LABELS[account.kind]}{account.branch ? <span className="xl:block xl:text-[12px] xl:text-black/45"><span className="xl:hidden"> · </span>{account.branch}</span> : ''}</span>
      <span className="flex gap-1">
        {account.currencies.map((currency) => <span key={currency} className="grid h-6 w-6 place-items-center rounded-full bg-black/[0.05] text-[12px] font-medium text-black/60" title={currency}>{CURRENCY_SYMBOLS[currency]}</span>)}
      </span>
      <span className="min-w-0 break-all font-mono text-[12px] text-black/55">{account.iban ? formatIban(account.iban) : ''}</span>
      <span className="tabular-nums text-foreground xl:text-end">
        {balances.length === 0 ? <span className="text-black/35">—</span> : balances.map((row) => <span key={row.currency} className="block">{formatMoney(row.total, row.currency)}</span>)}
      </span>
    </span>
    <span className="col-span-2 flex items-center justify-end gap-3 xl:col-span-1">
      <span className="hidden xl:inline-flex"><Switch checked={account.is_active} onChange={onActive} ariaLabel={`${account.name} active`} activeClass="bg-primary" /></span>
      <button type="button" onClick={onEdit} className="min-h-[44px] text-[13px] font-medium text-primary hover:underline md:min-h-[32px]">Edit</button>
    </span>
  </li>
);

export const CashAccountsTab: React.FC = () => {
  const { filter, toggle, clear } = useUrlFilter(ACCOUNT_FILTERS);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<{ account: CashAccount | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([fetchCashAccounts(), fetchAccountBalances()])
      .then(([rows, balanceRows]) => {
        if (cancelled) return;
        setAccounts(rows);
        setBalances(balanceRows);
      })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const count = (key: typeof ACCOUNT_FILTERS[number]) => accounts.filter((account) => inAccountFilter(account, key)).length;
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return accounts.filter((account) => inAccountFilter(account, filter)
      && (!query || [account.name, account.code, account.branch, account.bank_name].some((text) => text?.toLowerCase().includes(query))));
  }, [accounts, filter, search]);

  const setActive = async (account: CashAccount, active: boolean) => {
    const put = (value: boolean) => setAccounts((current) => current.map((row) => (row.id === account.id ? { ...row, is_active: value } : row)));
    put(active);
    try {
      await setAccountActive(account.id, active);
    } catch (failure) {
      put(!active);
      toast.error(`Couldn't change this account: ${failure instanceof Error ? failure.message : 'try again'}`);
    }
  };

  const saved = (account: CashAccount) => {
    const adding = sheet?.account === null;
    setAccounts((current) => (adding ? [...current, account] : current.map((row) => (row.id === account.id ? account : row))));
    setSheet(null);
    toast.success(adding ? 'Account added.' : 'Account updated.');
  };

  return (
    <div className="media-scope">
      {error && <LoadError message={`Couldn't load the accounts: ${error}`} onRetry={() => { setLoading(true); setReload((value) => value + 1); }} />}

      {loading ? <FilterTileSkeleton /> : (
        <FilterTileRow label="Filter accounts">
          <FilterTile tone="blue" icon={<WalletIcon size={15} />} label="All" value={String(accounts.length)} sub={accountWord(accounts.length)} active={filter === 'all'} onClick={clear} />
          <FilterTile tone="amber" icon={<KindIcon kind="safe" size={15} />} label="Safes" value={String(count('safe'))} sub={accountWord(count('safe'))} active={filter === 'safe'} onClick={() => toggle('safe')} />
          <FilterTile tone="teal" icon={<KindIcon kind="bank" size={15} />} label="Banks" value={String(count('bank'))} sub={accountWord(count('bank'))} active={filter === 'bank'} onClick={() => toggle('bank')} />
          <FilterTile tone="violet" icon={<KindIcon kind="pos" size={15} />} label="POS & gateways" value={String(count('pos'))} sub={accountWord(count('pos'))} active={filter === 'pos'} onClick={() => toggle('pos')} />
          <FilterTile tone="green" icon={<KindIcon kind="custody" size={15} />} label="Custody" value={String(count('custody'))} sub={accountWord(count('custody'))} active={filter === 'custody'} onClick={() => toggle('custody')} />
        </FilterTileRow>
      )}

      <div className="mt-4 flex max-w-[1100px] flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="Search name, code, branch…" className="min-w-[220px] flex-1" />
        <Button size="lg" className="!h-11 px-4 md:!h-10" onClick={() => setSheet({ account: null })}><Plus size={15} /> New account</Button>
      </div>

      <div className="mt-4 max-w-[1100px] overflow-hidden rounded-xl border border-subtle bg-surface">
        {loading ? <SkeletonRows /> : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13.5px] text-black/45">{accounts.length === 0 ? 'No accounts yet.' : 'No accounts match this view.'}</p>
        ) : (
          <>
            <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.3fr)_120px_130px_minmax(0,1.2fr)_120px_92px] gap-x-3 border-b border-subtle px-4 py-2 text-[11.5px] font-medium text-black/45 xl:grid">
              <span>Account</span><span>Kind</span><span>Currencies</span><span>IBAN</span><span className="text-end">Balance</span><span className="text-end">Active</span>
            </div>
            <ul>
              {visible.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  balances={balancesOf(balances, account.id)}
                  onEdit={() => setSheet({ account })}
                  onActive={(on) => setActive(account, on)}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {sheet && <AccountFormSheet account={sheet.account} accounts={accounts} onClose={() => setSheet(null)} onSaved={saved} />}
      <MediaToaster />
    </div>
  );
};

