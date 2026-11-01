import React, { useEffect, useRef, useState } from 'react';
import { CURRENCIES, CURRENCY_SYMBOLS, useCurrency, type Currency } from '../../lib/CurrencyContext';
import { cn } from '../../lib/media/badgeColor';
import { saveUserSettings } from '../../lib/userSettings';
import { Check, ChevronDown } from '../media/MediaIcons';

/** The same choice as Settings: this reads and writes the one currency state. */
export const CurrencySwitcher: React.FC<{ userId: string | undefined }> = ({ userId }) => {
  const { currency, setCurrency, symbol } = useCurrency();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (next: Currency) => {
    setCurrency(next);
    if (userId) saveUserSettings(userId, { currency: next });
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Currency: ${currency}`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-xl border border-subtle px-2 text-[13px] font-medium text-foreground transition-colors hover:bg-black/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/40 md:h-10 md:px-2.5"
      >
        <span>{symbol}</span>
        <span className="hidden md:inline">{currency}</span>
        <ChevronDown size={13} className="hidden text-black/40 md:block" />
      </button>

      {open && (
        <div role="menu" aria-label="Currency" className="absolute end-0 top-[calc(100%+8px)] z-[1100] w-[148px] rounded-xl border border-subtle bg-surface p-1 shadow-lg">
          {CURRENCIES.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === currency}
              onClick={() => choose(option)}
              className={cn('flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2.5 text-[13.5px] transition-colors hover:bg-black/[0.04] md:min-h-[36px]', option === currency ? 'font-medium text-primary' : 'text-foreground')}
            >
              <span className="w-6 shrink-0 text-start">{CURRENCY_SYMBOLS[option]}</span>
              <span className="flex-1 text-start">{option}</span>
              {option === currency && <Check size={14} strokeWidth={2.5} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
