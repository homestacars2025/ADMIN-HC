import React, { useEffect, useMemo, useState } from 'react';
import { Button, Sheet, SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Spinner, Switch } from '../../components/media/MediaUI';
import { fetchCarTransits, fetchStatementBookings, parseDayRange, rangeChip, type BookingOnCar, type DayRange, type HgsRow } from '../../lib/hgs';
import {
  statementFileName,
  statementLanguage,
  statementLines,
  statementNumber,
  statementPeriod,
  statementTotals,
  type StatementLang,
} from '../../lib/hgsStatement';
import { cn } from '../../lib/media/badgeColor';
import { LicensePlate, Segmented } from '../bookings/ui';

/**
 * Options for one car's HGS statement, then the PDF. The statement's own words are
 * in the customer's language; this sheet, like the rest of Admin, is English.
 */

const LANG_LABELS: Record<StatementLang, string> = { ar: 'Arabic', tr: 'Turkish', en: 'English', fr: 'French' };

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Some browsers start the download after this tick, so the URL stays a moment.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type BookingsState = { status: 'loading' | 'ready' | 'error'; rows: BookingOnCar[]; message?: string };

const dateClass = 'mt-1.5 h-11 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-normal tabular-nums outline-none focus:border-[#6EA4E7] focus:ring-[3px] focus:ring-[#6EA4E7]/25 md:h-10';

