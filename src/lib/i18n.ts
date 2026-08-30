import { useCallback, useSyncExternalStore } from 'react';
import ar from '../locales/ar';
import en from '../locales/en';

/**
 * A small translation runtime for notification and task messages.
 *
 * The API mirrors the i18next surface the team app uses — `t`, `exists`,
 * `changeLanguage`, `useTranslation` — so both apps read the same way and the
 * same locale key files transfer between them. It is implemented locally rather
 * than by adding i18next because this app ships no i18n dependency and the
 * feature needs exactly this much: nested key lookup, `{{var}}` interpolation
 * and a language switch that re-renders.
 *
 * Scope is deliberately narrow. The dashboard chrome is written in English in
 * the source; only database-authored messages pass through here.
 */

export type Lang = 'en' | 'ar';

const BUNDLES: Record<Lang, unknown> = { en, ar };
const STORAGE_KEY = 'admin:lang';
const DEFAULT_LANG: Lang = 'en';

function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'ar';
}

function readStored(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // Blocked storage — the default is a fine answer.
  }
  return DEFAULT_LANG;
}

let current: Lang = readStored();
const listeners = new Set<() => void>();

/** Walks a dotted key (`reminder.missing_insurance.title`) into the bundle. */
function lookup(lang: Lang, key: string): string | undefined {
  let node: unknown = BUNDLES[lang];
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

export function exists(key: string | null | undefined, lang: Lang = current): boolean {
  if (!key) return false;
  return lookup(lang, key) !== undefined;
}

export function t(
  key: string,
  vars?: Record<string, unknown> | null,
  lang: Lang = current,
): string {
  const template = lookup(lang, key);
  if (template === undefined) return key;
  return interpolate(template, vars);
}

export function getLanguage(): Lang {
  return current;
}

export function dirFor(lang: Lang = current): 'ltr' | 'rtl' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export function changeLanguage(next: Lang): void {
  if (!isLang(next) || next === current) return;
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not persisting is survivable; the switch still applies for this session.
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
 * Components read the language through this so a `changeLanguage` call
 * re-renders them immediately — no refetch, no reload.
 */
export function useTranslation() {
  const language = useSyncExternalStore(subscribe, getLanguage, () => DEFAULT_LANG);

  const translate = useCallback(
    (key: string, vars?: Record<string, unknown> | null) => t(key, vars, language),
    [language],
  );

  const keyExists = useCallback((key: string | null | undefined) => exists(key, language), [language]);

  return { t: translate, exists: keyExists, language, dir: dirFor(language), changeLanguage };
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
  translate: (key: string, vars?: Record<string, unknown> | null) => string,
  keyExists: (key: string | null | undefined) => boolean,
): string {
  if (!key || !keyExists(key)) return fallback ?? '';
  const rendered = translate(key, vars);
  if (hasGaps(rendered)) return fallback ?? rendered;
  return rendered;
}

/** Binds `renderMessage` to the active language for use inside a component. */
export function useMessageRenderer() {
  const { t: translate, exists: keyExists } = useTranslation();
  return useCallback(
    (
      key: string | null | undefined,
      vars: Record<string, unknown> | null | undefined,
      fallback: string | null | undefined,
    ) => renderMessage(key, vars, fallback, translate, keyExists),
    [translate, keyExists],
  );
}

// Exposed so the language can be flipped from the browser console, which is how
// the switch is exercised until a language picker exists in the UI.
if (typeof window !== 'undefined') {
  (window as unknown as { i18n: unknown }).i18n = {
    t,
    exists,
    changeLanguage,
    get language() {
      return current;
    },
  };
}
