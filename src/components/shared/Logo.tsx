import React from 'react';

interface LogoProps {
  /** Height of the arch mark in px. Width scales 1:1 (square viewBox). */
  size?: number;
  className?: string;
  /** Render the "homesta / cars" wordmark beside the arch mark. */
  wordmark?: boolean;
  /** Use light text/mark — for placement on dark backgrounds. */
  onDark?: boolean;
}

const ARCH_COLOR = '#6EA4E7';
const INK = '#0E0E10';
const INK_SOFT = '#45454B';

/**
 * Homesta Cars brand mark.
 * The Arch — a single rounded gateway stroke, always in Open Sky #6EA4E7.
 */
const Logo: React.FC<LogoProps> = ({
  size = 32,
  className,
  wordmark = false,
  onDark = false,
}) => {
  const textInk = onDark ? '#FFFFFF' : INK;
  const subInk = onDark ? 'rgba(255,255,255,0.72)' : INK_SOFT;

  const Arch = (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      fill="none"
      stroke={ARCH_COLOR}
      strokeWidth="14"
      strokeLinecap="round"
      aria-hidden={wordmark ? 'true' : undefined}
      aria-label={wordmark ? undefined : 'Homesta Cars'}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path d="M22 100 L 22 60 A 38 38 0 0 1 98 60 L 98 100" />
    </svg>
  );

  if (!wordmark) {
    return (
      <span className={className} style={{ display: 'inline-block', lineHeight: 0 }}>
        {Arch}
      </span>
    );
  }

  return (
    <span
      className={className}
      aria-label="Homesta Cars"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(size * 0.28),
        lineHeight: 1,
      }}
    >
      {Arch}
      <span style={{ display: 'flex', flexDirection: 'column', userSelect: 'none' }}>
        <span
          style={{
            fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, sans-serif',
            fontWeight: 500,
            fontSize: Math.round(size * 0.47),
            letterSpacing: '-0.045em',
            lineHeight: 0.88,
            color: textInk,
          }}
        >
          homesta
        </span>
        <span
          style={{
            fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, sans-serif',
            fontWeight: 500,
            fontSize: Math.round(size * 0.36),
            letterSpacing: '-0.035em',
            lineHeight: 1.2,
            color: ARCH_COLOR,
            marginTop: 2,
          }}
        >
          cars
        </span>
      </span>
    </span>
  );
};

export default Logo;
