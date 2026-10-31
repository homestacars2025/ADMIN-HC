import React, { useState } from 'react';
import {
  CUSTOMER_CHARACTER,
  INVESTOR_CHARACTER,
  getCustomerAvatar,
  getInvestorAvatar,
  smallCharacter,
  type PersonPhoto,
} from '../../lib/personAvatar';
import type { AvatarProfile } from '../../lib/staffAvatar';
import StaffAvatar from './StaffAvatar';

const TINT = 'rgb(110 164 231 / 0.12)';
const CHARACTER_SCALE = 1.15;

/**
 * A circular picture. A photo is centre-cropped; a character is a bust, scaled
 * past the circle and pinned to its bottom edge so the shoulders run off the
 * frame. A photo that fails to load falls back to the character.
 */
const PersonAvatar: React.FC<{
  src: string;
  character: string;
  alt: string;
  size: number;
  style?: React.CSSProperties;
}> = ({ src, character, alt, size, style }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shown = src === failedSrc ? character : src;
  const isCharacter = shown === character;

  return (
    <span
      style={{
        position: 'relative',
        display: 'block',
        width: size,
        height: size,
        flexShrink: 0,
        overflow: 'hidden',
        borderRadius: '50%',
        background: TINT,
        ...style,
      }}
    >
      <img
        src={shown}
        srcSet={isCharacter ? `${smallCharacter(character)} 256w, ${character} 512w` : undefined}
        sizes={isCharacter ? `${Math.ceil(size * CHARACTER_SCALE)}px` : undefined}
        alt={alt}
        loading="lazy"
        onError={() => setFailedSrc(shown)}
        style={isCharacter ? {
          position: 'absolute',
          left: '50%',
          bottom: 0,
          width: `${CHARACTER_SCALE * 100}%`,
          height: `${CHARACTER_SCALE * 100}%`,
          maxWidth: 'none',
          transform: 'translateX(-50%)',
          objectFit: 'cover',
          objectPosition: 'center bottom',
        } : {
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
        }}
      />
    </span>
  );
};

interface AvatarProps {
  person?: PersonPhoto | null;
  alt?: string;
  size?: number;
  style?: React.CSSProperties;
}

export const CustomerAvatar: React.FC<AvatarProps> = ({ person, alt = '', size = 32, style }) => (
  <PersonAvatar src={getCustomerAvatar(person)} character={CUSTOMER_CHARACTER} alt={alt} size={size} style={style} />
);

export const InvestorAvatar: React.FC<AvatarProps> = ({ person, alt = '', size = 32, style }) => (
  <PersonAvatar src={getInvestorAvatar(person)} character={INVESTOR_CHARACTER} alt={alt} size={size} style={style} />
);

/** Anyone from `profiles`, drawn as the character that matches their role. */
export const ProfileAvatar: React.FC<{
  profile: AvatarProfile & { role?: string | null };
  alt?: string;
  size?: number;
}> = ({ profile, alt = '', size = 32 }) => {
  if (profile.role === 'investor') return <InvestorAvatar person={profile} alt={alt} size={size} />;
  if (profile.role === 'customer') return <CustomerAvatar person={profile} alt={alt} size={size} />;
  return <StaffAvatar profile={profile} alt={alt} size={size} />;
};
