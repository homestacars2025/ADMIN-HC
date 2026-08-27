import type { CSSProperties } from 'react';
import type { EnumOption, Tone } from './types';

/**
 * Goal and format colours come straight from the database (`goals.color`,
 * `formats.color`). The column is free-form text — `#3b82f6`, `rgb(…)` or a named
 * colour all work — so everything is derived with `color-mix(in oklab, …)`, which
 * keeps both pale and dark inputs legible: the surface is a soft tint, the text is
 * darkened toward black.
 */

const NEUTRAL: CSSProperties = {
  backgroundColor: 'rgb(0 0 0 / 0.05)',
  color: 'rgb(0 0 0 / 0.62)',
  borderColor: 'rgb(0 0 0 / 0.08)',
};

function isUsable(color: string | null | undefined): color is string {
  return typeof color === 'string' && color.trim().length > 0;
}

/** Soft tinted pill — the default badge treatment. */
export function tintedStyle(color: string | null | undefined): CSSProperties {
  if (!isUsable(color)) return NEUTRAL;
  const c = color.trim();
  return {
    backgroundColor: `color-mix(in oklab, ${c} 13%, transparent)`,
    color: `color-mix(in oklab, ${c} 78%, #0a0a0a)`,
    borderColor: `color-mix(in oklab, ${c} 22%, transparent)`,
  };
}

/** Calendar chip — tint plus a solid leading rail so the goal reads at a glance. */
export function chipStyle(color: string | null | undefined): CSSProperties {
  if (!isUsable(color)) {
    return { ...NEUTRAL, borderInlineStartColor: 'rgb(0 0 0 / 0.25)' };
  }
  const c = color.trim();
  return {
    backgroundColor: `color-mix(in oklab, ${c} 10%, transparent)`,
    color: `color-mix(in oklab, ${c} 80%, #0a0a0a)`,
    borderInlineStartColor: c,
  };
}

/** Just the raw colour, for dots and legends. */
export function dotStyle(color: string | null | undefined): CSSProperties {
  return { backgroundColor: isUsable(color) ? color.trim() : 'rgb(0 0 0 / 0.25)' };
}

export const TONE_CLASSES: Record<Tone, string> = {
  slate: 'bg-slate-500/[0.09] text-slate-700 border-slate-500/15',
  sky: 'bg-sky-500/[0.09] text-sky-700 border-sky-500/15',
  violet: 'bg-violet-500/[0.09] text-violet-700 border-violet-500/15',
  amber: 'bg-amber-500/[0.11] text-amber-700 border-amber-500/20',
  rose: 'bg-rose-500/[0.09] text-rose-700 border-rose-500/15',
  emerald: 'bg-emerald-500/[0.1] text-emerald-700 border-emerald-500/[0.18]',
};

export const TONE_DOTS: Record<Tone, string> = {
  slate: 'bg-slate-500',
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  emerald: 'bg-emerald-500',
};

/** Maps an enum value to its static tone; unknown/null → "slate". */
export function toneFor(
  options: readonly EnumOption[],
  value: string | null | undefined,
): Tone {
  if (!value) return 'slate';
  return options.find((o) => o.value === value)?.tone ?? 'slate';
}

/** Tailwind-style class joiner — the section's local `cn`. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
