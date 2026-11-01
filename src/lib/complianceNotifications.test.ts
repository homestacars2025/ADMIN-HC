import { withComplianceMessage, withFineReminder, withCustodyMessage } from './complianceNotifications';
import { resolveNotificationLink, type NotificationRow } from './notifications';

jest.mock('./supabase', () => ({ supabase: {} }));

/** The database stores these rows in Arabic, and this file has to stay free of it. */
const STORED_ARABIC = String.fromCharCode(0x0627, 0x0644, 0x062a, 0x0623, 0x0645, 0x064a, 0x0646);

const row = (over: Partial<NotificationRow> = {}): NotificationRow => ({
  id: 'n1',
  category: 'reminder',
  event_key: 'compliance.insurance.expiring',
  i18n_key: 'compliance.insurance.expiring',
  body_i18n_key: null,
  vars: { plate: '34ABC123', model: 'Fiat Egea', days_left: 3, expiry: '2026-11-04' },
  title: `${STORED_ARABIC}: 34ABC123`,
  body: `Fiat Egea · ${STORED_ARABIC} 2026-11-04`,
  link: '/cars',
  entity_type: 'car',
  entity_id: '57',
  is_read: false,
  created_at: '2026-11-01T06:00:00Z',
  ...over,
});

const withVars = (vars: Record<string, unknown>, eventKey = 'compliance.insurance.expiring') =>
  withComplianceMessage(row({ event_key: eventKey, vars: { plate: '34ABC123', model: 'Fiat Egea', expiry: '2026-11-04', ...vars } }));

describe('compliance notifications', () => {
  it('writes the title from the days left', () => {
    expect(withVars({ days_left: 3 }).title).toBe('Insurance expires in 3 days — 34ABC123');
    expect(withVars({ days_left: 1 }).title).toBe('Insurance expires tomorrow — 34ABC123');
    expect(withVars({ days_left: 0 }).title).toBe('Insurance expires today — 34ABC123');
  });

  it('covers inspection the same way', () => {
    expect(withVars({ days_left: 0 }, 'compliance.inspection.expiring').title).toBe('Inspection expires today — 34ABC123');
    expect(withVars({ days_left: 3 }, 'compliance.inspection.expiring').title).toBe('Inspection expires in 3 days — 34ABC123');
  });

  it('reads a day count stored as text', () => {
    expect(withVars({ days_left: '1' }).title).toBe('Insurance expires tomorrow — 34ABC123');
  });

  it('is amber at 3 days and red at 1 and 0', () => {
    expect(withVars({ days_left: 3 }).compliance_tone).toBe('amber');
    expect(withVars({ days_left: 1 }).compliance_tone).toBe('red');
    expect(withVars({ days_left: 0 }).compliance_tone).toBe('red');
  });

  it('writes the body in English, with or without a model', () => {
    expect(withVars({ days_left: 3 }).body).toBe('Fiat Egea · Expires 04.11.2026');
    expect(withVars({ days_left: 3, model: null }).body).toBe('Expires 04.11.2026');
  });

  it('never lets the stored Arabic through, even with vars missing', () => {
    const bare = withComplianceMessage(row({ vars: null }));
    expect(bare.title).toBe('Insurance expires soon — —');
    [bare, withVars({ days_left: 3, model: null }), withVars({ days_left: 3 })].forEach((item) => {
      expect(`${item.title} ${item.body ?? ''}`).not.toMatch(new RegExp('[\\u0600-\\u06FF]'));
    });
  });

  it('opens the car, not just the page', () => {
    expect(resolveNotificationLink(withVars({ days_left: 1 }).link)).toBe('/dashboard/cars?car=57');
    expect(resolveNotificationLink(withComplianceMessage(row({ entity_id: null })).link)).toBe('/dashboard/cars');
  });

  it('leaves every other notification alone', () => {
    const other = row({ event_key: 'task.assigned', title: 'Keep me' });
    expect(withComplianceMessage(other)).toBe(other);
    const unset = row({ event_key: null });
    expect(withComplianceMessage(unset)).toBe(unset);
  });
});

describe('the unpaid fines reminder', () => {
  const reminder = (vars: Record<string, unknown> | null) => withFineReminder({
    id: 'n2', category: 'reminder', event_key: 'fines.unpaid.reminder', i18n_key: 'fines.unpaid.reminder',
    body_i18n_key: null, vars, title: 'stored', body: 'stored', link: '/fines?filter=unpaid', entity_type: 'fines',
    entity_id: null, is_read: false, created_at: '2026-11-01T10:36:00Z',
  });

  it('writes the title from vars', () => {
    expect(reminder({ count: 5, total: 48738, unassigned: 2, oldest: '2026-07-05' }).title).toBe('5 unpaid fines — ₺48,738 · 2 not linked to a customer');
  });

  it('leaves out the last part when every fine is linked', () => {
    expect(reminder({ count: 5, total: 48738, unassigned: 0 }).title).toBe('5 unpaid fines — ₺48,738');
  });

  it('says one fine properly', () => {
    expect(reminder({ count: 1, total: 1246, unassigned: 0 }).title).toBe('1 unpaid fine — ₺1,246');
  });

  it('shows the oldest date, and opens the unpaid list', () => {
    const row = reminder({ count: 5, total: 48738, unassigned: 1, oldest: '2026-07-05' });
    expect(row.body).toBe('Oldest from 05.07.2026');
    expect(resolveNotificationLink(row.link)).toBe('/dashboard/fines?filter=unpaid');
    expect(row.fine_alert).toBe(true);
  });

  it('copes with no vars', () => {
    expect(reminder(null).title).toBe('0 unpaid fines — ₺0');
  });

  it('leaves everything else alone', () => {
    const other = { ...reminder({}), event_key: 'task.assigned' };
    expect(withFineReminder(other)).toBe(other);
  });
});

describe('notification links', () => {
  it('keeps the query on a stored link', () => {
    expect(resolveNotificationLink('/fines?filter=unpaid')).toBe('/dashboard/fines?filter=unpaid');
    expect(resolveNotificationLink('/cars/57')).toBe('/dashboard/cars');
  });
});

describe('withCustodyMessage', () => {
  const custody = (over: Partial<NotificationRow>): NotificationRow => ({
    event_key: 'custody.expense.pending',
    title: STORED_ARABIC,
    body: STORED_ARABIC,
    i18n_key: 'custody.expense.pending',
    link: '/accounting?tab=custody',
    vars: { name: 'Noor', amount: 450.5, description: 'Car wash' },
    ...over,
  } as NotificationRow);

  it('replaces the stored Arabic with English from vars', () => {
    const row = withCustodyMessage(custody({}));
    expect(row.title).toBe('Expense waiting for approval: ₺450,50');
    expect(row.body).toBe('Noor — Car wash');
    expect(row.i18n_key).toBeNull();
  });

  it('opens the waiting list', () => {
    expect(withCustodyMessage(custody({})).link).toBe('/dashboard/accounting?tab=custody&filter=pending');
  });

  it('leaves other notifications alone', () => {
    const other = custody({ event_key: 'something.else' });
    expect(withCustodyMessage(other)).toBe(other);
  });
});
