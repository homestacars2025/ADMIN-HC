import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import ReactDOM from 'react-dom';
import { cn } from '../../lib/media/badgeColor';
import { ChevronDown, Loader2, X } from './MediaIcons';

/**
 * The section's UI primitives.
 *
 * The spec builds on shadcn/@base-ui — a Next.js-only stack. These are the same
 * components rebuilt on plain React portals so the geometry, focus rings and
 * motion in the spec transfer verbatim to this CRA app.
 */

const BRAND = '#6ea4e7';

// ── Button ────────────────────────────────────────────────────────────────────

type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';

const BUTTON_BASE =
  'inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none ' +
  'focus-visible:border-[#6ea4e7] focus-visible:ring-[3px] focus-visible:ring-[#6ea4e7]/50 ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-[#6ea4e7] text-white hover:bg-[#2c7adc]',
  outline: 'border-[#e2ded4] bg-white text-[#0e0e10] hover:bg-[#f2eee6]',
  secondary: 'bg-[#f0f2f5] text-[#0e0e10] hover:bg-[#e7eaef]',
  ghost: 'hover:bg-[#f2eee6] hover:text-[#0e0e10]',
  destructive: 'bg-[#d4183d]/10 text-[#d4183d] hover:bg-[#d4183d]/20',
  link: 'text-[#6ea4e7] underline-offset-4 hover:underline',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  default: 'h-8 px-2.5 gap-1.5',
  xs: 'h-6 px-2 gap-1',
  sm: 'h-7 px-2 gap-1.5',
  lg: 'h-9 gap-1.5 px-2.5',
  icon: 'h-8 w-8',
  'icon-xs': 'h-6 w-6',
  'icon-sm': 'h-7 w-7',
  'icon-lg': 'h-9 w-9',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Trims the left padding, matching the spec's `data-icon="inline-start"` rule. */
  iconStart?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'default', iconStart, className, type, ...rest }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        iconStart && 'pl-2',
        className,
      )}
      {...rest}
    />
  ),
);
Button.displayName = 'Button';

// ── Input / Textarea / Label ──────────────────────────────────────────────────

const FIELD_BASE =
  'w-full rounded-lg border border-[#e2ded4] bg-white px-3 text-[#0e0e10] outline-none transition-colors ' +
  'placeholder:text-black/30 focus-visible:border-[#6ea4e7] focus-visible:ring-[3px] focus-visible:ring-[#6ea4e7]/20 ' +
  'disabled:opacity-50';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={cn(FIELD_BASE, 'h-9 text-[13px]', className)} {...rest} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(FIELD_BASE, 'py-2 text-[13px] leading-relaxed', className)}
    {...rest}
  />
));
Textarea.displayName = 'Textarea';

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({
  className,
  children,
  ...rest
}) => (
  <label className={cn('text-[13px] font-medium text-black/70', className)} {...rest}>
    {children}
  </label>
);

export const RequiredMark: React.FC = () => (
  <span className="text-[#d4183d]" aria-hidden="true">
    {' '}
    *
  </span>
);

export const Skeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({
  className,
  style,
}) => <div className={cn('animate-pulse rounded-md bg-[#f2eee6]', className)} style={style} />;

export const Spinner: React.FC<{ size?: number; className?: string }> = ({
  size = 12,
  className,
}) => <Loader2 size={size} strokeWidth={2} className={cn('m-spin', className)} />;

// ── Popup positioning ─────────────────────────────────────────────────────────

interface Anchor {
  top: number;
  left: number;
  width: number;
}

/**
 * Places a popup under its trigger in viewport coordinates, flipping above when
 * it would overflow the bottom edge. Recomputed on scroll and resize so a popup
 * over a scrolling table never detaches from the control that opened it.
 */
