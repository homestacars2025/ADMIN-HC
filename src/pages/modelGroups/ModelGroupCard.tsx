import React, { useState } from 'react';
import { Pencil } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { SpecIcon3D, type SpecIconName } from '../../components/shared/SpecIcon3D';
import { StatusImage } from '../../components/shared/StatusImage';
import { formatLira } from '../../lib/customers';
import { UTILIZATION_COLORS, utilizationTone } from '../../lib/fleetCalendar';
import { cn } from '../../lib/media/badgeColor';
import {
  bestTier,
  discounted,
  displayName,
  listPriceTry,
  rateTone,
  type ModelGroupRow,
  type ModelGroupStats,
  type PricingTier,
} from '../../lib/modelGroups';

export const CATEGORY_TONES: Record<string, { ink: string; dot: string }> = {
  Economy: { ink: '#166534', dot: '#22C55E' },
  Middle: { ink: '#1E4E8C', dot: '#4BA6EA' },
  Luxury: { ink: '#4C1D95', dot: '#8B5CF6' },
  SUV: { ink: '#92400E', dot: '#F59E0B' },
  Van: { ink: '#155E75', dot: '#06B6D4' },
  Electric: { ink: '#065F46', dot: '#10B981' },
};

export const categoryTone = (category: string | null) => CATEGORY_TONES[category ?? ''] ?? { ink: '#374151', dot: '#9CA3AF' };

