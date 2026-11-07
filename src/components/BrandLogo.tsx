import React from 'react';
import { BRAND_ALT, WORDMARK_RATIO, brandSrc, type BrandAsset } from '../lib/brand';
import { cn } from '../lib/media/badgeColor';

export interface BrandLogoProps {
  /** The arch mark alone, or the "homesta" wordmark. */
  variant?: 'icon' | 'wordmark';
  /** The surface the logo sits on: a light one gets the black wordmark, a dark one the white. */
  theme?: 'light' | 'dark';
  /** Height in px. The width follows the file's own ratio. */
  size?: number;
  className?: string;
}

/**
 * The only way the app shows the Homesta logo: the official PNG, at its own ratio,
 * never recolored, filtered or shadowed. The file carries its own clear space.
 */
const BrandLogo: React.FC<BrandLogoProps> = ({ variant = 'wordmark', theme = 'light', size = 32, className }) => {
  const asset: BrandAsset = variant === 'icon' ? 'icon' : theme === 'dark' ? 'wordmarkDark' : 'wordmarkLight';
  const width = variant === 'icon' ? size : Math.round(size * WORDMARK_RATIO);
  return (
    <img
      src={brandSrc(asset)}
      alt={BRAND_ALT}
      width={width}
      height={size}
      draggable={false}
      decoding="async"
      className={cn('block shrink-0 select-none object-contain', variant === 'icon' && 'rounded-[22%]', className)}
      style={{ width, height: size }}
    />
  );
};

export default BrandLogo;
