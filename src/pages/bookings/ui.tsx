import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ConfirmDialog, type ConfirmState } from '../../components/media/ConfirmDialog';
import { AlertTriangle, ChevronDown, X } from '../../components/media/MediaIcons';
import { Button, Spinner } from '../../components/media/MediaUI';
import { formatRate, parseAmount, toTry, type BookingCurrency } from '../../lib/bookingForm';
import { formatLira } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';

export const INPUT =
  'h-11 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-black/35 focus:border-[#6EA4E7] focus:ring-[3px] focus:ring-[#6EA4E7]/25 md:h-10';

export const FOOTER_BUTTON = '!h-11 min-w-0 md:!h-10';

// ── Sheet ────────────────────────────────────────────────────────────────────

const DISCARD: Omit<ConfirmState, 'onConfirm'> = {
  title: 'Discard your changes?',
  description: "What you've entered here won't be saved.",
  confirmLabel: 'Discard',
};

/**
 * The shell of all four booking flows: a right-side sheet on desktop and full
 * screen on phones. The header and footer stay put while the body scrolls.
 */
export const BookingSheet: React.FC<{
  label: string;
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  stepper?: React.ReactNode;
  summary?: React.ReactNode;
  dirty: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  footer: (requestClose: () => void) => React.ReactNode;
  children: React.ReactNode;
}> = ({ label, title, subtitle, badge, stepper, summary, dirty, saving, onClose, onSubmit, footer, children }) => {
  const [confirming, setConfirming] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty) setConfirming(true);
    else onClose();
  }, [dirty, onClose, saving]);

  useEffect(() => {
    panelRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    if (confirming) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirming, requestClose]);

  return ReactDOM.createPortal(
    <div className="media-scope fixed inset-0 z-[1000]">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" style={{ animation: 'm-fade-in 150ms ease-out' }} onClick={requestClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-[#F8F9FB] shadow-lg outline-none sm:max-w-[640px]"
        style={{ animation: 'm-sheet-in 200ms ease-in-out' }}
      >
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-subtle bg-surface px-4 pb-3 pt-3.5 sm:px-6 sm:pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-foreground">{title}</h2>
                  {badge}
                </div>
                {subtitle && <div className="mt-0.5 truncate text-[12.5px] text-black/50">{subtitle}</div>}
              </div>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-black/45 transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9 md:w-9"
              >
                <X size={16} />
              </button>
            </div>
            {stepper}
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>

          {summary}

          <footer className="shrink-0 border-t border-subtle bg-surface px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-6">
            {footer(requestClose)}
          </footer>
        </form>
      </div>

      <ConfirmDialog
        state={confirming ? { ...DISCARD, onConfirm: async () => undefined } : null}
        pending={false}
        onCancel={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); onClose(); }}
      />
    </div>,
    document.body,
  );
};

export const PrimaryButton: React.FC<{ saving: boolean; disabled?: boolean; children: React.ReactNode; onClick?: () => void; type?: 'submit' | 'button' }> = ({
  saving,
  disabled,
  children,
  onClick,
  type = 'submit',
}) => (
  <Button type={type} size="lg" className={cn(FOOTER_BUTTON, 'flex-1 px-4 sm:flex-none')} disabled={saving || disabled} onClick={onClick}>
    {saving && <Spinner size={13} />} {children}
  </Button>
);

// ── Sections ─────────────────────────────────────────────────────────────────

export const FormCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, title, action, children }) => (
  <section className="surface-depth rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
    <div className="mb-3.5 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#6EA4E7]/[0.14] text-brand-strong">{icon}</span>
        <h3 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
      </div>
      {action}
    </div>
    <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">{children}</div>
  </section>
);

export const Field: React.FC<{
  label: string;
  required?: boolean;
  changed?: boolean;
  span?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}> = ({ label, required, changed, span, hint, error, children }) => (
  <div className={cn('min-w-0', span && 'sm:col-span-2')} data-field-error={error ? 'true' : undefined}>
    <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-black/65">
      <span>{label}{required && <span className="ms-0.5 text-[#DC2626]">*</span>}</span>
      {changed && <span title="Changed" aria-label="Changed" className="h-1.5 w-1.5 rounded-full bg-[#6EA4E7]" />}
    </div>
    {children}
    {error && <p role="alert" className="mt-1 text-[12px] text-[#B91C1C]">{error}</p>}
    {!error && hint && <div className="mt-1 text-[12px] text-black/45">{hint}</div>}
  </div>
);

