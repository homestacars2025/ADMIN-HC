import React, { useState } from 'react';
import { Button, Sheet, SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Spinner } from '../media/MediaUI';

/** A destructive step that has to say why. It stays open if the save fails. */
export const ReasonSheet: React.FC<{
  title: string;
  description: string;
  label: string;
  confirmLabel: string;
  /** For a step that isn't destructive and can go ahead without a word. */
  optional?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}> = ({ title, description, label, confirmLabel, optional = false, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!optional && !reason.trim()) { setError('A reason is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Try again.');
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} ariaLabel={title} maxWidthClass="sm:max-w-[440px]">
      <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <label className="block text-[13px] font-medium text-foreground">
            {label}
            <textarea
              autoFocus
              value={reason}
              rows={4}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1.5 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2 text-[14px] font-normal outline-none focus:border-[#6EA4E7] focus:ring-[3px] focus:ring-[#6EA4E7]/25"
            />
          </label>
          {error && <p role="alert" className="text-[13px] text-[#B91C1C]">{error}</p>}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" size="lg" className="!h-11 md:!h-10" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={optional ? 'default' : 'danger'} size="lg" className="!h-11 md:!h-10" disabled={saving}>
            {saving && <Spinner size={13} />} {confirmLabel}
          </Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
};
