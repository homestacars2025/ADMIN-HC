import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, X } from '../components/media/MediaIcons';
import { MediaToaster } from '../components/media/MediaToast';
import { Button } from '../components/media/MediaUI';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../components/shared/FilterTile';
import MonthNav from '../components/shared/MonthNav';
import { LoadError, PageHeader, SearchField } from '../components/shared/PageBits';
import { InvestorAvatar } from '../components/shared/PersonAvatar';
import { StatusImage } from '../components/shared/StatusImage';
import { useUrlFilter } from '../hooks/useUrlFilter';
import { formatLira, istanbulDate } from '../lib/customers';
import { shiftCalendarMonth } from '../lib/fleetCalendar';
import {
  INVESTOR_FILTERS,
  INVESTOR_LOW_UTILIZATION,
  fetchInvestorsOverview,
  investorTotals,
  matchesInvestorFilter,
  matchesInvestorSearch,
  type InvestorOverview,
} from '../lib/investors';
import { InvestorDrawer, type DrawerTab } from './investors/InvestorDrawer';
import { Glossy3D, InvestorCard, InvestorCardSkeleton } from './investors/InvestorParts';

const DRAWER_TABS: readonly DrawerTab[] = ['fleet', 'month', 'info'];
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const InvestorsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const thisMonth = istanbulDate().slice(0, 7);
  const requested = params.get('month');
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : thisMonth;
  const monthDate = new Date(`${month}-01T12:00:00Z`);
  const monthLabel = monthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthShort = monthDate.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

  const { filter, toggle, clear } = useUrlFilter(INVESTOR_FILTERS);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<{ month: string; rows: InvestorOverview[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    setError(null);
    fetchInvestorsOverview(month)
      .then((rows) => { if (active) setData({ month, rows }); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [month, reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  const updateParams = useCallback((change: (next: URLSearchParams) => void, replace = false) => {
    const next = new URLSearchParams(params);
    change(next);
    setParams(next, { replace });
  }, [params, setParams]);

  const setMonth = (next: string) => updateParams((updated) => {
    if (next === thisMonth) updated.delete('month'); else updated.set('month', next);
  });

  // The open investor lives in the URL too, so a refresh or a shared link reopens it.
  const openId = params.get('investor');
  const rawTab = params.get('tab') as DrawerTab | null;
  const tab: DrawerTab = rawTab && DRAWER_TABS.includes(rawTab) ? rawTab : 'fleet';
  const openInvestor = (id: string) => updateParams((updated) => { updated.set('investor', id); updated.delete('tab'); });
  const closeInvestor = useCallback(() => updateParams((updated) => { updated.delete('investor'); updated.delete('tab'); }), [updateParams]);
  const setTab = (next: DrawerTab) => updateParams((updated) => { if (next === 'fleet') updated.delete('tab'); else updated.set('tab', next); }, true);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  // Active investors first, the RPC's biggest-fleet-first order inside each.
  const ordered = useMemo(() => [...rows].sort((a, b) => Number(b.isActive) - Number(a.isActive)), [rows]);
  const totals = useMemo(() => investorTotals(rows), [rows]);
  const visible = useMemo(
    () => ordered.filter((investor) => matchesInvestorFilter(investor, filter) && matchesInvestorSearch(investor, query)),
    [ordered, filter, query],
  );
  const selected = openId ? rows.find((investor) => investor.id === openId) ?? null : null;
  const loading = data === null && !error;
  const stale = data !== null && data.month !== month;

  return (
    <div className="media-scope mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <MediaToaster />
      <PageHeader
        eyebrow="Management"
        title="Investors"
        subtitle={data ? `${plural(totals.investors, 'investor', 'investors')} · ${plural(totals.cars, 'car', 'cars')} · figures for ${monthLabel}` : `Figures for ${monthLabel}`}
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MonthNav label={monthLabel} justify="flex-end" onPrev={() => setMonth(shiftCalendarMonth(month, -1))} onNext={() => setMonth(shiftCalendarMonth(month, 1))} />
            {month !== thisMonth && <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-9" onClick={() => setMonth(thisMonth)}>This month</Button>}
            <Button size="lg" className="!h-11 px-4 md:!h-9" onClick={() => setAdding(true)}>
              <Plus size={15} /> Add investor
            </Button>
          </div>
        )}
      />

      {error && !data ? (
        <LoadError message={`Couldn't load the investors: ${error}`} onRetry={refresh} />
      ) : loading ? (
        <>
          <FilterTileSkeleton count={7} columns={7} />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <InvestorCardSkeleton key={index} />)}
          </div>
        </>
      ) : (
        <>
          <div className={stale ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={stale}>
            <FilterTileRow label="Filter the investors" columns={7}>
              <FilterTile
                tone="blue" mono bareIcon icon={<InvestorAvatar size={32} alt="" />}
                label="Investors" value={String(totals.investors)} sub={`${totals.activeInvestors} active`}
                active={filter === 'all'} onClick={clear}
              />
              <FilterTile
                tone="slate" mono bareIcon icon={<StatusImage status="fleet" size={32} />}
                label="Total cars" value={String(totals.cars)} sub={`in service · ${plural(totals.counts.cars, 'investor', 'investors')}`}
                active={filter === 'cars'} onClick={() => toggle('cars')}
              />
              <FilterTile
                tone="green" mono bareIcon icon={<StatusImage status="working" size={32} />}
                label="Rented now" value={String(totals.rentedNow)} sub={`of ${totals.cars} · ${plural(totals.counts.rented, 'investor', 'investors')}`}
                active={filter === 'rented'} onClick={() => toggle('rented')}
              />
              <FilterTile
                tone="violet" mono bareIcon icon={<Glossy3D tone="violet" glyph="gauge" />}
                label="Avg utilization" value={totals.utilization !== null ? `${totals.utilization}%` : '—'} sub={`${totals.counts.low} below ${INVESTOR_LOW_UTILIZATION}%`}
                active={filter === 'low'} onClick={() => toggle('low')}
              />
              <FilterTile
                tone="teal" mono bareIcon icon={<Glossy3D tone="green" glyph="in" />}
                label={`IN · ${monthShort}`} value={formatLira(totals.monthIn)} sub={plural(totals.counts.in, 'investor', 'investors')}
                active={filter === 'in'} onClick={() => toggle('in')}
              />
              <FilterTile
                tone="coral" mono bareIcon icon={<Glossy3D tone="coral" glyph="out" />}
                label={`OUT · ${monthShort}`} value={formatLira(totals.monthOut)} sub={plural(totals.counts.out, 'investor', 'investors')}
                active={filter === 'out'} onClick={() => toggle('out')}
              />
              <FilterTile
                tone={totals.net < 0 ? 'red' : 'blue'} mono bareIcon icon={<Glossy3D tone="blue" glyph="net" />}
                label="Net" value={formatLira(totals.net)} sub={`${totals.counts.net} in the red`}
                active={filter === 'net'} onClick={() => toggle('net')}
              />
            </FilterTileRow>
          </div>

          {error && (
            <div className="mt-4">
              <LoadError message={`Couldn't load ${monthLabel}: ${error}`} onRetry={refresh} />
            </div>
          )}

          <div className="mb-4 mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SearchField value={query} onChange={setQuery} placeholder="Search name, model or plate" className="w-full sm:w-[340px]" />
            <p className="text-[12.5px] tabular-nums text-black/45" aria-live="polite">
              {visible.length === rows.length ? plural(rows.length, 'investor', 'investors') : `${visible.length} of ${rows.length} investors`}
            </p>
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-14 text-center">
              <InvestorAvatar size={88} alt="" />
              <p className="mt-1 text-[15px] font-medium text-foreground">{rows.length === 0 ? 'No investors yet' : 'No investor matches'}</p>
              <p className="max-w-[360px] text-[13px] text-black/50">
                {rows.length === 0 ? 'Add the first investor, then pick them on their cars.' : 'Try another name or plate, or clear the filter.'}
              </p>
              {rows.length === 0 ? (
                <Button size="lg" className="mt-2 !h-11 px-4 md:!h-9" onClick={() => setAdding(true)}><Plus size={15} /> Add investor</Button>
              ) : (
                <Button variant="outline" size="lg" className="mt-2 !h-11 px-4 md:!h-9" onClick={() => { setQuery(''); clear(); }}>Show all</Button>
              )}
            </div>
          ) : (
            <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${stale ? 'opacity-60 transition-opacity' : 'transition-opacity'}`}>
              {visible.map((investor) => (
                <InvestorCard key={investor.id} investor={investor} monthShort={monthShort} onOpen={() => openInvestor(investor.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {selected && (
        <InvestorDrawer
          key={selected.id}
          investor={selected}
          month={month}
          monthLabel={monthLabel}
          tab={tab}
          onTab={setTab}
          onClose={closeInvestor}
          onChanged={refresh}
        />
      )}
      {adding && <AddInvestorDialog onClose={() => setAdding(false)} />}
    </div>
  );
};

/**
 * Investors are made the way they always were: an account on the Users page, set to
 * the Investor role, which creates the investor. This says so and goes there.
 */
const AddInvestorDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="media-scope fixed inset-0 z-[1000] flex items-end justify-center p-3 sm:items-center sm:p-5">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" style={{ animation: 'm-fade-in 150ms ease-out' }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="add-investor-title" className="relative w-full max-w-[440px] rounded-[22px] bg-white p-5 shadow-[0_24px_64px_-16px_rgb(0_0_0/0.3)] sm:p-6" style={{ animation: 'm-pop-in 160ms ease-out' }}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute end-3 top-3 grid h-11 w-11 place-items-center rounded-[10px] text-black/45 hover:bg-black/[0.05] md:h-9 md:w-9">
          <X size={16} />
        </button>
        <InvestorAvatar size={56} alt="" />
        <h2 id="add-investor-title" className="mt-4 text-[17px] font-semibold tracking-[-0.015em] text-foreground">Add an investor</h2>
        <ol className="mt-3 space-y-2.5 text-[13.5px] text-black/65">
          <li className="flex gap-2.5"><Step n={1} /><span>Create their account on the Users page with <span className="font-medium text-foreground">Add User</span>.</span></li>
          <li className="flex gap-2.5"><Step n={2} /><span>Open the account and set its role to <span className="font-medium text-foreground">Investor</span>.</span></li>
          <li className="flex gap-2.5"><Step n={3} /><span>They appear here. Fill in company, contacts and commission under <span className="font-medium text-foreground">Info</span>.</span></li>
        </ol>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" className="!h-11 md:!h-10" onClick={onClose}>Cancel</Button>
          <Link to="/dashboard/users?add=1" className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-[#6EA4E7] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#5A93DD] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-10">
            <Plus size={15} /> Go to Add User
          </Link>
        </div>
      </div>
    </div>
  );
};

const Step: React.FC<{ n: number }> = ({ n }) => (
  <span aria-hidden="true" className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#6EA4E7]/[0.14] text-[11px] font-semibold text-[#2F6FB8]">{n}</span>
);

export default InvestorsPage;