export const Notice: React.FC<{ tone: 'red' | 'amber' | 'blue'; children: React.ReactNode; span?: boolean }> = ({ tone, children, span }) => (
  <div
    role={tone === 'red' ? 'alert' : undefined}
    className={cn(
      'flex items-start gap-2 rounded-[10px] border px-3 py-2 text-[12.5px] leading-snug',
      tone === 'red' && 'border-[#DC2626]/25 bg-[#DC2626]/[0.06] text-[#B91C1C]',
      tone === 'amber' && 'border-[#F59E0B]/35 bg-[#F59E0B]/[0.08] text-[#92400E]',
      tone === 'blue' && 'border-[#6EA4E7]/30 bg-[#6EA4E7]/[0.08] text-brand-strong',
      span && 'sm:col-span-2',
    )}
  >
    {tone !== 'blue' && <AlertTriangle size={13} className="mt-px shrink-0" />}
    <div className="min-w-0">{children}</div>
  </div>
);

export const SelectedRow: React.FC<{ children: React.ReactNode; action: string; onAction: () => void }> = ({ children, action, onAction }) => (
  <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[#6EA4E7]/30 bg-[#6EA4E7]/[0.06] py-1 pe-1 ps-3 sm:col-span-2">
    <div className="min-w-0 text-[13px] text-foreground">{children}</div>
    <button type="button" onClick={onAction} className="h-11 shrink-0 rounded-lg px-2.5 text-[12.5px] font-semibold text-brand-strong hover:bg-[#6EA4E7]/[0.12] md:h-9">
      {action}
    </button>
  </div>
);

// ── Plate ────────────────────────────────────────────────────────────────────

/** A small Turkish number plate: white, thin border, blue TR strip. */
export const LicensePlate: React.FC<{ plate: string | null | undefined; className?: string }> = ({ plate, className }) => (
  <span className={cn('inline-flex shrink-0 items-stretch overflow-hidden rounded-[4px] border border-black/25 bg-white leading-none', className)}>
    <span aria-hidden="true" className="flex items-end bg-[#1D4ED8] px-[3px] pb-[2px] text-[7px] font-bold text-white">TR</span>
    <span className="whitespace-nowrap px-1.5 py-[3px] font-mono text-[12px] font-semibold tabular-nums tracking-[0.02em] text-[#0F1117]">{plate ?? '—'}</span>
  </span>
);

// ── Choices ──────────────────────────────────────────────────────────────────

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-[10px] bg-black/[0.05] p-0.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-11 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 disabled:opacity-40 md:h-9',
            option.value === value ? 'bg-surface text-foreground shadow-sm' : 'text-black/50',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── Money ────────────────────────────────────────────────────────────────────

const CURRENCIES: ReadonlyArray<{ value: BookingCurrency; label: string }> = [
  { value: 'TRY', label: '₺ TRY' },
  { value: 'USD', label: '$ USD' },
];

export const CurrencySwitch: React.FC<{ value: BookingCurrency; rate: number | null | undefined; onChange: (value: BookingCurrency) => void }> = ({ value, rate, onChange }) => (
  <Segmented
    ariaLabel="Currency"
    value={value}
    onChange={onChange}
    options={CURRENCIES.map((option) => ({ ...option, disabled: option.value === 'USD' && !rate && value !== 'USD' }))}
  />
);

export const ConversionHint: React.FC<{ value: string; currency: BookingCurrency; rate: number | null | undefined }> = ({ value, currency, rate }) => {
  const amount = parseAmount(value);
  if (currency !== 'USD' || !rate || amount <= 0) return null;
  return <>= {formatLira(toTry(amount, 'USD', rate))} (today's rate {formatRate(rate)})</>;
};

export const MoneyField: React.FC<{
  label: string;
  value: string;
  currency: BookingCurrency;
  rate: number | null | undefined;
  onChange: (value: string) => void;
  onCurrency?: (value: BookingCurrency) => void;
  required?: boolean;
  changed?: boolean;
  span?: boolean;
  error?: string | null;
}> = ({ label, value, currency, rate, onChange, onCurrency, required, changed, span, error }) => (
  <Field
    label={label}
    required={required}
    changed={changed}
    span={span}
    error={error}
    hint={<ConversionHint value={value} currency={currency} rate={rate} />}
  >
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[14px] text-black/40">{currency === 'USD' ? '$' : '₺'}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0.00"
          className={cn(INPUT, 'ps-7 tabular-nums')}
        />
      </div>
      {onCurrency && <CurrencySwitch value={currency} rate={rate} onChange={onCurrency} />}
    </div>
  </Field>
);

// ── Fuel ─────────────────────────────────────────────────────────────────────

const FUEL_MARKS = ['E', '¼', '½', '¾', 'F'];

/**
 * A 0–100 slider. A saved value the slider can't show (above 100, or free text
 * like "3/4") stays exactly as it is unless someone moves the handle.
 */
export const FuelSlider: React.FC<{
  label: string;
  value: string;
  percent: number | null;
  onChange: (value: string) => void;
  changed?: boolean;
}> = ({ label, value, percent, onChange, changed }) => {
  const recorded = value.trim() !== '';
  return (
    <Field label={label} changed={changed} span>
      <div className="rounded-[10px] border border-[#E5E7EB] bg-white px-3 pb-2 pt-2.5">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className={cn('font-medium tabular-nums', recorded ? 'text-foreground' : 'text-black/40')}>
            {!recorded ? 'Not recorded' : percent === null ? `Saved as ${value}` : `${percent}%`}
          </span>
          {recorded && (
            <button type="button" onClick={() => onChange('')} className="h-11 rounded-md px-1.5 text-[12px] font-medium text-black/45 hover:text-foreground md:h-8">
              Clear
            </button>
          )}
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          aria-label={label}
          aria-valuetext={recorded ? `${percent ?? value}` : 'Not recorded'}
          value={percent ?? (recorded ? 100 : 0)}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 h-7 w-full cursor-pointer accent-[#6EA4E7]"
        />
        <div aria-hidden="true" className="flex justify-between px-0.5 text-[11px] text-black/40">
          {FUEL_MARKS.map((mark) => <span key={mark}>{mark}</span>)}
        </div>
      </div>
    </Field>
  );
};

// ── Summary ──────────────────────────────────────────────────────────────────

export interface SummaryItem {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}

/** Sticks above the footer. It's open on desktop and folds to one line on phones. */
export const SummaryBar: React.FC<{ headline: React.ReactNode; items: SummaryItem[] }> = ({ headline, items }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0 border-t border-subtle bg-surface px-4 py-0.5 sm:px-6 sm:py-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left sm:hidden"
      >
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-foreground">{headline}</span>
        <ChevronDown size={14} className={cn('shrink-0 text-black/40 transition-transform', open && 'rotate-180')} />
      </button>
      <dl className={cn('grid-cols-2 gap-x-4 gap-y-1 pt-1.5 sm:grid sm:grid-cols-4 sm:pt-0', open ? 'grid' : 'hidden')}>
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="truncate text-[11px] text-black/45">{item.label}</dt>
            <dd className={cn('truncate text-[12.5px] tabular-nums text-foreground', item.strong && 'font-semibold')}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

/** The running total in the footer, until the amounts are entered on Review. */
export const FooterTotal: React.FC<{ amount: number }> = ({ amount }) => (
  <div className="min-w-0 flex-1">
    <div className="text-[11px] leading-tight text-black/45">Total</div>
    <div className="truncate text-[15px] font-semibold tabular-nums tracking-[-0.01em] text-foreground">
      {amount > 0 ? formatLira(amount) : <span className="text-[12.5px] font-medium text-black/55">Set in Review</span>}
    </div>
  </div>
);

// ── Stepper ──────────────────────────────────────────────────────────────────

export const Stepper: React.FC<{
  steps: ReadonlyArray<{ key: string; label: string }>;
  current: number;
  reached: number;
  onJump: (index: number) => void;
}> = ({ steps, current, reached, onJump }) => (
  <ol className="mt-3 flex items-center gap-1" aria-label="Booking steps">
    {steps.map((step, index) => {
      const done = index < current;
      const active = index === current;
      return (
        <li key={step.key} className="min-w-0 flex-1">
          <button
            type="button"
            disabled={index > reached}
            aria-current={active ? 'step' : undefined}
            onClick={() => onJump(index)}
            className="group flex min-h-[44px] w-full flex-col justify-center gap-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 disabled:cursor-default md:min-h-[36px]"
          >
            <span className={cn('h-1 w-full rounded-full transition-colors', done || active ? 'bg-[#6EA4E7]' : 'bg-black/[0.08]')} />
            <span className={cn(
              'truncate text-[11.5px] leading-tight',
              active ? 'font-semibold text-foreground' : done ? 'text-black/60' : 'text-black/35',
              !active && 'max-sm:hidden',
            )}>
              {index + 1}. {step.label}
            </span>
          </button>
        </li>
      );
    })}
  </ol>
);
