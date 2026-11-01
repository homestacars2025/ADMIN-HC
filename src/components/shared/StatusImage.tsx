import React from 'react';
import { cn } from '../../lib/media/badgeColor';

export type StatusArt = 'fleet' | 'working' | 'parking' | 'maintenance' | 'selling' | 'replacement';

const STATUS_DIR = `${process.env.PUBLIC_URL}/illustrations/status`;

/** The 3D picture of a car status, for big visuals. Table pills stay as they are. */
export const StatusImage: React.FC<{ status: StatusArt; size: number; className?: string; style?: React.CSSProperties }> = ({ status, size, className, style }) => {
  const base = `${STATUS_DIR}/${status}`;
  return (
    <img
      src={`${base}.webp`}
      srcSet={`${base}.webp 256w, ${base}@2x.webp 512w`}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={cn('shrink-0 object-contain', className)}
      style={style}
    />
  );
};
