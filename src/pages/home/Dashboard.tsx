import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ChevronRight } from '../../components/media/MediaIcons';
import { Sheet, SheetBody, SheetDescription, SheetHeader, SheetTitle, Tooltip } from '../../components/media/MediaUI';
import { ComplianceTriangle } from '../../components/shared/ComplianceBits';
import MonthNav from '../../components/shared/MonthNav';
import { LoadError } from '../../components/shared/PageBits';
import { StatusImage } from '../../components/shared/StatusImage';
import {
  attentionItems,
  deltaPercent,
  fetchAdminDashboard,
  type AdminDashboard,
  type AttentionArt,
  type BookingPoint,
  type GmvPoint,
} from '../../lib/adminDashboard';
import { cn } from '../../lib/media/badgeColor';
import { CURRENCIES, formatMoney } from '../../lib/money';
import { currentMonth, monthLabel, shiftMonth } from '../../lib/payroll';
import { LicensePlate } from '../bookings/ui';

const CARD = 'surface-depth rounded-2xl border border-[#EBEBEB] bg-white';
const CLICKABLE = 'transition-colors hover:border-[#6EA4E7]/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/30';
const MONO = 'font-mono tabular-nums';
const COUNT_MS = 700;

const FINE_ART = `${process.env.PUBLIC_URL}/illustrations/alerts/fine`;

/** Climbs to the figure on load, and from the old figure when the month changes. */
function useCountUp(target: number): number {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      from.current = target;
      setShown(target);
      return undefined;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - progress) ** 3;
      const value = origin + (target - origin) * eased;
      from.current = value;
      setShown(progress === 1 ? target : value);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}

const Money: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const shown = useCountUp(value);
  return <span aria-label={formatMoney(value)} className={cn(MONO, className)}>{formatMoney(shown)}</span>;
};

const Count: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const shown = useCountUp(value);
  return <span aria-label={String(value)} className={cn(MONO, className)}>{Math.round(shown)}</span>;
};

const Delta: React.FC<{ now: number; before: number; label?: string }> = ({ now, before, label = 'vs last month' }) => {
  const percent = deltaPercent(now, before);
  if (percent === null) return null;
  const rising = percent >= 0;
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium', rising ? 'text-[#15803D]' : 'text-[#B91C1C]')}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="currentColor"><path d={rising ? 'M5 1l4 7H1z' : 'M5 9L1 2h8z'} /></svg>
      <span className={MONO}>{Math.abs(percent).toFixed(1)}%</span>
      <span className="font-normal text-black/45">{label}</span>
    </span>
  );
};

const Sparkline: React.FC<{ series: GmvPoint[]; month: string }> = ({ series, month }) => {
  const width = 300;
  const height = 56;
  const top = Math.max(1, ...series.map((point) => point.gmv));
  const line = (value: (point: GmvPoint) => number) => series.map((point, index) => {
    const x = series.length === 1 ? width / 2 : (index / (series.length - 1)) * width;
    const y = height - 3 - (value(point) / top) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  if (series.length === 0) return null;
  const summary = series.map((point) => `${point.month}: ${formatMoney(point.gmv)}`).join(', ');
  return (
    <svg data-month={month} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`GMV by month. ${summary}`} className="mt-3 h-14 w-full">
      <polygon points={`0,${height} ${line((point) => point.gmv)} ${width},${height}`} fill="#6EA4E7" fillOpacity="0.12" />
      <polyline points={line((point) => point.gmv)} fill="none" stroke="#6EA4E7" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <polyline points={line((point) => point.commission)} fill="none" stroke="#3A74C2" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
};

const MiniBars: React.FC<{ series: BookingPoint[]; month: string }> = ({ series, month }) => {
  const top = Math.max(1, ...series.map((point) => point.new + point.extensions));
  return (
    <div aria-hidden="true" className="mt-3 flex h-14 items-end gap-1">
      {series.map((point) => {
        const faded = point.month !== month;
        return (
          <span key={point.month} title={`${monthLabel(`${point.month}-01`)}: ${point.new} new, ${point.extensions} extensions`} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-px">
            <span className={cn('block rounded-t-[2px] bg-[#3A74C2]', faded && 'opacity-40')} style={{ height: `${(point.extensions / top) * 100}%` }} />
            <span className={cn('block rounded-b-[2px] bg-[#6EA4E7]', faded && 'opacity-40')} style={{ height: `${(point.new / top) * 100}%` }} />
          </span>
        );
      })}
    </div>
  );
};

const Ring: React.FC<{ rate: number | null }> = ({ rate }) => {
  const size = 132;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const shown = useCountUp(rate ?? 0);
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EBEBEB" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#6EA4E7" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length * (1 - Math.min(100, shown) / 100)} />
      </svg>
      <span aria-label={rate === null ? 'No cars' : `${rate}%`} className={cn('absolute inset-0 grid place-items-center text-[26px] font-semibold text-foreground', MONO)}>
        {rate === null ? '—' : `${shown.toFixed(1)}%`}
      </span>
    </span>
  );
};

