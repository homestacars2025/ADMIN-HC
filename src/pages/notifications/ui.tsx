import React from 'react';
import ReactDOM from 'react-dom';

/**
 * Shared chrome for the notifications / reminders / tasks pages.
 *
 * Inline styles and the brand palette, matching the rest of the dashboard —
 * no new UI dependency.
 */

export const BRAND = '#4ba6ea';
export const INK = '#0f1117';
export const MUTED = '#6b7280';
export const FAINT = '#9ca3af';
export const LINE = '#ebebeb';

export const PAGE_STYLE: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)',
  padding: 'clamp(22px, 4vw, 44px) clamp(16px, 3vw, 40px)',
};

export const CARD_STYLE: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${LINE}`,
  borderRadius: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
};

export const PageHeader: React.FC<{
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, action }) => (
  <div style={{
    marginBottom: 24, display: 'flex', alignItems: 'flex-end',
    justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
  }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND }} />
        <span style={{
          fontSize: 11, fontWeight: 700, color: FAINT,
          letterSpacing: '1px', textTransform: 'uppercase',
        }}>
          {eyebrow}
        </span>
      </div>
      <h1 style={{
        fontSize: 'clamp(23px, 4vw, 30px)', fontWeight: 800, color: INK,
        letterSpacing: '-0.8px', margin: 0,
      }}>
        {title}
      </h1>
      <p style={{ fontSize: 14, color: MUTED, marginTop: 4, maxWidth: 640 }}>{subtitle}</p>
    </div>
    {action}
  </div>
);

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost';

const BUTTON_KINDS: Record<ButtonKind, React.CSSProperties> = {
  primary: { background: BRAND, color: '#fff', border: '1px solid transparent' },
  secondary: { background: '#fff', color: INK, border: '1px solid #e5e7eb' },
  danger: { background: '#fff1f2', color: '#dc2626', border: '1px solid #fecaca' },
  ghost: { background: 'transparent', color: MUTED, border: '1px solid transparent' },
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; small?: boolean }
> = ({ kind = 'secondary', small, style, disabled, ...rest }) => (
  <button
    type="button"
    disabled={disabled}
    style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      height: small ? 32 : 38,
      padding: small ? '0 12px' : '0 16px',
      borderRadius: 10,
      fontSize: small ? 12.5 : 13.5,
      fontWeight: 600,
      fontFamily: 'inherit',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.55 : 1,
      transition: 'all 140ms ease',
      whiteSpace: 'nowrap',
      ...BUTTON_KINDS[kind],
      ...style,
    }}
    {...rest}
  />
);

export const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  background: '#fff',
  fontSize: 13.5,
  color: INK,
  fontFamily: 'inherit',
  outline: 'none',
};

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: 'auto',
  padding: '10px 12px',
  lineHeight: 1.6,
  resize: 'vertical',
};

export const Field: React.FC<{
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, hint, required, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <label style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>
      {label}
      {required && <span style={{ color: '#dc2626' }}> *</span>}
    </label>
    {children}
    {hint && <span style={{ fontSize: 11.5, color: FAINT, lineHeight: 1.5 }}>{hint}</span>}
  </div>
);

export const Chip: React.FC<{
  label: string;
  color: string;
  bg: string;
  onRemove?: () => void;
}> = ({ label, color, bg, onRemove }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '3px 9px', borderRadius: 20,
    fontSize: 11.5, fontWeight: 700, color, background: bg,
    whiteSpace: 'nowrap',
  }}>
    {label}
    {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        style={{
          border: 'none', background: 'none', cursor: 'pointer', padding: 0,
          color, display: 'flex', alignItems: 'center', opacity: 0.7,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </button>
    )}
  </span>
);

/** Segmented tab strip, matching the pill treatment used elsewhere. */
export function Tabs<T extends string>({ value, onChange, tabs }: {
  value: T;
  onChange: (next: T) => void;
  tabs: Array<{ value: T; label: string; count?: number }>;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4,
        background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12,
        marginBottom: 20, maxWidth: '100%', overflowX: 'auto',
      }}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 34, padding: '0 14px', borderRadius: 9, border: 'none',
              fontSize: 13, fontWeight: active ? 700 : 500,
              fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
              color: active ? BRAND : MUTED,
              background: active ? 'rgba(75,166,234,0.10)' : 'transparent',
              transition: 'all 140ms ease',
            }}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span style={{
                minWidth: 18, padding: '0 5px', borderRadius: 9,
                fontSize: 10.5, fontWeight: 800, lineHeight: '17px', textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
                background: active ? 'rgba(75,166,234,0.18)' : '#f3f4f6',
                color: active ? BRAND : FAINT,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** iOS-style switch, same geometry as the one on Staff Permissions. */
export const Toggle: React.FC<{
  checked: boolean;
  busy?: boolean;
  ariaLabel: string;
  onChange: (next: boolean) => void;
}> = ({ checked, busy, ariaLabel, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={busy}
    onClick={() => onChange(!checked)}
    style={{
      position: 'relative', width: 40, height: 23, borderRadius: 12,
      border: 'none', flexShrink: 0,
      background: checked ? BRAND : '#d1d5db',
      cursor: busy ? 'wait' : 'pointer',
      opacity: busy ? 0.6 : 1,
      transition: 'background 160ms ease',
    }}
  >
    <span style={{
      position: 'absolute', top: 3, left: checked ? 20 : 3,
      width: 17, height: 17, borderRadius: '50%', background: '#fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      transition: 'left 160ms ease',
    }} />
  </button>
);

export const EmptyState: React.FC<{ title: string; description: string; action?: React.ReactNode }> = ({
  title, description, action,
}) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: '56px 24px', textAlign: 'center',
  }}>
    <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{title}</div>
    <div style={{ fontSize: 13, color: MUTED, maxWidth: 420, lineHeight: 1.6 }}>{description}</div>
    {action}
  </div>
);

export const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div style={{
    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 12, padding: '12px 16px', marginBottom: 20,
    display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: '#ef4444',
  }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
    {message}
  </div>
);

export const Toast: React.FC<{ message: string; kind: 'success' | 'error' }> = ({ message, kind }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 4000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: kind === 'success' ? INK : '#fff1f2',
      color: kind === 'success' ? '#fff' : '#ef4444',
      border: kind === 'error' ? '1px solid #fecaca' : 'none',
      borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)', animation: 'nToastUp 200ms ease',
      maxWidth: 'calc(100vw - 56px)',
    }}>
      {kind === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#16a34a" /><path d="M7 12l4 4 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v5M12 16h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" /></svg>}
      {message}
      <style>{`@keyframes nToastUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>,
    document.body,
  );

export const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ title, onClose, children, footer, wide }) =>
  ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3500,
        background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, width: '100%',
          maxWidth: wide ? 760 : 520, maxHeight: 'calc(100vh - 40px)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
          animation: 'nModalIn 180ms ease',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '18px 22px', borderBottom: `1px solid ${LINE}`,
        }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: INK, letterSpacing: '-0.2px' }}>
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none', background: 'none', cursor: 'pointer', color: FAINT,
              display: 'flex', padding: 4,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1 }}>{children}</div>

        {footer && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            padding: '14px 22px', borderTop: `1px solid ${LINE}`,
          }}>
            {footer}
          </div>
        )}

        <style>{`@keyframes nModalIn { from { opacity: 0; transform: translateY(14px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
      </div>
    </div>,
    document.body,
  );
