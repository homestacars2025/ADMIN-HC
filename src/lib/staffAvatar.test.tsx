import React from 'react';
import { act, render, screen } from '@testing-library/react';
import {
  avatarBgGradient,
  avatarBgRing,
  defaultStaffAvatar,
  getStaffAvatar,
  publishAvatarBg,
  toAvatarBg,
  useAvatarBg,
  type AvatarProfile,
} from './staffAvatar';

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

describe('avatar colors', () => {
  it('gives every color its own gradient and ring', () => {
    expect(avatarBgGradient('sky')).toBe('radial-gradient(circle closest-side, #EAF3FD, #CFE2F7)');
    expect(avatarBgGradient('mint')).toBe('radial-gradient(circle closest-side, #E9F8EF, #C9EBD8)');
    expect(avatarBgGradient('peach')).toBe('radial-gradient(circle closest-side, #FDF0E7, #F6D5BF)');
    expect(avatarBgGradient('lavender')).toBe('radial-gradient(circle closest-side, #F1ECFD, #DCD2F6)');
    expect(avatarBgRing('peach')).toBe('#F6D5BF');
  });

  it('falls back to sky for a missing or unknown color', () => {
    expect(toAvatarBg('mint')).toBe('mint');
    expect(toAvatarBg(null)).toBe('sky');
    expect(toAvatarBg('red')).toBe('sky');
  });
});

describe('useAvatarBg', () => {
  const Shown: React.FC<{ profile: AvatarProfile | null }> = ({ profile }) => <span>{useAvatarBg(profile)}</span>;

  it('uses the loaded color until one is saved, then updates without a reload', () => {
    render(<Shown profile={{ id: 'staff-1', avatar_bg: 'mint' }} />);
    expect(screen.getByText('mint')).toBeInTheDocument();
    act(() => publishAvatarBg('staff-1', 'peach'));
    expect(screen.getByText('peach')).toBeInTheDocument();
  });

  it('leaves other people and previews without an id alone', () => {
    publishAvatarBg('staff-2', 'lavender');
    render(<><Shown profile={{ id: 'staff-3', avatar_bg: 'mint' }} /><Shown profile={{ id: null, avatar_bg: 'peach' }} /></>);
    expect(screen.getByText('mint')).toBeInTheDocument();
    expect(screen.getByText('peach')).toBeInTheDocument();
  });
});
