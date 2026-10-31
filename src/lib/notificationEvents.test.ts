import { mayBeForMe, type RecipientRow } from './notificationEvents';

const row = (over: Partial<RecipientRow>): RecipientRow => ({
  notification_id: 'n', target_kind: 'profile', profile_id: null, role: null, ...over,
});

describe('mayBeForMe', () => {
  it('rules out a notification addressed to someone else', () => {
    expect(mayBeForMe(row({ profile_id: 'staff' }), 'me', 'admin')).toBe(false);
    expect(mayBeForMe(row({ profile_id: 'me' }), 'me', 'admin')).toBe(true);
  });

  it('matches a role notification on my role', () => {
    expect(mayBeForMe(row({ target_kind: 'role', role: 'admin' }), 'me', 'admin')).toBe(true);
    expect(mayBeForMe(row({ target_kind: 'role', role: 'staff' }), 'me', 'admin')).toBe(false);
  });

  it('leaves section notifications for the server to settle', () => {
    expect(mayBeForMe(row({ target_kind: 'section' }), 'me', 'admin')).toBe(true);
  });
});
