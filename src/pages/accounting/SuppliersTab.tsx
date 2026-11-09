import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Plus } from '../../components/media/MediaIcons';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button } from '../../components/media/MediaUI';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../../components/shared/FilterTile';
import { LoadError, SearchField, SkeletonRows } from '../../components/shared/PageBits';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import { formatMoney, type Currency } from '../../lib/money';
import { useMoney } from '../../hooks/useMoney';
import {
  CATEGORY_LABELS,
  fetchSupplierBalances,
  fetchSuppliers,
  inSupplierFilter,
  matchesSupplier,
  owedByCurrency,
  SUPPLIER_FILTERS,
  whatsappLink,
  type Supplier,
  type SupplierBalance,
} from '../../lib/suppliers';
import { MoreIcon, PhoneIcon, UsersIcon, WalletIcon, WhatsAppIcon } from '../customers/ui';
import { SupplierFormSheet } from '../suppliers/SupplierFormSheet';
import { BalanceLines, CategoryIcon } from '../suppliers/ui';

export const supplierPath = (id: number) => `/dashboard/accounting?tab=suppliers&supplier=${id}`;

const supplierWord = (count: number) => (count === 1 ? 'supplier' : 'suppliers');

const SupplierCard: React.FC<{ supplier: Supplier; balances: SupplierBalance[] }> = ({ supplier, balances }) => {
  const chat = whatsappLink(supplier.whatsapp || supplier.phone || '');
  return (
    <li className="relative flex min-w-0 flex-col gap-3 rounded-xl border border-subtle bg-surface p-3.5 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-2.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CategoryIcon category={supplier.category} size={18} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14.5px] font-medium text-foreground">
            {/* The whole card opens the sheet. The phone links sit above this. */}
            <Link to={supplierPath(supplier.id)} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary">{supplier.name}</Link>
          </h2>
          <p className="text-[12.5px] text-black/50">
            {CATEGORY_LABELS[supplier.category]}{supplier.district ? ` · ${supplier.district}` : ''}
          </p>
        </div>
        {!supplier.is_active && <span className="shrink-0 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11.5px] text-black/50">Inactive</span>}
      </div>
      <div className="mt-auto flex items-end justify-between gap-3">
        <span className="relative z-10 flex items-center gap-1.5">
          {supplier.phone && <a href={`tel:${supplier.phone}`} aria-label={`Call ${supplier.name}`} className="grid h-11 w-11 place-items-center rounded-lg border border-subtle text-black/55 hover:text-primary md:h-9 md:w-9"><PhoneIcon size={15} /></a>}
          {chat && <a href={chat} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${supplier.name}`} className="grid h-11 w-11 place-items-center rounded-lg border border-subtle text-[#15803D] hover:opacity-80 md:h-9 md:w-9"><WhatsAppIcon size={15} /></a>}
        </span>
        <BalanceLines balances={balances} />
      </div>
    </li>
  );
};

export const SuppliersTab: React.FC = () => {
  const { format } = useMoney();
  // Lira bills follow the top-bar currency; dollar and euro bills are real debts in that currency.
  const supplierMoney = (amount: number, currency: Currency) => (currency === 'TRY' ? format(amount) : formatMoney(amount, currency));
  const navigate = useNavigate();
  const { filter, toggle, clear } = useUrlFilter(SUPPLIER_FILTERS);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [balances, setBalances] = useState<SupplierBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([fetchSuppliers(), fetchSupplierBalances()])
      .then(([supplierRows, balanceRows]) => {
        if (cancelled) return;
        setSuppliers(supplierRows);
        setBalances(balanceRows);
      })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const balancesOf = useCallback((id: number) => balances.filter((row) => row.supplier_id === id), [balances]);
  const count = useCallback((key: typeof SUPPLIER_FILTERS[number]) => (
    suppliers.filter((supplier) => inSupplierFilter(supplier, balancesOf(supplier.id), key)).length
  ), [suppliers, balancesOf]);

  const owed = useMemo(() => owedByCurrency(balances), [balances]);
  const visible = useMemo(() => suppliers.filter((supplier) => (
    inSupplierFilter(supplier, balancesOf(supplier.id), filter)
    && (matchesSupplier(supplier, search) || CATEGORY_LABELS[supplier.category].toLowerCase().includes(search.trim().toLowerCase()))
  )), [suppliers, balancesOf, filter, search]);

  const owedCount = count('owed');

  return (
    <div className="media-scope">
      {error && <LoadError message={`Couldn't load the suppliers: ${error}`} onRetry={() => { setLoading(true); setReload((value) => value + 1); }} />}

      {loading ? <FilterTileSkeleton count={4} /> : (
        <FilterTileRow label="Filter suppliers">
          <FilterTile tone="blue" icon={<UsersIcon size={15} />} label="All suppliers" value={String(suppliers.length)} sub={supplierWord(suppliers.length)} active={filter === 'all'} onClick={clear} />
          <FilterTile
            tone="red"
            icon={<WalletIcon size={15} />}
            label="We owe"
            value={owed.length > 0 ? supplierMoney(owed[0].total, owed[0].currency) : format(0)}
            sub={[`${owedCount} ${supplierWord(owedCount)}`, ...owed.slice(1).map((row) => supplierMoney(row.total, row.currency))].join(' · ')}
            active={filter === 'owed'}
            onClick={() => toggle('owed')}
          />
          <FilterTile tone="green" icon={<Check size={15} strokeWidth={2.5} />} label="Settled" value={String(count('settled'))} sub={supplierWord(count('settled'))} active={filter === 'settled'} onClick={() => toggle('settled')} />
          <FilterTile tone="neutral" icon={<MoreIcon size={15} />} label="Inactive" value={String(count('inactive'))} sub={supplierWord(count('inactive'))} active={filter === 'inactive'} onClick={() => toggle('inactive')} />
        </FilterTileRow>
      )}

      <div className="mt-4 flex max-w-[1100px] flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="Search name or category…" className="min-w-[220px] flex-1" />
        <Button size="lg" className="!h-11 px-4 md:!h-10" onClick={() => setAdding(true)}><Plus size={15} /> New supplier</Button>
      </div>

      <div className="mt-4 max-w-[1100px]">
        {loading ? <div className="rounded-xl border border-subtle bg-surface"><SkeletonRows /></div>
          : !error && visible.length === 0 ? (
            <div className="rounded-xl border border-subtle bg-surface px-6 py-12 text-center">
              <p className="text-[15px] font-medium text-foreground">{suppliers.length === 0 ? 'No suppliers yet' : 'No suppliers match this view'}</p>
              {suppliers.length === 0 && (
                <>
                  <p className="mt-1 text-[13.5px] text-black/50">Add the workshops and shops you buy from, and their sheets start here.</p>
                  <Button size="lg" className="mt-4 !h-11 px-4 md:!h-10" onClick={() => setAdding(true)}><Plus size={15} /> New supplier</Button>
                </>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((supplier) => <SupplierCard key={supplier.id} supplier={supplier} balances={balancesOf(supplier.id)} />)}
            </ul>
          )}
      </div>

      {adding && (
        <SupplierFormSheet
          supplier={null}
          onClose={() => setAdding(false)}
          onSaved={(saved) => { toast.success('Supplier added.'); navigate(supplierPath(saved.id)); }}
        />
      )}
      <MediaToaster />
    </div>
  );
};

