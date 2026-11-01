import { withComplianceMessage } from './complianceNotifications';
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
