import React, { useState } from 'react';
import {
  avatarBgGradient,
  avatarBgRing,
  defaultStaffAvatar,
  getStaffAvatar,
  useAvatarBg,
  type AvatarProfile,
} from '../../lib/staffAvatar';

/**
 * One circular staff picture. A character is a bust on the person's color, with
 * headroom above it and the shoulders cut by the circle. A photo keeps its own
 * background, so the color is only a ring, and if it fails the character takes over.
 */
export const StaffAvatar: React.FC<{
  profile: AvatarProfile | null | undefined;
  alt?: string;
  size?: number;
  style?: React.CSSProperties;
}> = ({ profile, alt = '', size = 32, style }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const bg = useAvatarBg(profile);
  const src = getStaffAvatar(profile);
  const character = defaultStaffAvatar(profile?.gender);
  const shown = src === failedSrc ? character : src;
  const isCharacter = shown === character;

  return (
    <span
      style={{
        position: 'relative',
        display: 'block',
        boxSizing: 'border-box',
        width: size,
        height: size,
        flexShrink: 0,
        overflow: 'hidden',
        borderRadius: '50%',
        ...(isCharacter
          ? { background: avatarBgGradient(bg), border: '1px solid var(--border-subtle)' }
          : { border: `2px solid ${avatarBgRing(bg)}` }),
        ...style,
      }}
    >
      <img
        src={shown}
        alt={alt}
        loading="lazy"
        onError={() => setFailedSrc(src)}
        style={isCharacter ? {
          position: 'absolute',
          top: '7%',
          left: 0,
          width: '100%',
          height: '115%',
          maxWidth: 'none',
          objectFit: 'cover',
          objectPosition: 'center top',
        } : {
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'top center',
        }}
      />
    </span>
  );
};

export default StaffAvatar;
