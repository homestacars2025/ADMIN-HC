import React, { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import { Check, X } from '../../components/media/MediaIcons';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button, Spinner } from '../../components/media/MediaUI';
import { TONE_CLASSES } from '../../components/shared/ComplianceBits';
import { Lightbox } from '../../components/shared/Lightbox';
import { ReasonSheet } from '../../components/shared/ReasonSheet';
import { useCurrentProfile } from '../../hooks/useCurrentProfile';
import { useCurrency } from '../../lib/CurrencyContext';
import { formatDate } from '../../lib/customers';
import {
  approveExpense,
  fetchSignatures,
  fetchSigners,
  fetchSuggestedExpenses,
  rejectExpense,
  setSignature,
  signatureMap,
  signExpense,
  suggestionChoice,
  type Posting,
  type ReconcileChoice,
  type ReviewExpense,
  type SignatureMap,
  type Signer,
} from '../../lib/expenseApprovals';
import { fetchFineCars, type FineCar } from '../../lib/fines';
import { cn } from '../../lib/media/badgeColor';
import { getAvatarProfiles, type ProfileOption } from '../../lib/notifications';
import { ReconcileSheet } from './ReconcileSheet';
import { Receipt, SignatureCell } from './StaffCustodyTab';

type Scope = 'car' | 'company';

/**
 * Waiting custody expenses for one sheet and month. They aren't on the sheet until
 * someone adds them, so `onChanged` tells it to read itself again, with the new row.
 */
export function useSuggestions(scope: Scope, month: string, onChanged: (posting: Posting | null) => void) {
  const { profile } = useCurrentProfile();
  const me = profile?.id ?? null;
  const [rows, setRows] = useState<ReviewExpense[]>([]);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [signed, setSigned] = useState<SignatureMap>(new Map());
  const [people, setPeople] = useState<Record<string, ProfileOption>>({});
  const [cars, setCars] = useState<FineCar[]>([]);
  const [editing, setEditing] = useState<ReviewExpense | null>(null);
  const [rejecting, setRejecting] = useState<ReviewExpense | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setRows([]);
    Promise.all([fetchSuggestedExpenses(scope, month), fetchSigners(), fetchSignatures(), fetchFineCars()])
      .then(async ([expenses, signerRows, signatureRows, carRows]) => {
        const profiles = await getAvatarProfiles(Array.from(new Set(expenses.map((row) => row.employee_id))));
        if (cancelled) return;
        setRows(expenses);
        setSigners(signerRows);
        setSigned(signatureMap(signatureRows));
        setCars(carRows);
        setPeople(profiles);
      })
      .catch((failure: unknown) => {
        // The sheet itself still works, so this doesn't take it down.
        if (!cancelled) toast.error(`Couldn't load the suggested expenses: ${failure instanceof Error ? failure.message : 'try again'}`);
      });
    return () => { cancelled = true; };
  }, [scope, month]);

  const leave = useCallback((id: number) => setRows((current) => current.filter((row) => row.id !== id)), []);

  /** The row leaves at once and comes back if the server refuses. */
  const post = useCallback(async (row: ReviewExpense, choice: ReconcileChoice): Promise<Posting> => {
    setBusy((current) => new Set(current).add(row.id));
    try {
      const posting = await approveExpense(row.id, choice);
      leave(row.id);
      if (me) setSigned((current) => setSignature(current, row.id, me, new Date().toISOString()));
      return posting;
    } finally {
      setBusy((current) => { const next = new Set(current); next.delete(row.id); return next; });
    }
  }, [leave, me]);

  const add = async (row: ReviewExpense) => {
    try {
      onChanged(await post(row, suggestionChoice(row, scope)));
      toast.success('Added to the sheet.');
    } catch (failure) {
      toast.error(`Couldn't add it: ${failure instanceof Error ? failure.message : 'try again'}`);
    }
  };

  const addAll = async () => {
    setAddingAll(true);
    const targets = rows;
    const failures: string[] = [];
    // One at a time: each locks its row and writes to the sheet.
    for (const row of targets) {
      try {
        onChanged(await post(row, suggestionChoice(row, scope)));
      } catch (failure) {
        failures.push(failure instanceof Error ? failure.message : 'try again');
      }
    }
    setAddingAll(false);
    setConfirmingAll(false);
    if (failures.length === 0) toast.success(`${targets.length === 1 ? '1 expense' : `${targets.length} expenses`} added to the sheet.`);
    else toast.error(`${targets.length - failures.length} added, ${failures.length} failed: ${failures[0]}`);
  };

  const sign = async (row: ReviewExpense) => {
    if (!me) return;
    const before = signed.get(row.id)?.get(me);
    setSigned((current) => setSignature(current, row.id, me, before ? null : new Date().toISOString()));
    try {
      await signExpense(row.id, !before);
    } catch (failure) {
      setSigned((current) => setSignature(current, row.id, me, before ?? null));
      toast.error(`Couldn't save your signature: ${failure instanceof Error ? failure.message : 'try again'}`);
    }
  };

  return {
    rows, signers, signed, people, cars, me, busy, editing, rejecting, confirmingAll, addingAll, receipt,
    add, addAll, post, sign, leave, onChanged, setEditing, setRejecting, setConfirmingAll, setReceipt,
  };
}

