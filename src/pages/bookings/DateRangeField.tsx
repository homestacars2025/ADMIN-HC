import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from '../../components/media/MediaIcons';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatDays, rangeDays } from '../../lib/bookingForm';
import { formatDate, istanbulDate } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import { Field } from './ui';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_LABEL = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Every day of a month, with blanks so it starts on Monday, as a Turkish calendar does. */
function monthCells(year: number, month: number): Array<string | null> {
  const blanks = (utc(year, month, 1).getUTCDay() + 6) % 7;
  const days = utc(year, month + 1, 0).getUTCDate();
  return [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: days }, (_, index) => iso(utc(year, month, index + 1))),
  ];
}

const Month: React.FC<{
  year: number;
  month: number;
  start: string;
  end: string;
  min?: string;
  today: string;
  onPick: (day: string) => void;
}> = ({ year, month, start, end, min, today, onPick }) => (
  <div className="min-w-0">
    <div className="grid grid-cols-7 text-center text-[11px] font-medium text-black/40">
      {WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}
    </div>
    <div className="grid grid-cols-7">
      {monthCells(year, month).map((day, index) => {
        if (!day) return <span key={`blank-${index}`} />;
        const isEdge = day === start || day === end;
        const inside = Boolean(start && end) && day > start && day < end;
        const disabled = Boolean(min) && day < (min as string);
        return (
          <button
            key={day}
            type="button"
            disabled={disabled}
            aria-label={DAY_LABEL.format(new Date(`${day}T00:00:00Z`))}
            aria-pressed={isEdge}
            onClick={() => onPick(day)}
            className={cn(
              'h-11 text-[13px] tabular-nums transition-colors md:h-10 focus-visible:relative focus-visible:z-10 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/50 disabled:cursor-not-allowed disabled:text-black/20',
              isEdge && 'rounded-lg bg-[#6EA4E7] font-semibold text-white',
              inside && 'bg-[#6EA4E7]/[0.14] text-foreground',
              !isEdge && !inside && !disabled && 'rounded-lg text-foreground hover:bg-black/[0.05]',
              !isEdge && day === today && 'font-semibold text-brand-strong',
            )}
          >
            {Number(day.slice(8))}
          </button>
        );
      })}
    </div>
  </div>
);

/** The months to open on: wherever the selection is, otherwise this month. */
function initialMonth(day: string): { year: number; month: number } {
  const base = day || istanbulDate();
  return { year: Number(base.slice(0, 4)), month: Number(base.slice(5, 7)) - 1 };
}

const Calendar: React.FC<{
  start: string;
  end: string;
  min?: string;
  focusDay: string;
  onPick: (day: string) => void;
  /** For a field that only has half the row to open into. */
  oneMonth?: boolean;
}> = ({ start, end, min, focusDay, onPick, oneMonth }) => {
  const wide = useMediaQuery('(min-width: 640px)');
  const twoMonths = wide && !oneMonth;
  const [view, setView] = useState(() => initialMonth(focusDay));
  const today = useMemo(() => istanbulDate(), []);

  const move = (by: number) => setView(({ year, month }) => {
    const next = utc(year, month + by, 1);
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
  });

  const months = (twoMonths ? [0, 1] : [0]).map((offset) => {
    const date = utc(view.year, view.month + offset, 1);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth(), label: MONTH_LABEL.format(date) };
  });

  return (
    <div className="mt-2 rounded-xl border border-[#E5E7EB] bg-white p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} aria-label="Previous month" className="grid h-11 w-11 place-items-center rounded-lg text-black/50 hover:bg-black/[0.04] md:h-10 md:w-10">
          <ChevronLeft size={15} />
        </button>
        <div className="flex flex-1 justify-around text-[13px] font-medium text-foreground">
          {months.map((month) => <span key={month.label}>{month.label}</span>)}
        </div>
        <button type="button" onClick={() => move(1)} aria-label="Next month" className="grid h-11 w-11 place-items-center rounded-lg text-black/50 hover:bg-black/[0.04] md:h-10 md:w-10">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className={cn('grid gap-4', twoMonths && 'grid-cols-2')}>
        {months.map((month) => (
          <Month key={month.label} year={month.year} month={month.month} start={start} end={end} min={min} today={today} onPick={onPick} />
        ))}
      </div>
    </div>
  );
};

const Trigger: React.FC<{ open: boolean; empty: boolean; onToggle: () => void; children: React.ReactNode; aria: string }> = ({ open, empty, onToggle, children, aria }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={open}
    aria-label={aria}
    className={cn(
      'flex h-11 w-full items-center gap-2 rounded-[10px] border bg-white px-3 text-left text-[14px] transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/25 md:h-10',
      open ? 'border-[#6EA4E7]' : 'border-[#E5E7EB]',
      empty ? 'text-black/40' : 'text-foreground',
    )}
  >
    <CalendarDays size={15} className="shrink-0 text-black/40" />
    <span className="min-w-0 flex-1 truncate tabular-nums">{children}</span>
  </button>
);