const usd = (amount: number) => `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const km = (amount: number) => amount.toLocaleString('en-US');

// ── Pieces ───────────────────────────────────────────────────────────────────

/**
 * The group's photo, or the 3D fleet on a soft studio backdrop when there's none or it
 * won't load. The photos are tall, the car across the width a little below the middle
 * on their own light backdrop, so the photo fills the frame and is cropped to the car.
 */
export const GroupImage: React.FC<{ src: string | null; alt: string; className?: string; children?: React.ReactNode }> = ({ src, alt, className, children }) => {
  const [failed, setFailed] = useState<string | null>(null);
  const usable = src && src !== failed;
  return (
    <div className={cn('relative aspect-video overflow-hidden rounded-[14px] bg-[linear-gradient(160deg,#F7F9FC_0%,#EAF0F7_100%)]', className)}>
      {usable ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(src)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.03]"
          style={{ objectPosition: '50% 70%' }}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <div aria-hidden="true" className="absolute inset-x-[22%] bottom-[16%] h-[9%] rounded-[50%] bg-[#0F172A]/[0.06] blur-md" />
          <StatusImage status="fleet" size={112} className="relative opacity-90" />
          <span className="relative text-[12px] font-medium text-black/40">No photo yet</span>
        </div>
      )}
      {children}
    </div>
  );
};

export const SpecChip: React.FC<{ icon: SpecIconName; label: string }> = ({ icon, label }) => (
  <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-black/[0.06] bg-white pe-2.5 ps-1.5 text-[12.5px] font-medium text-black/70">
    <SpecIcon3D name={icon} size={20} />
    {label}
  </span>
);

export function specChips(group: ModelGroupRow): Array<{ icon: SpecIconName; label: string }> {
  return [
    group.transmission ? { icon: 'transmission' as const, label: group.transmission } : null,
    group.fuel ? { icon: 'fuel' as const, label: group.fuel } : null,
    group.seats !== null ? { icon: 'seats' as const, label: `${group.seats} seats` } : null,
    group.luggage !== null ? { icon: 'luggage' as const, label: `${group.luggage} ${group.luggage === 1 ? 'bag' : 'bags'}` } : null,
  ].filter((chip): chip is { icon: SpecIconName; label: string } => chip !== null);
}

const RING = 52;
const STROKE = 5;

/** The month's utilization as a ring: green from 80%, amber from 50%, red below. */
export const GroupUtilizationRing: React.FC<{ rate: number | null; size?: number }> = ({ rate, size = RING }) => {
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  if (rate === null) {
    return <span role="img" aria-label="Utilization not available" className="grid shrink-0 place-items-center rounded-full border-[5px] border-black/[0.06] text-[12px] font-semibold text-black/30" style={{ width: size, height: size }}>—</span>;
  }
  const colors = UTILIZATION_COLORS[utilizationTone(rate)];
  return (
    <span role="img" aria-label={`Utilization ${rate}%`} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.soft} strokeWidth={STROKE} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.ring} strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(100, Math.max(0, rate)) / 100)} />
      </svg>
      <span className="relative font-mono text-[12.5px] font-semibold tabular-nums" style={{ color: colors.ink }}>{rate}%</span>
    </span>
  );
};

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-[11.5px] text-black/45">{label}</dt>
    <dd className="mt-0.5 truncate text-[13px] font-medium tabular-nums text-foreground">{children}</dd>
  </div>
);

// ── Card ─────────────────────────────────────────────────────────────────────

export const ModelGroupCard: React.FC<{
  group: ModelGroupRow;
  stats: ModelGroupStats | undefined;
  /** Null while the month's figures load. */
  statsReady: boolean;
  tiers: PricingTier[];
  usdRate: number | null;
  monthLabel: string;
  onEdit: () => void;
  onViewCars: () => void;
}> = ({ group, stats, statsReady, tiers, usdRate, monthLabel, onEdit, onViewCars }) => {
  const name = displayName(group);
  const tone = categoryTone(group.category);
  const listTry = listPriceTry(group.price, usdRate);
  const tier = bestTier(tiers);
  const chips = specChips(group);
  const kmLimit = [group.daily_km !== null ? `${km(group.daily_km)}/day` : null, group.monthly_km !== null ? `${km(group.monthly_km)}/mo` : null].filter((part): part is string => part !== null);
  const real = stats?.avg_daily_rate ?? null;
  const realTone = rateTone(real, listTry);

  return (
    <article aria-label={name} className="surface-depth group/card flex min-w-0 flex-col rounded-[20px] border border-subtle bg-surface p-3 transition-shadow duration-200 hover:shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)]">
      <GroupImage src={group.image_url} alt={name}>
        {group.category && (
          <span className="absolute start-2.5 top-2.5 inline-flex h-7 items-center gap-1.5 rounded-full bg-white/90 px-2.5 text-[12px] font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.08)] backdrop-blur" style={{ color: tone.ink }}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
            {group.category}
          </span>
        )}
      </GroupImage>

      <div className="flex flex-1 flex-col px-1.5 pb-1 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold tracking-[-0.015em] text-foreground">{name}</h2>
            {group.name !== name && <p className="truncate text-[12.5px] text-black/45">{group.name}</p>}
          </div>
          <div className="shrink-0 text-end">
            <div className="text-[17px] font-semibold tabular-nums tracking-[-0.01em] text-foreground">
              {listTry !== null ? formatLira(listTry) : group.price !== null ? usd(group.price) : '—'}
              <span className="text-[12px] font-normal text-black/45"> /day</span>
            </div>
            {group.price !== null && listTry !== null && <div className="text-[11.5px] tabular-nums text-black/40">{usd(group.price)} list</div>}
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => <SpecChip key={chip.icon} icon={chip.icon} label={chip.label} />)}
          </div>
        )}

        <dl className="mt-3.5 grid grid-cols-3 gap-3 border-t border-black/[0.06] pt-3">
          <Fact label="Deposit">{group.deposit !== null ? formatLira(group.deposit) : '—'}</Fact>
          <Fact label="Min age">{group.min_age !== null ? `${group.min_age}+` : '—'}</Fact>
          <Fact label="Km limit">{kmLimit.length ? kmLimit.map((part) => <span key={part} className="block truncate">{part}</span>) : 'Unlimited'}</Fact>
        </dl>
        {tier && listTry !== null && (
          <p className="mt-2 text-[12px] text-black/50">
            From <span className="font-semibold tabular-nums text-brand-strong">{formatLira(discounted(listTry, tier.discount_percent))}</span>/day for {tier.min_days}+ days
            <span className="text-black/35"> · −{tier.discount_percent}%</span>
          </p>
        )}

        <section aria-label={`Performance in ${monthLabel}`} className="mt-3.5 flex items-center gap-3 rounded-[14px] bg-[#F6F8FB] p-3">
          {statsReady ? <GroupUtilizationRing rate={stats?.utilization ?? null} /> : <span className="h-[52px] w-[52px] shrink-0 animate-pulse rounded-full bg-black/[0.06]" />}
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1.5">
            <div className="col-span-2 flex items-center gap-1.5 text-[13px] text-foreground">
              <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', stats && stats.rented_now > 0 ? 'bg-[#22C55E]' : 'bg-black/20')} />
              <span className="truncate">
                <span className="font-semibold tabular-nums">{stats ? `${stats.rented_now} / ${stats.cars_active}` : '— / —'}</span> cars on the road now
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-[11.5px] text-black/45">Bookings</div>
              <div className="text-[13px] font-semibold tabular-nums text-foreground">{statsReady ? stats?.bookings_month ?? 0 : '…'}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11.5px] text-black/45">Avg real rate</div>
              <div
                className={cn('truncate text-[13px] font-semibold tabular-nums', realTone === 'above' ? 'text-[#15803D]' : realTone === 'below' ? 'text-[#B45309]' : 'text-foreground')}
                title={realTone === 'none' ? undefined : realTone === 'above' ? 'At or above the list price' : 'Below the list price'}
              >
                {!statsReady ? '…' : real !== null ? formatLira(real) : '—'}
                {statsReady && realTone !== 'none' && <span className="sr-only">{realTone === 'above' ? ' (at or above list)' : ' (below list)'}</span>}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="lg" className="!h-11 md:!h-10" onClick={onEdit}>
            <Pencil size={14} /> Edit
          </Button>
          <Button type="button" variant="secondary" size="lg" className="!h-11 md:!h-10" onClick={onViewCars}>
            View cars{stats ? <span className="tabular-nums text-black/45"> · {stats.cars_total}</span> : null}
          </Button>
        </div>
      </div>
    </article>
  );
};

export const ModelGroupCardSkeleton: React.FC = () => (
  <div className="flex flex-col rounded-[20px] border border-subtle bg-surface p-3">
    <div className="aspect-video animate-pulse rounded-[14px] bg-black/[0.05]" />
    <div className="space-y-3 px-1.5 pb-1 pt-4">
      <div className="h-4 w-2/3 animate-pulse rounded bg-black/[0.06]" />
      <div className="flex gap-1.5">{[64, 56, 60, 56].map((width, index) => <div key={index} className="h-8 animate-pulse rounded-full bg-black/[0.05]" style={{ width }} />)}</div>
      <div className="h-[76px] animate-pulse rounded-[14px] bg-black/[0.04]" />
    </div>
  </div>
);
