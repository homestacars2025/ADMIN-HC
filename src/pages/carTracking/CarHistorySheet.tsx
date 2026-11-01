import React, { useEffect, useMemo, useState } from 'react';
import { Button, Sheet, SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../../components/media/MediaUI';
import { LoadError, SkeletonRows } from '../../components/shared/PageBits';
import {
  addDays,
  daySeries,
  fetchDailyKm,
  historyCsv,
  HISTORY_START_LABEL,
  km,
  OVER_KM,
  type DailyKmRow,
  type DayRow,
} from '../../lib/carTracking';
import { formatDate } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import { LicensePlate } from '../bookings/ui';
import { CarThumb, DayBars } from './ui';

const DAYS = 30;

function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Thirty days of one car. `live` is its row today, which isn't in the history until midnight. */
export const CarHistorySheet: React.FC<{
  car: Pick<DayRow, 'car_id' | 'plate' | 'model' | 'image'>;
  live: DayRow | null;
  today: string;
  onClose: () => void;
}> = ({ car, live, today, onClose }) => {
  const [history, setHistory] = useState<DailyKmRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const from = addDays(today, -(DAYS - 1));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDailyKm(from, today, car.car_id)
      .then((rows) => { if (!cancelled) setHistory(rows); })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [car.car_id, from, today, reload]);

  const days = useMemo(() => daySeries(history, car.car_id, from, today, live), [history, car.car_id, from, today, live]);
  const recorded = useMemo(() => days.filter((day) => day.km !== null).reverse(), [days]);
  const total = recorded.reduce((sum, day) => sum + (day.km ?? 0), 0);
  const fileName = `${car.plate.replace(/[^\w-]/g, '')}-km-${today}.csv`;

  return (
    <Sheet open onClose={onClose} ariaLabel={`Kilometre history for ${car.plate}`} maxWidthClass="sm:max-w-[560px]">
      <SheetHeader>
        <div className="flex items-center gap-3 pe-8">
          <CarThumb src={car.image} />
          <div className="min-w-0">
            <SheetTitle><LicensePlate plate={car.plate} /></SheetTitle>
            <SheetDescription>{car.model ?? '—'} · {km(total)} km in the last {DAYS} days</SheetDescription>
          </div>
        </div>
      </SheetHeader>
      <SheetBody>
        {error && <LoadError message={`Couldn't load the history: ${error}`} onRetry={() => setReload((value) => value + 1)} />}
        {loading ? <SkeletonRows count={5} /> : (
          <>
            <DayBars days={days} />
            {recorded.length <= 1 && (
              <p className="rounded-lg bg-black/[0.03] px-3 py-2 text-[13px] text-black/55">
                History starts on {HISTORY_START_LABEL}, and a new day is saved every midnight.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[300px] text-[13px] tabular-nums">
                <thead>
                  <tr className="border-b border-subtle text-[11.5px] text-black/45">
                    <th scope="col" className="py-2 pe-3 text-start font-medium">Day</th>
                    <th scope="col" className="py-2 pe-3 text-end font-medium">Start</th>
                    <th scope="col" className="py-2 pe-3 text-end font-medium">End</th>
                    <th scope="col" className="py-2 text-end font-medium">Km</th>
                  </tr>
                </thead>
                <tbody>
                  {recorded.map((day) => (
                    <tr key={day.day} className="border-b border-subtle last:border-b-0">
                      <td className="py-2 pe-3 text-foreground">{formatDate(day.day)}</td>
                      <td className="py-2 pe-3 text-end text-black/55">{km(day.start_km)}</td>
                      <td className="py-2 pe-3 text-end text-black/55">{km(day.end_km)}</td>
                      <td className={cn('py-2 text-end font-semibold text-foreground', (day.km ?? 0) > OVER_KM && 'text-[#B91C1C]')}>{km(day.km)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SheetBody>
      <SheetFooter>
        <Button variant="outline" size="lg" className="!h-11 md:!h-10" disabled={recorded.length === 0} onClick={() => downloadCsv(fileName, historyCsv(days))}>
          Export CSV
        </Button>
      </SheetFooter>
    </Sheet>
  );
};
