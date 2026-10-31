import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from '../../components/media/MediaIcons';
import { cn } from '../../lib/media/badgeColor';
import { addDays, isoWeekday } from '../../lib/tasks';
import { FIELD_CLASS } from './shared';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** `YYYY-MM` for the month `delta` months after `month`. */
function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7);
}

function daysIn(month: string): number {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

/** An inline month and a time. Days are Istanbul days, and past ones can't be picked. */
export const DueCalendar: React.FC<{
  value: string;
  today: string;
  onChange: (value: string) => void;
}> = ({ value, today, onChange }) => {
  const [day, setDay] = useState(value.slice(0, 10));
  const [time, setTime] = useState(value.slice(11, 16) || '18:00');
  const [month, setMonth] = useState((value || today).slice(0, 7));

  const first = `${month}-01`;
  const blanks = isoWeekday(first) - 1;
  const days = Array.from({ length: daysIn(month) }, (_, index) => addDays(first, index));

  const pickDay = (next: string) => {
    setDay(next);
    onChange(`${next}T${time}`);
  };

  const pickTime = (next: string) => {
    setTime(next);
    if (day && next) onChange(`${day}T${next}`);
  };

  return (
    <div className="mt-2 rounded-xl border border-subtle p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          disabled={month <= today.slice(0, 7)}
          onClick={() => setMonth((current) => shiftMonth(current, -1))}
          className="grid h-11 w-11 place-items-center rounded-lg text-black/50 hover:bg-black/[0.04] disabled:opacity-30 md:h-8 md:w-8"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-[13.5px] font-medium text-foreground">{MONTH_LABEL.format(new Date(`${first}T00:00:00Z`))}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth((current) => shiftMonth(current, 1))}
          className="grid h-11 w-11 place-items-center rounded-lg text-black/50 hover:bg-black/[0.04] md:h-8 md:w-8"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11.5px] text-black/40">
        {WEEKDAY_INITIALS.map((initial, index) => <span key={index} className="py-1">{initial}</span>)}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: blanks }, (_, index) => <span key={index} />)}
        {days.map((date) => (
          <button
            key={date}
            type="button"
            aria-label={date}
            aria-pressed={date === day}
            disabled={date < today}
            onClick={() => pickDay(date)}
            className={cn(
              'mx-auto grid h-11 w-11 place-items-center rounded-full text-[13px] tabular-nums transition-colors md:h-9 md:w-9',
              date === day
                ? 'bg-brand-strong font-medium text-white'
                : 'text-foreground hover:bg-black/[0.05] disabled:text-black/25 disabled:hover:bg-transparent',
              date === today && date !== day && 'font-medium text-brand-strong',
            )}
          >
            {Number(date.slice(8))}
          </button>
        ))}
      </div>

      <label className="mt-3 flex items-center justify-between gap-3 border-t border-subtle pt-3 text-[13px] text-foreground">
        Time
        <input type="time" aria-label="Due time" value={time} onChange={(event) => pickTime(event.target.value)} className={cn(FIELD_CLASS, 'w-[120px]')} />
      </label>
    </div>
  );
};
