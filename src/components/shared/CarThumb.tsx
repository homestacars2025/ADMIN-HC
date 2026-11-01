import React, { useState } from 'react';

const CarSilhouette: React.FC<{ width: number }> = ({ width }) => (
  <svg aria-hidden="true" width={width * 0.7} viewBox="0 0 48 24" fill="#C4CAD3">
    <path d="M6 18a3 3 0 0 1-3-3v-3c0-1.2.8-2.2 2-2.5l5-1.3 4.3-4.3A5 5 0 0 1 17.8 2.5h9.5a6 6 0 0 1 4.4 1.900l3.9 4.200 6.3 1.100A4 4 0 0 1 45 13.500V15a3 3 0 0 1-3 3h-1.500a5.5 5.5 0 0 0-10.9 0H17.400a5.5 5.5 0 0 0-10.9 0H6Z" />
    <circle cx="12" cy="18.5" r="4" />
    <circle cx="35" cy="18.5" r="4" />
  </svg>
);

/**
 * The model's photo, sitting directly on the row with no box of its own, or a neutral
 * silhouette when there's none or it won't load. The photos are tall, with the car
 * across the full width just below the middle on white. Fitting a whole one in here
 * would leave a tiny car, so this trims the blank space above and below instead, and
 * `multiply` melts whatever white is left into the page.
 */
export const CarThumb: React.FC<{ src: string | null; width?: number; height?: number }> = ({ src, width = 64, height = 40 }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usable = src && src !== failedSrc;
  return (
    <span className="relative flex shrink-0 items-center justify-center overflow-hidden" style={{ width, height }}>
      {usable
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} className="absolute inset-0 h-full w-full object-cover mix-blend-multiply" style={{ objectPosition: '50% 80%' }} />
        : <CarSilhouette width={width} />}
    </span>
  );
};
