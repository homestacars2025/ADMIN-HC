import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/media/ConfirmDialog';
import { Plus } from '../components/media/MediaIcons';
import { Button } from '../components/media/MediaUI';
import { MediaToaster, toast } from '../components/media/MediaToast';
import { Lightbox, type LightboxItem } from '../components/shared/Lightbox';
import { FilterChips, LoadError, PageHeader, SearchField, SkeletonRows } from '../components/shared/PageBits';
import { CustomerAvatar } from '../components/shared/PersonAvatar';
import { useCurrency } from '../lib/CurrencyContext';
import { formatDate } from '../lib/customers';
import {
  deleteFine,
  fetchFineCars,
  fetchFines,
  filterFines,
  fineDocuments,
  fineStats,
  type Fine,
  type FineCar,
  type FineSegment,
} from '../lib/fines';
import { LicensePlate } from './bookings/ui';
import { ClockIcon, ReceiptIcon, UsersIcon, WalletIcon } from './customers/ui';
import { PremiumTile, TileSkeleton } from './customers/PremiumTile';
import { FineDetailSheet, LinkCustomerSheet, PaymentSheet } from './fines/FineDetailSheet';
import { FineFormSheet } from './fines/FineFormSheet';
import { DocumentIcons, FineStatusPill, UnassignedChip } from './fines/ui';

type Sheet =
  | { type: 'add' }
  | { type: 'view' | 'edit' | 'pay' | 'link'; id: string }
  | null;

