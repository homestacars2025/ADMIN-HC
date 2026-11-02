import React from 'react';

const ICON_DIR = `${process.env.PUBLIC_URL}/icons/3d/bookings`;

export type Icon3DName = 'total' | 'confirmed' | 'pending' | 'completed';

/** Decorative everywhere: the label beside it says the same. */
export const Icon3D: React.FC<{ name: Icon3DName; size?: number; className?: string }> = ({ name, size = 56, className }) => (
  <img
    src={`${ICON_DIR}/${name}.png`}
    alt=""
    width={size}
    height={size}
    decoding="async"
    className={className}
    style={{ width: size, height: size, objectFit: 'contain', flex: 'none' }}
  />
);