function useAnchor(
  triggerRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  popupRef: React.RefObject<HTMLElement | null>,
  align: 'start' | 'end' = 'start',
  minWidth?: number,
): Anchor | null {
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const popupHeight = popupRef.current?.offsetHeight ?? 0;
    const width = Math.max(rect.width, minWidth ?? 0);

    let top = rect.bottom + 4;
    if (popupHeight && top + popupHeight > window.innerHeight - 8) {
      const above = rect.top - popupHeight - 4;
      if (above > 8) top = above;
      else top = Math.max(8, window.innerHeight - popupHeight - 8);
    }

    let left = align === 'end' ? rect.right - width : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

    setAnchor({ top, left, width });
  }, [triggerRef, popupRef, align, minWidth]);

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  return anchor;
}

/** Closes on outside pointerdown and on Escape. */
function useDismiss(
  open: boolean,
  onClose: () => void,
  refs: Array<React.RefObject<HTMLElement | null>>,
) {
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);
}

const POPUP_CLASS =
  'fixed z-[10000] overflow-y-auto rounded-lg bg-white p-1 shadow-md ring-1 ring-black/10';

// ── Select ────────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  /** Rendered as a leading dot when present. */
  color?: string | null;
  /** Tailwind classes for a tone dot, when the option carries a static tone. */
  dotClass?: string;
  muted?: boolean;
}

export interface SelectProps {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  /** Trigger height: `sm` → h-7, `default` → h-8, `lg` → h-9. */
  size?: 'sm' | 'default' | 'lg';
  placeholderMuted?: boolean;
  minWidth?: number;
}

const SELECT_TRIGGER_BASE =
  'flex w-full items-center justify-between gap-1.5 rounded-lg border bg-transparent py-2 pr-2 pl-2.5 ' +
  'whitespace-nowrap transition-colors outline-none select-none ' +
  'focus-visible:border-[#6ea4e7] focus-visible:ring-[3px] focus-visible:ring-[#6ea4e7]/20 disabled:opacity-50';

export const Select: React.FC<SelectProps> = ({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  className,
  size = 'default',
  minWidth,
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const anchor = useAnchor(triggerRef, open, popupRef, 'start', minWidth);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, [triggerRef, popupRef]);

  const selected = options.find((o) => o.value === value);
  const heights = { sm: 'h-7', default: 'h-8', lg: 'h-9' };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(SELECT_TRIGGER_BASE, heights[size], className)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.color !== undefined && selected.color !== null && (
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: selected.color }}
            />
          )}
          {selected?.dotClass && (
            <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', selected.dotClass)} />
          )}
          <span className="truncate">{selected?.label ?? ''}</span>
        </span>
        <ChevronDown size={13} strokeWidth={2} className="shrink-0 opacity-50" />
      </button>

      {open &&
        anchor &&
        ReactDOM.createPortal(
          <div
            ref={popupRef}
            role="listbox"
            aria-label={ariaLabel}
            className={POPUP_CLASS}
            style={{
              top: anchor.top,
              left: anchor.left,
              minWidth: anchor.width,
              maxHeight: 'min(320px, 60vh)',
              animation: 'm-pop-in 100ms ease-out',
            }}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] transition-colors hover:bg-[#f2eee6]',
                  option.value === value ? 'font-medium text-[#0e0e10]' : 'text-black/70',
                  option.muted && 'text-black/45',
                )}
              >
                {option.color !== undefined && option.color !== null && (
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: option.color }}
                  />
                )}
                {option.dotClass && (
                  <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', option.dotClass)} />
                )}
                <span className="truncate">{option.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
};

// ── DropdownMenu ──────────────────────────────────────────────────────────────

export interface DropdownItem {
  key: string;
  label: string;
  dotClass?: string;
  muted?: boolean;
  onSelect: () => void;
}

export interface DropdownMenuProps {
  items: readonly DropdownItem[];
  ariaLabel: string;
  disabled?: boolean;
  align?: 'start' | 'end';
  minWidth?: number;
  /** Rendered as the trigger; receives the open state so it can style itself. */
  children: (props: { open: boolean }) => React.ReactNode;
  triggerClassName?: string;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  items,
  ariaLabel,
  disabled,
  align = 'start',
  minWidth = 172,
  children,
  triggerClassName,
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const anchor = useAnchor(triggerRef, open, popupRef, align, minWidth);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, [triggerRef, popupRef]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {children({ open })}
      </button>