type Suggestions = ReturnType<typeof useSuggestions>;

export const SuggestionBanner: React.FC<{ suggestions: Suggestions }> = ({ suggestions }) => {
  const { fmt } = useCurrency();
  const { rows, setConfirmingAll } = suggestions;
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <div className={cn('media-scope flex max-w-[1100px] flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5', TONE_CLASSES.amber.panel)}>
      <p className="min-w-0 text-[13.5px] font-medium text-[#92400E]">
        You have {rows.length === 1 ? '1 suggested expense' : `${rows.length} suggested expenses`} from custody worth <span className="font-semibold tabular-nums">{fmt(total)}</span>
      </p>
      <Button size="lg" className="!h-11 px-3 md:!h-9" onClick={() => setConfirmingAll(true)}><Check size={14} strokeWidth={2.5} /> Add all</Button>
    </div>
  );
};

export const SuggestedExpense: React.FC<{ row: ReviewExpense; suggestions: Suggestions }> = ({ row, suggestions }) => {
  const { fmt } = useCurrency();
  const { people, signers, signed, me, busy, add, sign, setEditing, setRejecting, setReceipt } = suggestions;
  const signer = signers.find((person) => person.profile_id === me);
  const pending = busy.has(row.id);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-black/25 bg-black/[0.015] px-3 py-2">
      <div className="min-w-[180px] flex-1 opacity-80">
        <p className="break-words text-[13.5px] text-foreground">{row.description || row.category || 'Expense'}</p>
        <p className="text-[12.5px] tabular-nums text-black/55">
          {[formatDate(row.transaction_date), row.category, `From custody of ${people[row.employee_id]?.full_name ?? 'staff'}`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="text-[14.5px] font-semibold tabular-nums text-foreground opacity-80">{fmt(row.amount)}</span>
      <Receipt row={row} onOpen={setReceipt} />
      {signer && <SignatureCell signer={signer} signedAt={signed.get(row.id)?.get(signer.profile_id)} mine onToggle={() => sign(row)} />}
      <span className="flex items-center gap-1.5">
        <Button variant="ghost" size="lg" className="!h-11 px-2 text-[#B91C1C] md:!h-9" aria-label="Reject" disabled={pending} onClick={() => setRejecting(row)}><X size={14} /></Button>
        <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-9" disabled={pending} onClick={() => setEditing(row)}>Edit</Button>
        <Button size="lg" className="!h-11 px-3 md:!h-9" disabled={pending} onClick={() => add(row)}>
          {pending && <Spinner size={13} />} Add
        </Button>
      </span>
    </li>
  );
};

export const SuggestionDialogs: React.FC<{ suggestions: Suggestions }> = ({ suggestions }) => {
  const { fmt } = useCurrency();
  const { rows, cars, editing, rejecting, confirmingAll, addingAll, receipt, post, addAll, leave, onChanged, setEditing, setRejecting, setConfirmingAll, setReceipt } = suggestions;
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <>
      {editing && (
        <ReconcileSheet
          row={editing}
          cars={cars}
          onClose={() => setEditing(null)}
          onConfirm={async (choice) => {
            onChanged(await post(editing, choice));
            setEditing(null);
            toast.success(choice.target === 'other' ? 'Approved. Nothing was posted.' : 'Approved and posted.');
          }}
        />
      )}
      {rejecting && (
        <ReasonSheet
          title="Reject this expense?"
          description={`${fmt(rejecting.amount)} · ${rejecting.description ?? ''}`}
          label="Reason"
          confirmLabel="Reject expense"
          onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            await rejectExpense(rejecting.id, reason);
            leave(rejecting.id);
            setRejecting(null);
            onChanged(null);
            toast.success('Expense rejected.');
          }}
        />
      )}
      <ConfirmDialog
        state={confirmingAll ? {
          title: `Add all ${rows.length === 1 ? '1 expense' : `${rows.length} expenses`}?`,
          description: `${fmt(total)} is approved and posted to this sheet, each under its own category.`,
          confirmLabel: 'Add all',
          pendingLabel: 'Adding…',
          onConfirm: addAll,
        } : null}
        pending={addingAll}
        onCancel={() => setConfirmingAll(false)}
        onConfirm={addAll}
      />
      {receipt && <Lightbox items={[{ url: receipt, label: 'Receipt' }]} onClose={() => setReceipt(null)} />}
      <MediaToaster />
    </>
  );
};
