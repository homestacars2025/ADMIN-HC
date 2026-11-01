import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MediaToaster } from '../components/media/MediaToast';
import { FilterTileSkeleton } from '../components/shared/FilterTile';
import { LoadError, PageHeader, SkeletonRows } from '../components/shared/PageBits';
import { fetchFleet, hiddenNote, todayInIstanbul, trackingOutage, validDay, type Fleet } from '../lib/carTracking';
import { cn } from '../lib/media/badgeColor';
import { DailyReport } from './carTracking/DailyReport';
import { LiveFleet } from './carTracking/LiveFleet';
import { DateNav, OutageBanner } from './carTracking/ui';

const REFRESH_MS = 60_000;
const TABS = [
  { key: 'daily', label: 'Daily report' },
  { key: 'live', label: 'Live fleet' },
] as const;

const CarTrackingPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [attempt, setAttempt] = useState(0);

  const tab = params.get('tab') === 'live' ? 'live' : 'daily';
  const today = todayInIstanbul(now);
  const day = validDay(params.get('day'), today);

  useEffect(() => {
    let cancelled = false;
    const load = async (quiet: boolean) => {
      try {
        const next = await fetchFleet();
        if (cancelled) return;
        setFleet(next);
        setNow(Date.now());
        setError(null);
      } catch (failure) {
        // A refresh that fails keeps the rows on screen. The ages keep counting.
        if (!cancelled && !quiet) setError(failure instanceof Error ? failure.message : 'Try again.');
      }
    };
    load(false);
    const timer = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === 'visible') load(true);
    }, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [attempt]);

  const switchTab = (next: typeof TABS[number]['key']) => {
    const updated = new URLSearchParams(params);
    updated.delete('filter');
    if (next === 'live') updated.set('tab', 'live');
    else updated.delete('tab');
    setParams(updated);
  };

  const changeDay = (next: string) => {
    const updated = new URLSearchParams(params);
    if (next === today) updated.delete('day');
    else updated.set('day', next);
    setParams(updated);
  };

  const patchOil = useCallback((id: number, value: number | null) => {
    setFleet((current) => current && ({
      ...current,
      cars: current.cars.map((car) => (car.id === id ? { ...car, next_oil_change: value } : car)),
    }));
  }, []);

  const outage = useMemo(() => (fleet ? trackingOutage(fleet.cars, now) : null), [fleet, now]);

  return (
    <div className="media-scope min-h-screen bg-surface px-4 py-6 sm:px-6 lg:px-10 lg:py-11">
      <PageHeader eyebrow="Fleet" title="Car Tracking" subtitle="Kilometres driven each day, and where the fleet stands now." />

      {outage && <OutageBanner outage={outage} />}

      <div className="sticky top-0 z-20 -mx-4 bg-surface px-4 pb-2 sm:-mx-6 sm:px-6 md:static md:mx-0 md:px-0">
        <div role="tablist" aria-label="Car tracking views" className="flex max-w-[1100px] gap-1 border-b border-subtle">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => switchTab(key)}
              className={cn(
                '-mb-px min-h-[44px] shrink-0 border-b-2 px-3 text-[13.5px] transition-colors',
                tab === key ? 'border-primary font-medium text-primary' : 'border-transparent text-black/55 hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'daily' && <div className="mt-3"><DateNav day={day} today={today} onChange={changeDay} /></div>}
      </div>

      {error && <LoadError message={`Couldn't load the fleet: ${error}`} onRetry={() => setAttempt((value) => value + 1)} />}

      {!fleet ? !error && (
        <div className="mt-2">
          <FilterTileSkeleton />
          <div className={cn('mt-4 max-w-[1100px] rounded-xl border border-subtle bg-surface')}><SkeletonRows /></div>
        </div>
      ) : (
        <>
          {tab === 'daily'
            ? <DailyReport fleet={fleet} day={day} today={today} now={now} />
            : <LiveFleet cars={fleet.cars} now={now} onOil={patchOil} />}
          {hiddenNote(fleet) && <p className="mt-3 max-w-[1100px] text-[12px] text-black/40">{hiddenNote(fleet)}</p>}
        </>
      )}

      <MediaToaster />
    </div>
  );
};

export default CarTrackingPage;
