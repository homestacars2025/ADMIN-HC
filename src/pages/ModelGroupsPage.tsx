import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus } from '../components/media/MediaIcons';
import { MediaToaster } from '../components/media/MediaToast';
import { Button } from '../components/media/MediaUI';
import { CarIcon3D } from '../components/shared/Icon3D';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../components/shared/FilterTile';
import MonthNav from '../components/shared/MonthNav';
import { LoadError, PageHeader, SearchField } from '../components/shared/PageBits';
import { StatusImage } from '../components/shared/StatusImage';
import { useUrlFilter } from '../hooks/useUrlFilter';
import { useUrlSort } from '../hooks/useUrlSort';
import { useCurrency } from '../lib/CurrencyContext';
import { istanbulDate } from '../lib/customers';
import { shiftCalendarMonth } from '../lib/fleetCalendar';
import {
  LOW_UTILIZATION,
  MODEL_FILTERS,
  MODEL_SORTS,
  fetchModelGroupStats,
  fetchModelGroups,
  fetchPricingTiers,
  filterCounts,
  firstSortDirection,
  matchesFilter,
  matchesSearch,
  sortGroups,
  type ModelGroupRow,
  type ModelGroupStats,
  type ModelSort,
  type PricingTier,
} from '../lib/modelGroups';
import { Segmented } from './bookings/ui';
import { GroupCarsDrawer } from './modelGroups/GroupCarsDrawer';
import { ModelGroupCard, ModelGroupCardSkeleton } from './modelGroups/ModelGroupCard';
import { ModelGroupSheet } from './modelGroups/ModelGroupSheet';

const SORT_LABELS: Record<ModelSort, string> = { utilization: 'Utilization', cars: 'Cars', price: 'Price', name: 'Name' };

interface Catalog {
  groups: ModelGroupRow[];
  tiers: PricingTier[];
}

