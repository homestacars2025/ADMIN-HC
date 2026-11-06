import type { FilterTileTone } from '../components/shared/FilterTile';

/**
 * One palette for a booking's or a car's status, shared by the Bookings tiles and the
 * Fleet Calendar so a colour means the same thing on both. Each value is the tile tone
 * of the same name in theme.css: `from`→`to` is the fill, `ink` the text and `chip`
 * the accent (dot, bar border, active tile border). Team uses the same mapping.
 */

export type FleetStatus = 'booked' | 'pending' | 'completed' | 'parking' | 'maintenance' | 'selling' | 'replacement';

export interface StatusToken {
  label: string;
  tile: FilterTileTone;
  from: string;
  to: string;
  ink: string;
  chip: string;
}

export const FLEET_STATUS: Record<FleetStatus, StatusToken> = {
  booked:      { label: 'Booked',      tile: 'green',   from: '#EAF7EF', to: '#D3EEDC', ink: '#166534', chip: '#22C55E' },
  pending:     { label: 'Pending',     tile: 'amber',   from: '#FEF6E7', to: '#FBE8C4', ink: '#92400E', chip: '#F59E0B' },
  completed:   { label: 'Completed',   tile: 'slate',   from: '#F3F5F9', to: '#E3E8F0', ink: '#334155', chip: '#64748B' },
  parking:     { label: 'Parking',     tile: 'neutral', from: '#FFFFFF', to: '#F3F4F6', ink: '#374151', chip: '#9CA3AF' },
  maintenance: { label: 'Maintenance', tile: 'violet',  from: '#F2EEFD', to: '#E3DBFA', ink: '#4C1D95', chip: '#8B5CF6' },
  selling:     { label: 'Selling',     tile: 'yellow',  from: '#FEFBE8', to: '#FDF2B3', ink: '#854D0E', chip: '#EAB308' },
  replacement: { label: 'Replacement', tile: 'coral',   from: '#FFF1EE', to: '#FFD9D0', ink: '#9A3412', chip: '#F97362' },
};

/** Bars and legend, in the order they're explained. */
export const FLEET_STATUS_ORDER: FleetStatus[] = ['booked', 'pending', 'completed', 'parking', 'maintenance', 'selling', 'replacement'];

/** A car's status today, as `car_availability` names it: `working` is a car out on a booking. */
export type CarStatus = 'working' | 'pending' | 'parking' | 'maintenance' | 'selling' | 'replacement';
export const CAR_STATUSES: readonly CarStatus[] = ['working', 'pending', 'parking', 'maintenance', 'selling', 'replacement'];

export const carStatusToken = (status: string): StatusToken & { key: FleetStatus } => {
  const key: FleetStatus = status === 'working' ? 'booked' : (CAR_STATUSES as readonly string[]).includes(status) ? status as FleetStatus : 'parking';
  return { ...FLEET_STATUS[key], key, label: status === 'working' ? 'Working' : FLEET_STATUS[key].label };
};

/** A booking's own status. A cancelled one is never drawn. */
export function bookingStatusKey(status: string | null): FleetStatus {
  if (status === 'pending') return 'pending';
  if (status === 'completed') return 'completed';
  return 'booked';
}

export const barBackground = (token: Pick<StatusToken, 'from' | 'to'>) => `linear-gradient(145deg, ${token.from} 0%, ${token.to} 100%)`;
