import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { ConfirmDialog, type ConfirmState } from '../../components/media/ConfirmDialog';
import { toast } from '../../components/media/MediaToast';
import { Button, Spinner, Textarea } from '../../components/media/MediaUI';
import { customerName, setCustomerBan, type Customer } from '../../lib/customers';

const BanDialog: React.FC<{ customer: Customer; onClose: () => void; onChanged: () => void }> = ({ customer, onClose, onChanged }) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = customerName(customer);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = reason.trim();
    if (!text) { setError('A reason is required to ban a customer.'); return; }
    setSaving(true);
    setError(null);
    try {
      await setCustomerBan(customer.id, true, text);
      toast.success(`${name} is banned`);
      onChanged();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not ban this customer.');
      setSaving(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="media-scope fixed inset-0 z-[10003] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={() => { if (!saving) onClose(); }} />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`Ban ${name}`}
        onSubmit={onSubmit}
        noValidate
        className="relative w-full max-w-[420px] rounded-2xl bg-white p-5 shadow-[0_24px_64px_-16px_rgb(0_0_0/0.3)] sm:p-6"
      >
        <h2 className="text-[15px] font-semibold tracking-[-0.014em] text-foreground">Ban {name}?</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-black/55">
          They won't be able to book, and neither will anyone with the same ID number or phone.
        </p>
        <label htmlFor="ban-reason" className="mt-4 block text-[13px] font-medium text-foreground">Reason</label>
        <Textarea
          id="ban-reason"
          autoFocus
          rows={3}
          value={reason}
          onChange={(event) => { setReason(event.target.value); setError(null); }}
          aria-invalid={Boolean(error)}
          className="mt-1.5"
        />
        {error && <p role="alert" className="mt-2 text-[12.5px] text-[#B91C1C]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="lg" className="!h-11 md:!h-10" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" size="lg" className="!h-11 md:!h-10" disabled={saving}>
            {saving && <Spinner size={13} />} Ban customer
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

/** Bans an unbanned customer with a reason, or confirms lifting an existing ban. */
export const BanFlow: React.FC<{ customer: Customer | null; onClose: () => void; onChanged: () => void }> = ({
  customer,
  onClose,
  onChanged,
}) => {
  const [pending, setPending] = useState(false);

  if (!customer) return null;
  if (!customer.is_banned) return <BanDialog customer={customer} onClose={onClose} onChanged={onChanged} />;

  const name = customerName(customer);
  const state: ConfirmState = {
    title: `Remove the ban on ${name}?`,
    description: 'They will be able to book again.',
    confirmLabel: 'Remove ban',
    onConfirm: async () => {
      await setCustomerBan(customer.id, false, null);
    },
  };

  return (
    <ConfirmDialog
      state={state}
      pending={pending}
      onCancel={onClose}
      onConfirm={async () => {
        setPending(true);
        try {
          await state.onConfirm();
          toast.success(`The ban on ${name} is removed`);
          onChanged();
          onClose();
        } catch (failure) {
          toast.error(failure instanceof Error ? failure.message : 'Could not remove the ban.');
        } finally {
          setPending(false);
        }
      }}
    />
  );
};
