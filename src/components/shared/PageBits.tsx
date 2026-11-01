import React from 'react';
import { Check, Search } from '../media/MediaIcons';
import { cn } from '../../lib/media/badgeColor';

export const PageHeader: React.FC<{
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, action }) => (
  <header className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
    <div className="min-w-0">
      <p className="text-[12.5px] text-black/45">{eyebrow}</p>
      <h1 className="mt-1 text-[22px] font-medium tracking-[-0.022em] text-foreground sm:text-[26px]">{title}</h1>
      <p className="mt-1 text-[13.5px] text-black/50">{subtitle}</p>
    </div>
    {action}
  </header>
);

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  color?: string;
}

/** One line that scrolls sideways on a phone, rather than wrapping into a block. */
export function FilterChips<T extends string>({ value, options, onChange, ariaLabel }: {
  value: T;
  options: ReadonlyArray<ChipOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9',
              active ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.1] text-brand-strong' : 'border-subtle bg-surface text-black/60 hover:bg-black/[0.03]',
            )}
          >
            {option.icon && <span style={{ color: option.color }} className="flex shrink-0">{option.icon}</span>}
            {option.label}
            {option.count !== undefined && <span className="tabular-nums opacity-60">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export const SearchField: React.FC<{ value: string; onChange: (value: string) => void; placeholder: string; className?: string }> = ({ value, onChange, placeholder, className }) => (
  <div className={cn('relative min-w-0', className)}>
    <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-black/35" />
    <input
      type="search"
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-11 w-full rounded-[10px] border border-[#E5E7EB] bg-white pe-3 ps-9 text-[14px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-black/35 focus:border-[#6EA4E7] focus:ring-[3px] focus:ring-[#6EA4E7]/25 md:h-10"
    />
  </div>
);

export interface TimelineStep {
  label: string;
  detail?: React.ReactNode;
  done: boolean;
}

export const Timeline: React.FC<{ steps: TimelineStep[] }> = ({ steps }) => (
  <ol>
    {steps.map((step, index) => (
      <li key={step.label} className="flex gap-3">
        <span className="flex flex-col items-center">
          <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full text-white', step.done ? 'bg-[#6EA4E7]' : 'border-2 border-black/15 bg-white')}>
            {step.done && <Check size={13} strokeWidth={3} />}
          </span>
          {index < steps.length - 1 && <span className={cn('my-0.5 w-0.5 flex-1', step.done ? 'bg-[#6EA4E7]/40' : 'bg-black/[0.08]')} />}
        </span>
        <span className={cn('min-w-0 pb-4', index === steps.length - 1 && 'pb-0')}>
          <span className={cn('block text-[13.5px] font-medium', step.done ? 'text-foreground' : 'text-black/45')}>{step.label}</span>
          {step.detail && <span className="block text-[12.5px] tabular-nums text-black/50">{step.detail}</span>}
        </span>
      </li>
    ))}
  </ol>
);

export const DetailRow: React.FC<{ label: string; children: React.ReactNode; span?: boolean }> = ({ label, children, span }) => (
  <div className={cn('min-w-0', span && 'sm:col-span-2')}>
    <dt className="text-[12px] text-black/45">{label}</dt>
    <dd className="mt-0.5 break-words text-[13.5px] text-foreground">{children}</dd>
  </div>
);

export const SkeletonRows: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <ul aria-hidden="true">
    {Array.from({ length: count }).map((_, index) => (
      <li key={index} className="flex items-center gap-3 border-b border-subtle px-4 py-4 last:border-b-0">
        <span className="h-5 w-24 animate-pulse rounded-md bg-black/[0.06]" />
        <span className="h-4 flex-1 animate-pulse rounded-md bg-black/[0.05]" />
        <span className="h-4 w-20 animate-pulse rounded-md bg-black/[0.05]" />
      </li>
    ))}
  </ul>
);

export const LoadError: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13px] text-red-700">
    <span className="min-w-0 flex-1 break-words">{message}</span>
    <button type="button" onClick={onRetry} className="min-h-[44px] rounded-lg border border-subtle bg-surface px-4 font-medium text-foreground">Try again</button>
  </div>
);
