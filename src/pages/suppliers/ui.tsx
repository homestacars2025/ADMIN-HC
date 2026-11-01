import React from 'react';
import { cn } from '../../lib/media/badgeColor';
import { formatMoney } from '../../lib/money';
import type { SupplierBalance, SupplierCategory } from '../../lib/suppliers';

const PATHS: Record<SupplierCategory, React.ReactNode> = {
  workshop: <path d="M3 21V9l9-6 9 6v12M9 21v-7h6v7" />,
  mechanic: <path d="M14.7 6.3a4 4 0 0 0-5.3 5.3L3 18v3h3l6.4-6.4a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.8-.7-.7-2.8z" />,
  body_paint: <><path d="M4 4h13v5H4z" /><path d="M17 6h3v5l-8 2v3" /><path d="M10 16h4v5h-4z" /></>,
  tires: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></>,
  car_wash: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  parts: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
  glass: <><path d="M4 4h16v16H4z" /><path d="M8 13l5-5M11 16l5-5" /></>,
  electric: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  towing: <><path d="M3 17V8h10v9M13 11h4l4 4v2h-8" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  insurance: <path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z" />,
  notary: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7" /></>,
  fuel: <><path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M7 8h5" /><path d="M15 11h2a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V9l-3-3" /></>,
  other: <><circle cx="6" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" /></>,
};

export const CategoryIcon: React.FC<{ category: SupplierCategory; size?: number }> = ({ category, size = 16 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {PATHS[category]}
  </svg>
);

/** One line per currency: red when we owe them, green when they hold our money. */
export const BalanceLines: React.FC<{ balances: SupplierBalance[]; className?: string }> = ({ balances, className }) => {
  const open = balances.filter((row) => row.balance !== 0);
  if (open.length === 0) return <span className={cn('text-[13px] text-black/40', className)}>Settled</span>;
  return (
    <span className={cn('flex flex-col items-end gap-0.5', className)}>
      {open.map((row) => (
        <span key={row.currency} className={cn('text-[14.5px] font-semibold tabular-nums', row.balance > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]')}>
          {formatMoney(Math.abs(row.balance), row.currency)}
          <span className="ms-1 text-[11.5px] font-normal">{row.balance > 0 ? 'we owe' : 'credit'}</span>
        </span>
      ))}
    </span>
  );
};
