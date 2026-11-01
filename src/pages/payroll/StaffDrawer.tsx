import React, { useCallback, useEffect, useState } from 'react';
import { toast } from '../../components/media/MediaToast';
import {
  Button,
  Field,
  Input,
  Sheet,
  SheetBody,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '../../components/media/MediaUI';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { cn } from '../../lib/media/badgeColor';
import {
  addEntry,
  fetchStaffEntries,
  formatTry,
  monthLabel,
  receiptLink,
  signedAmount,
  uploadReceipt,
  voidEntry,
  type EntryType,
  type ManualEntryType,
  type PayrollStaff,
  type WalletEntry,
} from '../../lib/payroll';

const RECEIPT_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export const TYPE_CHIPS: Record<EntryType, { label: string; className: string }> = {
  salary: { label: 'Salary', className: 'bg-emerald-500/10 text-emerald-700' },
  bonus: { label: 'Bonus', className: 'bg-violet-500/10 text-violet-700' },
  advance: { label: 'Advance', className: 'bg-amber-500/10 text-amber-700' },
  deduction: { label: 'Deduction', className: 'bg-red-500/10 text-red-600' },
  payout: { label: 'Payout', className: 'bg-brand-strong/10 text-brand-strong' },
};

const MANUAL_TYPES: ManualEntryType[] = ['bonus', 'advance', 'deduction', 'payout'];
const FIELD_CLASS = 'h-11 w-full rounded-lg border border-input bg-surface px-2.5 text-[13.5px] text-foreground md:h-9';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function displayName(staff: PayrollStaff): string {
  return staff.full_name?.trim() || staff.email || 'Unnamed employee';
}

const EntryRow: React.FC<{ entry: WalletEntry; onVoided: () => void }> = ({ entry, onVoided }) => {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const voided = entry.voided_at !== null;
  const signed = signedAmount(entry);
  const chip = TYPE_CHIPS[entry.entry_type];

  const submitVoid = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await voidEntry(entry.id, reason.trim());
      toast.success('Entry voided');
      setVoiding(false);
      onVoided();
    } catch (error) {
      toast.error(`Couldn't void: ${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const openReceipt = async () => {
    // Opened first: a window opened after an await counts as a pop-up.
    const tab = window.open('', '_blank');
    try {
      const url = await receiptLink(entry.receipt_url as string);
      if (tab) tab.location.href = url;
    } catch (error) {
      tab?.close();
      toast.error(`Couldn't open the receipt: ${errorText(error)}`);
    }
  };

  return (
    <li className="border-b border-subtle py-3 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <span className={cn('inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium', chip.className, voided && 'opacity-50')}>
          {chip.label}
        </span>
        <span className={cn('min-w-0 flex-1 truncate text-[12.5px] text-black/55', voided && 'line-through')}>
          {monthLabel(entry.month)}
        </span>
        <span
          className={cn(
            'shrink-0 font-mono text-[13.5px] font-semibold tabular-nums',
            voided ? 'text-black/35 line-through' : signed >= 0 ? 'text-emerald-700' : 'text-red-600',
          )}
        >
          {signed >= 0 ? '+' : '−'}{formatTry(Math.abs(signed))}
        </span>
      </div>

      {entry.note && <p className={cn('mt-1 text-[12.5px] text-black/60', voided && 'line-through opacity-60')}>{entry.note}</p>}
      {voided && <p className="mt-1 text-[12px] text-black/45">Voided: {entry.void_reason}</p>}

      <div className="mt-1 flex items-center gap-3">
        {entry.receipt_url && (
          <button type="button" onClick={openReceipt} className="min-h-[32px] text-[12px] font-medium text-brand-strong hover:underline">
            Receipt
          </button>
        )}
        {!voided && !voiding && (
          <button type="button" onClick={() => setVoiding(true)} className="min-h-[32px] text-[12px] font-medium text-black/45 hover:text-red-600">
            Void
          </button>
        )}
      </div>

      {voiding && (
        <form onSubmit={submitVoid} className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason for voiding"
            aria-label="Reason for voiding"
            className="h-11 min-w-0 flex-1 md:h-9"
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="destructive"
              size="lg"
              className="!h-11 px-3 md:!h-10"
              disabled={busy || !reason.trim()}>
              {busy ? 'Voiding…' : 'Void entry'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="!h-11 px-3 md:!h-10"
              disabled={busy}
              onClick={() => setVoiding(false)}>
              Keep
            </Button>
          </div>
        </form>
      )}
    </li>
  );
};

export const StaffDrawer: React.FC<{
  staff: PayrollStaff;
  month: string;
  adminId: string;
  onClose: () => void;
  onChanged: () => void;
}> = ({ staff, month, adminId, onClose, onChanged }) => {
  const [entries, setEntries] = useState<WalletEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [type, setType] = useState<ManualEntryType>('bonus');
  const [amount, setAmount] = useState('');
  const [entryMonth, setEntryMonth] = useState(month.slice(0, 7));
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const loadEntries = useCallback(async () => {
    setLoadError(null);
    try {
      setEntries(await fetchStaffEntries(staff.id));
    } catch (error) {
      setLoadError(errorText(error));
    }
  }, [staff.id]);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setLoadError(null);
    fetchStaffEntries(staff.id)
      .then((found) => { if (!cancelled) setEntries(found); })
      .catch((error: unknown) => { if (!cancelled) setLoadError(errorText(error)); });
    return () => { cancelled = true; };
  }, [staff.id]);

  const refresh = () => {
    loadEntries();
    onChanged();
  };

  const chooseReceipt = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > MAX_RECEIPT_BYTES) {
      toast.error('The receipt must be 10 MB or smaller.');
      setFileInputKey((k) => k + 1);
      return;
    }
    setReceipt(file);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter an amount above zero.');
      return;
    }
    if (!entryMonth) {
      toast.error('Choose a month.');
      return;
    }

    setSaving(true);
    try {
      // The receipt goes first, so a failed upload can't leave an entry without it.
      const receipt_url = receipt ? await uploadReceipt(staff.id, receipt) : null;
      await addEntry({
        profile_id: staff.id,
        entry_type: type,
        amount: value,
        month: `${entryMonth}-01`,
        note: note.trim() || null,
        receipt_url,
        created_by: adminId,
      });
      toast.success(`${TYPE_CHIPS[type].label} added`);
      setAmount('');
      setNote('');
      setReceipt(null);
      setFileInputKey((k) => k + 1);
      refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} ariaLabel={`Wallet for ${displayName(staff)}`} maxWidthClass="sm:max-w-[560px]">
      <SheetHeader>
        <div className="flex items-center gap-3 pr-8">
          <StaffAvatar profile={staff} size={44} />
          <div className="min-w-0">
            <SheetTitle>{displayName(staff)}</SheetTitle>
            <SheetDescription>
              Balance <span className="font-mono tabular-nums">{formatTry(staff.balance)}</span>
              {staff.department ? ` · ${staff.department}` : ''}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <SheetBody>
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-subtle p-4">
          <h3 className="text-[13.5px] font-medium text-foreground">Add entry</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Type">
              <select value={type} onChange={(event) => setType(event.target.value as ManualEntryType)} className={FIELD_CLASS}>
                {MANUAL_TYPES.map((option) => <option key={option} value={option}>{TYPE_CHIPS[option].label}</option>)}
              </select>
            </Field>
            <Field label="Amount (₺)">
              <Input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="h-11 font-mono tabular-nums md:h-9"
              />
            </Field>
            <Field label="Month">
              <input type="month" value={entryMonth} onChange={(event) => setEntryMonth(event.target.value)} className={FIELD_CLASS} />
            </Field>
          </div>
          <Field label="Note">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
          </Field>
          <Field label="Receipt (optional)">
            <input key={fileInputKey} type="file" accept={RECEIPT_TYPES} onChange={chooseReceipt} className="min-h-[36px] text-[12.5px] text-black/60" />
          </Field>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="lg"
              disabled={saving}
              className="!h-11 px-4 hover:/90 md:!h-10">
              {saving ? 'Saving…' : 'Add entry'}
            </Button>
          </div>
        </form>

        <section>
          <h3 className="mb-1 text-[13.5px] font-medium text-foreground">History</h3>
          {loadError ? (
            <p className="py-4 text-[13px] text-red-600">Couldn't load the history: {loadError}</p>
          ) : !entries ? (
            <div className="h-24 animate-pulse rounded-xl bg-black/[0.04]" />
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-black/40">No entries yet</p>
          ) : (
            <ul>{entries.map((entry) => <EntryRow key={entry.id} entry={entry} onVoided={refresh} />)}</ul>
          )}
        </section>
      </SheetBody>
    </Sheet>
  );
};
