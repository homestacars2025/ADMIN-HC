import React, { useState } from 'react';

/**
 * The month stepper used by Bookings and by Accounting's Booking Accounts tab.
 *
 * Lifted out of BookingsPage so the two cannot drift: the arrows, the hover
 * treatment and the label width are the same object, not a copy. It takes a
 * rendered `label` rather than a date, because the two callers hold their month
 * in different shapes — a `Date` in Bookings, a `YYYY-MM` key in Accounting —
 * and both already format it to the same "September 2026" text.
 */

const MonthArrow: React.FC<{ direction: 'left' | 'right'; onClick: () => void }> = ({ direction, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={direction === 'left' ? 'Previous month' : 'Next month'}
      style={{
        width: 36, height: 36, borderRadius: 10,
        border: `1.5px solid ${hovered ? '#4ba6ea' : '#e5e7eb'}`,
        background: hovered ? 'rgba(75,166,234,0.06)' : '#fff',
        color: hovered ? '#3A74C2' : '#6b7280',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 140ms ease', flexShrink: 0,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        {direction === 'left'
          ? <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          : <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        }
      </svg>
    </button>
  );
};

export const MonthNav: React.FC<{
  label: string;
  onPrev: () => void;
  onNext: () => void;
  /** Bookings centres it on the page; a toolbar may want it flush left. */
  justify?: React.CSSProperties['justifyContent'];
  style?: React.CSSProperties;
}> = ({ label, onPrev, onNext, justify = 'center', style }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: justify, gap: 16, ...style }}>
    <MonthArrow direction="left" onClick={onPrev} />
    <span style={{ fontSize: 18, fontWeight: 600, color: '#0f1117', letterSpacing: '-0.4px', minWidth: 160, textAlign: 'center' }}>
      {label}
    </span>
    <MonthArrow direction="right" onClick={onNext} />
  </div>
);

export default MonthNav;
