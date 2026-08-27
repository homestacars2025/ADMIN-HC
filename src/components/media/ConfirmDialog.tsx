import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { cn } from '../../lib/media/badgeColor';
import { AlertTriangle } from './MediaIcons';
import { Button, Spinner } from './MediaUI';

/**
 * The section's single destructive-confirm dialog.
 *
 * Delete is admin-only at the database level, so this is the affordance the staff
 * build deliberately has none of. One component for all three tables keeps the
 * wording and the escape hatch identical wherever it appears.
 */

export interface ConfirmState {
  title: string;
  description: string;
  /** Extra line for the cases where deleting one row quietly changes another. */
  consequence?: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

export const ConfirmDialog: React.FC<{
  state: ConfirmState | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ state, pending, onCancel, onConfirm }) => {
  useEffect(() => {
    if (!state) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [state, pending, onCancel]);

  if (!state) return null;

  return ReactDOM.createPortal(
    <div className="media-scope fixed inset-0 z-[10003] flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
        style={{ animation: 'm-fade-in 150ms ease-out' }}
        onClick={() => !pending && onCancel()}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={state.title}
        className="relative w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-[0_24px_64px_-16px_rgb(0_0_0/0.3)]"
        style={{ animation: 'm-pop-in 160ms ease-out' }}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#d4183d]/[0.09]">
          <AlertTriangle size={20} strokeWidth={1.75} className="text-[#d4183d]" />
        </div>

        <p className="mt-4 text-[15px] font-semibold tracking-[-0.014em] text-black/85">
          {state.title}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-black/50">{state.description}</p>

        {state.consequence && (
          <p className="mt-3 rounded-xl bg-amber-500/[0.06] px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900/75 ring-1 ring-amber-500/[0.12]">
            {state.consequence}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" size="lg" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            size="lg"
            onClick={onConfirm}
            disabled={pending}
            className={cn('bg-[#d4183d] text-white hover:bg-[#b21334]')}
          >
            {pending && <Spinner size={13} />}
            {pending ? 'Deleting…' : state.confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
