import type { Currency } from './CurrencyContext';

export interface UserSettings {
  currency: Currency | null;
  notificationSound: boolean;
  startCollapsed: boolean;
}

const DEFAULTS: UserSettings = { currency: null, notificationSound: false, startCollapsed: false };

const storageKey = (userId: string) => `hc_settings:${userId}`;

export function loadUserSettings(userId: string): UserSettings {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<UserSettings>) } : DEFAULTS;
  } catch {
    // Blocked storage or a damaged value: the defaults are a safe answer.
    return DEFAULTS;
  }
}

export function saveUserSettings(userId: string, patch: Partial<UserSettings>): UserSettings {
  const next = { ...loadUserSettings(userId), ...patch };
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // The choice still applies for this session.
  }
  return next;
}
