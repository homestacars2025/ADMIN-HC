import React, { useState } from 'react';
import { defaultStaffAvatar, getStaffAvatar, type AvatarProfile } from '../../lib/staffAvatar';

/** One circular staff picture. A photo that fails to load falls back to the character. */
export const StaffAvatar: React.FC<{
  profile: AvatarProfile | null | undefined;
  alt?: string;
  size?: number;
  style?: React.CSSProperties;
}> = ({ profile, alt = '', size = 32, style }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = getStaffAvatar(profile);

  return (
    <img
      src={src === failedSrc ? defaultStaffAvatar(profile?.gender) : src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      style={{
        display: 'block',
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        objectFit: 'cover',
        objectPosition: 'top center',
        border: '1px solid var(--border-subtle)',
        ...style,
      }}
    />
  );
};

export default StaffAvatar;
