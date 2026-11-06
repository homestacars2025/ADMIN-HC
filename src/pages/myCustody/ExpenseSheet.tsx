import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/media/MediaUI';
import { PdfGlyph } from '../../components/shared/FileDrop';
import { isPdfUrl } from '../../components/shared/Lightbox';
import { istanbulDate } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import {
  EXPENSE_CATEGORIES,
  PROBLEM_LABELS,
  addCustodyExpense,
  addDays,
  amountInput,
  expenseErrorMessage,
  expenseProblems,
  fetchExpenseCars,
  fetchSupplierChoices,
  parseAmount,
  updateCustodyExpense,
  uploadCustodyReceipt,
  type CustodyMovement,
  type ExpenseScope,
  type SupplierChoice,
} from '../../lib/myCustody';
import { isPdfFile, prepareReceipt, receiptRejection } from '../../lib/receiptImage';
import { formatTry } from '../../lib/payroll';
import type { CarChoice } from '../../lib/bookingForm';
import { CarPicker } from '../bookings/CarPicker';
import { BookingSheet, FOOTER_BUTTON, Field, INPUT, PrimaryButton } from '../bookings/ui';

type DateMode = 'today' | 'yesterday' | 'other';
type Stage = 'idle' | 'uploading' | 'saving';

const DATE_LABELS: Record<DateMode, string> = { today: 'Today', yesterday: 'Yesterday', other: 'Another date' };
const SCOPE_LABELS: Record<ExpenseScope, string> = { car: 'A car', company: 'Company expenses' };

interface FormValues {
  amount: string;
  scope: ExpenseScope;
  carId: number | null;
  category: string | null;
  supplierId: number | null;
  description: string;
  dateMode: DateMode;
  otherDate: string;
}

const BLANK: FormValues = { amount: '', scope: 'car', carId: null, category: null, supplierId: null, description: '', dateMode: 'today', otherDate: '' };

/** What the form opens with: nothing, or the expense being edited. */
function startingValues(expense: CustodyMovement | undefined, today: string): FormValues {
  if (!expense) return BLANK;
  const scope: ExpenseScope = expense.expense_scope ?? (expense.car_id !== null ? 'car' : 'company');
  const date = expense.transaction_date;
  const dateMode: DateMode = date === today ? 'today' : date === addDays(today, -1) ? 'yesterday' : 'other';
  return {
    amount: amountInput(expense.amount),
    scope,
    carId: scope === 'car' ? expense.car_id : null,
    // A category from before these lists matches no choice, so it is picked again.
    category: EXPENSE_CATEGORIES[scope].includes(expense.category ?? '') ? expense.category : null,
    supplierId: expense.supplier_id,
    description: expense.description ?? '',
    dateMode,
    otherDate: dateMode === 'other' ? date : '',
  };
}

/** A real radio, so arrow keys and screen readers work with no extra code. */
const Choice: React.FC<{ name: string; checked: boolean; disabled: boolean; onChange: () => void; className: string; children: React.ReactNode }> = ({ name, checked, disabled, onChange, className, children }) => (
  <label className="relative cursor-pointer">
    <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="peer sr-only" />
    <span className={cn(
      'flex items-center justify-center border text-center transition-colors peer-focus-visible:ring-[3px] peer-focus-visible:ring-[#6EA4E7]/40',
      checked ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.1] font-semibold text-brand-strong' : 'border-[#E5E7EB] bg-white text-black/70 hover:bg-black/[0.02]',
      className,
    )}>
      {children}
    </span>
  </label>
);

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

const LINK = 'inline-flex min-h-[44px] items-center text-[13px] font-semibold text-brand-strong disabled:opacity-50 md:min-h-[32px]';

/**
 * Two inputs on purpose: `capture` opens the camera directly and hides the gallery,
 * so the gallery input must not have it.
 */
