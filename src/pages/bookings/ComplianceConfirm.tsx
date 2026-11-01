import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Button } from '../../components/media/MediaUI';
import { ComplianceTriangle, IssueChip, trapTab } from '../../components/shared/ComplianceBits';
import { toneOf, type ComplianceIssue } from '../../lib/carCompliance';
import type { CarChoice } from '../../lib/bookingForm';
import { LicensePlate } from './ui';

/**
 * Stands between choosing the car and the car being set. It warns and doesn't
 * block: nothing in the database stops the booking.
 */
export const ComplianceConfirm: React.FC<{
  car: CarChoice;
  issues: ComplianceIssue[];
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ car, issues, onConfirm, onCancel }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLButtonElement>(null);
  const tone = issues.some((issue) => issue.state === 'expired') ? toneOf('expired') : toneOf('missing');

  useEffect(() => {
    safeRef.current?.focus({ preventScroll: true });
    // Caught first, or Esc would also reach the sheet behind and ask to discard it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCancel();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onCancel]);

  return ReactDOM.createPortal(
    <div className="media-scope fixed inset-0 z-[1100] flex items-end justify-center bg-[#0f1117]/50 backdrop-blur-[3px] sm:items-center sm:p-6" style={{ animation: 'm-fade-in 150ms ease-out' }}>
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="car-compliance-title"
        aria-describedby="car-compliance-explanation"
        onKeyDown={(event) => trapTab(event, panelRef.current)}
        className="w-full rounded-t-3xl bg-surface px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-5 text-center shadow-lg sm:max-w-[440px] sm:rounded-3xl sm:px-6 sm:pb-6"
      >
        <ComplianceTriangle tone={tone} size={80} className="mx-auto" />
        <h2 id="car-compliance-title" className="mt-3 text-[17px] font-semibold leading-snug tracking-[-0.015em] text-foreground">
          This car has no valid insurance or inspection
        </h2>
        <p id="car-compliance-explanation" className="mt-1 text-[13.5px] text-black/60">It must not be rented until this is fixed.</p>

        <div className="mt-3.5 flex items-center justify-center gap-2">
          <LicensePlate plate={car.plate_number} />
          <span className="min-w-0 truncate text-[13px] text-black/60">{car.model}</span>
        </div>
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          {issues.map((issue) => <IssueChip key={issue.doc} issue={issue} />)}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Button ref={safeRef} size="lg" className="!h-11 w-full" onClick={onCancel}>Choose another car</Button>
          <Button variant="destructive" size="lg" className="!h-11 w-full" onClick={onConfirm}>I understand and take responsibility</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
