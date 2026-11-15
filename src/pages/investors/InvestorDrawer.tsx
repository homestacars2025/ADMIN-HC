import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import { ArrowUpRight, ChevronDown, X } from '../../components/media/MediaIcons';
import { toast } from '../../components/media/MediaToast';
import { formatLira } from '../../lib/customers';
import {
  fleetMix,
  investorName,
  memberSince,
  modelLabel,
  monthNet,
  type InvestorModelGroup,
  type InvestorOverview,
} from '../../lib/investors';
import { cn } from '../../lib/media/badgeColor';
import { EditCarSheet } from '../cars/EditCarSheet';
import { GroupImage, GroupUtilizationRing, SpecChip, categoryTone } from '../modelGroups/ModelGroupCard';
import { StatusImage } from '../../components/shared/StatusImage';
import { InvestorForm } from './InvestorForm';
import { Glossy3D, InvestorPicture, QuickActions, StatusChip } from './InvestorParts';

export type DrawerTab = 'fleet' | 'month' | 'info';
const TABS: ReadonlyArray<{ value: DrawerTab; label: string }> = [
  { value: 'fleet', label: 'Fleet' },
  { value: 'month', label: 'This month' },
  { value: 'info', label: 'Info' },
];

/**
 * One investor, large: who they are, their fleet by model down to the plates, the
 * month's figures and their details. A right-side drawer on desktop, full screen on a
 * phone. It sits under the car sheet (z 1000) so a plate can open a car above it.
 */