const GmvTile: React.FC<{ data: AdminDashboard['investor_gmv']; month: string }> = ({ data, month }) => (
  <Link to="/dashboard/accounting?tab=investors" className={cn(CARD, CLICKABLE, 'flex min-w-0 flex-col p-5')}>
    <span className="flex items-center gap-1.5 text-[13px] font-medium text-black/55">
      GMV (Investor statements)
      <Tooltip content="Source: investor monthly sheets (Rent Collection / Commission)">
        <span aria-label="Source: investor monthly sheets (Rent Collection / Commission)" className="grid h-4 w-4 place-items-center rounded-full border border-black/20 text-[10px] leading-none text-black/45">i</span>
      </Tooltip>
    </span>
    <Money value={data.gmv} className="mt-2 text-[30px] font-semibold leading-tight text-foreground sm:text-[32px]" />
    <span className="mt-1"><Delta now={data.gmv} before={data.prev_gmv} /></span>
    {data.gmv === 0 && <span className="mt-1 text-[12.5px] text-[#92400E]">Investor sheet not filled yet</span>}
    <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-black/[0.06] pt-3 text-[13px] text-black/55">
      Homesta share
      <Money value={data.homesta_commission} className="font-semibold text-foreground" />
      {data.commission_rate !== null && <span className={cn('rounded-full bg-[#6EA4E7]/15 px-1.5 py-0.5 text-[11.5px] font-medium text-[#3A74C2]', MONO)}>{data.commission_rate}%</span>}
    </span>
    <span className="mt-1"><Delta now={data.homesta_commission} before={data.prev_commission} /></span>
    <Sparkline series={data.series} month={month} />
    <span className="mt-auto flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-2 text-[12px] text-black/50">
      <span>YTD GMV <span className={cn('text-foreground', MONO)}>{formatMoney(data.ytd_gmv)}</span></span>
      <span>YTD commission <span className={cn('text-foreground', MONO)}>{formatMoney(data.ytd_commission)}</span></span>
      <span><span className={cn('text-foreground', MONO)}>{data.cars_with_revenue}</span> {data.cars_with_revenue === 1 ? 'car' : 'cars'} with revenue</span>
    </span>
  </Link>
);

const BookingsTile: React.FC<{ data: AdminDashboard['bookings']; month: string }> = ({ data, month }) => (
  <Link to={`/dashboard/bookings?month=${month}`} className={cn(CARD, CLICKABLE, 'flex min-w-0 flex-col p-5')}>
    <span className="text-[13px] font-medium text-black/55">Bookings</span>
    <Count value={data.new + data.extensions} className="mt-2 text-[30px] font-semibold leading-tight text-foreground sm:text-[32px]" />
    <span className="mt-1 text-[13px] text-black/55">New <span className={cn('text-foreground', MONO)}>{data.new}</span> · Extensions <span className={cn('text-foreground', MONO)}>{data.extensions}</span></span>
    <span className="mt-1"><Delta now={data.new} before={data.prev_new} label="new vs last month" /></span>
    <span className="mt-3 flex flex-wrap items-center gap-x-2 border-t border-black/[0.06] pt-3 text-[13px] text-black/55">
      <Money value={data.booked_value} className="font-semibold text-foreground" /> booked in system
    </span>
    <MiniBars series={data.series} month={month} />
    <span className="mt-auto pt-2 text-[12px] text-black/50"><span className={cn('text-foreground', MONO)}>{data.all_time}</span> all time</span>
  </Link>
);

