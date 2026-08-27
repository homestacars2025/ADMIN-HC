import { useCallback, useState } from 'react';
import type { ConfirmState } from '../../components/media/ConfirmDialog';

/**
 * Drives the shared confirm dialog: one piece of state for what is being asked,
 * one for whether the answer is in flight.
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [pending, setPending] = useState(false);

  const ask = useCallback((next: ConfirmState) => setState(next), []);

  const cancel = useCallback(() => {
    setPending(false);
    setState(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!state) return;
    setPending(true);
    try {
      await state.onConfirm();
    } finally {
      setPending(false);
      setState(null);
    }
  }, [state]);

  return { state, pending, ask, cancel, confirm };
}
