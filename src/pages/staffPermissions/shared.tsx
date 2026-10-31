import React from 'react';
import { cn } from '../../lib/media/badgeColor';
import type { PageSource } from '../../lib/staffAccess';

export const CARD_CLASS = 'rounded-xl border border-subtle bg-surface';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

const SOURCE_TAGS: Record<PageSource, { label: string; className: string }> = {
  department: { label: 'Department', className: 'bg-primary/10 text-primary' },
  everyone: { label: 'Everyone', className: 'bg-black/[0.05] text-black/55' },
  extra: { label: 'Extra', className: 'bg-emerald-500/10 text-emerald-700' },
  blocked: { label: 'Blocked', className: 'bg-red-500/10 text-red-600' },
  'no-department': { label: 'No department', className: 'bg-amber-500/10 text-amber-700' },
};

export const SourceTag: React.FC<{ source: PageSource }> = ({ source }) => {
  const tag = SOURCE_TAGS[source];
  return (
    <span className={cn('inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-medium', tag.className)}>
      {tag.label}
    </span>
  );
};

export const SmallBadge: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <span
    className={cn(
      'inline-flex h-[18px] items-center whitespace-nowrap rounded-full bg-black/[0.05] px-1.5 text-[10.5px] font-medium text-black/55',
      className,
    )}
  >
    {children}
  </span>
);

/** Reaches the 44px touch target without making the switch itself any larger. */
export const SWITCH_HIT_AREA = "after:absolute after:-inset-[13px] after:content-['']";
