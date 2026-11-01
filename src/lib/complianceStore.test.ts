import { claimComplianceAlert, resetComplianceAlert } from './complianceStore';

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
