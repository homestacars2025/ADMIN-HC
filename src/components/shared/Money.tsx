import React from 'react';
import { useMoney, type MoneyOptions } from '../../hooks/useMoney';
import { cn } from '../../lib/media/badgeColor';

/** An amount in the top-bar currency, in Geist Mono. */
export const Money: React.FC<MoneyOptions & { value: number; className?: string }> = ({ value, className, ...options }) => {
  const { format } = useMoney();
  return <span className={cn('font-mono tabular-nums', className)}>{format(value, options)}</span>;
};

/** "Converted at 1 USD = 50,00 ₺ (9 Nov 2026)" near the totals, only when amounts aren't in lira. */
export const RateNote: React.FC<{ className?: string }> = ({ className }) => {
  const { rateNote } = useMoney();
  if (!rateNote) return null;
  return <p className={cn('text-[11.5px] text-black/45', className)}>{rateNote}</p>;
};
