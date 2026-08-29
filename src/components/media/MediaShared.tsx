import React, { useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn, tintedStyle, TONE_CLASSES, TONE_DOTS } from '../../lib/media/badgeColor';
import type { ColorBy, MediaFormat, MediaGoal, Tone } from '../../lib/media/types';
import {
  CalendarRange,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Lightbulb,
  ListChecks,
  Megaphone,
  Palette,
  ShieldCheck,
  type IconProps,
} from './MediaIcons';

/*
 * Shared shell pieces: the page header, the sub-nav, the badge family, the empty
 * state, and the sliding pill both segmented controls animate with.
 *
 * Brand colour throughout is Cars `#6ea4e7` (Approved text `#1f64bb`) — the only
 * values swapped from the source spec. The alpha-black neutral ladder is untouched.
 */

// ── PageHeader ────────────────────────────────────────────────────────────────

export const PageHeader: React.FC<{
  eyebrow: string;
  title: string;
  subtitle: string;
  className?: string;
}> = ({ eyebrow, title, subtitle, className }) => (
  <div className={cn('flex flex-col', className)}>
    <div className="mb-2 flex items-center gap-2">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#6ea4e7]" />
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6ea4e7]">
        {eyebrow}
      </span>
    </div>
    <h1 className="text-[20px] font-semibold tracking-[-0.022em] text-[#0e0e10] sm:text-[24px]">
      {title}
    </h1>
    <p className="mt-1 text-[12.5px] tracking-[-0.005em] text-black/45 sm:text-[13.5px]">
      {subtitle}
    </p>
  </div>
);

// ── SlidingPill ───────────────────────────────────────────────────────────────

/**
 * The spec's two `motion.layoutId` pills, without framer-motion.
 *
 * The pill is one absolutely-positioned element in the track; it measures the
 * active child and transitions `transform`/`width` to it. The easing curve is
 * tuned to the spec's spring (stiffness 480, damping 38) — a fast settle with a
 * barely-perceptible overshoot.
 */
const SPRING = 'transform 260ms cubic-bezier(0.22, 1.2, 0.36, 1), width 260ms cubic-bezier(0.22, 1.2, 0.36, 1)';

export function useSlidingPill(activeKey: string) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; width: number } | null>(null);
  const settled = useRef(false);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    function measure() {
      const el = track!.querySelector<HTMLElement>('[data-pill-active="true"]');
      if (!el) {
        setBox(null);
        return;
      }
      setBox({ x: el.offsetLeft, width: el.offsetWidth });
    }

    measure();
    // The first placement must not animate in from x=0.
    const raf = requestAnimationFrame(() => {
      settled.current = true;
    });

    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [activeKey]);

  const pillStyle: React.CSSProperties = box
    ? {
        transform: `translateX(${box.x}px)`,
        width: box.width,
        transition: settled.current ? SPRING : 'none',
        opacity: 1,
      }
    : { opacity: 0 };

  return { trackRef, pillStyle };
}

// ── MediaNav ──────────────────────────────────────────────────────────────────

interface NavSection {
  title: string;
  href: string;
  Icon: React.FC<IconProps>;
}

const SECTIONS: NavSection[] = [
  { title: 'Ideas', href: '/dashboard/media/ideas', Icon: Lightbulb },
  { title: 'Calendar', href: '/dashboard/media/calendar', Icon: CalendarRange },
  { title: 'Influencers', href: '/dashboard/media/influencers', Icon: Megaphone },
  { title: 'Lists', href: '/dashboard/media/lists', Icon: ListChecks },
];

export const MediaNav: React.FC = () => {
  const { pathname } = useLocation();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Media sections"
      className="inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-black/[0.06] bg-black/[0.02] p-1"
    >
      {SECTIONS.map(({ title, href, Icon }) => {
        const active = isActive(href);
        return (
          <NavLink
            key={href}
            to={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] tracking-[-0.006em] no-underline transition-all duration-150 sm:px-3.5',
              active
                ? 'bg-white font-semibold text-[#6ea4e7] shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-black/[0.05]'
                : 'font-medium text-black/55 hover:bg-white/70 hover:text-black/80',
            )}
          >
            <Icon size={14} strokeWidth={active ? 2 : 1.6} />
            {title}
          </NavLink>
        );
      })}
    </nav>
  );
};

