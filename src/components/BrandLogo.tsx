import React from 'react';
import { BRAND_ALT, LOCKUP_GAP, WORDMARK_RATIO, brandSrc, lockupWordmarkHeight, type BrandAsset } from '../lib/brand';
import { cn } from '../lib/media/badgeColor';

export interface BrandLogoProps {
  /** The arch mark alone, the "homesta" wordmark, or both together (the lockup). */
  variant?: 'icon' | 'wordmark' | 'lockup';
  /** The surface the logo sits on: a light one gets the black wordmark, a dark one the white. */
  theme?: 'light' | 'dark';
  /** Height in px: of the logo, or of the icon in a lockup. The width follows the file's own ratio. */
  size?: number;
  /** A lockup's layout: icon beside the wordmark (it follows the page's direction, so RTL puts the icon on the right), or above it. */
  orientation?: 'row' | 'column';
  className?: string;
}

const LogoImage: React.FC<{ asset: BrandAsset; height: number; alt: string; className?: string }> = ({ asset, height, alt, className }) => {
  const width = asset === 'icon' ? height : Math.round(height * WORDMARK_RATIO);
  return (
    <img
      src={brandSrc(asset)}
      alt={alt}
      width={width}
      height={height}
      draggable={false}
      decoding="async"
      className={cn('block shrink-0 select-none object-contain', asset === 'icon' && 'rounded-[22%]', className)}
      style={{ width, height }}
    />
  );
};

/**
 * The only way the app shows the Homesta logo: the official PNGs, at their own ratio,
 * never recolored, filtered or shadowed. Each file carries its own clear space.
 */
const BrandLogo: React.FC<BrandLogoProps> = ({ variant = 'wordmark', theme = 'light', size = 32, orientation = 'row', className }) => {
  const wordmark: BrandAsset = theme === 'dark' ? 'wordmarkDark' : 'wordmarkLight';

  if (variant === 'lockup') {
    return (
      <span
        role="img"
        aria-label={BRAND_ALT}
        className={cn('inline-flex shrink-0 items-center', orientation === 'column' ? 'flex-col' : 'flex-row', className)}
        style={{ gap: LOCKUP_GAP }}
      >
        <LogoImage asset="icon" height={size} alt="" />
        <LogoImage asset={wordmark} height={lockupWordmarkHeight(size)} alt="" />
      </span>
    );
  }

  return <LogoImage asset={variant === 'icon' ? 'icon' : wordmark} height={size} alt={BRAND_ALT} className={className} />;
};

export default BrandLogo;
