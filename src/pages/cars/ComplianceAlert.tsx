import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/media/MediaUI';
import { ComplianceTriangle, IssueChip, TONE_CLASSES, trapTab } from '../../components/shared/ComplianceBits';
import {
  summarize,
  summaryLabel,
  toneOf,
  type CarCompliance,
  type ComplianceDoc,
  type IssueState,
} from '../../lib/carCompliance';
import { claimComplianceAlert, refreshCompliance, releaseComplianceAlert, useComplianceCars, useUnpaidFines } from '../../lib/complianceStore';
import { formatDate } from '../../lib/customers';
import type { Fine } from '../../lib/fines';
import { cn } from '../../lib/media/badgeColor';
import { LicensePlate } from '../bookings/ui';
import { FinesAlertSection, UNPAID_FINES_LINK } from '../fines/UnpaidAlert';

const TITLE = 'Critical: cars without valid insurance or inspection';
const EXPLANATION = 'These cars must not be rented until this is fixed.';

const GROUPS: ReadonlyArray<{ state: IssueState; title: string }> = [
  { state: 'expired', title: 'Expired' },
  { state: 'missing', title: 'Date not recorded' },
];

const CarRow: React.FC<{ car: CarCompliance; onFix?: () => void }> = ({ car, onFix }) => (
  <li className="flex flex-col gap-2.5 border-t border-subtle py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-3">
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2">
        <LicensePlate plate={car.plate_number} />
        <span className="min-w-0 truncate text-[13px] text-black/60">{car.model}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {car.issues.map((issue) => <IssueChip key={issue.doc} issue={issue} />)}
      </div>
    </div>
    {onFix && (
      <button
        type="button"
        onClick={onFix}
        aria-label={`Add date for ${car.plate_number}`}
        className="h-11 shrink-0 rounded-[10px] border border-subtle bg-surface px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9"
      >
        Add date
      </button>
    )}
  </li>
);

/**
 * The same modal in two places. On the Cars page it has an "Add date" on each car
 * and closes with "Got it". After sign-in the fix is on another page, so it has
 * "Fix now" and "Remind me later", and any unpaid fines follow the cars in the same
 * modal. There's never a "don't show again". A bottom sheet on phones.
 */