// ── Badges ────────────────────────────────────────────────────────────────────

const PILL =
  'inline-flex h-[22px] w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-medium leading-none';

export const GoalBadge: React.FC<{
  goal?: MediaGoal;
  fallback?: string | null;
  /** The dot marks the dimension the "Color by" toggle is currently using. */
  dot?: boolean;
  className?: string;
}> = ({ goal, fallback, dot = true, className }) => {
  if (!goal && !fallback) return null;
  return (
    <span className={cn(PILL, className)} style={tintedStyle(goal?.color)}>
      {dot && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: goal?.color ?? 'currentColor' }}
        />
      )}
      {goal?.label ?? fallback}
    </span>
  );
};

export const FormatBadge: React.FC<{
  format?: MediaFormat;
  fallback?: string | null;
  dot?: boolean;
  className?: string;
}> = ({ format, fallback, dot = false, className }) => {
  if (!format && !fallback) return null;
  return (
    <span className={cn(PILL, className)} style={tintedStyle(format?.color)}>
      {dot && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: format?.color ?? 'currentColor' }}
        />
      )}
      {format?.label ?? fallback}
    </span>
  );
};

/**
 * The reference link, wearing the same pill geometry as Goal and Format so it
 * sits beside them as a peer. Neutral at rest, brand on hover.
 *
 * Rendered only when there is a link — a disabled chip would take the same room
 * to say nothing.
 */
export const ReferenceChip: React.FC<{
  url: string;
  label?: string;
  className?: string;
}> = ({ url, label = 'Reference', className }) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={`${label} — opens in a new tab`}
    className={cn(
      PILL,
      'border-black/[0.08] bg-black/[0.03] text-black/55 no-underline transition-colors duration-150',
      'hover:border-[#6ea4e7]/25 hover:bg-[#6ea4e7]/[0.07] hover:text-[#6ea4e7]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/35',
      className,
    )}
  >
    <ExternalLink size={11} strokeWidth={2} />
    {label}
  </a>
);

export const ToneBadge: React.FC<{
  label: string;
  tone: Tone;
  dot?: boolean;
  className?: string;
}> = ({ label, tone, dot = true, className }) => (
  <span className={cn(PILL, TONE_CLASSES[tone], className)}>
    {dot && <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOTS[tone])} />}
    {label}
  </span>
);

/**
 * Posted / Approved as **interactive** controls.
 *
 * This is the one place the admin build inverts the staff build: there, these are
 * read-only badges with a "Marked by an admin" tooltip, because RLS would reject
 * the write. Here the admin is that admin, so the pill is a real toggle and the
 * `guard_admin_columns` trigger lets it through.
 */
export const PostedToggle: React.FC<{
  posted: boolean;
  onToggle: () => void;
  pending?: boolean;
  ariaLabel: string;
  className?: string;
}> = ({ posted, onToggle, pending, ariaLabel, className }) => (
  <button
    type="button"
    role="switch"
    aria-checked={posted}
    aria-label={ariaLabel}
    disabled={pending}
    onClick={onToggle}
    className={cn(
      PILL,
      'cursor-pointer select-none transition-all duration-150 hover:brightness-[0.97]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40 disabled:opacity-60',
      posted
        ? 'border-emerald-500/[0.18] bg-emerald-500/[0.1] text-emerald-700'
        : 'border-black/[0.07] bg-black/[0.035] text-black/45',
      className,
    )}
  >
    {posted ? (
      <CheckCircle2 size={12} strokeWidth={2} />
    ) : (
      <CircleDashed size={12} strokeWidth={2} />
    )}
    {posted ? 'Posted' : 'Not posted'}
  </button>
);

