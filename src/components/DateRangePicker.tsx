import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/media/badgeColor';
import { Button } from './media/MediaUI';

/**
 * A single-trigger date range picker.
 *
 * Hand-rolled rather than pulled from a library: this project has no calendar,
 * popover or date dependency at all — Select, DropdownMenu, Tooltip and Sheet
 * are all built in-house — so react-day-picker would be the only new runtime
 * package, for a month grid that is about sixty lines of arithmetic.
 *
 * Selection is staged: the calendar edits a draft and nothing leaves the
 * component until Apply, so a half-picked range never filters the page.
 */

export interface DateRange {
  /** ISO day, `YYYY-MM-DD`. Empty string means "open at this end". */
  from: string;
  to: string;
}

export const ALL_DATES: DateRange = { from: '', to: '' };

// ── Day helpers ───────────────────────────────────────────────────────────────
//
// Everything is local calendar days. A Date built from `new Date(iso)` would be
// UTC midnight and could land on the previous day west of Greenwich.

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Monday-first, which is what a Turkish calendar shows. */
function leadingBlanks(first: Date): number {
  return (first.getDay() + 6) % 7;
}

export function presetRange(kind: 'this' | 'last' | '3m'): DateRange {
  const now = new Date();
  if (kind === 'this') {
    return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
  }
  if (kind === 'last') {
    return {
      from: isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: isoDay(new Date(now.getFullYear(), now.getMonth(), 0)),   // day 0 = last of previous month
    };
  }
  return { from: isoDay(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: isoDay(now) };
}

const PRESETS: Array<{ key: string; label: string; make: () => DateRange }> = [
  { key: 'this', label: 'This month',    make: () => presetRange('this') },
  { key: 'last', label: 'Last month',    make: () => presetRange('last') },
  { key: '3m',   label: 'Last 3 months', make: () => presetRange('3m') },
  { key: 'all',  label: 'All',           make: () => ALL_DATES },
];

function sameRange(a: DateRange, b: DateRange): boolean {
  return a.from === b.from && a.to === b.to;
}

// ── Labels ────────────────────────────────────────────────────────────────────

const LOCALE = 'tr-TR';
const DAY_MONTH = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
const MONTH_YEAR = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });

/** "07 Eyl – 16 Eyl 2026", with the year written once when both ends share it. */
export function formatRangeLabel(range: DateRange): string {
  const from = fromIso(range.from);
  const to = fromIso(range.to);
  if (!from && !to) return 'All dates';
  if (from && !to) return `${DAY_MONTH_YEAR.format(from)} – …`;
  if (!from && to) return `… – ${DAY_MONTH_YEAR.format(to)}`;
  if (from && to) {
    return from.getFullYear() === to.getFullYear()
      ? `${DAY_MONTH.format(from)} – ${DAY_MONTH_YEAR.format(to)}`
      : `${DAY_MONTH_YEAR.format(from)} – ${DAY_MONTH_YEAR.format(to)}`;
  }
  return 'All dates';
}

/** Monday-first weekday initials in the calendar's own locale. */
const WEEKDAYS = (() => {
  const fmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)).slice(0, 2));
})();

// ── Calendar ──────────────────────────────────────────────────────────────────

const MonthGrid: React.FC<{
  month: Date;
  draft: DateRange;
  hovered: string | null;
  onPick: (iso: string) => void;
  onHover: (iso: string | null) => void;
}> = ({ month, draft, hovered, onPick, onHover }) => {
  const first = startOfMonth(month);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const blanks = leadingBlanks(first);
  const today = isoDay(new Date());

  // While only the start is picked, the hovered day previews the other end.
  const previewTo = draft.from && !draft.to && hovered && hovered >= draft.from ? hovered : draft.to;

  return (
    <div className="grid grid-cols-7 gap-y-0.5" role="grid">
      {WEEKDAYS.map((w) => (
        <div key={w} className="pb-1 text-center text-[10.5px] font-medium uppercase tracking-[0.06em] text-black/35">
          {w}
        </div>
      ))}

      {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} />)}

      {Array.from({ length: days }, (_, i) => {
        const date = new Date(month.getFullYear(), month.getMonth(), i + 1);
        const iso = isoDay(date);
        const isStart = iso === draft.from;
        const isEnd = Boolean(previewTo) && iso === previewTo;
        const inside = Boolean(draft.from && previewTo && iso > draft.from && iso < previewTo!);
        const edge = isStart || isEnd;

        return (
          <div
            key={iso}
            className={cn(
              'flex justify-center py-px',
              // The connecting wash sits on the wrapper so it meets edge to edge.
              inside && 'bg-primary/[0.10]',
              isStart && previewTo && previewTo !== iso && 'rounded-l-full bg-primary/[0.10]',
              isEnd && draft.from && draft.from !== iso && 'rounded-r-full bg-primary/[0.10]',
            )}
          >
            <button
              type="button"
              role="gridcell"
              aria-selected={edge}
              onClick={() => onPick(iso)}
              onMouseEnter={() => onHover(iso)}
              onMouseLeave={() => onHover(null)}
              className={cn(
                'grid size-8 place-items-center rounded-full text-[12.5px] tabular-nums transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                edge
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : inside
                    ? 'text-black/75 hover:bg-primary/20'
                    : 'text-black/65 hover:bg-black/[0.05]',
                !edge && iso === today && 'font-semibold text-primary ring-1 ring-primary/35',
              )}
            >
              {i + 1}
            </button>
          </div>
        );
      })}
    </div>
  );
};

