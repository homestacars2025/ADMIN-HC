import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../../components/media/MediaUI';
import { X } from '../../components/media/MediaIcons';
import { parseDayRange, presetOf, presetRange, RANGE_PRESETS, type DayRange, type RangePreset } from '../../lib/hgs';
import { cn } from '../../lib/media/badgeColor';

const PRESET_LABELS: Record<RangePreset, string> = { today: 'Today', last7: 'Last 7 days', this_month: 'This month', last_month: 'Last month' };

export const DatesIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
  </svg>
);

const WIDTH = 300;

/**
 * A from → to picker: four presets that apply at once, or Custom, two dates and Apply.
 * It opens fixed under its button, or above it when there's no room, and never off the
 * screen, so the row's rounded clipping can't cut it.
 */
export const RangePicker: React.FC<{
  /** Names the popover and the button, e.g. "Dates for 34ABC101". */
  label: string;
  value: DayRange | null;
  /** What Custom starts from when there's no range yet: what the row shows now. */
  fallback: DayRange;
  today: string;
  onChange: (range: DayRange | null) => void;
  className?: string;
  children: React.ReactNode;
}> = ({ label, value, fallback, today, onChange, className, children }) => {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const active = presetOf(value, today);

  const show = () => {
    const start = value ?? fallback;
    setFrom(start.from);
    setTo(start.to);
    setCustom(Boolean(value) && !active);
    setPosition(null);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const pick = (range: DayRange | null) => {
    onChange(range);
    close();
  };

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const height = panel.current?.getBoundingClientRect().height ?? 260;
    const width = Math.min(WIDTH, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    const below = rect.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
    setPosition({ left, top });
  }, [open, custom]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    // It's placed against the button once, so it goes when the page moves under it.
    const onScroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const typed = parseDayRange(from, to);
  const dateClass = 'mt-1 h-11 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-2.5 text-[14px] tabular-nums outline-none focus:border-[#6EA4E7] focus:ring-[3px] focus:ring-[#6EA4E7]/25 md:h-9 md:text-[13px]';
  const presetClass = (on: boolean) => cn(
    'min-h-[44px] rounded-[10px] border px-2.5 text-[13px] font-medium transition-colors md:min-h-[36px]',
    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/35',
    on ? 'border-[#6EA4E7] bg-[#6EA4E7]/10 text-[#3A74C2]' : 'border-[#E5E7EB] bg-white text-black/70 hover:border-black/20',
  );

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : show())}
        className={className}
      >
        {children}
      </button>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label={label}
          className="fixed z-[1200] rounded-2xl border border-[#EBEBEB] bg-white p-3 shadow-[0_12px_40px_rgba(0,0,0,0.16)]"
          style={{ width: Math.min(WIDTH, window.innerWidth - 16), left: position?.left ?? -9999, top: position?.top ?? -9999 }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-foreground">Dates</span>
            <button type="button" aria-label="Close" onClick={close} className="grid h-11 w-11 place-items-center rounded-[10px] text-black/45 hover:bg-black/[0.04] md:h-8 md:w-8"><X size={15} /></button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {RANGE_PRESETS.map((preset) => (
              <button key={preset} type="button" aria-pressed={active === preset && !custom} onClick={() => pick(presetRange(preset, today))} className={presetClass(active === preset && !custom)}>
                {PRESET_LABELS[preset]}
              </button>
            ))}
            <button type="button" aria-pressed={custom} onClick={() => setCustom((on) => !on)} className={cn(presetClass(custom), 'col-span-2')}>Custom</button>
          </div>
          {custom && (
            <form
              className="mt-2.5"
              onSubmit={(event) => {
                event.preventDefault();
                if (typed) pick(typed);
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[12px] font-medium text-black/55">
                  From
                  <input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} className={dateClass} />
                </label>
                <label className="text-[12px] font-medium text-black/55">
                  To
                  <input type="date" required value={to} onChange={(event) => setTo(event.target.value)} className={dateClass} />
                </label>
              </div>
              <Button type="submit" size="lg" className="mt-2.5 !h-11 w-full md:!h-9" disabled={!typed}>Apply</Button>
            </form>
          )}
          {value && (
            <button type="button" onClick={() => pick(null)} className="mt-2 min-h-[44px] w-full rounded-[10px] text-[13px] font-medium text-[#3A74C2] hover:bg-[#6EA4E7]/[0.08] md:min-h-[34px]">
              Clear dates
            </button>
          )}
        </div>
      )}
    </>
  );
};