      {open &&
        anchor &&
        ReactDOM.createPortal(
          <div
            ref={popupRef}
            role="menu"
            aria-label={ariaLabel}
            className={POPUP_CLASS}
            style={{
              top: anchor.top,
              left: anchor.left,
              minWidth: Math.max(anchor.width, minWidth),
              maxHeight: 'min(320px, 60vh)',
              animation: 'm-pop-in 100ms ease-out',
            }}
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] transition-colors hover:bg-[#f2eee6]',
                  item.muted ? 'text-black/45' : 'text-black/75',
                )}
              >
                {item.dotClass && (
                  <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', item.dotClass)} />
                )}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
};

// ── Tooltip ───────────────────────────────────────────────────────────────────

export const Tooltip: React.FC<{ content: React.ReactNode; children: React.ReactNode }> = ({
  content,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 });
  }, [open]);

  return (
    <>
      <span
        ref={wrapRef}
        className="inline-flex"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {open &&
        pos &&
        ReactDOM.createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[10001] -translate-x-1/2 -translate-y-full rounded-md bg-[#0e0e10] px-3 py-1.5 text-xs text-white shadow-md"
            style={{ top: pos.top, left: pos.left, animation: 'm-fade-in 120ms ease-out' }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
};

// ── Switch ────────────────────────────────────────────────────────────────────

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Tailwind background for the checked track. Defaults to the brand colour. */
  activeClass?: string;
  className?: string;
}

/**
 * The admin's Posted control. Deliberately a real switch: unlike the staff build,
 * an admin write here is allowed, so the affordance matches what the database
 * will actually accept.
 */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  ariaLabel,
  disabled,
  activeClass = 'bg-emerald-500',
  className,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full border border-transparent transition-colors duration-150 outline-none',
      'focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40 focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-60',
      checked ? activeClass : 'bg-black/[0.14]',
      className,
    )}
  >
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-150',
        checked ? 'translate-x-[16px]' : 'translate-x-[2px]',
      )}
    />
  </button>
);

// ── Sheet ─────────────────────────────────────────────────────────────────────

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** `sm:max-w-[480px]` for ideas/influencers, `[520px]` for posts. */
  maxWidthClass?: string;
  children: React.ReactNode;
  ariaLabel: string;
}

/**
 * A right-anchored drawer. Full-width below `sm`, capped at the per-sheet max
 * above it, exactly as the spec's `w-full … sm:max-w-[480px]` produces.
 */
export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  maxWidthClass = 'sm:max-w-[480px]',
  children,
  ariaLabel,
}) => {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="media-scope fixed inset-0 z-[9998]">
      <div
        className="absolute inset-0 bg-black/10 backdrop-blur-[2px]"
        style={{ animation: 'm-fade-in 150ms ease-out' }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn(
          'absolute inset-y-0 right-0 flex h-full w-full flex-col border-l border-[#e2ded4] bg-white bg-clip-padding shadow-lg',
          maxWidthClass,
        )}
        style={{ animation: 'm-sheet-in 200ms ease-in-out' }}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 text-black/40"
          aria-label="Close"
        >
          <X size={15} strokeWidth={1.75} />
        </Button>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export const SheetHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={cn('border-b border-black/[0.06] px-6 py-5', className)}>{children}</div>
);

export const SheetTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-[16px] font-medium tracking-[-0.014em] text-[#0e0e10]">{children}</h2>
);

export const SheetDescription: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-0.5 text-[13px] text-black/45">{children}</p>
);

export const SheetBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">{children}</div>
);

export const SheetFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-auto flex flex-row items-center justify-end gap-2 border-t border-black/[0.06] px-6 py-4">
    {children}
  </div>
);

/** Label + control pair with the spec's `gap-1.5` rhythm. */
export const Field: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ label, children, className }) => (
  <div className={cn('flex flex-col gap-1.5', className)}>
    <Label>{label}</Label>
    {children}
  </div>
);

export { BRAND };
