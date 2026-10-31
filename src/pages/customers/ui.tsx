import React from 'react';
import { cn } from '../../lib/media/badgeColor';
import { nationalityToFlag } from '../../lib/countries';
import { balanceState, DOCUMENT_SLOTS, formatLira } from '../../lib/customers';

const ICON = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
  'aria-hidden': true,
};

export const PhoneIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} {...ICON}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </svg>
);

export const WhatsAppIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} {...ICON}>
    <path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4L3 21z" />
    <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-.8.7a4 4 0 0 1-2-2l.7-.7-1-2L9 9.5z" />
  </svg>
);

export const CarIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} {...ICON}>
    <path d="M5 11l1.6-4.3A2 2 0 0 1 8.5 5.4h7a2 2 0 0 1 1.9 1.3L19 11" />
    <rect x="3" y="11" width="18" height="6" rx="2" />
    <path d="M6.5 17v2M17.5 17v2M7 14h.01M17 14h.01" />
  </svg>
);

export const UploadIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} {...ICON}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

export const FileIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} {...ICON}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

export const GridIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} {...ICON}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const StarIcon: React.FC<{ size?: number; filled?: boolean }> = ({ size = 14, filled = true }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.5l-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3z" />
  </svg>
);

export const PlateChip: React.FC<{ plate: string | null; className?: string }> = ({ plate, className }) => (
  <span className={cn('inline-block whitespace-nowrap rounded-md border border-subtle bg-black/[0.03] px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums text-foreground', className)}>
    {plate ?? '—'}
  </span>
);

export const Flag: React.FC<{ nationality: string | null }> = ({ nationality }) => {
  const { flag, label } = nationalityToFlag(nationality);
  return <span role="img" aria-label={label} title={label} className="shrink-0 text-[14px] leading-none">{flag}</span>;
};

/** Red when the customer owes us, green when we hold their money, grey at zero. */
export const BalancePill: React.FC<{ balance: number; className?: string }> = ({ balance, className }) => {
  const state = balanceState(balance);
  const amount = <bdi className="tabular-nums">{formatLira(Math.abs(balance))}</bdi>;
  return (
    <span
      lang="ar"
      dir="rtl"
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium',
        state === 'owes' && 'bg-[#DC2626]/10 text-[#B91C1C]',
        state === 'credit' && 'bg-[#16A34A]/10 text-[#15803D]',
        state === 'clear' && 'bg-black/[0.05] text-black/50',
        className,
      )}
    >
      {state === 'owes' && <>عليه {amount}</>}
      {state === 'credit' && <>له {amount}</>}
      {state === 'clear' && 'صفر'}
    </span>
  );
};

const RING = 24;
const RING_STROKE = 3;

/** How many of the five documents are on file. */
export const DocumentsRing: React.FC<{ count: number }> = ({ count }) => {
  const total = DOCUMENT_SLOTS.length;
  const radius = (RING - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="inline-flex items-center gap-1.5" title={`${count} of ${total} documents`}>
      <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} role="img" aria-label={`${count} of ${total} documents`} className="-rotate-90">
        <circle cx={RING / 2} cy={RING / 2} r={radius} fill="none" stroke="rgb(0 0 0 / 0.08)" strokeWidth={RING_STROKE} />
        {count > 0 && (
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={radius}
            fill="none"
            stroke={count === total ? '#16A34A' : '#6EA4E7'}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${(count / total) * circumference} ${circumference}`}
          />
        )}
      </svg>
      <span className="text-[12px] tabular-nums text-black/50">{count}/{total}</span>
    </span>
  );
};

export const RatingBadge: React.FC<{ rating: number | null }> = ({ rating }) => (
  rating === null
    ? <span className="text-[13px] text-black/30">—</span>
    : (
      <span className={cn('inline-flex items-center gap-1 text-[13px] font-medium tabular-nums', rating <= 2 ? 'text-[#B91C1C]' : 'text-foreground')}>
        <span className={rating <= 2 ? '' : 'text-[#F59E0B]'}><StarIcon size={13} /></span>
        {rating}
      </span>
    )
);

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-brand-strong/10 text-brand-strong',
  completed: 'bg-[#16A34A]/10 text-[#15803D]',
  cancelled: 'bg-[#DC2626]/10 text-[#B91C1C]',
  pending: 'bg-[#F59E0B]/15 text-[#B45309]',
  paid: 'bg-[#16A34A]/10 text-[#15803D]',
  unpaid: 'bg-[#DC2626]/10 text-[#B91C1C]',
};

export const StatusPill: React.FC<{ status: string | null }> = ({ status }) => (
  <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-[11.5px] font-medium capitalize', STATUS_STYLES[status ?? ''] ?? 'bg-black/[0.05] text-black/50')}>
    {status ?? '—'}
  </span>
);

export const Panel: React.FC<{ title?: React.ReactNode; action?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  title,
  action,
  className,
  children,
}) => (
  <section className={cn('rounded-2xl border border-subtle bg-surface p-4 sm:p-5', className)}>
    {(title || action) && (
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-medium tracking-[-0.01em] text-foreground">{title}</h2>
        {action}
      </div>
    )}
    {children}
  </section>
);

export const EmptyNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="py-8 text-center text-[13px] text-black/45">{children}</p>
);

export const ICON_BUTTON =
  'grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-subtle bg-surface text-black/55 transition-colors hover:bg-black/[0.03] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30 xl:h-9 xl:w-9';
