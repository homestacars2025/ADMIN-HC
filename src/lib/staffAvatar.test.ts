import { defaultStaffAvatar, getStaffAvatar } from './staffAvatar';

describe('getStaffAvatar', () => {
  it('prefers the uploaded photo over the character', () => {
    expect(getStaffAvatar({ avatar_url: 'https://x.co/me.jpg', gender: 'male' })).toBe('https://x.co/me.jpg');
  });

  it('falls back to the character for the gender', () => {
    expect(getStaffAvatar({ avatar_url: null, gender: 'male' })).toContain('/avatars/staff-male.webp');
    expect(getStaffAvatar({ avatar_url: '', gender: 'female' })).toContain('/avatars/staff-female.webp');
  });

  it('uses the neutral silhouette when gender is unset or the profile is missing', () => {
    expect(getStaffAvatar({ avatar_url: null, gender: null })).toContain('/avatars/staff-neutral.webp');
    expect(getStaffAvatar(null)).toContain('/avatars/staff-neutral.webp');
    expect(defaultStaffAvatar('other')).toContain('/avatars/staff-neutral.webp');
  });
});