export const StatementSheet: React.FC<{
  row: Pick<HgsRow, 'carId' | 'plate' | 'model'>;
  /** The car's range on the page, where the statement starts. */
  range: DayRange;
  today: string;
  onClose: () => void;
}> = ({ row, range, today, onClose }) => {
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [lang, setLang] = useState<StatementLang>('ar');
  const [langChosen, setLangChosen] = useState(false);
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [includePrivate, setIncludePrivate] = useState(true);
  const [bookings, setBookings] = useState<BookingsState>({ status: row.carId === null ? 'ready' : 'loading', rows: [] });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typed = useMemo(() => parseDayRange(from, to), [from, to]);
  const booking = bookings.rows.find((item) => item.id === bookingId) ?? null;
  const period = typed ? statementPeriod(typed, booking) : null;

  // The bookings that meet the range, again whenever it changes.
  useEffect(() => {
    if (row.carId === null || !typed) return undefined;
    let cancelled = false;
    setBookings((current) => ({ status: 'loading', rows: current.rows }));
    fetchStatementBookings(row.carId, typed)
      .then((rows) => {
        if (cancelled) return;
        setBookings({ status: 'ready', rows });
        setBookingId((current) => (current !== null && rows.some((item) => item.id === current) ? current : null));
      })
      .catch((failure: unknown) => {
        if (!cancelled) setBookings({ status: 'error', rows: [], message: failure instanceof Error ? failure.message : undefined });
      });
    return () => { cancelled = true; };
  }, [row.carId, typed]);

  // A linked booking writes in its customer's language, unless one was picked here.
  const pickBooking = (next: BookingOnCar | null) => {
    setBookingId(next?.id ?? null);
    if (!langChosen) setLang(statementLanguage(next?.customerLanguage));
  };

  const download = async () => {
    if (!period) return;
    setWorking(true);
    setError(null);
    try {
      const transits = await fetchCarTransits({ carId: row.carId, plate: row.plate }, period);
      const lines = statementLines(transits, period, includePrivate);
      const { renderStatementPdf } = await import('./HgsStatementPdf');
      const blob = await renderStatementPdf({
        lang,
        number: statementNumber(row.plate, today),
        issueDay: today,
        plate: row.plate,
        model: row.model,
        period,
        customer: booking?.customerName ?? null,
        booking: booking?.number ?? null,
        includePrivate,
        lines,
        totals: statementTotals(lines),
      });
      downloadBlob(statementFileName(row.plate, period, lang), blob);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The statement couldn't be made. Try again.");
      setWorking(false);
    }
  };

  const bookingOption = (item: BookingOnCar | null) => {
    const selected = (item?.id ?? null) === bookingId;
    return (
      <li key={item?.id ?? 'none'}>
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => pickBooking(item)}
          className={cn(
            'flex min-h-[44px] w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-start transition-colors',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/35',
            selected ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.08]' : 'border-[#E5E7EB] bg-white hover:border-black/20',
          )}
        >
          <span aria-hidden="true" className={cn('grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px]', selected ? 'border-[#3A74C2]' : 'border-black/25')}>
            {selected && <span className="h-2 w-2 rounded-full bg-[#3A74C2]" />}
          </span>
          {item ? (
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-mono text-[13px] font-medium tabular-nums text-foreground">{item.number ?? `#${item.id}`}</span>
                <span className="text-[12px] tabular-nums text-black/50">{rangeChip({ from: item.start, to: item.end }, today)}</span>
              </span>
              <span className="block truncate text-[12.5px] text-black/60">
                {item.customerName ?? 'No customer'}
                {item.customerLanguage && <span className="text-black/40"> · {LANG_LABELS[statementLanguage(item.customerLanguage)]}</span>}
              </span>
            </span>
          ) : (
            <span className="text-[13px] text-foreground">No booking</span>
          )}
        </button>
      </li>
    );
  };

  return (
    <Sheet open onClose={onClose} ariaLabel={`HGS statement for ${row.plate}`} maxWidthClass="sm:max-w-[480px]" blocking={working}>
      <div className="flex h-full min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>HGS statement</SheetTitle>
          <SheetDescription>A PDF of this car's tolls, to send to the customer.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="flex items-center gap-2.5">
            <LicensePlate plate={row.plate} />
            <span className="min-w-0 truncate text-[13px] text-black/55">{row.model ?? '—'}</span>
          </div>

          <div>
            <span className="text-[13px] font-medium text-foreground">Language</span>
            <div className="mt-1.5">
              <Segmented
                ariaLabel="Statement language"
                value={lang}
                onChange={(next) => { setLang(next); setLangChosen(true); }}
                options={(Object.keys(LANG_LABELS) as StatementLang[]).map((value) => ({ value, label: LANG_LABELS[value] }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[13px] font-medium text-foreground">
              From
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={dateClass} />
            </label>
            <label className="block text-[13px] font-medium text-foreground">
              To
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={dateClass} />
            </label>
          </div>

          {row.carId !== null && (
            <div>
              <span id="statement-booking" className="text-[13px] font-medium text-foreground">Booking <span className="font-normal text-black/45">· optional</span></span>
              <p className="mt-0.5 text-[12px] text-black/50">Prints the customer and booking number, and keeps only the days the car was on it.</p>
              {bookings.status === 'error' ? (
                <p role="alert" className="mt-2 text-[13px] text-[#B91C1C]">{bookings.message ?? "Couldn't load the bookings."}</p>
              ) : bookings.status === 'loading' && bookings.rows.length === 0 ? (
                <div className="mt-2 h-11 animate-pulse rounded-[10px] bg-black/[0.05]" />
              ) : (
                <ul role="radiogroup" aria-labelledby="statement-booking" className="mt-2 flex flex-col gap-1.5">
                  {bookingOption(null)}
                  {bookings.rows.map(bookingOption)}
                  {bookings.rows.length === 0 && <li className="px-1 text-[12.5px] text-black/45">No booking on this car in these days.</li>}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-[13px] font-medium text-foreground">Include private roads</span>
              <span className="block text-[12px] text-black/50">Bridges and private gates.</span>
            </span>
            <Switch checked={includePrivate} onChange={setIncludePrivate} ariaLabel="Include private roads" activeClass="bg-[#4ba6ea]" />
          </div>

          <p className="rounded-[10px] bg-black/[0.03] px-3 py-2.5 text-[12.5px] text-black/60">
            {!typed
              ? 'Pick a start and an end date.'
              : period
                ? <>Covers <span className="font-medium tabular-nums text-foreground">{rangeChip(period, today)}</span>{booking && ', the booking\'s days in the range'}.</>
                : 'That booking has no days in this range.'}
          </p>
          {error && <p role="alert" className="text-[13px] text-[#B91C1C]">{error}</p>}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" size="lg" className="!h-11 md:!h-10" disabled={working} onClick={onClose}>Cancel</Button>
          <Button type="button" size="lg" className="!h-11 md:!h-10" disabled={working || !period} onClick={() => void download()}>
            {working && <Spinner size={13} />} {working ? 'Making the PDF…' : 'Download PDF'}
          </Button>
        </SheetFooter>
      </div>
    </Sheet>
  );
};