const ModelGroupsPage: React.FC = () => {
  const { rates } = useCurrency();
  const usdRate = rates.find((rate) => rate.currency === 'USD')?.rate_to_try ?? null;
  const [params, setParams] = useSearchParams();
  const thisMonth = istanbulDate().slice(0, 7);
  const requested = params.get('month');
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : thisMonth;
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const { filter, toggle, clear } = useUrlFilter(MODEL_FILTERS);
  const sort = useUrlSort(MODEL_SORTS, { key: 'utilization', direction: 'desc' }, firstSortDirection);
  const [query, setQuery] = useState('');

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ month: string; rows: Map<number, ModelGroupStats> } | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<{ group: ModelGroupRow | null } | null>(null);
  const [viewing, setViewing] = useState<ModelGroupRow | null>(null);

  // The groups and tiers don't depend on the month; the figures do. Both start together.
  useEffect(() => {
    let active = true;
    setCatalogError(null);
    Promise.all([fetchModelGroups(), fetchPricingTiers()])
      .then(([groups, tiers]) => { if (active) setCatalog({ groups, tiers }); })
      .catch((reason: unknown) => { if (active) setCatalogError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    let active = true;
    setStatsError(null);
    fetchModelGroupStats(month)
      .then((rows) => { if (active) setStats({ month, rows }); })
      .catch((reason: unknown) => { if (active) setStatsError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [month, reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  const setMonth = (next: string) => {
    const updated = new URLSearchParams(params);
    if (next === thisMonth) updated.delete('month'); else updated.set('month', next);
    setParams(updated);
  };

  const statRows = useMemo(() => stats?.rows ?? new Map<number, ModelGroupStats>(), [stats]);
  const statsReady = stats?.month === month;
  const groups = useMemo(() => catalog?.groups ?? [], [catalog]);
  const counts = useMemo(() => filterCounts(groups, statRows), [groups, statRows]);
  const totalCars = useMemo(() => groups.reduce((sum, group) => sum + (statRows.get(group.id)?.cars_total ?? 0), 0), [groups, statRows]);
  const visible = useMemo(
    () => sortGroups(groups.filter((group) => matchesFilter(group, statRows.get(group.id), filter) && matchesSearch(group, query)), statRows, sort.key, sort.direction),
    [groups, statRows, filter, query, sort.key, sort.direction],
  );

  const loading = catalog === null && !catalogError;
  const SortArrow = sort.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div className="media-scope mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <MediaToaster />
      <PageHeader
        eyebrow="Fleet"
        title="Model Groups"
        subtitle={catalog ? `${groups.length} ${groups.length === 1 ? 'model group' : 'model groups'} · ${totalCars} ${totalCars === 1 ? 'car' : 'cars'} · figures for ${monthLabel}` : `Figures for ${monthLabel}`}
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MonthNav label={monthLabel} justify="flex-end" onPrev={() => setMonth(shiftCalendarMonth(month, -1))} onNext={() => setMonth(shiftCalendarMonth(month, 1))} />
            {month !== thisMonth && <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-9" onClick={() => setMonth(thisMonth)}>This month</Button>}
            <Button size="lg" className="!h-11 px-4 md:!h-9" onClick={() => setEditing({ group: null })}>
              <Plus size={15} /> New model group
            </Button>
          </div>
        )}
      />

      {catalogError ? (
        <LoadError message={`Couldn't load the model groups: ${catalogError}`} onRetry={refresh} />
      ) : loading ? (
        <>
          <FilterTileSkeleton count={4} />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <ModelGroupCardSkeleton key={index} />)}
          </div>
        </>
      ) : (
        <>
          <FilterTileRow label="Filter the model groups">
            <FilterTile mono tone="blue" bareIcon icon={<StatusImage status="fleet" size={56} />} label="All models" value={String(groups.length)} sub={`${totalCars} ${totalCars === 1 ? 'car' : 'cars'}`} active={filter === 'all'} onClick={clear} />
            <FilterTile mono tone="green" bareIcon icon={<StatusImage status="working" size={56} />} label="Fully rented now" value={statsReady || stats ? String(counts.rented) : '…'} sub="every active car out" active={filter === 'rented'} onClick={() => toggle('rented')} />
            <FilterTile mono tone="amber" bareIcon icon={<StatusImage status="parking" size={56} />} label="Low utilization" value={statsReady ? String(counts.low) : '…'} sub={`below ${LOW_UTILIZATION}% in ${monthLabel.split(' ')[0]}`} active={filter === 'low'} onClick={() => toggle('low')} />
            <FilterTile mono tone="slate" bareIcon icon={<CarIcon3D name="photos" size={52} />} label="No image" value={String(counts.noimage)} sub={counts.noimage === 1 ? 'group to finish' : 'groups to finish'} active={filter === 'noimage'} onClick={() => toggle('noimage')} />
          </FilterTileRow>

          {statsError && (
            <div className="mt-4">
              <LoadError message={`Couldn't load the figures for ${monthLabel}: ${statsError}`} onRetry={refresh} />
            </div>
          )}

          <div className="mb-4 mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField value={query} onChange={setQuery} placeholder="Search name or brand" className="w-full sm:w-[320px]" />
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="shrink-0 text-[12.5px] text-black/45">Sort</span>
              <Segmented
                ariaLabel="Sort model groups"
                value={sort.key}
                onChange={sort.sortBy}
                options={MODEL_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }))}
              />
              <button
                type="button"
                onClick={sort.reverse}
                aria-label={sort.direction === 'asc' ? 'Ascending, click for descending' : 'Descending, click for ascending'}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-black/50 hover:bg-black/[0.05] md:h-9 md:w-9"
              >
                <SortArrow size={15} />
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-14 text-center">
              <StatusImage status="parking" size={96} />
              <p className="text-[15px] font-medium text-foreground">{groups.length === 0 ? 'No model groups yet' : 'No model group matches'}</p>
              <p className="max-w-[340px] text-[13px] text-black/50">
                {groups.length === 0 ? 'Add the first one to start grouping cars by model.' : 'Try another search, or clear the filter.'}
              </p>
              {groups.length === 0 ? (
                <Button size="lg" className="mt-2 !h-11 px-4 md:!h-9" onClick={() => setEditing({ group: null })}><Plus size={15} /> New model group</Button>
              ) : (
                <Button variant="outline" size="lg" className="mt-2 !h-11 px-4 md:!h-9" onClick={() => { setQuery(''); clear(); }}>Show all</Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((group) => (
                <ModelGroupCard
                  key={group.id}
                  group={group}
                  stats={statRows.get(group.id)}
                  statsReady={statsReady}
                  tiers={catalog?.tiers ?? []}
                  usdRate={usdRate}
                  monthLabel={monthLabel}
                  onEdit={() => setEditing({ group })}
                  onViewCars={() => setViewing(group)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {editing && catalog && (
        <ModelGroupSheet
          key={editing.group?.id ?? 'new'}
          group={editing.group}
          tiers={catalog.tiers}
          usdRate={usdRate}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {viewing && (
        <GroupCarsDrawer group={viewing} stats={statRows.get(viewing.id)} month={month} monthLabel={monthLabel} onClose={() => setViewing(null)} />
      )}
    </div>
  );
};

export default ModelGroupsPage;