const FineRow: React.FC<{
  fine: Fine;
  car: FineCar | undefined;
  onOpen: () => void;
  onPay: () => void;
  onDocument: (items: LightboxItem[], start: number) => void;
}> = ({ fine, car, onOpen, onPay, onDocument }) => {
  const { fmt } = useCurrency();
  const documents = fineDocuments(fine);
  const customer = fine.resolved_customer_name || fine.customer_name;
  const summary = [fine.article, fine.description].filter(Boolean).join(' · ');

  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={`Fine ${fine.violation_number}, ${fine.plate_number}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onOpen();
        }
      }}
      className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-subtle px-4 py-3.5 transition-colors last:border-b-0 hover:bg-black/[0.015] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[#6EA4E7]/40 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_120px_168px]"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <LicensePlate plate={fine.plate_number} />
          <span className="min-w-0 truncate text-[13px] text-black/55">{car?.model}</span>
        </div>
        <div className="mt-1 truncate font-mono text-[12px] tabular-nums text-black/45">{fine.violation_number}</div>
      </div>

      <div className="text-right lg:order-4">
        <div className="text-[14.5px] font-semibold tabular-nums tracking-[-0.01em] text-foreground">{fmt(fine.amount)}</div>
        <div className="mt-1 flex justify-end"><FineStatusPill status={fine.status} /></div>
      </div>

      <div className="col-span-2 flex min-w-0 items-center gap-2 lg:order-2 lg:col-span-1">
        {customer ? (
          <>
            <CustomerAvatar size={28} />
            <span className="min-w-0 truncate text-[13.5px] text-foreground">{customer}</span>
          </>
        ) : <UnassignedChip />}
      </div>

      <div className="col-span-2 min-w-0 text-[12.5px] text-black/55 lg:order-3 lg:col-span-1">
        <div className="truncate tabular-nums">
          {formatDate(fine.violation_date)}{fine.violation_time ? ` · ${fine.violation_time}` : ''}{fine.location ? ` · ${fine.location}` : ''}
        </div>
        {summary && <div className="mt-0.5 truncate">{summary}</div>}
      </div>

      <div className="col-span-2 flex min-h-[36px] items-center justify-between gap-2 lg:order-5 lg:col-span-1 lg:justify-end">
        <DocumentIcons documents={documents} onOpen={(index) => onDocument(documents, index)} />
        {fine.status === 'unpaid' && (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onPay(); }}
            className="h-11 shrink-0 rounded-[10px] bg-[#16A34A]/[0.1] px-3 text-[12.5px] font-semibold text-[#15803D] transition-colors hover:bg-[#16A34A]/[0.18] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9"
          >
            Pay
          </button>
        )}
      </div>
    </li>
  );
};

const FinesPage: React.FC = () => {
  const { fmt } = useCurrency();
  const [fines, setFines] = useState<Fine[]>([]);
  const [cars, setCars] = useState<FineCar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [segment, setSegment] = useState<FineSegment>('all');
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; start: number } | null>(null);
  const [deleting, setDeleting] = useState<Fine | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([fetchFines(), fetchFineCars()])
      .then(([rows, carRows]) => {
        if (cancelled) return;
        setFines(rows);
        setCars(carRows);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Couldn't load the fines.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const carsById = useMemo(() => new Map(cars.map((car) => [car.id, car])), [cars]);
  const stats = useMemo(() => fineStats(fines), [fines]);
  const visible = useMemo(() => filterFines(fines, segment, search), [fines, segment, search]);
  const selected = sheet && sheet.type !== 'add' ? fines.find((fine) => fine.id === sheet.id) ?? null : null;

  const saved = useCallback((message: string, next: Sheet) => {
    toast.success(message);
    setSheet(next);
    setReload((value) => value + 1);
  }, []);

  const openDocument = useCallback((items: LightboxItem[], start = 0) => setLightbox({ items, start }), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await deleteFine(deleting.id);
      setDeleting(null);
      saved('Fine deleted.', null);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "The fine wasn't deleted.");
    } finally {
      setDeletePending(false);
    }
  };

  const toggle = (next: FineSegment) => setSegment((current) => (current === next ? 'all' : next));

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <PageHeader
        eyebrow="Operations"
        title="Traffic fines"
        subtitle="Every fine, who it belongs to, and whether it's paid."
        action={(
          <Button size="lg" className="!h-11 md:!h-10" onClick={() => setSheet({ type: 'add' })}><Plus size={15} /> Add fine</Button>
        )}
      />

      {error && <LoadError message={`Couldn't load the fines: ${error}`} onRetry={() => setReload((value) => value + 1)} />}

      {loading ? <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><TileSkeleton count={4} /></div> : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <PremiumTile tone="red" icon={<WalletIcon size={15} />} label="Unpaid" value={stats.unpaid.count} hint={fmt(stats.unpaid.amount)} active={segment === 'unpaid'} onClick={() => toggle('unpaid')} />
          <PremiumTile tone="green" icon={<ReceiptIcon size={15} />} label="Paid" value={stats.paid.count} hint={fmt(stats.paid.amount)} active={segment === 'paid'} onClick={() => toggle('paid')} />
          <PremiumTile tone="blue" icon={<ClockIcon size={15} />} label="This month" value={stats.month.count} hint={fmt(stats.month.amount)} active={segment === 'month'} onClick={() => toggle('month')} />
          <PremiumTile
            tone={stats.unassigned > 0 ? 'amber' : 'neutral'}
            icon={<UsersIcon size={15} />}
            label="Linked to a customer"
            value={`${stats.linked} / ${fines.length}`}
            hint={stats.unassigned > 0 ? `${stats.unassigned} not linked` : 'All linked'}
            active={segment === 'unassigned'}
            onClick={() => toggle('unassigned')}
          />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          ariaLabel="Filter fines"
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'all', label: 'All', count: fines.length },
            { value: 'unpaid', label: 'Unpaid', count: stats.unpaid.count },
            { value: 'paid', label: 'Paid', count: stats.paid.count },
            { value: 'unassigned', label: 'Unassigned', count: stats.unassigned },
            { value: 'month', label: 'This month', count: stats.month.count },
          ]}
        />
        <SearchField value={search} onChange={setSearch} placeholder="Search plate, violation, customer…" className="lg:w-[320px]" />
      </div>

      <section aria-label="Fines" className="surface-depth mt-3 overflow-hidden rounded-2xl border border-subtle bg-surface">
        {loading ? <SkeletonRows /> : visible.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-[14px] font-medium text-foreground">{fines.length === 0 ? 'No fines recorded yet' : 'No fines match'}</p>
            <p className="mt-1 text-[13px] text-black/50">{fines.length === 0 ? 'Use “Add fine” to record the first one.' : 'Try another filter or search.'}</p>
          </div>
        ) : (
          <ul>
            {visible.map((fine) => (
              <FineRow
                key={fine.id}
                fine={fine}
                car={fine.car_id ? carsById.get(fine.car_id) : undefined}
                onOpen={() => setSheet({ type: 'view', id: fine.id })}
                onPay={() => setSheet({ type: 'pay', id: fine.id })}
                onDocument={openDocument}
              />
            ))}
          </ul>
        )}
      </section>
      {!loading && visible.length > 0 && (
        <p className="mt-2.5 text-[12.5px] text-black/45">Showing {visible.length} of {fines.length} fines</p>
      )}

      {sheet?.type === 'add' && (
        <FineFormSheet cars={cars} onClose={() => setSheet(null)} onSaved={(message) => saved(message, null)} onOpenDocument={openDocument} />
      )}
      {selected && sheet?.type === 'view' && (
        <FineDetailSheet
          fine={selected}
          car={selected.car_id ? carsById.get(selected.car_id) : undefined}
          onClose={() => setSheet(null)}
          onEdit={() => setSheet({ type: 'edit', id: selected.id })}
          onPay={() => setSheet({ type: 'pay', id: selected.id })}
          onLink={() => setSheet({ type: 'link', id: selected.id })}
          onDelete={() => setDeleting(selected)}
          onOpenDocument={openDocument}
        />
      )}
      {selected && sheet?.type === 'edit' && (
        <FineFormSheet
          fine={selected}
          cars={cars}
          onClose={() => setSheet({ type: 'view', id: selected.id })}
          onSaved={(message) => saved(message, { type: 'view', id: selected.id })}
          onOpenDocument={openDocument}
        />
      )}
      {selected && sheet?.type === 'pay' && (
        <PaymentSheet fine={selected} onClose={() => setSheet({ type: 'view', id: selected.id })} onDone={(message) => saved(message, { type: 'view', id: selected.id })} />
      )}
      {selected && sheet?.type === 'link' && (
        <LinkCustomerSheet fine={selected} onClose={() => setSheet({ type: 'view', id: selected.id })} onDone={(message) => saved(message, { type: 'view', id: selected.id })} />
      )}

      {lightbox && <Lightbox items={lightbox.items} start={lightbox.start} onClose={closeLightbox} />}

      <ConfirmDialog
        state={deleting ? {
          title: 'Delete this fine?',
          description: `Fine ${deleting.violation_number} for ${deleting.plate_number} will be removed. This can't be undone.`,
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

export default FinesPage;
