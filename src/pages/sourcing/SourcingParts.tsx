import React from 'react';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { formatLira } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import type { ProfileOption } from '../../lib/notifications';
import {
  LEAD_STAGES,
  LEAD_TONES,
  PAYBACK_COLORS,
  damageBadges,
  gapPercent,
  leadStage,
  platformLabel,
  type InvestmentCheck,
  type LeadStage,
  type SourcingRow,
} from '../../lib/sourcing';

// ── Platform ─────────────────────────────────────────────────────────────────

const PLATFORM_LOOK: Record<string, { mark: string; bg: string; ink: string }> = {
  'sahibinden.com': { mark: 'S', bg: '#FFE800', ink: '#1A1A1A' },
  'arabam.com': { mark: 'a', bg: '#E30A17', ink: '#FFFFFF' },
  letgo: { mark: 'l', bg: '#FF3F55', ink: '#FFFFFF' },
  Instagram: { mark: 'IG', bg: 'linear-gradient(135deg,#F58529 0%,#DD2A7B 55%,#8134AF 100%)', ink: '#FFFFFF' },
  'Facebook Marketplace': { mark: 'f', bg: '#1877F2', ink: '#FFFFFF' },
};

/** Where the listing is: the platform's colour and initial, then its name. */
export const PlatformChip: React.FC<{ row: Pick<SourcingRow, 'source_platform' | 'source_platform_custom'>; className?: string }> = ({ row, className }) => {
  const look = PLATFORM_LOOK[row.source_platform] ?? { mark: platformLabel(row).slice(0, 1).toUpperCase() || '?', bg: '#E5E7EB', ink: '#374151' };
  return (
    <span className={cn('inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-full bg-white/95 pe-2 ps-0.5 text-[11.5px] font-semibold text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.10)]', className)}>
      <span aria-hidden="true" className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold leading-none" style={{ background: look.bg, color: look.ink }}>{look.mark}</span>
      <span className="truncate">{platformLabel(row)}</span>
    </span>
  );
};

// ── Lead ─────────────────────────────────────────────────────────────────────

export const LeadChip: React.FC<{ status: string | null; className?: string }> = ({ status, className }) => {
  const tone = LEAD_TONES[leadStage(status)];
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-medium', className)} style={{ background: tone.soft, color: tone.ink }}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: tone.chip }} />
      {tone.label}
    </span>
  );
};