export const ApprovedToggle: React.FC<{
  approved: boolean;
  onToggle: () => void;
  pending?: boolean;
  ariaLabel: string;
  className?: string;
}> = ({ approved, onToggle, pending, ariaLabel, className }) => (
  <button
    type="button"
    role="switch"
    aria-checked={approved}
    aria-label={ariaLabel}
    disabled={pending}
    onClick={onToggle}
    className={cn(
      PILL,
      'cursor-pointer select-none transition-all duration-150 hover:brightness-[0.97]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40 disabled:opacity-60',
      approved
        ? 'border-[#6ea4e7]/20 bg-[#6ea4e7]/[0.09] text-[#1f64bb]'
        : 'border-black/[0.07] bg-black/[0.035] text-black/45',
      className,
    )}
  >
    <ShieldCheck size={12} strokeWidth={2} />
    {approved ? 'Approved' : 'Pending approval'}
  </button>
);

// ── Empty state ───────────────────────────────────────────────────────────────

export const MediaEmptyState: React.FC<{
  Icon: React.FC<IconProps>;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ Icon, title, description, action, className }) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-black/[0.09] bg-black/[0.012] px-6 py-12 text-center sm:py-16',
      className,
    )}
  >
    <div className="relative flex h-14 w-14 items-center justify-center">
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-2xl bg-gradient-to-b from-[#6ea4e7]/[0.12] to-[#6ea4e7]/[0.03]"
      />
      <Icon size={22} strokeWidth={1.5} className="relative text-[#6ea4e7]" />
    </div>
    <div className="flex max-w-sm flex-col gap-1.5">
      <p className="text-[15px] font-semibold tracking-[-0.014em] text-black/85">{title}</p>
      <p className="text-[13px] leading-relaxed text-black/45">{description}</p>
    </div>
    {action}
  </div>
);

// ── Search input ──────────────────────────────────────────────────────────────

export const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}> = ({ value, onChange, placeholder, ariaLabel }) => (
  <div className="relative w-full sm:max-w-xs">
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/30"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="h-9 w-full rounded-lg border border-[#e2ded4] bg-white pl-8 pr-3 text-[13px] text-[#0e0e10] outline-none transition-colors placeholder:text-black/30 focus-visible:border-[#6ea4e7] focus-visible:ring-[3px] focus-visible:ring-[#6ea4e7]/20"
    />
  </div>
);

// ── Color-by toggle ───────────────────────────────────────────────────────────

const COLOR_BY_OPTIONS: Array<{ value: ColorBy; label: string }> = [
  { value: 'goal', label: 'Goal' },
  { value: 'format', label: 'Format' },
];

/**
 * Switches which lookup dimension colours the chips, rails and legend.
 *
 * `scope` must be unique per mounted toggle — it keys the sliding pill, and two
 * toggles sharing one would animate the pill between them.
 */
export const ColorByToggle: React.FC<{
  value: ColorBy;
  onChange: (next: ColorBy) => void;
  scope: string;
  className?: string;
}> = ({ value, onChange, scope, className }) => {
  const { trackRef, pillStyle } = useSlidingPill(`${scope}:${value}`);

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-black/40">
        <Palette size={12} strokeWidth={1.75} />
        Color by:
      </span>
      <div
        ref={trackRef}
        role="group"
        aria-label="Colour source"
        className="relative inline-flex items-center gap-0.5 rounded-lg border border-black/[0.07] bg-black/[0.02] p-0.5"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0.5 h-[26px] rounded-[7px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.07)] ring-1 ring-black/[0.05]"
          style={pillStyle}
        />
        {COLOR_BY_OPTIONS.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              data-pill-active={active ? 'true' : 'false'}
              onClick={() => onChange(option.value)}
              className={cn(
                'relative inline-flex h-[26px] items-center rounded-[7px] px-2.5 text-[12px] transition-colors duration-150',
                active
                  ? 'font-semibold text-black/85'
                  : 'font-medium text-black/45 hover:text-black/70',
              )}
            >
              <span className="relative">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
