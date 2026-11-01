import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/media/ConfirmDialog';
import { Plus } from '../components/media/MediaIcons';
import { MediaToaster, toast } from '../components/media/MediaToast';
import { Button } from '../components/media/MediaUI';
import { Lightbox, type LightboxItem } from '../components/shared/Lightbox';
import { FilterChips, LoadError, PageHeader, SearchField, SkeletonRows } from '../components/shared/PageBits';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  FORM_TYPES,
  deleteCarIssue,
  fetchIssues,
  filterIssues,
  issueStats,
  type Issue,
  type IssueStatus,
  type IssueType,
} from '../lib/carIssues';
import { fetchFineCars, type FineCar } from '../lib/fines';
import { cn } from '../lib/media/badgeColor';
import type { ProfileOption } from '../lib/notifications';
import { Segmented } from './bookings/ui';
import { EditIssueSheet, IssueDetailSheet, ResolveSheet } from './carIssues/IssueDetailSheet';
import { IssueFormSheet } from './carIssues/IssueFormSheet';
import { IssueCard, IssueRow, TYPE_CONFIG, TypeIcon } from './carIssues/ui';
import { ClockIcon, ReceiptIcon } from './customers/ui';
import { PremiumTile, TileSkeleton } from './customers/PremiumTile';

type Layout = 'board' | 'list';
type Sheet =
  | { type: 'add' }
  | { type: 'view' | 'edit' | 'resolve'; id: number }
  | null;

const LAYOUT_OPTIONS: ReadonlyArray<{ value: Layout; label: string }> = [
  { value: 'board', label: 'Board' },
  { value: 'list', label: 'List' },
];

const COLUMNS: ReadonlyArray<{ status: IssueStatus; title: string; dot: string }> = [
  { status: 'open', title: 'Open', dot: 'bg-[#DC2626]' },
  { status: 'resolved', title: 'Resolved', dot: 'bg-[#16A34A]' },
];

