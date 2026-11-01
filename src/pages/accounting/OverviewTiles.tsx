import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from '../../components/media/MediaIcons';
import { ComplianceTriangle } from '../../components/shared/ComplianceBits';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../../components/shared/FilterTile';
import { useCurrentProfile } from '../../hooks/useCurrentProfile';
import { useCurrency } from '../../lib/CurrencyContext';
import { istanbulDate } from '../../lib/customers';
import { fetchCustodyMovements, fetchSignatures, reviewStats, signatureMap, type ReviewExpense, type Signature } from '../../lib/expenseApprovals';
import { fetchFinanceOverview, type FinanceOverview } from '../../lib/financeOverview';
import { formatMoney } from '../../lib/money';
import { ClockIcon, UsersIcon } from '../customers/ui';

const counted = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;

interface Loaded {
  overview: FinanceOverview;
  movements: ReviewExpense[];
  signatures: Signature[];
}

/** What needs someone's attention, under the treasury card. Each tile opens where it's dealt with. */
export const OverviewTiles: React.FC = () => {
  const navigate = useNavigate();
  const { fmt } = useCurrency();
  const { profile } = useCurrentProfile();
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchFinanceOverview(), fetchCustodyMovements(), fetchSignatures()])
      .then(([overview, movements, signatures]) => { if (!cancelled) setData({ overview, movements, signatures }); })
      // The summary below stands on its own, so this only loses the tiles.
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const month = istanbulDate().slice(0, 7);
  const stats = useMemo(() => (data
    ? reviewStats(data.movements, { month, me: profile?.id ?? null, signatures: signatureMap(data.signatures) })
    : null), [data, month, profile?.id]);

  if (failed) return null;
  if (!data || !stats) return <div className="media-scope"><FilterTileSkeleton count={4} /></div>;

  const go = (to: string) => () => navigate(to);

  return (
    <div className="media-scope">
      <FilterTileRow label="Needs attention">
        <FilterTile tone="amber" icon={<ClockIcon size={15} />} label="Pending approvals" value={formatMoney(stats.pending.total)} sub={counted(stats.pending.count, 'expense')} active={false} onClick={go('/dashboard/accounting?tab=custody&filter=pending')} />
        <FilterTile tone="violet" icon={<Check size={15} strokeWidth={2.5} />} label="Unsigned by me" value={String(stats.unsigned.count)} sub={formatMoney(stats.unsigned.total)} active={false} onClick={go('/dashboard/accounting?tab=custody&filter=unsigned')} />
        <FilterTile tone="red" icon={<UsersIcon size={15} />} label="Customers owing" value={fmt(data.overview.customersOwing.total)} sub={counted(data.overview.customersOwing.count, 'customer')} active={false} onClick={go('/dashboard/accounting?tab=customers')} />
        <FilterTile tone="red" bareIcon icon={<ComplianceTriangle tone="red" size={32} />} label="Unpaid fines" value={fmt(data.overview.fines.total)} sub={counted(data.overview.fines.count, 'fine')} active={false} onClick={go('/dashboard/fines?filter=unpaid')} />
      </FilterTileRow>
    </div>
  );
};