const ReceiptField: React.FC<{
  file: File | null;
  current: string | null;
  preparing: boolean;
  progress: number | null;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}> = ({ file, current, preparing, progress, disabled, onPick, onRemove }) => {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const pdf = Boolean(file && isPdfFile(file));

  useEffect(() => {
    if (!file || pdf) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, pdf]);

  const take = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (picked) onPick(picked);
  };

  const thumb = (src: string | null, isPdf: boolean) => (isPdf || !src
    ? <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-[#DC2626]/[0.06] text-[#B91C1C]"><PdfGlyph size={22} /></span>
    : <img src={src} alt="Receipt preview" className="h-16 w-16 shrink-0 rounded-lg border border-subtle object-cover" />);

  return (
    <div>
      <input ref={gallery} type="file" accept="image/*,application/pdf" className="hidden" tabIndex={-1} aria-label="Choose a receipt" onChange={take} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true" onChange={take} />

      {preparing ? (
        <div role="status" className="grid min-h-[112px] place-items-center rounded-2xl border-2 border-dashed border-black/10 text-[13px] text-black/50">Preparing the image…</div>
      ) : file ? (
        <div className="flex items-center gap-3 rounded-2xl border border-subtle bg-white p-3">
          {thumb(preview, pdf)}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium text-foreground">{file.name}</div>
            <div className="text-[12px] text-black/45">{formatSize(file.size)}</div>
            <div className="flex gap-4">
              <button type="button" disabled={disabled} onClick={() => gallery.current?.click()} className={LINK}>Replace</button>
              <button type="button" disabled={disabled} onClick={onRemove} className={cn(LINK, 'text-[#B91C1C]')}>{current ? 'Keep current' : 'Remove'}</button>
            </div>
          </div>
        </div>
      ) : current ? (
        <div className="flex items-center gap-3 rounded-2xl border border-subtle bg-white p-3">
          {thumb(current, isPdfUrl(current))}
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium text-foreground">Current receipt</div>
            <div className="flex flex-wrap gap-x-4">
              <button type="button" disabled={disabled} onClick={() => gallery.current?.click()} className={LINK}>Replace image or file</button>
              <button type="button" disabled={disabled} onClick={() => camera.current?.click()} className={cn(LINK, 'md:hidden')}>Take photo</button>
              <a href={current} target="_blank" rel="noreferrer" className={cn(LINK, 'text-black/65')}>View</a>
            </div>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={() => gallery.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) onPick(dropped);
            }}
            className={cn(
              'hidden min-h-[120px] w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-4 text-center transition-colors md:flex',
              dragging ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.06]' : 'border-black/10 hover:border-[#6EA4E7]',
            )}
          >
            <span className="text-[13.5px] font-medium text-black/70">Drop the receipt here or click to choose</span>
            <span className="text-[12px] text-black/40">Image or PDF</span>
          </button>
          <div className="grid grid-cols-2 gap-2 md:hidden">
            <Button type="button" variant="outline" size="lg" className="!h-12" disabled={disabled} onClick={() => camera.current?.click()}>Take photo</Button>
            <Button type="button" variant="outline" size="lg" className="!h-12" disabled={disabled} onClick={() => gallery.current?.click()}>From gallery</Button>
          </div>
        </>
      )}

      {progress !== null && (
        <div className="mt-2">
          <div className="text-[12px] text-black/50">Uploading the receipt… {progress}%</div>
          <div role="progressbar" aria-label="Receipt upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-[#6EA4E7] transition-[width] duration-150" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
};

/** Team's Add expense form: the same fields, rules and RPCs. */
export const ExpenseSheet: React.FC<{
  userId: string;
  balance: number;
  /** Edits this expense instead of adding one. */
  expense?: CustodyMovement;
  onClose: () => void;
  onSaved: (edited: boolean) => void;
}> = ({ userId, balance, expense, onClose, onSaved }) => {
  const baseId = useId();
  const submitting = useRef(false);
  // A retry after the save failed must not upload the same file twice.
  const uploaded = useRef<{ file: File; url: string } | null>(null);
  const today = useMemo(() => istanbulDate(), []);
  const [start] = useState(() => startingValues(expense, today));

  const [amount, setAmount] = useState(start.amount);
  const [scope, setScope] = useState<ExpenseScope>(start.scope);
  const [carId, setCarId] = useState<number | null>(start.carId);
  const [category, setCategory] = useState<string | null>(start.category);
  const [supplierId, setSupplierId] = useState<number | null>(start.supplierId);
  const [description, setDescription] = useState(start.description);
  const [dateMode, setDateMode] = useState<DateMode>(start.dateMode);
  const [otherDate, setOtherDate] = useState(start.otherDate);
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [dateTouched, setDateTouched] = useState(false);

  const [cars, setCars] = useState<CarChoice[]>([]);
  const [carsError, setCarsError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierChoice[]>([]);

  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchExpenseCars()
      .then((rows) => { if (!cancelled) setCars(rows); })
      .catch((failure: unknown) => { if (!cancelled) setCarsError(failure instanceof Error ? failure.message : 'Could not load the cars.'); });
    // Optional, so a failure here leaves the rest of the form working.
    fetchSupplierChoices()
      .then((rows) => { if (!cancelled) setSuppliers(rows); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const busy = stage !== 'idle';
  const dateFor = (mode: DateMode, other: string) => (mode === 'today' ? today : mode === 'yesterday' ? addDays(today, -1) : other);
  const date = dateFor(dateMode, otherDate);
  const parsed = parseAmount(amount);
  // Editing takes the old amount out of the balance before the new one goes in.
  const after = parsed === null ? null : balance + (expense?.amount ?? 0) - parsed;

  const problems = expenseProblems({ amount, scope, carId, category, date, hasReceipt: Boolean(file) || Boolean(expense?.receipt_url) }, today);
  const dirty = Boolean(file) || amount !== start.amount || scope !== start.scope || carId !== start.carId || category !== start.category
    || supplierId !== start.supplierId || description.trim() !== start.description.trim() || date !== dateFor(start.dateMode, start.otherDate);
  // Saving an edit sends it back for review, so an unchanged one isn't saved.
  const unchanged = Boolean(expense) && !dirty;
  const ready = problems.length === 0 && !preparing && !unchanged;

  const changeScope = (next: ExpenseScope) => {
    if (next === scope) return;
    setScope(next);
    // The two lists differ, and "Other" in one doesn't carry over a choice made in the other.
    setCategory(null);
  };

  const pickReceipt = async (picked: File) => {
    const rejection = receiptRejection(picked);
    if (rejection) { setReceiptError(rejection); return; }
    setReceiptError(null);
    setPreparing(true);
    try {
      setFile(await prepareReceipt(picked));
    } catch {
      setReceiptError("This image can't be read. Try a JPEG or PNG.");
    } finally {
      setPreparing(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || parsed === null || !category || (!file && !expense) || submitting.current) return;
    submitting.current = true;
    setError(null);

    let step: 'upload' | 'save' = 'upload';
    try {
      // Only a new file is uploaded; an edit that keeps its receipt sends none.
      let receiptUrl: string | null = null;
      if (file) {
        receiptUrl = uploaded.current?.file === file ? uploaded.current.url : null;
        if (!receiptUrl) {
          setStage('uploading');
          setProgress(0);
          receiptUrl = await uploadCustodyReceipt(userId, file, setProgress);
          uploaded.current = { file, url: receiptUrl };
        }
      }

      step = 'save';
      setStage('saving');
      setProgress(null);
      const changes = { amount: parsed, category, description: description.trim() || null, date, scope, carId, supplierId };
      if (expense) await updateCustodyExpense(expense.id, { ...changes, receiptUrl });
      else if (receiptUrl) await addCustodyExpense({ ...changes, receiptUrl });
      else throw new Error('Receipt photo required');
      onSaved(Boolean(expense));
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : undefined;
      setError(step === 'upload' ? 'Could not upload the receipt. Check your connection and try again.' : expenseErrorMessage(message));
      setProgress(null);
      setStage('idle');
      submitting.current = false;
    }
  };

  const amountInvalid = Boolean(amount) && parsed === null;
  const dateInvalid = dateMode === 'other' && dateTouched && problems.includes('date');
  const saveLabel = stage === 'uploading' ? `Uploading… ${progress ?? 0}%` : stage === 'saving' ? 'Saving…' : expense ? 'Save changes' : 'Save';

  return (
    <BookingSheet
      label={expense ? 'Edit expense' : 'Add expense'}
      title={expense ? 'Edit expense' : 'Add expense'}
      subtitle="Paid from your custody. Finance reviews it."
      narrow
      dirty={dirty}
      saving={busy}
      onClose={onClose}
      onSubmit={submit}
      footer={(requestClose) => (
        <>
          {error ? (
            <p role="alert" className="mb-2 text-[12.5px] text-[#B91C1C]">{error}</p>
          ) : problems.length > 0 ? (
            <p className="mb-2 text-[12px] text-black/50">Still needed: {problems.map((problem) => PROBLEM_LABELS[problem]).join(' · ')}</p>
          ) : unchanged && (
            <p className="mb-2 text-[12px] text-black/50">Nothing has changed yet.</p>
          )}
          <div className="flex gap-2 sm:justify-end">
            <Button type="button" variant="outline" size="lg" className={cn(FOOTER_BUTTON, 'flex-1 px-4 sm:flex-none')} disabled={busy} onClick={requestClose}>Cancel</Button>
            <PrimaryButton saving={busy} disabled={!ready}>{saveLabel}</PrimaryButton>
          </div>
        </>
      )}
    >
      {expense && (
        <div role="note" className="rounded-[10px] border border-[#F59E0B]/35 bg-[#F59E0B]/[0.08] px-3 py-2 text-[12.5px] font-medium text-[#92400E]">
          Editing sends the expense back for review.
          {expense.review_status === 'rejected' && expense.review_note && <p className="mt-1 font-normal">Rejected: {expense.review_note}</p>}
        </div>
      )}

      <div className="rounded-2xl border border-subtle bg-white px-4 py-4">
        <label htmlFor={`${baseId}-amount`} className="sr-only">Amount</label>
        <div className="flex items-baseline justify-center gap-1 text-foreground">
          <span aria-hidden="true" className="text-[28px] font-semibold text-black/35">₺</span>
          <input
            id={`${baseId}-amount`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            placeholder="0,00"
            value={amount}
            disabled={busy}
            aria-invalid={amountInvalid}
            aria-describedby={`${baseId}-after`}
            onChange={(event) => setAmount(event.target.value)}
            className="min-w-[4ch] max-w-full bg-transparent text-center font-mono text-[34px] font-semibold tabular-nums tracking-[-0.02em] outline-none placeholder:text-black/20"
            style={{ width: `${Math.max(amount.length, 4) + 1}ch` }}
          />
        </div>
        <p id={`${baseId}-after`} aria-live="polite" className={cn('mt-1 min-h-5 text-center text-[12.5px]', amountInvalid || (after !== null && after < 0) ? 'text-[#B91C1C]' : 'text-black/50')}>
          {amountInvalid ? 'Enter an amount greater than zero.' : after !== null && (
            <>Your balance after this: <span className="font-semibold tabular-nums">{after < 0 ? '−' : ''}{formatTry(Math.abs(after))}</span></>
          )}
        </p>
      </div>

      <Field label="Who is this expense for?" required>
        <div role="radiogroup" aria-label="Who is this expense for?" className="grid grid-cols-2 gap-2">
          {(['car', 'company'] as ExpenseScope[]).map((option) => (
            <Choice key={option} name={`${baseId}-scope`} checked={scope === option} disabled={busy} onChange={() => changeScope(option)} className="min-h-[64px] flex-col gap-1 rounded-2xl px-2 text-[13.5px]">
              <span aria-hidden="true" className="text-[20px] leading-none">{option === 'car' ? '🚗' : '🏢'}</span>
              {SCOPE_LABELS[option]}
            </Choice>
          ))}
        </div>
      </Field>

      {scope === 'car' && (
        <CarPicker
          label="Car"
          required
          cars={cars}
          value={carId === null ? '' : String(carId)}
          onChange={(id) => setCarId(id ? Number(id) : null)}
          pinRecent
          error={carsError}
        />
      )}

      <Field label="Category" required>
        <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-2">
          {EXPENSE_CATEGORIES[scope].map((option) => (
            <Choice key={option} name={`${baseId}-category`} checked={category === option} disabled={busy} onChange={() => setCategory(option)} className="min-h-[44px] rounded-full px-4 text-[13px]">
              {option}
            </Choice>
          ))}
        </div>
      </Field>

      <Field label="Supplier (optional)">
        <select
          aria-label="Supplier (optional)"
          value={supplierId ?? ''}
          disabled={busy}
          onChange={(event) => setSupplierId(event.target.value ? Number(event.target.value) : null)}
          className={INPUT}
        >
          <option value="">No supplier</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
      </Field>

      <Field label="Date" required error={dateInvalid ? "Choose a valid date. It can't be in the future." : null}>
        <div role="radiogroup" aria-label="Date" className="grid grid-cols-3 gap-2">
          {(['today', 'yesterday', 'other'] as DateMode[]).map((option) => (
            <Choice key={option} name={`${baseId}-date`} checked={dateMode === option} disabled={busy} onChange={() => setDateMode(option)} className="min-h-[44px] rounded-full px-2 text-[13px]">
              {DATE_LABELS[option]}
            </Choice>
          ))}
        </div>
        {dateMode === 'other' && (
          <input
            type="date"
            aria-label="Choose the date"
            max={today}
            value={otherDate}
            disabled={busy}
            aria-invalid={dateInvalid}
            onChange={(event) => { setOtherDate(event.target.value); setDateTouched(true); }}
            onBlur={() => setDateTouched(true)}
            className={cn(INPUT, 'mt-2')}
          />
        )}
      </Field>

      <Field label="Receipt" required error={receiptError}>
        <ReceiptField
          file={file}
          current={expense?.receipt_url ?? null}
          preparing={preparing}
          progress={progress}
          disabled={busy}
          onPick={pickReceipt}
          onRemove={() => { setFile(null); setReceiptError(null); }}
        />
      </Field>

      <Field label="Note (optional)">
        <input
          type="text"
          aria-label="Note (optional)"
          maxLength={200}
          autoComplete="off"
          value={description}
          disabled={busy}
          placeholder="What was it for?"
          onChange={(event) => setDescription(event.target.value)}
          className={INPUT}
        />
      </Field>
    </BookingSheet>
  );
};
