import React from 'react';

const ICON_ROOT = `${process.env.PUBLIC_URL}/icons/3d`;

export type Icon3DName = 'total' | 'confirmed' | 'pending' | 'completed';
export type CarIcon3DName = 'info' | 'registration' | 'expiry' | 'documents' | 'photos' | 'key';

const Img3D: React.FC<{ src: string; size: number; className?: string }> = ({ src, size, className }) => (
  <img
    src={src}
    alt=""
    width={size}
    height={size}
    decoding="async"
    className={className}
    style={{ width: size, height: size, objectFit: 'contain', flex: 'none' }}
  />
);

/** Decorative everywhere: the label beside it says the same. */
export const Icon3D: React.FC<{ name: Icon3DName; size?: number; className?: string }> = ({ name, size = 56, className }) => (
  <Img3D src={`${ICON_ROOT}/bookings/${name}.png`} size={size} className={className} />
);

/** The Edit Car sheet's section icons. */
export const CarIcon3D: React.FC<{ name: CarIcon3DName; size?: number; className?: string }> = ({ name, size = 44, className }) => (
  <Img3D src={`${ICON_ROOT}/cars/${name}.png`} size={size} className={className} />
);
