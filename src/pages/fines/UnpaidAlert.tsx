import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FineImage, TONE_CLASSES } from '../../components/shared/ComplianceBits';
import { CustomerAvatar } from '../../components/shared/PersonAvatar';
import { useCurrency } from '../../lib/CurrencyContext';
import { formatDate } from '../../lib/customers';
import { fineAgeDays, fineAgeTone, unpaidSummary, type Fine, type FineAgeTone } from '../../lib/fines';
import { cn } from '../../lib/media/badgeColor';
import { LicensePlate } from '../bookings/ui';

export const UNPAID_FINES_TITLE = 'Unpaid traffic fines need your attention';
export const UNPAID_FINES_LINK = '/dashboard/fines?filter=unpaid';

const countOf = (count: number) => `${count} ${count === 1 ? 'fine' : 'fines'}`;
const daysOf = (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`;

const AGE_CLASSES: Record<FineAgeTone, string> = {
  neutral: 'bg-black/[0.05] text-black/60',
  amber: TONE_CLASSES.amber.chip,
  red: TONE_CLASSES.red.chip,
};

export const UnassignedChip: React.FC = () => (
  <span className="inline-flex whitespace-nowrap rounded-full bg-[#F59E0B]/[0.16] px-2.5 py-1 text-[12px] font-semibold leading-none text-[#92400E]">Not linked to a customer</span>
);

function useUnpaidLabel(fines: Fine[]) {
  const { fmt } = useCurrency();
  return useMemo(() => {
    const summary = unpaidSummary(fines);
    return { summary, total: fmt(summary.total), detail: `${countOf(summary.count)} · oldest: ${daysOf(summary.oldestDays)}` };
  }, [fines, fmt]);
}

const FineAlertRow: React.FC<{ fine: Fine; onOpen: () => void; onPay: () => void }> = ({ fine, onOpen, onPay }) => {
  const { fmt } = useCurrency();
  const days = fineAgeDays(fine);
  const customer = fine.resolved_customer_name || fine.customer_name;

  return (
    <li className="border-t border-subtle py-3 first:border-t-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <LicensePlate plate={fine.plate_number} />
        <span className="flex min-w-0 flex-1 basis-[110px] items-center gap-2">
          {customer ? (
            <>
              <CustomerAvatar size={24} />
              <span className="min-w-0 truncate text-[13.5px] text-foreground">{customer}</span>
            </>
          ) : <UnassignedChip />}
        </span>
        <span className="ms-auto text-[14.5px] font-semibold tabular-nums tracking-[-0.01em] text-foreground">{fmt(fine.amount)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] tabular-nums text-black/55">{formatDate(fine.violation_date)}</span>
        <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none tabular-nums', AGE_CLASSES[fineAgeTone(days)])}>{daysOf(days)}</span>
        <span className="ms-auto flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open fine for ${fine.plate_number}`}
            className="h-11 rounded-[10px] border border-subtle bg-surface px-3 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9"
          >
            Open
          </button>
          <button
            type="button"
            onClick={onPay}
            aria-label={`Mark fine for ${fine.plate_number} as paid`}
            className="h-11 rounded-[10px] bg-[#16A34A]/[0.1] px-3 text-[12.5px] font-semibold text-[#15803D] transition-colors hover:bg-[#16A34A]/[0.18] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9"
          >
            Mark as paid
          </button>
        </span>
      </div>
    </li>
  );
};

/** The fines half of the sign-in alert. It has the whole modal to itself when no car needs fixing. */
export const FinesAlertSection: React.FC<{
  fines: Fine[];
  alone: boolean;
  onOpen: (fine: Fine) => void;
  onPay: (fine: Fine) => void;
}> = ({ fines, alone, onOpen, onPay }) => {
  const { total, detail } = useUnpaidLabel(fines);
  return (
    <section aria-labelledby="unpaid-fines-title" className={cn('py-3', !alone && 'mt-1 border-t border-subtle')}>
      <div className={cn('flex gap-3', alone ? 'flex-col items-center text-center' : 'items-center')}>
        <FineImage size={alone ? 96 : 64} />
        <div className="min-w-0">
          <h2 id="unpaid-fines-title" className={cn('font-semibold leading-snug tracking-[-0.015em] text-foreground', alone ? 'text-[18px] sm:text-[20px]' : 'text-[15.5px]')}>{UNPAID_FINES_TITLE}</h2>
          <p className="mt-1 text-[13.5px] tabular-nums text-[#B91C1C]">
            <span className="font-semibold">{total}</span> · {detail}
          </p>
        </div>
      </div>
      <ul className="mt-2">
        {fines.map((fine) => <FineAlertRow key={fine.id} fine={fine} onOpen={() => onOpen(fine)} onPay={() => onPay(fine)} />)}
      </ul>
    </section>
  );
};

export const UnpaidFinesBanner: React.FC<{ fines: Fine[]; onReview?: () => void }> = ({ fines, onReview }) => {
  const { summary, total, detail } = useUnpaidLabel(fines);
  return (
    <div role="alert" className={cn('mb-4 flex max-w-[1100px] items-center gap-3 rounded-2xl border px-3.5 py-3 sm:gap-3.5 sm:px-4', TONE_CLASSES.red.panel)}>
      <FineImage size={56} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug text-[#B91C1C] sm:text-[14px]">{UNPAID_FINES_TITLE}</p>
        <p className="mt-0.5 text-[13px] tabular-nums text-[#B91C1C]">
          <span className="font-semibold">{total}</span> · {detail}
          {summary.unassigned > 0 ? ` · ${summary.unassigned} not linked` : ''}
        </p>
      </div>
      {onReview && (
        <button
          type="button"
          onClick={onReview}
          className="h-11 shrink-0 rounded-[10px] bg-surface px-4 text-[13px] font-semibold text-[#B91C1C] shadow-sm transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9"
        >
          Review
        </button>
      )}
    </div>
  );
};

export const UnpaidFinesHomeCard: React.FC<{ fines: Fine[] }> = ({ fines }) => {
  const { total, detail } = useUnpaidLabel(fines);
  return (
    <Link
      to={UNPAID_FINES_LINK}
      className={cn('mb-4 flex min-h-[44px] items-center gap-3 rounded-2xl border p-3.5 transition-opacity hover:opacity-90 sm:gap-4 sm:p-4', TONE_CLASSES.red.panel)}
    >
      <FineImage size={52} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-snug text-[#B91C1C]">Unpaid fines</span>
        <span className="mt-0.5 block text-[13px] tabular-nums text-[#B91C1C]">{detail}</span>
      </span>
      <span className="shrink-0 text-[20px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[#B91C1C] sm:text-[28px]">{total}</span>
    </Link>
  );
};
