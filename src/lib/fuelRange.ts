/**
 * Fuel is always the driving range left on the car's dashboard, in km. Every
 * booking, operation and replacement sheet stores it that way, and pickup charges
 * are worked out from it, so it's never shown as a percentage or a fraction.
 */
export const FUEL_RANGE_LABEL = 'Fuel range (km)';
export const FUEL_RANGE_PLACEHOLDER = 'e.g. 280';

/** "280 km" and "1,280 km", the same on screen and on paper. */
export function formatFuelRange(value: string | number | null | undefined): string {
  const text = String(value ?? '').trim();
  if (!text) return '—';
  const km = Number(text);
  return Number.isFinite(km) ? `${km.toLocaleString('en-US')} km` : text;
}

/** Bookings keep fuel as text, so typed input is reduced to whole km before it's stored. */
export const fuelRangeDigits = (value: string) => value.replace(/\D/g, '');
