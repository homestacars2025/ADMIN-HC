import React from 'react';
import { cn } from '../../lib/media/badgeColor';

/**
 * Marks a sold car (cars.is_active = false) where it still shows in a history record.
 * Sold cars are archive only; see "Sold / archived cars" in CLAUDE.md.
 */
export const SoldChip: React.FC<{ className?: string }> = ({ className }) => (
  <span
    title="Sold: archive only"
    className={cn('inline-flex h-5 shrink-0 items-center rounded-full bg-black/[0.07] px-2 text-[11px] font-semibold leading-none text-black/50', className)}
  >
    Sold
  </span>
);

export default SoldChip;
