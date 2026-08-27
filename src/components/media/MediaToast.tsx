import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { cn } from '../../lib/media/badgeColor';
import { AlertTriangle, CheckCircle2, Info, X } from './MediaIcons';

/**
 * Top-right toasts, the section's only channel for write failures.
 *
 * Published through a module-level emitter rather than context so an action
 * helper deep in a form can raise one without every caller threading a prop.
 */

export type ToastKind = 'success' | 'error' | 'warning';

interface ToastRecord {
  id: number;
  kind: ToastKind;
  message: string;
  leaving?: boolean;
}

type Listener = (record: Omit<ToastRecord, 'leaving'>) => void;

let nextId = 1;
const listeners = new Set<Listener>();

function emit(kind: ToastKind, message: string) {
  const record = { id: nextId++, kind, message };
  listeners.forEach((listener) => listener(record));
}

export const toast = {
  success: (message: string) => emit('success', message),
  error: (message: string) => emit('error', message),
  warning: (message: string) => emit('warning', message),
};

const KIND_STYLES: Record<ToastKind, { ring: string; icon: string }> = {
  success: { ring: 'ring-emerald-500/25', icon: 'text-emerald-600' },
  error: { ring: 'ring-[#d4183d]/25', icon: 'text-[#d4183d]' },
  warning: { ring: 'ring-amber-500/30', icon: 'text-amber-600' },
};

const DURATION = 4000;

export const MediaToaster: React.FC = () => {
  const [items, setItems] = useState<ToastRecord[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>[]>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    const timeout = setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
      // The toast is gone; drop its timers so the map tracks only live ones.
      timers.current.get(id)?.forEach(clearTimeout);
      timers.current.delete(id);
    }, 160);
    timers.current.set(id, [...(timers.current.get(id) ?? []), timeout]);
  }, []);

  useEffect(() => {
    const listener: Listener = (record) => {
      setItems((prev) => [...prev, record]);
      const timeout = setTimeout(() => dismiss(record.id), DURATION);
      timers.current.set(record.id, [...(timers.current.get(record.id) ?? []), timeout]);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [dismiss]);

  // Clearing every pending timer on unmount keeps a navigation away from the
  // section from firing setState on a component that is already gone.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((list) => list.forEach(clearTimeout));
      pending.clear();
    };
  }, []);

  if (items.length === 0) return null;

  return ReactDOM.createPortal(
    <div className="pointer-events-none fixed top-4 right-4 z-[10002] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((item) => {
        const styles = KIND_STYLES[item.kind];
        const Icon =
          item.kind === 'success' ? CheckCircle2 : item.kind === 'error' ? AlertTriangle : Info;
        return (
          <div
            key={item.id}
            role="status"
            aria-live="polite"
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-xl bg-white px-3.5 py-3 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.25)] ring-1',
              styles.ring,
            )}
            style={{
              animation: `${item.leaving ? 'm-toast-out' : 'm-toast-in'} 160ms ease-out forwards`,
            }}
          >
            <Icon size={15} strokeWidth={2} className={cn('mt-px shrink-0', styles.icon)} />
            <p className="flex-1 text-[12.5px] leading-relaxed text-black/75">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="-mt-0.5 -mr-1 shrink-0 rounded-md p-1 text-black/25 transition-colors hover:bg-black/[0.05] hover:text-black/60"
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
};