export const ComplianceModal: React.FC<{
  cars: CarCompliance[];
  fines?: Fine[];
  /** The car edit form is open on top, so keys belong to it. */
  paused?: boolean;
  onFix?: (car: CarCompliance) => void;
  onFixNow?: () => void;
  onOpenFine?: (fine: Fine) => void;
  onPayFine?: (fine: Fine) => void;
  onReviewFines?: () => void;
  onClose: () => void;
}> = ({ cars, fines = [], paused = false, onFix, onFixNow, onOpenFine, onPayFine, onReviewFines, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const summary = summarize(cars);
  const hasCars = cars.length > 0;
  const hasFines = fines.length > 0;
  const acts = Boolean(onFixNow || onReviewFines);

  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, paused]);

  return ReactDOM.createPortal(
    <div className="media-scope fixed inset-0 z-[1000] flex items-end justify-center bg-[#0f1117]/50 backdrop-blur-[3px] sm:items-center sm:p-6" style={{ animation: 'm-fade-in 160ms ease' }}>
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={hasCars ? 'compliance-title' : 'unpaid-fines-title'}
        aria-describedby={hasCars ? 'compliance-explanation' : undefined}
        onKeyDown={(event) => trapTab(event, panelRef.current)}
        className="flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-lg sm:h-auto sm:max-h-[86vh] sm:max-w-[640px] sm:rounded-3xl"
        style={{ animation: 'live-toast-in 200ms ease' }}
      >
        {hasCars && !hasFines && (
          <header className="shrink-0 border-b border-subtle px-5 pb-4 pt-5 text-center sm:px-7 sm:pt-6">
            <ComplianceTriangle tone={summary.tone} size={84} className="mx-auto sm:h-24 sm:w-24" />
            <h2 id="compliance-title" className="mx-auto mt-3 max-w-[460px] text-[18px] font-semibold leading-snug tracking-[-0.015em] text-foreground sm:text-[20px]">{TITLE}</h2>
            <p id="compliance-explanation" className="mt-1.5 text-[13.5px] text-black/60">{EXPLANATION}</p>
          </header>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 sm:px-7">
          {hasCars && hasFines && (
            <div className="flex items-center gap-3 py-3">
              <ComplianceTriangle tone={summary.tone} size={64} />
              <div className="min-w-0">
                <h2 id="compliance-title" className="text-[15.5px] font-semibold leading-snug tracking-[-0.015em] text-foreground">{TITLE}</h2>
                <p id="compliance-explanation" className="mt-1 text-[13.5px] text-black/60">{EXPLANATION}</p>
              </div>
            </div>
          )}
          {GROUPS.map(({ state, title }) => {
            const group = cars.filter((car) => car.severity === state);
            if (group.length === 0) return null;
            const tone = TONE_CLASSES[toneOf(state)];
            return (
              <section key={state} aria-label={title} className="py-2">
                <h3 className={cn('flex items-center gap-2 text-[12.5px] font-semibold', tone.text)}>
                  <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', tone.dot)} />
                  {title}
                  <span className="tabular-nums">({group.length})</span>
                </h3>
                <ul className="mt-1">
                  {group.map((car) => <CarRow key={car.id} car={car} onFix={onFix && (() => onFix(car))} />)}
                </ul>
              </section>
            );
          })}
          {hasFines && onOpenFine && onPayFine && (
            <FinesAlertSection fines={fines} alone={!hasCars} onOpen={onOpenFine} onPay={onPayFine} />
          )}
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-subtle px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3.5 sm:flex-row sm:justify-end sm:px-7">
          {acts ? (
            <>
              <Button variant="secondary" size="lg" className="!h-11 w-full sm:w-auto md:!h-10" onClick={onClose}>Remind me later</Button>
              {hasCars && onFixNow && <Button ref={primaryRef} size="lg" className="!h-11 w-full sm:w-auto sm:min-w-[120px] md:!h-10" onClick={onFixNow}>{hasFines ? 'Fix cars' : 'Fix now'}</Button>}
              {hasFines && onReviewFines && <Button ref={hasCars ? undefined : primaryRef} size="lg" className="!h-11 w-full sm:w-auto sm:min-w-[120px] md:!h-10" onClick={onReviewFines}>Review fines</Button>}
            </>
          ) : (
            <Button ref={primaryRef} size="lg" className="!h-11 w-full sm:w-auto sm:min-w-[120px] md:!h-10" onClick={onClose}>Got it</Button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
};

/**
 * After every sign-in, and once per browser session for someone already signed in,
 * on whatever page they land, until no car and no fine is left. It waits for both
 * reads so there's only ever one modal. Cars skips its own while this one is around.
 */
export const ComplianceSignInAlert: React.FC = () => {
  const cars = useComplianceCars();
  const fines = useUnpaidFines();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => { refreshCompliance(); }, [pathname]);

  useEffect(() => {
    if (!cars || !fines || (cars.length === 0 && fines.length === 0) || !claimComplianceAlert()) return;
    setOpen(true);
  }, [cars, fines]);

  const close = () => {
    releaseComplianceAlert();
    setOpen(false);
  };
  const goTo = (path: string) => {
    close();
    navigate(path);
  };

  if (!open || !cars || !fines || (cars.length === 0 && fines.length === 0)) return null;
  return (
    <ComplianceModal
      cars={cars}
      fines={fines}
      onClose={close}
      onFixNow={() => goTo('/dashboard/cars?issues=1')}
      onOpenFine={(fine) => goTo(`/dashboard/fines?fine=${encodeURIComponent(fine.id)}`)}
      onPayFine={(fine) => goTo(`/dashboard/fines?fine=${encodeURIComponent(fine.id)}&action=pay`)}
      onReviewFines={() => goTo(UNPAID_FINES_LINK)}
    />
  );
};

export const ComplianceBanner: React.FC<{ cars: CarCompliance[]; onView: () => void }> = ({ cars, onView }) => {
  const summary = summarize(cars);
  const tone = TONE_CLASSES[summary.tone];
  return (
    <div role="alert" className={cn('mb-7 flex items-center gap-3 rounded-2xl border px-3.5 py-3 sm:gap-3.5 sm:px-4', tone.panel)}>
      <ComplianceTriangle tone={summary.tone} size={44} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13.5px] font-semibold leading-snug sm:text-[14px]', tone.text)}>Cars without valid insurance or inspection</p>
        <p className={cn('mt-0.5 text-[13px] tabular-nums', tone.text)}>{summaryLabel(summary)}</p>
      </div>
      <button
        type="button"
        onClick={onView}
        className={cn('h-11 shrink-0 rounded-[10px] bg-surface px-4 text-[13px] font-semibold shadow-sm transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9', tone.text)}
      >
        View
      </button>
    </div>
  );
};

/** If the dates can't be read, every car would look unrecorded, so say that instead. */
export const ComplianceErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" className={cn('mb-7 rounded-2xl border px-4 py-3 text-[13.5px]', TONE_CLASSES.amber.panel, TONE_CLASSES.amber.text)}>
    <p className="font-semibold">Couldn't check insurance and inspection dates</p>
    <p className="mt-0.5 break-words text-[13px]">{message}</p>
  </div>
);

export const ComplianceAlertCard: React.FC<{ cars: CarCompliance[]; onView: () => void }> = ({ cars, onView }) => {
  const summary = summarize(cars);
  const tone = TONE_CLASSES[summary.tone];
  return (
    <button
      type="button"
      onClick={onView}
      className={cn('flex min-w-0 flex-col rounded-2xl border p-5 text-start transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40', tone.panel)}
    >
      <span className="flex items-center gap-3">
        <ComplianceTriangle tone={summary.tone} size={52} />
        <span className="min-w-0">
          <span className={cn('block text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums', tone.text)}>{summary.total}</span>
          <span className={cn('mt-1 block text-[14px] font-semibold', tone.text)}>Missing or expired data</span>
        </span>
      </span>
      <span className="mt-3.5 flex flex-wrap gap-1.5">
        {cars.map((car) => (
          <span key={car.id} className={cn('rounded-md bg-surface px-1.5 py-1 font-mono text-[11.5px] font-semibold leading-none tabular-nums', TONE_CLASSES[toneOf(car.severity)].text)}>
            {car.plate_number}
          </span>
        ))}
      </span>
    </button>
  );
};

export const ExpiryCell: React.FC<{ date: string | null; car: CarCompliance | undefined; doc: ComplianceDoc; checked: boolean }> = ({ date, car, doc, checked }) => {
  const issue = car?.issues.find((item) => item.doc === doc);
  if (!checked) return <span className="text-[12px] text-black/40">—</span>;
  if (!issue) return <span className="text-[13px] tabular-nums text-[#374151]">{formatDate(date)}</span>;
  return (
    <span
      title={issue.state === 'expired' ? `Expired on ${formatDate(date)}` : undefined}
      className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none', TONE_CLASSES[toneOf(issue.state)].chip)}
    >
      {issue.state === 'expired' ? 'Expired' : 'Not recorded'}
    </span>
  );
};

export const ComplianceHomeCard: React.FC<{ cars: CarCompliance[] }> = ({ cars }) => {
  const summary = summarize(cars);
  const tone = TONE_CLASSES[summary.tone];
  return (
    <Link
      to="/dashboard/cars"
      className={cn('mb-4 flex min-h-[44px] items-center gap-3 rounded-2xl border p-3.5 transition-opacity hover:opacity-90 sm:gap-4 sm:p-4', tone.panel)}
    >
      <ComplianceTriangle tone={summary.tone} size={52} />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[14px] font-semibold leading-snug', tone.text)}>Cars without valid insurance or inspection</span>
        <span className={cn('mt-0.5 block text-[13px] tabular-nums', tone.text)}>{summaryLabel(summary)}</span>
      </span>
      <span className={cn('shrink-0 text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums sm:text-[34px]', tone.text)}>{summary.total}</span>
    </Link>
  );
};
