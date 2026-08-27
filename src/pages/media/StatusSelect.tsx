import React, { useState } from 'react';
import { cn, toneFor, TONE_CLASSES, TONE_DOTS } from '../../lib/media/badgeColor';
import type { EnumOption } from '../../lib/media/types';
import { ChevronDown } from '../../components/media/MediaIcons';
import { DropdownMenu } from '../../components/media/MediaUI';
import { toast } from '../../components/media/MediaToast';

/**
 * A coloured pill that *is* its own dropdown.
 *
 * Optimism is local and three-state: `undefined` means "defer to the prop", which
 * makes a rollback a single assignment rather than a re-derivation from the
 * parent's list.
 */
export const StatusSelect: React.FC<{
  value: string | null;
  options: readonly EnumOption[];
  placeholder: string;
  ariaLabel: string;
  onSelect: (next: string | null) => Promise<boolean>;
}> = ({ value, options, placeholder, ariaLabel, onSelect }) => {
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState<string | null | undefined>(undefined);

  const current = optimistic === undefined ? value : optimistic;
  const tone = toneFor(options, current);
  const label = options.find((o) => o.value === current)?.label ?? current;

  async function choose(next: string | null) {
    if (next === current) return;
    setOptimistic(next);
    setPending(true);
    const ok = await onSelect(next);
    setPending(false);
    if (!ok) setOptimistic(undefined);
    else toast.success('Status updated');
  }

  const items = [
    { key: '__none__', label: placeholder, muted: true, onSelect: () => choose(null) },
    ...options.map((o) => ({
      key: o.value,
      label: o.label,
      dotClass: TONE_DOTS[o.tone],
      onSelect: () => choose(o.value),
    })),
  ];

  return (
    <DropdownMenu
      items={items}
      ariaLabel={ariaLabel}
      disabled={pending}
      minWidth={172}
      triggerClassName={cn(
        'inline-flex h-[26px] w-fit max-w-full items-center gap-1.5 rounded-full border px-2.5',
        'text-[11.5px] font-medium whitespace-nowrap transition-all duration-150',
        'hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[#6ea4e7]/35 disabled:opacity-60',
        // An unset status is a dashed, transparent pill — visibly a slot waiting
        // to be filled, never mistakable for a real value.
        current ? TONE_CLASSES[tone] : 'border-dashed border-black/[0.14] bg-transparent text-black/35',
      )}
    >
      {() => (
        <>
          {current && (
            <span
              aria-hidden="true"
              className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOTS[tone])}
            />
          )}
          <span className="truncate">{label ?? placeholder}</span>
          <ChevronDown size={11} strokeWidth={2} className="shrink-0 opacity-50" />
        </>
      )}
    </DropdownMenu>
  );
};
