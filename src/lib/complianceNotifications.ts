import { formatDate } from './customers';
import { t } from './i18n';
import type { NotificationRow } from './notifications';

const EVENT = /^compliance\.(insurance|inspection)\.expiring$/;

function titleKey(doc: string, daysLeft: number): string {
  if (daysLeft === 0) return `compliance.${doc}.expires_today`;
  if (daysLeft === 1) return `compliance.${doc}.expires_tomorrow`;
  return Number.isFinite(daysLeft) ? `compliance.${doc}.expires_in_days` : `compliance.${doc}.expires_soon`;
}

/**
 * The database stores these rows with an Arabic title and body, and only the title
 * has a key, so both are rebuilt here from `vars`. Every list in the app reads
 * through `getNotifications`, which means nothing Arabic can reach the screen. The
 * stored link is just `/cars`, so the car comes from `entity_id`.
 */
export function withComplianceMessage(row: NotificationRow): NotificationRow {
  const match = EVENT.exec(row.event_key ?? '');
  if (!match) return row;

  const vars = row.vars ?? {};
  const daysLeft = vars.days_left === null || vars.days_left === undefined ? NaN : Number(vars.days_left);
  const plate = typeof vars.plate === 'string' && vars.plate ? vars.plate : '—';
  const expiry = typeof vars.expiry === 'string' ? formatDate(vars.expiry) : null;
  const model = typeof vars.model === 'string' ? vars.model : '';

  return {
    ...row,
    i18n_key: null,
    body_i18n_key: null,
    title: t(titleKey(match[1], daysLeft), { plate, days_left: daysLeft }),
    body: expiry ? t(model ? 'compliance.expiring_body' : 'compliance.expiring_body_no_model', { model, expiry }) : model || null,
    link: row.entity_id ? `/dashboard/cars?car=${encodeURIComponent(row.entity_id)}` : '/dashboard/cars',
    compliance_tone: daysLeft <= 1 ? 'red' : 'amber',
  };
}