export const InvestorDrawer: React.FC<{
  investor: InvestorOverview;
  month: string;
  monthLabel: string;
  tab: DrawerTab;
  onTab: (tab: DrawerTab) => void;
  onClose: () => void;
  onChanged: () => void;
}> = ({ investor, month, monthLabel, tab, onTab, onClose, onChanged }) => {
  const [carId, setCarId] = useState<number | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const name = investorName(investor);
  const since = memberSince(investor.createdAt);

  const requestClose = useCallback(() => {
    if (formDirty) setConfirming(true);
    else onClose();
  }, [formDirty, onClose]);

  useEffect(() => {
    panelRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  // A car or a question open above answers Esc itself.
  useEffect(() => {
    if (carId !== null || confirming) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [carId, confirming, requestClose]);

  const tabId = (value: DrawerTab) => `${titleId}-tab-${value}`;
  const panelId = (value: DrawerTab) => `${titleId}-panel-${value}`;

  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TABS.findIndex((item) => item.value === tab);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].value;
    onTab(next);
    document.getElementById(tabId(next))?.focus();
  };

  return ReactDOM.createPortal(
    <div className="media-scope fixed inset-0 z-[900]">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" style={{ animation: 'm-fade-in 150ms ease-out' }} onClick={requestClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-[#F8F9FB] shadow-lg outline-none sm:max-w-[880px] sm:rounded-s-[24px]"
        style={{ animation: 'm-sheet-in 220ms ease-in-out' }}
      >
        {/* Header */}
        <header className="shrink-0 border-b border-subtle bg-surface px-4 pb-0 pt-4 sm:rounded-ss-[24px] sm:px-7 sm:pt-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <InvestorPicture investor={investor} size={64} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 pe-10">
                <h2 id={titleId} className="truncate text-[19px] font-semibold tracking-[-0.02em] text-foreground sm:text-[22px]">{name}</h2>
                <StatusChip active={investor.isActive} />
              </div>
              {investor.fullName && investor.fullName !== name && <p className="truncate text-[13px] text-black/50">{investor.fullName}</p>}
              <QuickActions investor={investor} labelled className="mt-2.5 flex-wrap" />
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="absolute end-3 top-3 grid h-11 w-11 place-items-center rounded-[12px] text-black/45 transition-colors hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 sm:end-5 sm:top-5 md:h-9 md:w-9"
            >
              <X size={16} />
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2 sm:max-w-[560px]">
            <HeaderFact label="Commission">{investor.commissionRate !== null ? `${investor.commissionRate}%` : '—'}</HeaderFact>
            <HeaderFact label="Total investment">{investor.totalInvestment ? formatLira(investor.totalInvestment) : '—'}</HeaderFact>
            <HeaderFact label="Member since">{since ?? '—'}</HeaderFact>
          </dl>

          <div role="tablist" aria-label="Investor sections" className="-mb-px mt-4 flex gap-1 overflow-x-auto">
            {TABS.map((item) => (
              <button
                key={item.value}
                id={tabId(item.value)}
                type="button"
                role="tab"
                aria-selected={tab === item.value}
                aria-controls={panelId(item.value)}
                tabIndex={tab === item.value ? 0 : -1}
                onClick={() => onTab(item.value)}
                onKeyDown={onTabKey}
                className={cn(
                  'relative h-11 shrink-0 px-3.5 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[#6EA4E7]/40',
                  tab === item.value ? 'text-foreground' : 'text-black/45 hover:text-black/70',
                )}
              >
                {item.label}
                {item.value === 'fleet' && <span className="ms-1.5 rounded-full bg-black/[0.06] px-1.5 py-px text-[11.5px] tabular-nums text-black/55">{investor.carsTotal}</span>}
                <span aria-hidden="true" className={cn('absolute inset-x-2 bottom-0 h-[2.5px] rounded-full transition-colors', tab === item.value ? 'bg-[#6EA4E7]' : 'bg-transparent')} />
              </button>
            ))}
          </div>
        </header>

        {/* Body */}
        <div
          id={panelId(tab)}
          role="tabpanel"
          aria-labelledby={tabId(tab)}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 sm:px-7 sm:pt-6"
        >
          {tab === 'fleet' && <FleetTab investor={investor} onOpenCar={setCarId} />}
          {tab === 'month' && <MonthTab investor={investor} month={month} monthLabel={monthLabel} />}
          {/* Kept mounted, so a half-made edit survives a look at another tab. */}
          <div hidden={tab !== 'info'}>
            <InvestorForm
              key={investor.id}
              investor={investor}
              onDirty={setFormDirty}
              onSaved={() => { setFormDirty(false); onChanged(); }}
            />
          </div>
        </div>
      </div>

      {carId !== null && (
        <EditCarSheet
          carId={carId}
          onClose={(changed) => { setCarId(null); if (changed) onChanged(); }}
          showToast={(message, type) => (type === 'success' ? toast.success(message) : toast.error(message))}
        />
      )}

      <ConfirmDialog
        state={confirming ? { title: 'Discard your changes?', description: "What you've changed in Info won't be saved.", confirmLabel: 'Discard', onConfirm: async () => undefined } : null}
        pending={false}
        onCancel={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); onClose(); }}
      />
    </div>,
    document.body,
  );
};

const HeaderFact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0 rounded-[12px] bg-black/[0.03] px-2.5 py-2 sm:px-3">
    <dt className="truncate text-[11px] text-black/45 sm:text-[11.5px]">{label}</dt>
    <dd className="mt-0.5 truncate font-mono text-[12.5px] font-semibold tabular-nums tracking-[-0.02em] text-foreground sm:text-[14px] sm:tracking-normal">{children}</dd>
  </div>
);

// ── Fleet ────────────────────────────────────────────────────────────────────

const FleetTab: React.FC<{ investor: InvestorOverview; onOpenCar: (carId: number) => void }> = ({ investor, onOpenCar }) => {
  const groups = investor.modelGroups;
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-14 text-center">
        <StatusImage status="parking" size={96} />
        <p className="text-[15px] font-medium text-foreground">No cars yet</p>
        <p className="max-w-[320px] text-[13px] text-black/50">Pick this investor on a car in the Cars page and it shows up here, grouped by model.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <FleetMixBar groups={groups} total={investor.carsTotal} />
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {groups.map((group) => <ModelCard key={group.id ?? 'none'} group={group} onOpenCar={onOpenCar} />)}
      </ul>
    </div>
  );
};

