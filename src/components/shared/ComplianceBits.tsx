import React from 'react';
import { issueLabel, toneOf, type ComplianceIssue, type ComplianceTone } from '../../lib/carCompliance';
import { cn } from '../../lib/media/badgeColor';

const TRIANGLE_DIR = `${process.env.PUBLIC_URL}/illustrations/alerts`;

export const TONE_CLASSES: Record<ComplianceTone, { text: string; chip: string; panel: string; dot: string }> = {
  red: {
    text: 'text-[#B91C1C]',
    chip: 'bg-[#DC2626]/[0.1] text-[#B91C1C]',
    panel: 'border-[#DC2626]/30 bg-[#DC2626]/[0.06]',
    dot: 'bg-[#DC2626]',
  },
  amber: {
    text: 'text-[#92400E]',
    chip: 'bg-[#F59E0B]/[0.16] text-[#92400E]',
    panel: 'border-[#F59E0B]/40 bg-[#F59E0B]/[0.08]',
    dot: 'bg-[#F59E0B]',
  },
};

/** Red when something has expired, amber when a date is only missing. */
export const ComplianceTriangle: React.FC<{ tone: ComplianceTone; size: number; alt?: string; className?: string }> = ({ tone, size, alt = '', className }) => {
  const base = `${TRIANGLE_DIR}/triangle-${tone}`;
  return (
    <img
      src={`${base}.webp`}
      srcSet={`${base}.webp 256w, ${base}@2x.webp 512w`}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt={alt}
      draggable={false}
      className={cn('shrink-0 object-contain', className)}
    />
  );
};

export const FineImage: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <img
    src={`${TRIANGLE_DIR}/fine.webp`}
    srcSet={`${TRIANGLE_DIR}/fine.webp 256w, ${TRIANGLE_DIR}/fine@2x.webp 512w`}
    sizes={`${size}px`}
    width={size}
    height={size}
    alt=""
    draggable={false}
    className={cn('shrink-0 object-contain', className)}
  />
);

export const IssueChip: React.FC<{ issue: ComplianceIssue }> = ({ issue }) => (
  <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium leading-none', TONE_CLASSES[toneOf(issue.state)].chip)}>
    {issueLabel(issue)}
  </span>
);

/** Keeps Tab inside a dialog, so nothing behind it can be reached by keyboard. */
export function trapTab(event: React.KeyboardEvent, panel: HTMLElement | null): void {
  if (event.key !== 'Tab' || !panel) return;
  const focusable = panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled])');
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
