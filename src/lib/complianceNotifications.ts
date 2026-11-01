import { formatDate } from './customers';
import { t } from './i18n';
import { formatMoney } from './money';
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

/** Stored in Arabic with only a key, so the English comes from `vars`. */
export function withCustodyMessage(row: NotificationRow): NotificationRow {
  if (row.event_key !== 'custody.expense.pending') return row;
  const vars = row.vars ?? {};
  const name = typeof vars.name === 'string' ? vars.name : '';
  const description = typeof vars.description === 'string' ? vars.description : '';
  return {
    ...row,
    i18n_key: null,
    body_i18n_key: null,
    title: t('custody.pending.title', { amount: formatMoney(Number(vars.amount) || 0) }),
    body: [name, description].filter(Boolean).join(' — ') || null,
    link: '/dashboard/accounting?tab=custody&filter=pending',
  };
}

const wholeLira = (amount: number) => `₺${Math.round(amount).toLocaleString('en-US')}`;

/** The two-day reminder, written from `vars` and pointed at the unpaid fines. */
export function withFineReminder(row: NotificationRow): NotificationRow {
  if (row.event_key !== 'fines.unpaid.reminder') return row;
  const vars = row.vars ?? {};
  const count = Number(vars.count) || 0;
  const unassigned = Number(vars.unassigned) || 0;
  const total = wholeLira(Number(vars.total) || 0);
  const title = t(count === 1 ? 'fines.unpaid.one' : 'fines.unpaid.many', { count, total });
  return {
    ...row,
    i18n_key: null,
    body_i18n_key: null,
    title: unassigned > 0 ? `${title} · ${t('fines.unpaid.not_linked', { count: unassigned })}` : title,
    body: typeof vars.oldest === 'string' ? t('fines.unpaid.oldest', { oldest: formatDate(vars.oldest) }) : null,
    link: '/dashboard/fines?filter=unpaid',
    fine_alert: true,
  };
}
