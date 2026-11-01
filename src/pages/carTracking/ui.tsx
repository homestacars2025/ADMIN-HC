import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Pencil, X } from '../../components/media/MediaIcons';
import { toast } from '../../components/media/MediaToast';
import { ComplianceTriangle, TONE_CLASSES } from '../../components/shared/ComplianceBits';
import {
  addDays,
  dayLabel,
  HISTORY_START,
  km,
  niceMax,
  oilBarPercent,
  oilState,
  OVER_KM,
  parseNextOil,
  saveNextOil,
  signalAgo,
  signalTime,
  signalTone,
  trackingOutage,
  type DayRow,
  type SeriesDay,
  type TrackedCar,
} from '../../lib/carTracking';
import { cn } from '../../lib/media/badgeColor';
import { Calendar } from '../bookings/DateRangeField';

const BLUE = '#4ba6ea';
const RED = '#DC2626';
const barColor = (value: number) => (value > OVER_KM ? RED : BLUE);

export const CARD = 'rounded-xl border border-subtle bg-surface';

export const OutageBanner: React.FC<{ outage: NonNullable<ReturnType<typeof trackingOutage>> }> = ({ outage }) => (
  <div role="alert" className={cn('mb-4 flex max-w-[1100px] items-center gap-3 rounded-2xl border px-3.5 py-3 sm:px-4', TONE_CLASSES.red.panel)}>
    <ComplianceTriangle tone="red" size={48} />
    <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-[#B91C1C] sm:text-[14px]">
      Tracking is down — last signal {signalTime(outage.lastSignal)}. Check the Trio link.
    </p>
  </div>
);

// ─── Date navigator ───────────────────────────────────────────────────────────

const ARROW = 'grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-[#E5E7EB] bg-white text-black/55 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#E5E7EB] disabled:hover:text-black/55 md:h-10 md:w-10';

export const DateNav: React.FC<{ day: string; today: string; onChange: (day: string) => void }> = ({ day, today, onChange }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const first = addDays(HISTORY_START, -1);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative flex max-w-[360px] items-center gap-2">
      <button type="button" aria-label="Previous day" disabled={day <= first} onClick={() => onChange(addDays(day, -1))} className={ARROW}>
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Choose a day, showing ${dayLabel(day, today)}`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-medium text-foreground transition-colors hover:border-primary md:h-10"
      >
        <CalendarDays size={15} className="hidden shrink-0 text-black/40 min-[360px]:block" />
        <span className="truncate tabular-nums">{dayLabel(day, today)}</span>
        <ChevronDown size={14} className="shrink-0 text-black/35" />
      </button>
      <button type="button" aria-label="Next day" disabled={day >= today} onClick={() => onChange(addDays(day, 1))} className={ARROW}>
        <ChevronRight size={16} />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 shadow-lg">
          <Calendar
            key={day}
            start={day}
            end={day}
            min={first}
            max={today}
            focusDay={day}
            oneMonth
            onPick={(picked) => { onChange(picked); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
};

// ─── Charts ───────────────────────────────────────────────────────────────────

const CHART_HEIGHT = 190;

/** Km per car, tallest first. The line on top reads out whichever bar is hovered or focused. */
export const KmChart: React.FC<{ rows: DayRow[]; onPick: (row: DayRow) => void }> = ({ rows, onPick }) => {
  const bars = rows.filter((row) => row.km > 0);
  const [hovered, setHovered] = useState<string | null>(null);
  if (bars.length === 0) return null;

  const top = niceMax(bars[0].km);
  const shown = bars.find((row) => row.key === hovered) ?? bars[0];

  return (
    <section aria-label="Kilometres per car" className={cn(CARD, 'mt-4 max-w-[1100px] p-4 sm:p-5')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[14px] font-medium text-foreground">Kilometres per car</h2>
        <p className="min-w-0 truncate text-[13px] tabular-nums text-black/55">
          <span className="font-mono font-semibold text-foreground">{shown.plate}</span>
          {shown.model ? ` · ${shown.model}` : ''} · <span className="font-semibold text-foreground">{km(shown.km)} km</span>
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        <div aria-hidden="true" className="flex shrink-0 flex-col justify-between text-end text-[11px] tabular-nums text-black/40" style={{ height: CHART_HEIGHT }}>
          <span>{km(top)}</span>
          <span>{km(top / 2)}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <ul className="relative flex gap-[3px]" style={{ minWidth: bars.length * 25 }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-black/[0.08]" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-black/[0.08]" style={{ top: CHART_HEIGHT / 2 }} />
            {bars.map((row) => (
              <li key={row.key} className="min-w-0 flex-1">
                <button
                  type="button"
                  aria-label={`${row.plate}, ${km(row.km)} km, open history`}
                  onClick={() => onPick(row)}
                  onMouseEnter={() => setHovered(row.key)}
                  onFocus={() => setHovered(row.key)}
                  className="group block w-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="relative flex items-end justify-center" style={{ height: CHART_HEIGHT }}>
                    <span
                      className="block w-full max-w-[28px] rounded-t-[4px] transition-opacity group-hover:opacity-80"
                      style={{ height: `${Math.max(1.5, (row.km / top) * 100)}%`, background: barColor(row.km) }}
                    />
                  </span>
                  <span className="mt-1.5 flex h-[62px] items-start justify-center overflow-hidden">
                    <span className="font-mono text-[10.5px] leading-none text-black/55 [transform:rotate(180deg)] [writing-mode:vertical-rl]">{row.plate}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

/** Seven days at a glance. A day with nothing recorded is a dot, not a zero. */
export const Sparkline: React.FC<{ days: SeriesDay[] }> = ({ days }) => {
  const top = Math.max(1, ...days.map((day) => day.km ?? 0));
  return (
    <span aria-hidden="true" className="flex h-7 w-[70px] shrink-0 items-end gap-[3px]">
      {days.map((day) => (
        <span
          key={day.day}
          className="block flex-1 rounded-[2px]"
          style={day.km === null
            ? { height: 3, background: 'rgb(0 0 0 / 0.1)' }
            : { height: `${Math.max(10, (day.km / top) * 100)}%`, background: day.km > 0 ? barColor(day.km) : 'rgb(0 0 0 / 0.18)' }}
        />
      ))}
    </span>
  );
};

/** The drawer's chart: one slot a day, so a gap in the history stays visible. */
export const DayBars: React.FC<{ days: SeriesDay[] }> = ({ days }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const top = niceMax(Math.max(0, ...days.map((day) => day.km ?? 0)));
  const shown = days.find((day) => day.day === hovered) ?? days[days.length - 1];

  return (
    <div>
      <p className="text-[12.5px] tabular-nums text-black/55">
        {dayLabel(shown.day, '')} · <span className="font-semibold text-foreground">{shown.km === null ? 'Nothing recorded' : `${km(shown.km)} km`}</span>
      </p>
      <div className="mt-2 flex h-[130px] items-end gap-[2px] border-b border-black/[0.08]" onMouseLeave={() => setHovered(null)}>
        {days.map((day) => (
          <span key={day.day} onMouseEnter={() => setHovered(day.day)} className="flex h-full min-w-0 flex-1 items-end">
            <span
              className="block w-full rounded-t-[2px]"
              style={day.km === null
                ? { height: 2, background: 'rgb(0 0 0 / 0.08)' }
                : { height: `${Math.max(2, (day.km / top) * 100)}%`, background: barColor(day.km) }}
            />
          </span>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-black/40">
        <span>{dayLabel(days[0].day, '')}</span>
        <span>{dayLabel(days[days.length - 1].day, '')}</span>
      </div>
    </div>
  );
};

// ─── Small cells ──────────────────────────────────────────────────────────────

const SIGNAL_CLASS = { ok: 'text-black/55', amber: 'font-medium text-[#B45309]', red: 'font-medium text-[#B91C1C]' };

export const SignalAge: React.FC<{ at: string | null; now: number }> = ({ at, now }) => (
  <span title={signalTime(at)} className={cn('whitespace-nowrap text-[13px] tabular-nums', SIGNAL_CLASS[signalTone(at, now)])}>
    {signalAgo(at, now)}
  </span>
);

const OIL_BAR = { ok: 'bg-[#16A34A]', due: 'bg-[#F59E0B]', over: 'bg-[#DC2626]', unknown: 'bg-transparent' };
const OIL_TEXT = { ok: 'text-[#15803D]', due: 'text-[#92400E]', over: 'text-[#B91C1C]', unknown: 'text-black/40' };

function oilLabel(remaining: number): string {
  if (remaining > 0) return `${km(remaining)} km left`;
  return remaining === 0 ? 'Due now' : `Overdue by ${km(-remaining)} km`;
}

export const OilBar: React.FC<{ remaining: number | null }> = ({ remaining }) => {
  const state = oilState(remaining);
  if (remaining === null) return <span className="text-[13px] text-black/40">Not set</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {state !== 'ok' && <ComplianceTriangle tone={state === 'over' ? 'red' : 'amber'} size={22} />}
      <span className="min-w-0 flex-1">
        <span className={cn('block whitespace-nowrap text-[12.5px] font-medium tabular-nums', OIL_TEXT[state])}>{oilLabel(remaining)}</span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
          <span className={cn('block h-full rounded-full', OIL_BAR[state])} style={{ width: `${oilBarPercent(remaining)}%` }} />
        </span>
      </span>
    </span>
  );
};

const EDIT_BUTTON = 'grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-subtle bg-white xl:h-8 xl:w-8';

export const OilEditor: React.FC<{ car: TrackedCar; onSaved: (value: number | null) => void }> = ({ car, onSaved }) => {
  const [text, setText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const editing = text !== null;

  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);

  const save = async () => {
    const parsed = parseNextOil(text ?? '');
    if (!parsed) { toast.error('Enter whole kilometres, like 25000.'); return; }
    setSaving(true);
    try {
      await saveNextOil(car.id, parsed.value);
      onSaved(parsed.value);
      setText(null);
    } catch (error) {
      toast.error(`Couldn't save the oil change: ${error instanceof Error ? error.message : 'try again'}`);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`Edit next oil change for ${car.plate}`}
        onClick={() => setText(car.next_oil_change === null ? '' : String(car.next_oil_change))}
        className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] tabular-nums text-foreground hover:text-primary xl:min-h-[32px]"
      >
        {car.next_oil_change === null ? <span className="text-black/40">Set</span> : `${km(car.next_oil_change)} km`}
        <Pencil size={12} className="shrink-0 text-black/30" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        ref={input}
        type="number"
        inputMode="numeric"
        min={0}
        value={text}
        aria-label={`Next oil change for ${car.plate}, in km`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save();
          if (event.key === 'Escape') setText(null);
        }}
        className="h-11 w-[96px] rounded-lg border border-primary bg-white px-2 text-[14px] tabular-nums outline-none xl:h-8 xl:text-[13px]"
      />
      <button type="button" aria-label="Save" disabled={saving} onClick={save} className={cn(EDIT_BUTTON, 'text-[#16A34A]')}><Check size={14} strokeWidth={2.5} /></button>
      <button type="button" aria-label="Cancel" onClick={() => setText(null)} className={cn(EDIT_BUTTON, 'text-black/40')}><X size={14} /></button>
    </span>
  );
};

export const IgnitionDot: React.FC<{ car: TrackedCar; live: boolean; now: number }> = ({ car, live, now }) => {
  const stale = car.ignition && !live;
  return (
    <span
      title={stale ? `Last reported ON, ${signalAgo(car.last_signal_at, now).toLowerCase()}` : undefined}
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]', live ? 'font-medium text-[#15803D]' : 'text-black/45')}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', live ? 'bg-[#22C55E]' : 'bg-black/20')} />
      {stale ? 'ON earlier' : car.ignition ? 'ON' : 'OFF'}
    </span>
  );
};
