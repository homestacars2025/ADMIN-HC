import React, { useState } from 'react';
import { Plus } from '../../components/media/MediaIcons';
import { toast } from '../../components/media/MediaToast';
import { Button, Switch } from '../../components/media/MediaUI';
import { formatIban, KIND_LABELS, setAccountActive, type AccountKind, type CashAccount } from '../../lib/cashAccounts';
import { cn } from '../../lib/media/badgeColor';
import { balancesOf, type AccountBalance, type CurrencyTotal } from '../../lib/cashEnvelopes';
import { CURRENCY_SYMBOLS, formatMoney } from '../../lib/money';
import { AccountFormSheet } from '../cashAccounts/AccountFormSheet';

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

/** The accounts themselves. Cash & Envelopes loads them, so this only adds and edits. */
export const AccountsSection: React.FC<{
  accounts: CashAccount[];
  balances: AccountBalance[];
  onChange: (update: (current: CashAccount[]) => CashAccount[]) => void;
}> = ({ accounts, balances, onChange }) => {
  const [sheet, setSheet] = useState<{ account: CashAccount | null } | null>(null);

  const setActive = async (account: CashAccount, active: boolean) => {
    const put = (value: boolean) => onChange((current) => current.map((row) => (row.id === account.id ? { ...row, is_active: value } : row)));
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
    onChange((current) => (adding ? [...current, account] : current.map((row) => (row.id === account.id ? account : row))));
    setSheet(null);
    toast.success(adding ? 'Account added.' : 'Account updated.');
  };

  return (
    <section id="cash-accounts" aria-label="Accounts" className="mt-5 max-w-[1100px] scroll-mt-4">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-medium text-foreground">Accounts</h2>
        <Button size="lg" className="!h-11 px-4 md:!h-9" onClick={() => setSheet({ account: null })}><Plus size={15} /> New account</Button>
      </header>
      <div className="overflow-hidden rounded-xl border border-subtle bg-surface">
        {accounts.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13.5px] text-black/45">No accounts yet.</p>
        ) : (
          <>
            <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.3fr)_120px_130px_minmax(0,1.2fr)_120px_92px] gap-x-3 border-b border-subtle px-4 py-2 text-[11.5px] font-medium text-black/45 xl:grid">
              <span>Account</span><span>Kind</span><span>Currencies</span><span>IBAN</span><span className="text-end">Balance</span><span className="text-end">Active</span>
            </div>
            <ul>
              {accounts.map((account) => (
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
    </section>
  );
};