const CarIssuesPage: React.FC = () => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [staff, setStaff] = useState<Record<string, ProfileOption>>({});
  const [cars, setCars] = useState<FineCar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [status, setStatus] = useState<IssueStatus | 'all'>('all');
  const [type, setType] = useState<IssueType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<Layout>('board');

  const [sheet, setSheet] = useState<Sheet>(null);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; start: number } | null>(null);
  const [deleting, setDeleting] = useState<Issue | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [dropReady, setDropReady] = useState(false);
  const dragged = useRef<number | null>(null);
  const canDrag = useMediaQuery('(hover: hover) and (pointer: fine)');

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([fetchIssues(), fetchFineCars()])
      .then(([loaded, carRows]) => {
        if (cancelled) return;
        setIssues(loaded.issues);
        setStaff(loaded.staff);
        setCars(carRows);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Couldn't load the issues.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const stats = useMemo(() => issueStats(issues), [issues]);
  const visible = useMemo(() => filterIssues(issues, status, type, search), [issues, status, type, search]);
  const selected = sheet && sheet.type !== 'add' ? issues.find((issue) => issue.id === sheet.id) ?? null : null;

  const saved = useCallback((message: string, next: Sheet) => {
    toast.success(message);
    setSheet(next);
    setReload((value) => value + 1);
  }, []);

  const openPhoto = useCallback((items: LightboxItem[], start: number) => setLightbox({ items, start }), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await deleteCarIssue(deleting.id);
      setDeleting(null);
      saved('Issue deleted.', null);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "This issue wasn't deleted.");
    } finally {
      setDeletePending(false);
    }
  };

  // Moving a card to Resolved opens the same form as the button, so nothing skips it.
  const onDropResolved = (event: React.DragEvent) => {
    event.preventDefault();
    setDropReady(false);
    if (dragged.current !== null) setSheet({ type: 'resolve', id: dragged.current });
    dragged.current = null;
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <PageHeader
        eyebrow="Operations"
        title="Car issues"
        subtitle="Damage, accidents, sounds and mechanical problems, from report to repair."
        action={(
          <Button size="lg" className="!h-11 md:!h-10" onClick={() => setSheet({ type: 'add' })}><Plus size={15} /> New issue</Button>
        )}
      />

      {error && <LoadError message={`Couldn't load the issues: ${error}`} onRetry={() => setReload((value) => value + 1)} />}

      {loading ? <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><TileSkeleton count={4} /></div> : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <PremiumTile tone="red" icon={<ClockIcon size={15} />} label="Open" value={stats.open} active={status === 'open'} onClick={() => setStatus((current) => (current === 'open' ? 'all' : 'open'))} />
          <PremiumTile tone="green" icon={<ReceiptIcon size={15} />} label="Resolved this month" value={stats.resolvedThisMonth} />
          <PremiumTile tone="amber" icon={<TypeIcon type="accident" />} label="Accidents" value={stats.accidents} active={type === 'accident'} onClick={() => setType((current) => (current === 'accident' ? 'all' : 'accident'))} />
          <PremiumTile tone="blue" icon={<ClockIcon size={15} />} label="Average days to resolve" value={stats.averageDays ?? '—'} />
        </div>
      )}

      <div className="mt-5 flex min-w-0 flex-col gap-2.5">
        <div className="flex min-w-0 flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            ariaLabel="Filter by type"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'All types' },
              ...FORM_TYPES.map((item) => ({
                value: item,
                label: TYPE_CONFIG[item].label,
                color: TYPE_CONFIG[item].color,
                icon: <TypeIcon type={item} size={14} />,
                count: issues.filter((issue) => issue.type === item).length,
              })),
            ]}
          />
          <SearchField value={search} onChange={setSearch} placeholder="Search plate, customer…" className="lg:w-[280px]" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterChips
            ariaLabel="Filter by status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All', count: issues.length },
              { value: 'open', label: 'Open', count: stats.open },
              { value: 'resolved', label: 'Resolved', count: issues.length - stats.open },
            ]}
          />
          <Segmented ariaLabel="Layout" value={layout} options={LAYOUT_OPTIONS} onChange={setLayout} />
        </div>
      </div>

      {loading ? (
        <section className="surface-depth mt-3 overflow-hidden rounded-2xl border border-subtle bg-surface"><SkeletonRows /></section>
      ) : visible.length === 0 ? (
        <section className="surface-depth mt-3 rounded-2xl border border-subtle bg-surface px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-foreground">{issues.length === 0 ? 'No issues logged yet' : 'No issues match'}</p>
          <p className="mt-1 text-[13px] text-black/50">{issues.length === 0 ? 'Use “New issue” to log the first one.' : 'Try another filter or search.'}</p>
        </section>
      ) : layout === 'list' ? (
        <section aria-label="Issues" className="surface-depth mt-3 overflow-hidden rounded-2xl border border-subtle bg-surface">
          <ul>{visible.map((issue) => <IssueRow key={issue.id} issue={issue} staff={staff} onOpen={() => setSheet({ type: 'view', id: issue.id })} />)}</ul>
        </section>
      ) : (
        <div className="mt-3 grid items-start gap-4 lg:grid-cols-2">
          {COLUMNS.filter((column) => status === 'all' || status === column.status).map((column) => {
            const cards = visible.filter((issue) => issue.status === column.status);
            const accepts = column.status === 'resolved' && canDrag;
            return (
              <section
                key={column.status}
                aria-label={column.title}
                onDragOver={accepts ? (event) => { event.preventDefault(); setDropReady(true); } : undefined}
                onDragLeave={accepts ? () => setDropReady(false) : undefined}
                onDrop={accepts ? onDropResolved : undefined}
                className={cn('min-w-0 rounded-2xl bg-black/[0.025] p-2.5 transition-shadow', status !== 'all' && 'lg:col-span-2', accepts && dropReady && 'ring-2 ring-[#16A34A]/50')}
              >
                <h2 className="mb-2.5 flex items-center gap-2 px-1.5 pt-0.5 text-[13.5px] font-semibold text-foreground">
                  <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', column.dot)} />
                  {column.title}
                  <span className="font-medium tabular-nums text-black/40">{cards.length}</span>
                </h2>
                {cards.length === 0 ? (
                  <p className="px-2 py-8 text-center text-[13px] text-black/45">Nothing here.</p>
                ) : (
                  <div className={cn('grid grid-cols-1 gap-2.5 sm:grid-cols-2', status !== 'all' && 'lg:grid-cols-3 xl:grid-cols-4')}>
                    {cards.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        staff={staff}
                        onOpen={() => setSheet({ type: 'view', id: issue.id })}
                        onDragStart={canDrag && issue.status === 'open' ? () => { dragged.current = issue.id; } : undefined}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {sheet?.type === 'add' && <IssueFormSheet cars={cars} onClose={() => setSheet(null)} onSaved={(message) => saved(message, null)} />}
      {selected && sheet?.type === 'view' && (
        <IssueDetailSheet
          issue={selected}
          onClose={() => setSheet(null)}
          onEdit={() => setSheet({ type: 'edit', id: selected.id })}
          onResolve={() => setSheet({ type: 'resolve', id: selected.id })}
          onDelete={() => setDeleting(selected)}
          onOpenPhoto={openPhoto}
        />
      )}
      {selected && sheet?.type === 'edit' && (
        <EditIssueSheet issue={selected} onClose={() => setSheet({ type: 'view', id: selected.id })} onDone={(message) => saved(message, { type: 'view', id: selected.id })} />
      )}
      {selected && sheet?.type === 'resolve' && (
        <ResolveSheet issue={selected} onClose={() => setSheet({ type: 'view', id: selected.id })} onDone={(message) => saved(message, { type: 'view', id: selected.id })} />
      )}

      {lightbox && <Lightbox items={lightbox.items} start={lightbox.start} onClose={closeLightbox} />}

      <ConfirmDialog
        state={deleting ? {
          title: 'Delete this issue?',
          description: 'It will be removed from the list. The photos stay in storage.',
          confirmLabel: 'Delete',
          onConfirm: async () => undefined,
        } : null}
        pending={deletePending}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
      <MediaToaster />
    </div>
  );
};

export default CarIssuesPage;
