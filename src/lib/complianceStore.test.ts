import { claimComplianceAlert, releaseComplianceAlert, resetComplianceAlert, signInAlertActive } from './complianceStore';

jest.mock('./supabase', () => ({ supabase: {} }));

describe('the sign-in alert', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetComplianceAlert();
  });

  it('shows once for an existing session', () => {
    expect(claimComplianceAlert()).toBe(true);
    expect(claimComplianceAlert()).toBe(false);
  });

  it('shows again after every sign-in', () => {
    claimComplianceAlert();
    resetComplianceAlert();
    expect(claimComplianceAlert()).toBe(true);
  });

  it('keeps the Cars page from stacking its own modal until it has been closed', () => {
    expect(signInAlertActive()).toBe(true);
    claimComplianceAlert();
    expect(signInAlertActive()).toBe(true);
    releaseComplianceAlert();
    expect(signInAlertActive()).toBe(false);
  });

  it('lets the Cars page open its own after a reload in the same session', () => {
    sessionStorage.setItem('hc_compliance_alert_seen', '1');
    expect(signInAlertActive()).toBe(false);
  });

  it('remembers across a page reload in the same session', () => {
    sessionStorage.setItem('hc_compliance_alert_seen', '1');
    expect(claimComplianceAlert()).toBe(false);
  });

  it('still shows once when storage is blocked', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(claimComplianceAlert()).toBe(true);
    expect(claimComplianceAlert()).toBe(false);
    getItem.mockRestore();
  });
});
