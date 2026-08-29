import { useCallback, useSyncExternalStore } from 'react';
import type { ColorBy, MediaFormat, MediaGoal, MediaLookup } from './types';

/**
 * "Color by: Goal | Format" — which lookup dimension drives chips, rails and the
 * legend.
 *
 * Goal is the default (what the section shipped with); Format re-reads the same
 * records through `formats.color` using the identical derivation helpers — only
 * the colour passed in changes.
 */

const DEFAULT: ColorBy = 'goal';

/** Each page owns its own key, so recolouring the calendar never silently
 *  recolours the Ideas board. */
export const COLOR_BY_KEYS = {
  ideas: 'media:ideas:color-by',
  calendar: 'media:calendar:color-by',
} as const;

function isColorBy(value: unknown): value is ColorBy {
  return value === 'goal' || value === 'format';
}

// `getSnapshot` runs on every render and must return a stable value, so reads are
// memoised here rather than hitting localStorage each time.
const cache = new Map<string, ColorBy>();
const listeners = new Set<() => void>();

function read(key: string): ColorBy {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let value: ColorBy = DEFAULT;
  try {
    const stored = window.localStorage.getItem(key);
    if (isColorBy(stored)) value = stored;
  } catch {
    // Private mode or blocked storage — the default is a fine answer.
  }
  cache.set(key, value);
  return value;
}

function write(key: string, next: ColorBy) {
  cache.set(key, next);
  try {
    window.localStorage.setItem(key, next);
  } catch {
    // The preference is a convenience; failing to persist it must not break the page.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reads through `useSyncExternalStore` rather than `useState` + a restoring
 * effect: the stored value is available on the very first client render, so the
 * pill never flashes "Goal" before settling on "Format".
 */
export function useColorBy(key: string): [ColorBy, (next: ColorBy) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => DEFAULT,
  );

  const set = useCallback((next: ColorBy) => write(key, next), [key]);

  return [value, set];
}

/**
 * Resolves the lookup row that colours a record, for whichever dimension is
 * active. Returns `undefined` when the record has nothing set in that dimension —
 * callers render their plain, un-accented state rather than a meaningless grey.
 */
export function accentFor(
  colorBy: ColorBy,
  record: { goal_key: string | null; format_key: string | null },
  goals: Map<string, MediaGoal>,
  formats: Map<string, MediaFormat>,
): MediaLookup | undefined {
  const key = colorBy === 'goal' ? record.goal_key : record.format_key;
  if (!key) return undefined;
  return colorBy === 'goal' ? goals.get(key) : formats.get(key);
}