const UtilizationTile: React.FC<{ data: AdminDashboard['utilization']; onOpen: () => void }> = ({ data, onOpen }) => (
  <button type="button" onClick={onOpen} className={cn(CARD, CLICKABLE, 'flex min-w-0 flex-col p-5 text-start')}>
    <span className="text-[13px] font-medium text-black/55">Fleet utilization now</span>
    <span className="flex flex-1 flex-col items-center justify-center gap-3 py-3">
      <Ring rate={data.rate} />
      <span className="text-center text-[13px] text-black/55">
        <span className={cn('text-foreground', MONO)}>{data.rented_now}</span> / <span className={cn('text-foreground', MONO)}>{data.active_cars}</span> cars on the road
      </span>
    </span>
    <span className="flex items-center justify-between border-t border-black/[0.06] pt-3 text-[13px] text-black/55">
      <span><span className={cn('font-semibold text-foreground', MONO)}>{data.idle_now}</span> idle now</span>
      <span className="font-medium text-[#3A74C2]">See idle cars</span>
    </span>
  </button>
);

const TodayTile: React.FC<{ label: string; value: number; to: string }> = ({ label, value, to }) => (
  <Link to={to} className={cn(CARD, CLICKABLE, 'block min-h-[44px] px-4 py-3')}>
    <span className="block text-[12.5px] text-black/55">{label}</span>
    <Count value={value} className="mt-0.5 block text-[22px] font-semibold leading-tight text-foreground" />
  </Link>
);

const AttentionIcon: React.FC<{ art: AttentionArt }> = ({ art }) => {
  if (art === 'fine') return <img src={`${FINE_ART}.webp`} srcSet={`${FINE_ART}.webp 1x, ${FINE_ART}@2x.webp 2x`} alt="" width={36} height={36} className="shrink-0 object-contain" />;
  if (art === 'maintenance') return <StatusImage status="maintenance" size={36} className="shrink-0" />;
  return <ComplianceTriangle tone={art} size={36} />;
};

