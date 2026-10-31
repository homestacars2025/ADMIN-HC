import { useCallback } from 'react';
import en from '../locales/en';

/**
 * Renders notification and task messages from their `i18n_key`.
 *
 * Admin is English only. The dashboard chrome is written in the source; only
 * database-authored messages pass through here, and the same key files are
 * shared in shape with the team app, which also ships Arabic.
 */

/** Walks a dotted key (`reminder.missing_insurance.title`) into the bundle. */
function lookup(key: string): string | undefined {
  let node: unknown = en;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function interpolate(template: string, vars: Record<string, unknown> | null | undefined): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = vars[name];
    // An absent variable leaves its placeholder in place, so `hasGaps` can spot
    // it rather than the UI printing "undefined" at the reader.
    if (value === undefined || value === null || value === '') return match;
    return String(value);
  });
}

/** True when a rendered string still carries an unfilled `{{placeholder}}`. */
export function hasGaps(rendered: string): boolean {
  PLACEHOLDER.lastIndex = 0;
  return PLACEHOLDER.test(rendered);
}

export function exists(key: string | null | undefined): boolean {
  if (!key) return false;
  return lookup(key) !== undefined;
}

export function t(key: string, vars?: Record<string, unknown> | null): string {
  const template = lookup(key);
  if (template === undefined) return key;
  return interpolate(template, vars);
}

/**
 * Renders one database-authored message.
 *
 * Falls back to the stored text whenever the key is unknown **or** the template
 * needs a variable the row does not carry. That second case is real: KABIS rows
 * store only `action_label`, so `kabis.pending.title` renders cleanly while
 * `kabis.pending.body` — which wants customer, plate, booking and km — would
 * come out full of holes. Showing the stored line beats showing a template.
 * When the backend starts sending those variables, this starts translating with
 * no code change.
 */
export function renderMessage(
  key: string | null | undefined,
  vars: Record<string, unknown> | null | undefined,
  fallback: string | null | undefined,
): string {
  if (!key || !exists(key)) return fallback ?? '';
  const rendered = t(key, vars);
  if (hasGaps(rendered)) return fallback ?? rendered;
  return rendered;
}

export function useMessageRenderer() {
  return useCallback(renderMessage, []);
}