/** The fleet by model as one bar, each model's share of the cars, with its legend. */
const FleetMixBar: React.FC<{ groups: InvestorModelGroup[]; total: number }> = ({ groups, total }) => {
  const slices = fleetMix(groups);
  return (
    <section aria-label="Fleet mix by model" className="rounded-[18px] border border-subtle bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13.5px] font-semibold text-foreground">Fleet mix</h3>
        <p className="text-[12px] tabular-nums text-black/45">{total} {total === 1 ? 'car' : 'cars'} · {slices.length} {slices.length === 1 ? 'model' : 'models'}</p>
      </div>
      <div className="mt-3 flex h-3.5 w-full gap-[2px] overflow-hidden rounded-full bg-black/[0.04]" role="img" aria-label={slices.map((slice) => `${slice.label} ${slice.count}`).join(', ')}>
        {slices.map((slice) => (
          <span key={slice.key} title={`${slice.label} · ${slice.count} (${Math.round(slice.share * 100)}%)`} className="h-full first:rounded-s-full last:rounded-e-full" style={{ width: `${slice.share * 100}%`, background: slice.color, minWidth: 3 }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {slices.map((slice) => (
          <li key={slice.key} className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-black/60">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: slice.color }} />
            <span className="max-w-[160px] truncate">{slice.label}</span>
            <span className="tabular-nums text-black/40">{slice.count} · {Math.round(slice.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

const ModelCard: React.FC<{ group: InvestorModelGroup; onOpenCar: (carId: number) => void }> = ({ group, onOpenCar }) => {
  const [open, setOpen] = useState(false);
  const label = modelLabel(group);
  const tone = categoryTone(group.category);
  const platesId = useId();
  const inactive = group.count - group.active;

  return (
    <li className="flex min-w-0 flex-col rounded-[18px] border border-subtle bg-surface p-2.5">
      <GroupImage src={group.imageUrl} alt={label} compact className="!aspect-[12/5] !rounded-[12px]">
        {group.category && (
          <span className="absolute start-2 top-2 inline-flex h-6 items-center gap-1.5 rounded-full bg-white/90 px-2 text-[11.5px] font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.08)] backdrop-blur" style={{ color: tone.ink }}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
            {group.category}
          </span>
        )}
      </GroupImage>
      <div className="px-1.5 pb-0.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate text-[15px] font-semibold tracking-[-0.012em] text-foreground">{label}</h4>
            {group.name && group.name !== label && <p className="truncate text-[12px] text-black/45">{group.name}</p>}
          </div>
          <p className="shrink-0 text-end text-[12.5px] tabular-nums text-black/55">
            <span className="font-semibold text-foreground">{group.count}</span> {group.count === 1 ? 'car' : 'cars'}
            <span className="text-black/35"> · </span>
            <span className="text-[#166534]">{group.active} active</span>
          </p>
        </div>
        {(group.transmission || group.fuel) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {group.transmission && <SpecChip icon="transmission" label={group.transmission} />}
            {group.fuel && <SpecChip icon="fuel" label={group.fuel} />}
          </div>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={platesId}
          onClick={() => setOpen((value) => !value)}
          className="mt-3 flex h-11 w-full items-center justify-between rounded-[12px] bg-black/[0.035] px-3 text-[13px] font-medium text-black/70 transition-colors hover:bg-black/[0.06] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9"
        >
          <span>{open ? 'Hide plates' : 'Show plates'}{inactive > 0 && <span className="font-normal text-black/40"> · {inactive} inactive</span>}</span>
          <ChevronDown size={15} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <ul id={platesId} className="mt-2.5 flex flex-wrap gap-1.5">
            {group.plates.map((plate) => (
              <li key={plate.carId}>
                <button
                  type="button"
                  onClick={() => onOpenCar(plate.carId)}
                  title={plate.active ? 'Open the car' : 'Inactive · open the car'}
                  className={cn(
                    'inline-flex h-11 items-center gap-1.5 rounded-full border px-3 font-mono text-[12.5px] font-semibold tabular-nums tracking-[0.02em] transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-8',
                    plate.active
                      ? 'border-[#22C55E]/30 bg-[#22C55E]/[0.07] text-[#14532D] hover:bg-[#22C55E]/[0.14]'
                      : 'border-black/[0.08] bg-black/[0.03] text-black/40 line-through decoration-black/25 hover:bg-black/[0.06]',
                  )}
                >
                  <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', plate.active ? 'bg-[#22C55E]' : 'bg-black/25')} />
                  {plate.plate}
                  <span className="sr-only">{plate.active ? ', active' : ', inactive'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
};

// ── This month ───────────────────────────────────────────────────────────────

const MonthTab: React.FC<{ investor: InvestorOverview; month: string; monthLabel: string }> = ({ investor, month, monthLabel }) => {
  const net = monthNet(investor);
  const sheetHref = `/dashboard/accounting/report?investor_id=${encodeURIComponent(investor.id)}&month=${month}`;
  return (
    <div className="flex flex-col gap-4">
      <section aria-label={`Utilization in ${monthLabel}`} className="flex flex-col items-center gap-5 rounded-[20px] border border-subtle bg-surface p-5 sm:flex-row sm:p-6">
        <GroupUtilizationRing rate={investor.carsActive > 0 ? investor.utilization : null} size={112} />
        <div className="min-w-0 text-center sm:text-start">
          <p className="text-[12.5px] text-black/45">Utilization · {monthLabel}</p>
          <p className="mt-1 text-[15px] text-foreground">
            {investor.carsActive > 0
              ? <>Rented days over the days of <span className="font-semibold tabular-nums">{investor.carsActive}</span> active {investor.carsActive === 1 ? 'car' : 'cars'}.</>
              : 'No active car to measure this month.'}
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#22C55E]/[0.1] px-3 py-1.5 text-[13px] text-[#14532D]">
            <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', investor.carsRentedNow > 0 ? 'bg-[#22C55E]' : 'bg-black/25')} />
            Rented now <span className="font-semibold tabular-nums">{investor.carsRentedNow}/{investor.carsActive}</span>
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MoneyCard glyph="in" tone="green" label="IN" value={investor.monthIn} />
        <MoneyCard glyph="out" tone="coral" label="OUT" value={investor.monthOut} />
        <MoneyCard glyph="net" tone="blue" label="Net" value={net} signed />
      </div>

      <Link
        to={sheetHref}
        className="group flex min-h-[56px] items-center justify-between gap-3 rounded-[16px] border border-subtle bg-surface px-4 py-3 transition-colors hover:border-[#6EA4E7]/50 hover:bg-[#6EA4E7]/[0.04] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40"
      >
        <span className="min-w-0">
          <span className="block text-[14px] font-medium text-foreground">Open the investor sheet</span>
          <span className="block truncate text-[12.5px] text-black/50">Every IN and OUT line of {monthLabel}</span>
        </span>
        <ArrowUpRight size={16} className="shrink-0 text-black/40 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
};

const MoneyCard: React.FC<{ glyph: 'in' | 'out' | 'net'; tone: 'green' | 'coral' | 'blue'; label: string; value: number; signed?: boolean }> = ({ glyph, tone, label, value, signed }) => (
  <div className="flex items-center gap-3 rounded-[18px] border border-subtle bg-surface p-4">
    <Glossy3D tone={tone} glyph={glyph} size={40} />
    <div className="min-w-0">
      <p className="text-[12px] text-black/45">{label}</p>
      <p className={cn(
        'truncate font-mono text-[18px] font-semibold tabular-nums tracking-[-0.01em]',
        signed && value < 0 ? 'text-[#B91C1C]' : signed && value > 0 ? 'text-[#15803D]' : 'text-foreground',
      )}>
        {formatLira(value)}
      </p>
    </div>
  </div>
);
