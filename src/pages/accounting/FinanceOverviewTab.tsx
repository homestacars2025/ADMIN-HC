import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Plus } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { ComplianceTriangle } from '../../components/shared/ComplianceBits';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../../components/shared/FilterTile';
import { LoadError, SkeletonRows } from '../../components/shared/PageBits';
import { useCurrentProfile } from '../../hooks/useCurrentProfile';
import { formatDate, istanbulDate } from '../../lib/customers';
import {
  fetchCustodyMovements,
  fetchSignatures,
  fetchWalletBalances,
  reviewStats,
  signatureMap,
  type ReviewExpense,
  type Signature,
} from '../../lib/expenseApprovals';
import { fetchFinanceOverview, type FinanceOverview } from '../../lib/financeOverview';
import { formatMoney } from '../../lib/money';
import { getAvatarProfiles, type ProfileOption } from '../../lib/notifications';
import { LicensePlate } from '../bookings/ui';
import { CarIcon, ClockIcon, FileIcon, UsersIcon, WalletIcon } from '../customers/ui';

const LATEST = 5;

const counted = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;

const Panel: React.FC<{ title: string; to: string; action: string; children: React.ReactNode }> = ({ title, to, action, children }) => (
  <section className="min-w-0 overflow-hidden rounded-xl border border-subtle bg-surface">
    <header className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-2.5">
      <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
      <Link to={to} className="inline-flex min-h-[44px] items-center text-[13px] font-medium text-primary hover:underline md:min-h-[28px]">{action}</Link>
    </header>
    {children}
  </section>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="px-4 py-8 text-center text-[13.5px] text-black/45">{children}</p>;

interface Loaded {
  overview: FinanceOverview;
  movements: ReviewExpense[];
  signatures: Signature[];
  custody: number;
  people: Record<string, ProfileOption>;
}

export const FinanceOverviewTab: React.FC<{ onAddTransaction: () => void }> = ({ onAddTransaction }) => {
  const navigate = useNavigate();
  const { profile } = useCurrentProfile();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const month = istanbulDate().slice(0, 7);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([fetchFinanceOverview(month), fetchCustodyMovements(), fetchSignatures(), fetchWalletBalances()])
      .then(async ([overview, movements, signatures, balances]) => {
        const pending = movements.filter((row) => row.direction === 'OUT' && row.review_status === 'pending').slice(0, LATEST);
        const people = await getAvatarProfiles(Array.from(new Set(pending.map((row) => row.employee_id))));
        if (cancelled) return;
        setData({ overview, movements, signatures, people, custody: balances.reduce((sum, row) => sum + row.balance, 0) });
      })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); });
    return () => { cancelled = true; };
  }, [month, reload]);

  const stats = useMemo(() => (data
    ? reviewStats(data.movements, { month, me: profile?.id ?? null, signatures: signatureMap(data.signatures) })
    : null), [data, month, profile?.id]);

  const go = (to: string) => () => navigate(to);
  const latest = data?.movements.filter((row) => row.direction === 'OUT' && row.review_status === 'pending').slice(0, LATEST) ?? [];
  const owed = data?.overview.suppliers.owed ?? [];

  if (error) return <div className="media-scope"><LoadError message={`Couldn't load the overview: ${error}`} onRetry={() => setReload((value) => value + 1)} /></div>;

  return (
    <div className="media-scope">
      {!data || !stats ? <FilterTileSkeleton count={9} /> : (
        <FilterTileRow label="Finance at a glance">
          <FilterTile tone="amber" icon={<ClockIcon size={15} />} label="Waiting approval" value={formatMoney(stats.pending.total)} sub={counted(stats.pending.count, 'expense')} active={false} onClick={go('/dashboard/accounting?tab=custody&filter=pending')} />
          <FilterTile tone="violet" icon={<Check size={15} strokeWidth={2.5} />} label="Unsigned by me" value={String(stats.unsigned.count)} sub={formatMoney(stats.unsigned.total)} active={false} onClick={go('/dashboard/accounting?tab=custody&filter=unsigned')} />
          <FilterTile tone="blue" icon={<WalletIcon size={15} />} label="Staff custody" value={formatMoney(data.custody)} sub="held by staff" active={false} onClick={go('/dashboard/accounting?tab=custody')} />
          <FilterTile tone="red" icon={<UsersIcon size={15} />} label="Customers owing us" value={formatMoney(data.overview.customers.owing.total)} sub={counted(data.overview.customers.owing.count, 'customer')} active={false} onClick={go('/dashboard/accounting?tab=customers')} />
          <FilterTile tone="green" icon={<UsersIcon size={15} />} label="Customers in credit" value={formatMoney(data.overview.customers.credit.total)} sub={counted(data.overview.customers.credit.count, 'customer')} active={false} onClick={go('/dashboard/accounting?tab=customers')} />
          <FilterTile tone="red" bareIcon icon={<ComplianceTriangle tone="red" size={32} />} label="Unpaid fines" value={formatMoney(data.overview.fines.total)} sub={counted(data.overview.fines.count, 'fine')} active={false} onClick={go('/dashboard/fines?filter=unpaid')} />
          <FilterTile
            tone="amber"
            icon={<WalletIcon size={15} />}
            label="Suppliers we owe"
            value={owed.length > 0 ? formatMoney(owed[0].total, owed[0].currency) : formatMoney(0)}
            sub={[counted(data.overview.suppliers.count, 'supplier'), ...owed.slice(1).map((row) => formatMoney(row.total, row.currency))].join(' · ')}
            active={false}
            onClick={go('/dashboard/accounting?tab=suppliers&filter=owed')}
          />
          <FilterTile tone="teal" icon={<CarIcon size={15} />} label="Car sheets this month" value={formatMoney(data.overview.carExpenses)} sub="expenses" active={false} onClick={go('/dashboard/accounting?tab=cars')} />
          <FilterTile tone="neutral" icon={<FileIcon size={15} />} label="Company this month" value={formatMoney(data.overview.companyExpenses)} sub="expenses" active={false} onClick={go('/dashboard/accounting?tab=expenses')} />
        </FilterTileRow>
      )}

      <div className="mt-4 flex max-w-[1100px] flex-wrap items-center gap-2">
        <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-10" onClick={onAddTransaction}><Plus size={15} /> Add transaction</Button>
        <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-10" onClick={go('/dashboard/accounting?tab=custody&filter=pending')}>Review expenses</Button>
        <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-10" onClick={go('/dashboard/accounting?tab=suppliers')}>Open suppliers</Button>
      </div>

      <div className="mt-4 grid max-w-[1100px] grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Latest waiting expenses" to="/dashboard/accounting?tab=custody&filter=pending" action="View all">
          {!data ? <SkeletonRows count={3} /> : latest.length === 0 ? <Empty>Nothing is waiting for approval.</Empty> : (
            <ul>
              {latest.map((row) => (
                <li key={row.id} className="flex items-center gap-3 border-b border-subtle px-4 py-2.5 last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-foreground">{row.description || row.category || 'Expense'}</span>
                    <span className="block truncate text-[12.5px] text-black/50">{data.people[row.employee_id]?.full_name ?? 'Unknown'} · {formatDate(row.transaction_date)}</span>
                  </span>
                  {row.plate && <LicensePlate plate={row.plate} />}
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums text-foreground">{formatMoney(row.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top debtors" to="/dashboard/accounting?tab=customers" action="View all">
          {!data ? <SkeletonRows count={3} /> : data.overview.customers.topDebtors.length === 0 ? <Empty>No customer owes us anything.</Empty> : (
            <ul>
              {data.overview.customers.topDebtors.map((row) => (
                <li key={row.customerId}>
                  <Link to={`/dashboard/customers/${row.customerId}`} className="flex min-h-[44px] items-center justify-between gap-3 border-b border-subtle px-4 py-2.5 transition-colors hover:bg-black/[0.02]">
                    <span className="min-w-0 truncate text-[13.5px] text-foreground">{row.name}</span>
                    <span className="shrink-0 text-[14px] font-semibold tabular-nums text-[#B91C1C]">{formatMoney(row.balance)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
};
