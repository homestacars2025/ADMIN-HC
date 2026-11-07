import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from '../components/media/MediaIcons';
import { MediaToaster, toast } from '../components/media/MediaToast';
import { Button } from '../components/media/MediaUI';
import { CarIcon3D, Icon3D } from '../components/shared/Icon3D';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../components/shared/FilterTile';
import { LoadError, PageHeader, SkeletonRows } from '../components/shared/PageBits';
import { StatusImage } from '../components/shared/StatusImage';
import { useUrlFilter } from '../hooks/useUrlFilter';
import { useUrlSort } from '../hooks/useUrlSort';
import { istanbulDate } from '../lib/customers';
import { fetchModelGroupStats, fetchModelGroups, type ModelGroupRow, type ModelGroupStats } from '../lib/modelGroups';
import { getAvatarProfiles, type ProfileOption } from '../lib/notifications';
import {
  LEAD_TONES,
  NO_FILTERS,
  SOURCING_TILES,
  TABLE_SORTS,
  fetchCities,
  fetchSourcing,
  firstTableDirection,
  investmentCheck,
  leadStage,
  matchesFilters,
  matchesTile,
  sortRows,
  summarize,
  updateLeadStatus,
  type GeoOption,
  type InvestmentCheck,
  type LeadStage,
  type SourcingFilters,
  type SourcingRow,
} from '../lib/sourcing';
import { Segmented } from './bookings/ui';
import { PipelineBoard } from './sourcing/PipelineBoard';
import { SourcingFilterBar } from './sourcing/SourcingFilters';
import { SourcingSheet } from './sourcing/SourcingSheet';
import { SourcingTable } from './sourcing/SourcingTable';

type View = 'pipeline' | 'table';

interface Lookups {
  groups: ModelGroupRow[];
  cities: GeoOption[];
  stats: Map<number, ModelGroupStats>;
}

