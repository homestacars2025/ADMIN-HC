import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/media/badgeColor';

const asText = (value: number | null) => (value === null ? '' : String(value));

/** A number that saves on blur or Enter. Escape puts it back. */
export const NumberCell: React.FC<{
  value: number | null;
  ariaLabel: string;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  disabled?: boolean;
  width?: number;
  /** Null means the field was cleared. */
  onCommit: (value: number | null) => void;
}> = ({ value, ariaLabel, prefix, suffix, placeholder, disabled, width = 84, onCommit }) => {
  const [draft, setDraft] = useState(asText(value));

  useEffect(() => { setDraft(asText(value)); }, [value]);

  const commit = () => {
    const next = draft.trim() === '' ? null : Number(draft);
    if (next !== value) onCommit(next);
  };

  return (
    <span className="inline-flex items-center gap-1 text-[13px] text-black/40">
      {prefix}
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(asText(value));
            event.currentTarget.blur();
          }
        }}
        style={{ width }}
        className={cn(
          'h-11 rounded-lg border border-subtle bg-surface px-2 font-mono text-[13px] tabular-nums text-foreground outline-none',
          'transition-colors focus:border-brand-strong disabled:opacity-50 md:h-9',
        )}
      />
      {suffix}
    </span>
  );
};