/** Both ends of a stay. The first click sets the start, the second the end. */
export const DateRangeField: React.FC<{
  label: string;
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  required?: boolean;
  changed?: boolean;
  error?: string | null;
}> = ({ label, start, end, onChange, required, changed, error }) => {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);

  const onPick = (day: string) => {
    if (!picking) {
      onChange(day, '');
      setPicking(true);
      return;
    }
    setPicking(false);
    setOpen(false);
    if (day < start) onChange(day, start);
    else onChange(start, day);
  };

  const days = rangeDays(start, end);

  return (
    <Field label={label} required={required} changed={changed} span error={error}>
      <Trigger open={open} empty={!start} aria={label} onToggle={() => { setOpen((value) => !value); setPicking(false); }}>
        {start
          ? <>{formatDate(start)} → {end ? formatDate(end) : 'Pick the end date'}{days > 0 && <span className="ms-2 font-semibold text-brand-strong">{formatDays(days)}</span>}</>
          : 'Pick the dates'}
      </Trigger>
      {open && <Calendar start={start} end={end} focusDay={start} onPick={onPick} />}
    </Field>
  );
};

/** One date anywhere, in place of the browser's own dd.mm.yyyy input. */
export const DateField: React.FC<{
  label: string;
  value: string;
  onChange: (day: string) => void;
  required?: boolean;
  changed?: boolean;
  error?: string | null;
  span?: boolean;
  clearable?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, required, changed, error, span, clearable, placeholder = 'Pick a date' }) => {
  const [open, setOpen] = useState(false);
  return (
    <Field
      label={label}
      required={required}
      changed={changed}
      span={span}
      error={error}
      hint={clearable && value ? (
        <button type="button" onClick={() => onChange('')} className="min-h-[28px] font-medium text-brand-strong">Clear</button>
      ) : undefined}
    >
      <Trigger open={open} empty={!value} aria={label} onToggle={() => setOpen((current) => !current)}>
        {value ? formatDate(value) : placeholder}
      </Trigger>
      {open && (
        <Calendar
          start={value}
          end=""
          oneMonth={!span}
          focusDay={value}
          onPick={(day) => { onChange(day); setOpen(false); }}
        />
      )}
    </Field>
  );
};

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'));
const TIME_PART = 'h-11 min-w-0 flex-1 rounded-[10px] border border-[#E5E7EB] bg-white px-2.5 text-[14px] tabular-nums text-foreground outline-none transition-[border-color,box-shadow] focus:border-[#6EA4E7] focus:ring-[3px] focus:ring-[#6EA4E7]/25 md:h-10';

/** Hours and minutes, stored as "HH:MM" the way a time input does. */
export const TimeField: React.FC<{
  label: string;
  value: string;
  onChange: (time: string) => void;
  changed?: boolean;
}> = ({ label, value, onChange, changed }) => {
  const [hour = '', minute = ''] = value.split(':');
  return (
    <Field label={label} changed={changed}>
      <div className="flex items-center gap-1.5">
        <select aria-label={`${label}, hour`} value={hour} onChange={(event) => onChange(event.target.value ? `${event.target.value}:${minute || '00'}` : '')} className={TIME_PART}>
          <option value="">--</option>
          {HOURS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <span aria-hidden="true" className="font-semibold text-black/40">:</span>
        <select aria-label={`${label}, minute`} value={minute} disabled={!hour} onChange={(event) => onChange(`${hour}:${event.target.value}`)} className={cn(TIME_PART, !hour && 'opacity-50')}>
          <option value="">--</option>
          {MINUTES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
    </Field>
  );
};

/** One date, for the new end of an extension. Days before `min` can't be picked. */
export const EndDateField: React.FC<{
  label: string;
  anchor: string;
  min: string;
  value: string;
  onChange: (day: string) => void;
  required?: boolean;
  error?: string | null;
}> = ({ label, anchor, min, value, onChange, required, error }) => {
  const [open, setOpen] = useState(false);
  return (
    <Field label={label} required={required} span error={error}>
      <Trigger open={open} empty={!value} aria={label} onToggle={() => setOpen((current) => !current)}>
        {value ? formatDate(value) : 'Pick the new end date'}
      </Trigger>
      {open && (
        <Calendar
          start={anchor}
          end={value}
          min={min}
          focusDay={value || anchor}
          onPick={(day) => { onChange(day); setOpen(false); }}
        />
      )}
    </Field>
  );
};
