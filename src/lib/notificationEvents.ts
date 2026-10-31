import type { NotificationRow } from './notifications';

/**
 * What the realtime channel hands to the rest of the shell. `arrived` is a
 * notification for this admin. `activity` fires for every new recipient row,
 * including ones for staff, so the Tasks page can stay current.
 */
type Listener<T> = (value: T) => void;

function channel<T>() {
  const listeners = new Set<Listener<T>>();
  return {
    emit: (value: T) => listeners.forEach((listener) => listener(value)),
    subscribe: (listener: Listener<T>) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const notificationArrived = channel<NotificationRow>();
export const notificationActivity = channel<void>();

export interface RecipientRow {
  notification_id: string;
  target_kind: 'profile' | 'role' | 'section';
  profile_id: string | null;
  role: string | null;
}

/**
 * An admin's subscription sees every recipient row, staff included, but the bell
 * only lists what's addressed to them. Rows for someone else can be ruled out here
 * without a request; role and section rows are settled by `my_notifications`.
 */
export function mayBeForMe(row: RecipientRow, profileId: string, role: string | null): boolean {
  if (row.target_kind === 'profile') return row.profile_id === profileId;
  if (row.target_kind === 'role') return row.role === role;
  return true;
}
