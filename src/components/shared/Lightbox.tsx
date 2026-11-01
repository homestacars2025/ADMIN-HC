import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, X } from '../media/MediaIcons';

export interface LightboxItem {
  url: string;
  label?: string;
}

export const isPdfUrl = (url: string) => /\.pdf(\?|#|$)/i.test(url);

const SWIPE_PX = 50;

const NAV_BUTTON = 'grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.14] text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';

/** Photos and PDFs full screen, with arrow keys on a keyboard and swipe on a phone. */
export const Lightbox: React.FC<{ items: LightboxItem[]; start?: number; onClose: () => void }> = ({ items, start = 0, onClose }) => {
  const [index, setIndex] = useState(start);
  const touchX = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = items[index];
  const many = items.length > 1;

  const move = (by: number) => setIndex((value) => (value + by + items.length) % items.length);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    // Caught first, or Esc would also reach the sheet behind this.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key === 'ArrowRight') setIndex((value) => (value + 1) % items.length);
      if (event.key === 'ArrowLeft') setIndex((value) => (value - 1 + items.length) % items.length);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [items.length, onClose]);

  if (!current) return null;

  return ReactDOM.createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.label ?? 'Document'}
      className="media-scope fixed inset-0 z-[1400] flex flex-col bg-black/90"
      style={{ animation: 'm-fade-in 120ms ease-out' }}
      onClick={onClose}
      onTouchStart={(event) => { touchX.current = event.touches[0].clientX; }}
      onTouchEnd={(event) => {
        if (touchX.current === null || !many) return;
        const moved = event.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(moved) >= SWIPE_PX) move(moved < 0 ? 1 : -1);
      }}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-3 text-white sm:px-5" onClick={(event) => event.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{current.label}</span>
        {many && <span className="shrink-0 text-[12.5px] tabular-nums text-white/70">{index + 1} / {items.length}</span>}
        <a href={current.url} target="_blank" rel="noopener noreferrer" aria-label="Open in a new tab" className={NAV_BUTTON}>
          <ExternalLink size={16} />
        </a>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className={NAV_BUTTON}>
          <X size={17} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4 sm:px-16">
        {isPdfUrl(current.url) ? (
          <iframe src={current.url} title={current.label ?? 'Document'} className="h-full w-full max-w-[1000px] rounded-lg bg-white" onClick={(event) => event.stopPropagation()} />
        ) : (
          <img src={current.url} alt={current.label ?? 'Document'} className="max-h-full max-w-full rounded-lg object-contain" onClick={(event) => event.stopPropagation()} />
        )}
        {many && (
          <>
            <button type="button" aria-label="Previous" onClick={(event) => { event.stopPropagation(); move(-1); }} className={`${NAV_BUTTON} absolute left-3 top-1/2 hidden -translate-y-1/2 sm:grid`}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" aria-label="Next" onClick={(event) => { event.stopPropagation(); move(1); }} className={`${NAV_BUTTON} absolute right-3 top-1/2 hidden -translate-y-1/2 sm:grid`}>
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