// ── Picker ────────────────────────────────────────────────────────────────────

const DateRangePicker: React.FC<{
  value: DateRange;
  onApply: (range: DateRange) => void;
  className?: string;
}> = ({ value, onApply, className }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const [hovered, setHovered] = useState<string | null>(null);
  const [month, setMonth] = useState<Date>(() => startOfMonth(fromIso(value.from) ?? new Date()));
  const wrapRef = useRef<HTMLDivElement>(null);

  // Opening always starts from what is currently applied, so cancelling by
  // clicking away cannot leave a stale half-selection behind.
  const openPicker = useCallback(() => {
    setDraft(value);
    setHovered(null);
    setMonth(startOfMonth(fromIso(value.from) ?? new Date()));
    setOpen(true);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = useCallback((iso: string) => {
    setDraft((d) => {
      if (!d.from || d.to) return { from: iso, to: '' };     // start a new range
      if (iso < d.from) return { from: iso, to: '' };         // clicked before the start
      return { from: d.from, to: iso };
    });
  }, []);

  const apply = () => {
    // A start with no end reads as "from this day onwards" rather than nothing.
    onApply({ from: draft.from, to: draft.to });
    setOpen(false);
  };

  const clear = () => {
    setDraft(ALL_DATES);
    onApply(ALL_DATES);
    setOpen(false);
  };

  const label = useMemo(() => formatRangeLabel(value), [value]);
  const isFiltered = Boolean(value.from || value.to);

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[12.5px] transition-colors',
          'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20',
          isFiltered
            ? 'border-primary/35 bg-primary/[0.06] font-medium text-primary'
            : 'border-input bg-background text-black/65 hover:bg-black/[0.03]',
        )}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        {label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
             className={cn('transition-transform duration-200 text-black/30', open && 'rotate-180')}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date range"
          className={cn(
            'absolute left-0 z-50 mt-1.5 w-[290px] max-w-[calc(100vw-2.5rem)] rounded-xl border border-black/[0.08]',
            'bg-white p-3 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.24)]',
          )}
        >
          {/* Presets */}
          <div className="flex flex-wrap gap-1.5 pb-2.5">
            {PRESETS.map((p) => {
              const r = p.make();
              const active = sameRange(draft, r);
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setDraft(r);
                    const anchor = fromIso(r.from);
                    if (anchor) setMonth(startOfMonth(anchor));
                  }}
                  className={cn(
                    'h-6 rounded-full px-2.5 text-[11px] font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-black/[0.04] text-black/55 hover:bg-black/[0.07] hover:text-black/75',
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Month header */}
          <div className="flex items-center justify-between border-t border-black/[0.06] pt-2.5">
            <button
              type="button" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}
              className="grid size-7 place-items-center rounded-md text-black/45 transition-colors hover:bg-black/[0.05] hover:text-black/70"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span className="text-[12.5px] font-semibold capitalize tracking-[-0.008em] text-black/75">
              {MONTH_YEAR.format(month)}
            </span>
            <button
              type="button" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}
              className="grid size-7 place-items-center rounded-md text-black/45 transition-colors hover:bg-black/[0.05] hover:text-black/70"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>

          <div className="pt-1.5">
            <MonthGrid month={month} draft={draft} hovered={hovered} onPick={pick} onHover={setHovered} />
          </div>

          {/* Staged selection + actions */}
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-black/[0.06] pt-2.5">
            <span className="min-w-0 truncate text-[11.5px] text-black/45">{formatRangeLabel(draft)}</span>
            <div className="flex shrink-0 gap-1.5">
              <Button variant="ghost" size="sm" onClick={clear}>Clear</Button>
              <Button variant="default" size="sm" onClick={apply}>Apply</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