const Attention: React.FC<{ alerts: AdminDashboard['alerts']; quiet: boolean }> = ({ alerts, quiet }) => {
  const items = attentionItems(alerts);
  if (items.length === 0 && !quiet) return null;
  return (
    <section aria-label="Needs attention" className="mt-6">
      <h2 className="mb-2 text-[15px] font-medium text-foreground">Needs attention</h2>
      {items.length === 0 ? (
        <p className={cn(CARD, 'flex items-center justify-center gap-2 px-4 py-6 text-[14px] font-medium text-[#15803D]')}><Check size={16} strokeWidth={2.5} /> All clear</p>
      ) : (
        <ul className={cn(CARD, 'divide-y divide-black/[0.05] overflow-hidden')}>
          {items.map((item) => (
            <li key={item.key}>
              <Link to={item.to} className="flex min-h-[56px] items-center gap-3 px-4 py-2 transition-colors hover:bg-black/[0.02]">
                <AttentionIcon art={item.art} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-foreground">{item.title}</span>
                  <span className="block truncate text-[12.5px] text-black/50">{item.detail}</span>
                </span>
                <span className={cn('text-[18px] font-semibold text-foreground', MONO)}>{item.count}</span>
                <ChevronRight size={15} className="shrink-0 text-black/30" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const Bone: React.FC<{ className: string }> = ({ className }) => <div aria-hidden="true" className={cn('animate-pulse rounded-2xl bg-black/[0.05]', className)} />;

const DashboardSkeleton: React.FC = () => (
  <div aria-busy="true">
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><Bone className="h-[340px]" /><Bone className="h-[340px]" /><Bone className="h-[340px]" /></div>
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Bone className="h-[76px]" /><Bone className="h-[76px]" /><Bone className="h-[76px]" /><Bone className="h-[76px]" /></div>
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3"><Bone className="h-[112px]" /><Bone className="h-[112px]" /><Bone className="h-[112px]" /></div>
  </div>
);

/** `compliant` is false while a car's documents are expired or unrecorded, which the figures here don't count. */
export const Dashboard: React.FC<{ compliant: boolean }> = ({ compliant }) => {
  const [params, setParams] = useSearchParams();
  const requested = params.get('month');
  // Investor sheets for the running month are filled later, so last month is the one to read.
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : shiftMonth(currentMonth(), -1).slice(0, 7);

  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [showIdle, setShowIdle] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchAdminDashboard(month)
      .then((next) => { if (!cancelled) setData(next); })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); });
    return () => { cancelled = true; };
  }, [month, reload]);

  const moveMonth = (by: number) => {
    const next = new URLSearchParams(params);
    next.set('month', shiftMonth(`${month}-01`, by).slice(0, 7));
    setParams(next);
  };

  const cash = useMemo(() => CURRENCIES.map((currency) => ({ currency, amount: Number(data?.cash.by_currency[currency] ?? 0) })), [data]);

  return (
    <div className="media-scope">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <MonthNav label={monthLabel(`${month}-01`)} justify="flex-start" onPrev={() => moveMonth(-1)} onNext={() => moveMonth(1)} />
      </div>

      {error && <LoadError message={`Couldn't load the dashboard: ${error}`} onRetry={() => setReload((value) => value + 1)} />}
      {!error && !data && <DashboardSkeleton />}
      {!error && data && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <GmvTile data={data.investor_gmv} month={month} />
            <BookingsTile data={data.bookings} month={month} />
            <UtilizationTile data={data.utilization} onOpen={() => setShowIdle(true)} />
          </div>

          <section aria-label="Today" className="mt-6">
            <h2 className="mb-2 text-[15px] font-medium text-foreground">Today</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <TodayTile label="Active now" value={data.bookings.active_now} to="/dashboard/bookings/active?list=active" />
              <TodayTile label="Pickups today" value={data.bookings.pickups_today} to="/dashboard/bookings/active?list=pickups" />
              <TodayTile label="Returns today" value={data.bookings.returns_today} to="/dashboard/bookings/active?list=returns" />
              <TodayTile label="Returns next 7 days" value={data.bookings.returns_next_7} to="/dashboard/bookings/active?list=next7" />
            </div>
          </section>

          <section aria-label="Money" className="mt-6">
            <h2 className="mb-2 text-[15px] font-medium text-foreground">Money</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Link to="/dashboard/accounting?tab=vault" className={cn(CARD, CLICKABLE, 'block p-4')}>
                <span className="block text-[12.5px] text-black/55">Cash by currency</span>
                <span className="mt-1 flex flex-col gap-0.5">
                  {cash.map((row) => <span key={row.currency} className={cn('text-[16px] font-semibold text-foreground', MONO)}>{formatMoney(row.amount, row.currency)}</span>)}
                </span>
              </Link>
              <Link to="/dashboard/accounting?tab=vault" className={cn(CARD, CLICKABLE, 'block p-4')}>
                <span className="block text-[12.5px] text-black/55">Waiting for admin</span>
                <Money value={data.cash.envelopes_in_safe_try} className="mt-1 block text-[22px] font-semibold text-foreground" />
                <span className="mt-0.5 block text-[12.5px] text-black/50"><span className={MONO}>{data.cash.envelopes_in_safe}</span> {data.cash.envelopes_in_safe === 1 ? 'envelope' : 'envelopes'} in safes · lira part only</span>
              </Link>
              <Link to="/dashboard/accounting?tab=customers&filter=owes" className={cn(CARD, CLICKABLE, 'block p-4')}>
                <span className="block text-[12.5px] text-black/55">Customers owing</span>
                <Money value={data.alerts.customers_owing_amount} className="mt-1 block text-[22px] font-semibold text-foreground" />
                <span className="mt-0.5 block text-[12.5px] text-black/50"><span className={MONO}>{data.alerts.customers_owing}</span> {data.alerts.customers_owing === 1 ? 'customer' : 'customers'}</span>
              </Link>
            </div>
          </section>

          <Attention alerts={data.alerts} quiet={compliant} />

          {showIdle && (
            <Sheet open onClose={() => setShowIdle(false)} ariaLabel="Idle cars" maxWidthClass="sm:max-w-[440px]">
              <SheetHeader className="pe-14">
                <SheetTitle>Idle cars</SheetTitle>
                <SheetDescription>{data.utilization.idle_now} of {data.utilization.active_cars} active cars are not on the road right now.</SheetDescription>
              </SheetHeader>
              <SheetBody>
                {data.utilization.idle_cars.length === 0 ? <p className="py-6 text-center text-[13.5px] text-black/45">Every active car is on the road.</p> : (
                  <ul className="divide-y divide-black/[0.05]">
                    {data.utilization.idle_cars.map((car) => (
                      <li key={car.car_id}>
                        <Link to={`/dashboard/cars?car=${car.car_id}`} className="flex min-h-[48px] items-center gap-3 py-2 hover:bg-black/[0.02]">
                          <LicensePlate plate={car.plate} />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">{car.model?.replace(/\s+/g, ' ') ?? '—'}</span>
                          <ChevronRight size={15} className="shrink-0 text-black/30" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </SheetBody>
            </Sheet>
          )}
        </>
      )}
    </div>
  );
};