const SourcingPage: React.FC = () => {
  const today = istanbulDate();
  const month = today.slice(0, 7);
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'table' ? 'table' : 'pipeline';
  const { filter, toggle, clear } = useUrlFilter(SOURCING_TILES);
  const sort = useUrlSort(TABLE_SORTS, { key: 'listed', direction: 'desc' }, firstTableDirection);
  const [filters, setFilters] = useState<SourcingFilters>(NO_FILTERS);

  const [rows, setRows] = useState<SourcingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<Lookups>({ groups: [], cities: [], stats: new Map() });
  const [people, setPeople] = useState<Record<string, ProfileOption>>({});
  const [reload, setReload] = useState(0);
  const [moving, setMoving] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ row: SourcingRow | null } | null>(null);

  // Listings, the pickers' lists and this month's model figures load side by side.
  useEffect(() => {
    let active = true;
    setError(null);
    fetchSourcing()
      .then(async (data) => {
        if (!active) return;
        setRows(data);
        const ids = Array.from(new Set(data.map((row) => row.added_by).filter((id): id is string => Boolean(id))));
        const profiles = await getAvatarProfiles(ids).catch(() => ({}));
        if (active) setPeople(profiles);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    Promise.all([
      fetchModelGroups().catch(() => [] as ModelGroupRow[]),
      fetchCities().catch(() => [] as GeoOption[]),
      fetchModelGroupStats(month).catch(() => new Map<number, ModelGroupStats>()),
    ]).then(([groups, cities, stats]) => { if (active) setLookups({ groups, cities, stats }); });
    return () => { active = false; };
  }, [reload, month]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  const setView = (next: View) => {
    const updated = new URLSearchParams(params);
    if (next === 'pipeline') updated.delete('view'); else updated.set('view', next);
    setParams(updated);
  };

  const all = useMemo(() => rows ?? [], [rows]);
  const summary = useMemo(() => summarize(all, today), [all, today]);
  const visible = useMemo(
    () => all.filter((row) => matchesTile(row, filter, today) && matchesFilters(row, filters)),
    [all, filter, filters, today],
  );
  const tableRows = useMemo(() => sortRows(visible, sort.key, sort.direction), [visible, sort.key, sort.direction]);

  const checkFor = useCallback((row: SourcingRow): InvestmentCheck | null => (
    row.model_group_id === null ? null : investmentCheck(row.asking_price, lookups.stats.get(row.model_group_id))
  ), [lookups.stats]);

  /** Moves the lead at once, saves in the background and puts it back if the save fails. */
  const move = useCallback(async (row: SourcingRow, stage: LeadStage) => {
    const before = row.lead_status;
    if (leadStage(before) === stage) return;
    setRows((current) => current?.map((item) => (item.id === row.id ? { ...item, lead_status: stage, updated_at: new Date().toISOString() } : item)) ?? current);
    setMoving((current) => new Set(current).add(row.id));
    try {
      await updateLeadStatus(row.id, stage);
      toast.success(`Moved to ${LEAD_TONES[stage].label}`);
    } catch (reason) {
      setRows((current) => current?.map((item) => (item.id === row.id ? { ...item, lead_status: before } : item)) ?? current);
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setMoving((current) => { const next = new Set(current); next.delete(row.id); return next; });
    }
  }, []);

  const loading = rows === null && !error;
  const filtered = filter !== 'all' || JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const gapLabel = summary.avgGap === null ? '—' : `${summary.avgGap > 0 ? '+' : summary.avgGap < 0 ? '−' : ''}${Math.abs(summary.avgGap)}%`;

  return (
    <div className="media-scope mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <MediaToaster />
      <PageHeader
        eyebrow="Fleet"
        title="Sourcing"
        subtitle={rows ? `${summary.total} ${summary.total === 1 ? 'car' : 'cars'} we're tracking to buy` : 'Cars we\'re tracking to buy'}
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Segmented ariaLabel="View" value={view} onChange={setView} options={[{ value: 'pipeline', label: 'Pipeline' }, { value: 'table', label: 'Table' }]} />
            <Button size="lg" className="!h-11 px-4 md:!h-9" onClick={() => setEditing({ row: null })}><Plus size={15} /> Add listing</Button>
          </div>
        )}
      />

      {error && !rows ? (
        <LoadError message={`Couldn't load the listings: ${error}`} onRetry={refresh} />
      ) : loading ? (
        <>
          <FilterTileSkeleton count={5} />
          <div className="mt-6 rounded-2xl border border-subtle bg-surface"><SkeletonRows count={6} /></div>
        </>
      ) : (
        <>
          <FilterTileRow label="Filter the listings">
            <FilterTile mono tone="blue" bareIcon icon={<Icon3D name="total" size={52} />} label="Total" value={String(summary.total)} sub={summary.total === 1 ? 'listing' : 'listings'} active={filter === 'all'} onClick={clear} />
            <FilterTile mono tone="teal" bareIcon icon={<StatusImage status="selling" size={56} />} label="Active listings" value={String(summary.active)} sub="still for sale" active={filter === 'active'} onClick={() => toggle('active')} />
            <FilterTile mono tone="amber" bareIcon icon={<Icon3D name="pending" size={52} />} label="Hot leads" value={String(summary.hot)} sub="contacted, offer or talking" active={filter === 'hot'} onClick={() => toggle('hot')} />
            <FilterTile mono tone="green" bareIcon icon={<CarIcon3D name="key" size={52} />} label="Bought this month" value={String(summary.bought)} sub={monthLabel.split(' ')[0]} active={filter === 'bought'} onClick={() => toggle('bought')} />
            <FilterTile
              mono
              tone={summary.avgGap === null ? 'neutral' : summary.avgGap <= 0 ? 'green' : 'coral'}
              bareIcon
              icon={<CarIcon3D name="registration" size={52} />}
              label="Avg gap to target"
              value={gapLabel}
              sub={summary.gapCount ? `over ${summary.gapCount} with a target` : 'no targets set yet'}
            />
          </FilterTileRow>

          <SourcingFilterBar filters={filters} cities={lookups.cities} onChange={setFilters} />

          {all.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-16 text-center">
              <StatusImage status="selling" size={140} />
              <p className="mt-1 text-[16px] font-semibold text-foreground">No cars on the radar yet</p>
              <p className="max-w-[380px] text-[13.5px] text-black/50">Paste a listing from Sahibinden, Arabam or Letgo and follow it from first contact to bought, with a payback estimate from our own fleet.</p>
              <Button size="lg" className="mt-3 !h-11 px-4 md:!h-10" onClick={() => setEditing({ row: null })}><Plus size={15} /> Add first listing</Button>
            </div>
          ) : visible.length === 0 && filtered ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-14 text-center">
              <StatusImage status="parking" size={96} />
              <p className="text-[15px] font-medium text-foreground">Nothing matches these filters</p>
              <Button variant="outline" size="lg" className="mt-2 !h-11 px-4 md:!h-9" onClick={() => { setFilters(NO_FILTERS); clear(); }}>Show all</Button>
            </div>
          ) : view === 'pipeline' ? (
            <PipelineBoard rows={visible} today={today} checkFor={checkFor} people={people} moving={moving} onOpen={(row) => setEditing({ row })} onMove={move} />
          ) : (
            <SourcingTable rows={tableRows} today={today} checkFor={checkFor} people={people} moving={moving} sort={sort} onOpen={(row) => setEditing({ row })} onMove={move} />
          )}
        </>
      )}

      {editing && (
        <SourcingSheet
          key={editing.row?.id ?? 'new'}
          row={editing.row}
          groups={lookups.groups}
          cities={lookups.cities}
          stats={lookups.stats}
          today={today}
          monthLabel={monthLabel}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
};

export default SourcingPage;