/** The lead chip as a control: pick a stage to move the lead, on touch or keyboard. */
export const LeadSelect: React.FC<{ row: SourcingRow; onMove: (stage: LeadStage) => void; disabled?: boolean }> = ({ row, onMove, disabled }) => {
  const stage = leadStage(row.lead_status);
  const tone = LEAD_TONES[stage];
  return (
    <label className="relative inline-flex shrink-0" onClick={(event) => event.stopPropagation()}>
      <span className="sr-only">Lead stage</span>
      <select
        value={stage}
        disabled={disabled}
        onChange={(event) => onMove(event.target.value as LeadStage)}
        className="h-11 cursor-pointer appearance-none rounded-full border-0 pe-6 ps-5 text-[11.5px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-7"
        style={{ background: tone.soft, color: tone.ink }}
      >
        {LEAD_STAGES.map((value) => <option key={value} value={value}>{LEAD_TONES[value].label}</option>)}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute start-2.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full" style={{ background: tone.chip }} />
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2" style={{ color: tone.ink }}>
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
};

// ── Damage and price ─────────────────────────────────────────────────────────

const DAMAGE_STYLE = {
  clean: 'bg-[#E7F6EC] text-[#166534]',
  damage: 'bg-[#FDF1DB] text-[#92400E]',
  heavy: 'bg-[#FDE8E8] text-[#991B1B]',
  paint: 'bg-[#EEF2FF] text-[#3730A3]',
  unknown: 'bg-black/[0.05] text-black/55',
} as const;

export const DamageBadges: React.FC<{ row: SourcingRow; className?: string }> = ({ row, className }) => (
  <span className={cn('inline-flex flex-wrap gap-1', className)}>
    {damageBadges(row, formatLira).map((badge) => (
      <span key={badge.label} className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium', DAMAGE_STYLE[badge.tone])}>{badge.label}</span>
    ))}
  </span>
);

/** Asking against target: green at or under target, amber above it. */
export const GapPill: React.FC<{ asking: number | null; target: number | null; className?: string }> = ({ asking, target, className }) => {
  const gap = gapPercent(asking, target);
  if (gap === null) return null;
  const under = gap <= 0;
  return (
    <span
      title={under ? 'At or under our target' : 'Above our target'}
      className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2 font-mono text-[11.5px] font-semibold tabular-nums', under ? 'bg-[#E7F6EC] text-[#166534]' : 'bg-[#FDF1DB] text-[#92400E]', className)}
    >
      {gap > 0 ? '+' : gap < 0 ? '−' : ''}{Math.abs(gap)}%
    </span>
  );
};

// ── Investment check ─────────────────────────────────────────────────────────

const months = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} mo`;

/** One line for a card: payback months, coloured, with the figures behind it. */
export const InvestmentPill: React.FC<{ check: InvestmentCheck | null }> = ({ check }) => {
  if (!check || check.paybackMonths === null || !check.tone) {
    return <span className="text-[11.5px] text-black/40">{check ? 'Not enough data for a payback yet' : 'Custom model: no fleet data'}</span>;
  }
  const colors = PAYBACK_COLORS[check.tone];
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-semibold tabular-nums" style={{ background: colors.soft, color: colors.ink }}>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: colors.dot }} />
        Payback {months(check.paybackMonths)}
      </span>
      <span className="truncate text-[11.5px] tabular-nums text-black/45">{check.utilization}% · {formatLira(check.avgDailyRate ?? 0)}/day</span>
    </span>
  );
};

/** The full check for the drawer: what our own cars of this model earn, and the payback it implies. */
export const InvestmentPanel: React.FC<{ check: InvestmentCheck | null; asking: number | null; monthLabel: string }> = ({ check, asking, monthLabel }) => {
  const tone = check?.tone ? PAYBACK_COLORS[check.tone] : null;
  const cell = (label: string, value: React.ReactNode, hint?: string) => (
    <div className="min-w-0 rounded-[12px] bg-white p-3">
      <div className="text-[11.5px] text-black/45">{label}</div>
      <div className="mt-0.5 truncate text-[16px] font-semibold tabular-nums text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-black/40">{hint}</div>}
    </div>
  );
  return (
    <section aria-label="Investment check" className="rounded-2xl border border-subtle p-4 sm:p-5" style={{ background: tone ? tone.soft : '#F6F8FB' }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">Investment check</h3>
          <p className="text-[12px] text-black/50">Our own cars of this model, {monthLabel} so far</p>
        </div>
        {check?.paybackMonths != null && tone && (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-semibold tabular-nums" style={{ color: tone.ink }}>
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: tone.dot }} />
            Pays back in {months(check.paybackMonths)}
          </span>
        )}
      </div>
      {!check ? (
        <p className="text-[13px] text-black/55">Pick a model group to compare it with the cars we already run.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {cell('Utilization', check.utilization !== null ? `${check.utilization}%` : '—')}
            {cell('Avg real daily rate', check.avgDailyRate !== null ? formatLira(check.avgDailyRate) : '—')}
            {cell('Est. monthly revenue', check.monthlyRevenue !== null ? formatLira(check.monthlyRevenue) : '—', 'rate × 30 × utilization')}
            {cell('Payback', check.paybackMonths !== null ? months(check.paybackMonths) : '—', asking ? `${formatLira(asking)} ÷ revenue` : 'needs the asking price')}
          </div>
          <p className="mt-2.5 text-[11.5px] text-black/45">Green up to 18 months, amber to 30, red beyond. Before costs: insurance, service and the investor's share aren't taken off.</p>
        </>
      )}
    </section>
  );
};

// ── Who added it ─────────────────────────────────────────────────────────────

export const AddedBy: React.FC<{ profile: ProfileOption | undefined; size?: number }> = ({ profile, size = 22 }) => (
  profile ? (
    <span title={`Added by ${profile.full_name ?? 'a teammate'}`} className="inline-flex shrink-0 rounded-full ring-2 ring-white">
      <StaffAvatar profile={profile} size={size} alt={`Added by ${profile.full_name ?? 'a teammate'}`} />
    </span>
  ) : null
);

export const ExternalLinkIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
