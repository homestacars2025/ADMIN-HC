import { supabase } from './supabase';
import { istanbulDate } from './customers';
import type { CarChoice } from './bookingForm';

/**
 * The signed-in person's custody: company money they hold, not money they earned.
 * Finance records the money in; the person logs what they spent through three RPCs.
 * It is Team's My custody, rule for rule, so an admin's expense reaches the
 * accountant in Staff custody like anyone else's.
 *
 * An admin passes `is_finance()`, so RLS shows them every employee's rows. Every
 * read names the person, or an admin's own page would add up the whole team.
 */

const RECEIPT_BUCKET = 'employee_wallets';

export type ExpenseScope = 'car' | 'company';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** What is stored in `employee_wallets.category`: always English, the same as Team. */
export const EXPENSE_CATEGORIES: Record<ExpenseScope, readonly string[]> = {
  car: ['Wash', 'Petrol', 'Parking', 'Maintenance', 'Oil', 'Other'],
  company: ['Branch', 'Office supplies', 'Transport', 'Other'],
};

export interface CustodyMovement {
  id: number;
  transaction_date: string;
  direction: 'IN' | 'OUT';
  category: string | null;
  amount: number;
  description: string | null;
  receipt_url: string | null;
  created_at: string | null;
  created_by: string | null;
  expense_scope: ExpenseScope | null;
  car_id: number | null;
  supplier_id: number | null;
  posted_car_tx_id: number | null;
  posted_company_expense_id: number | null;
  review_status: ReviewStatus;
  reviewed_at: string | null;
  review_note: string | null;
  /** Kept for the row even once the car has left the fleet. */
  car: { plate_number: string } | null;
  supplier: { name: string } | null;
}

export interface CustodyRow extends CustodyMovement {
  /** The balance straight after this movement. */
  running: number;
}

type Joined<T> = T | T[] | null;
const one = <T,>(value: Joined<T> | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

const MOVEMENT_COLUMNS = 'id, transaction_date, direction, category, amount, description, receipt_url, created_at, created_by, expense_scope, car_id, supplier_id, posted_car_tx_id, posted_company_expense_id, review_status, reviewed_at, review_note, car:car_id(plate_number), supplier:supplier_id(name)';

// ─── Reading ──────────────────────────────────────────────────────────────────

/** Oldest first, the order a running balance has to be worked out in. */
export async function fetchMyCustody(userId: string): Promise<CustodyMovement[]> {
  const { data, error } = await supabase
    .from('employee_wallets')
    .select(MOVEMENT_COLUMNS)
    .eq('employee_id', userId)
    .order('transaction_date')
    .order('created_at')
    .order('id');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...(row as unknown as CustodyMovement),
    amount: Number(row.amount),
    car: one(row.car as Joined<{ plate_number: string }>),
    supplier: one(row.supplier as Joined<{ name: string }>),
  }));
}

export async function fetchMyCustodyBalance(userId: string): Promise<number> {
  const { data, error } = await supabase.from('employee_wallet_balances').select('balance').eq('employee_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return Number(data?.balance ?? 0);
}

/** Only what the picker shows. `cars` also holds investor details, which stay out. */
export async function fetchExpenseCars(): Promise<CarChoice[]> {
  const { data, error } = await supabase.from('cars').select('id, plate_number, model_group:model_group_id(name)').eq('is_active', true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<{ id: number; plate_number: string; model_group: Joined<{ name: string }> }>)
    .map((row) => ({ id: row.id, plate_number: row.plate_number, model: one(row.model_group)?.name ?? '' }));
}

export interface SupplierChoice {
  id: number;
  name: string;
}

export async function fetchSupplierChoices(): Promise<SupplierChoice[]> {
  const { data, error } = await supabase.from('suppliers').select('id, name').eq('is_active', true).order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierChoice[];
}

// ─── Writing ──────────────────────────────────────────────────────────────────

export function receiptPath(userId: string, file: Pick<File, 'name' | 'type'>, id: string, today = istanbulDate()): string {
  const fromType = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]?.replace('jpeg', 'jpg');
  const fromName = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined;
  return `${userId}/${today.slice(0, 7)}/${id}.${fromType || fromName || 'jpg'}`;
}

/**
 * Into `{user}/{yyyy-mm}/`, the only folder the storage policy lets them write. A
 * plain request rather than the Supabase client, which reports no upload progress.
 */
export async function uploadCustodyReceipt(userId: string, file: File, onProgress: (percent: number) => void): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Your session ended. Sign in again.');

  const path = receiptPath(userId, file, crypto.randomUUID());
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${process.env.REACT_APP_SUPABASE_URL}/storage/v1/object/${RECEIPT_BUCKET}/${path}`);
    request.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    request.setRequestHeader('apikey', process.env.REACT_APP_SUPABASE_ANON_KEY ?? '');
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Upload failed: ${request.status}`)));
    request.onerror = () => reject(new Error('Upload failed'));
    request.send(file);
  });
  return supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(path).data.publicUrl;
}

export interface CustodyExpenseInput {
  amount: number;
  category: string;
  /** Null when they wrote nothing. */
  description: string | null;
  date: string;
  scope: ExpenseScope;
  carId: number | null;
  supplierId: number | null;
}

const expenseArgs = (expense: CustodyExpenseInput) => ({
  p_amount: expense.amount,
  p_category: expense.category,
  p_description: expense.description,
  p_date: expense.date,
  p_scope: expense.scope,
  p_car_id: expense.scope === 'car' ? expense.carId : null,
  p_supplier_id: expense.supplierId,
});

export async function addCustodyExpense(expense: CustodyExpenseInput & { receiptUrl: string }): Promise<number> {
  const { data, error } = await supabase.rpc('staff_add_custody_expense', { ...expenseArgs(expense), p_receipt_url: expense.receiptUrl });
  if (error) throw new Error(error.message);
  return Number(data);
}

/** Their own, while pending or rejected. Saving sends it back for review. `null` keeps the receipt. */
export async function updateCustodyExpense(id: number, expense: CustodyExpenseInput & { receiptUrl: string | null }): Promise<void> {
  const { error } = await supabase.rpc('staff_update_custody_expense', { p_id: id, ...expenseArgs(expense), p_receipt_url: expense.receiptUrl });
  if (error) throw new Error(error.message);
}

export async function deleteCustodyExpense(id: number): Promise<void> {
  const { error } = await supabase.rpc('staff_delete_custody_expense', { p_id: id });
  if (error) throw new Error(error.message);
}

// ─── Working it out ───────────────────────────────────────────────────────────

export function withRunning(rows: CustodyMovement[]): CustodyRow[] {
  let running = 0;
  return rows.map((row) => {
    running += row.direction === 'IN' ? row.amount : -row.amount;
    return { ...row, running: Math.round(running * 100) / 100 };
  });
}

export interface CustodyTotals {
  received: number;
  spent: number;
  balance: number;
  /** Expenses finance hasn't looked at yet. */
  pending: { count: number; total: number };
}

export function custodyTotals(rows: CustodyMovement[]): CustodyTotals {
  const totals: CustodyTotals = { received: 0, spent: 0, balance: 0, pending: { count: 0, total: 0 } };
  rows.forEach((row) => {
    if (row.direction === 'IN') totals.received += row.amount;
    else {
      totals.spent += row.amount;
      if (row.review_status === 'pending') { totals.pending.count += 1; totals.pending.total += row.amount; }
    }
  });
  totals.balance = Math.round((totals.received - totals.spent) * 100) / 100;
  return totals;
}

/** Approved before reviews existed: no reviewer, and posted nowhere. */
export const isLegacyApproval = (row: Pick<CustodyMovement, 'review_status' | 'reviewed_at' | 'posted_car_tx_id' | 'posted_company_expense_id'>): boolean =>
  row.review_status === 'approved' && !row.reviewed_at && row.posted_car_tx_id == null && row.posted_company_expense_id == null;

export type StatusTone = 'blue' | 'amber' | 'green' | 'red' | 'grey';

export function statusChip(row: Pick<CustodyMovement, 'direction' | 'review_status' | 'reviewed_at' | 'posted_car_tx_id' | 'posted_company_expense_id'>): { label: string; tone: StatusTone } {
  if (row.direction === 'IN') return { label: 'From finance', tone: 'blue' };
  if (isLegacyApproval(row)) return { label: 'Approved (old)', tone: 'grey' };
  if (row.review_status === 'approved') return { label: 'Approved', tone: 'green' };
  if (row.review_status === 'rejected') return { label: 'Rejected', tone: 'red' };
  return { label: 'Pending', tone: 'amber' };
}

export const CUSTODY_FILTERS = ['in', 'out', 'pending', 'rejected'] as const;
export type CustodyFilter = typeof CUSTODY_FILTERS[number];

export function inCustodyFilter(row: CustodyMovement, filter: CustodyFilter | 'all'): boolean {
  if (filter === 'in') return row.direction === 'IN';
  if (filter === 'out') return row.direction === 'OUT';
  if (filter === 'pending') return row.direction === 'OUT' && row.review_status === 'pending';
  if (filter === 'rejected') return row.direction === 'OUT' && row.review_status === 'rejected';
  return true;
}

const squeeze = (value: string | null | undefined) => (value ?? '').toLocaleLowerCase('tr').replace(/\s+/g, '');

export function matchesCustodySearch(row: CustodyMovement, query: string): boolean {
  const wanted = squeeze(query);
  return !wanted || [row.category, row.description, row.supplier?.name, row.car?.plate_number, String(row.amount)].some((field) => squeeze(field).includes(wanted));
}

// ─── The expense form ─────────────────────────────────────────────────────────

// Arabic-Indic (U+0660–0669) and Persian (U+06F0–06F9) digits, written as escapes.
const ARABIC_DIGITS = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';
const PERSIAN_DIGITS = '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9';

/** A phone keyboard may type its own digits; everything downstream wants Latin ones. */
export function latinDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => {
    const arabic = ARABIC_DIGITS.indexOf(digit);
    return String(arabic >= 0 ? arabic : PERSIAN_DIGITS.indexOf(digit));
  });
}

/**
 * Takes what a keypad produces, in any locale: `12,50`, `12.50`, `1.250,50`,
 * `1,250.50`. Money has at most two decimals, so a final group of exactly three
 * digits is thousands, not decimals. `null` when it isn't a positive amount.
 */
export function parseAmount(text: string): number | null {
  const cleaned = latinDigits(text).replace(/[\s₺]/g, '').replace(/\u066B/g, ',').replace(/\u066C/g, '.');
  if (!/^\d[\d.,]*$/.test(cleaned)) return null;

  const lastSeparator = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  let whole = cleaned;
  let decimals = '';
  if (lastSeparator !== -1) {
    const tail = cleaned.slice(lastSeparator + 1);
    if (tail.length !== 3) {
      if (tail.length > 2) return null;
      whole = cleaned.slice(0, lastSeparator);
      decimals = tail;
      // One character can't be both the thousands and the decimal separator.
      if (whole.includes(cleaned[lastSeparator])) return null;
    }
  }
  if (!/^\d{1,3}(?:[.,]\d{3})*$|^\d+$/.test(whole)) return null;

  const amount = Number(`${whole.replace(/[.,]/g, '')}.${decimals || '0'}`);
  return amount > 0 ? amount : null;
}

/** A stored amount as the field shows it: `1250.5` → `1250,50`, `75` → `75`. Reads back through `parseAmount`. */
export function amountInput(amount: number): string {
  return amount.toFixed(2).replace('.', ',').replace(/,00$/, '');
}

export type ExpenseProblem = 'amount' | 'car' | 'category' | 'date' | 'receipt';

export const PROBLEM_LABELS: Record<ExpenseProblem, string> = { amount: 'amount', car: 'car', category: 'category', date: 'date', receipt: 'receipt' };

export interface ExpenseDraft {
  amount: string;
  scope: ExpenseScope;
  carId: number | null;
  category: string | null;
  date: string;
  hasReceipt: boolean;
}

/** What still stands in the way of saving, in the order the form asks for it. The note is optional. */
export function expenseProblems(draft: ExpenseDraft, today: string): ExpenseProblem[] {
  const problems: ExpenseProblem[] = [];
  if (parseAmount(draft.amount) === null) problems.push('amount');
  if (draft.scope === 'car' && draft.carId === null) problems.push('car');
  if (!draft.category) problems.push('category');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || draft.date > today) problems.push('date');
  if (!draft.hasReceipt) problems.push('receipt');
  return problems;
}

const HOURS_24 = 24 * 60 * 60 * 1000;

/** The same test `staff_delete_custody_expense` applies, so the button never lies. */
export function canDeleteExpense(row: Pick<CustodyMovement, 'direction' | 'created_by' | 'created_at' | 'posted_car_tx_id' | 'posted_company_expense_id' | 'review_status'>, userId: string | null, now = Date.now()): boolean {
  if (!userId || row.direction !== 'OUT' || row.created_by !== userId || !row.created_at) return false;
  if (row.review_status !== 'pending') return false;
  if (row.posted_car_tx_id != null || row.posted_company_expense_id != null) return false;
  return now - new Date(row.created_at).getTime() < HOURS_24;
}

/** Their own expense, until finance approves it: the test `staff_update_custody_expense` applies. */
export function canEditExpense(row: Pick<CustodyMovement, 'direction' | 'created_by' | 'review_status'>, userId: string | null): boolean {
  if (!userId || row.direction !== 'OUT' || row.created_by !== userId) return false;
  return row.review_status === 'pending' || row.review_status === 'rejected';
}

/** The server's refusal, said plainly. */
export function expenseErrorMessage(message: string | undefined): string {
  const known: Array<[RegExp, string]> = [
    [/Amount/i, 'Enter an amount greater than zero.'],
    [/Category/i, 'Choose a category.'],
    [/Choose a car/i, 'Choose a car.'],
    [/Choose car or company/i, 'Choose a car or company expenses.'],
    [/Receipt/i, 'A receipt is required.'],
    [/Invalid date/i, "That date isn't valid."],
    [/not active/i, "Your account isn't active."],
    [/signed in|session ended/i, 'Your session ended. Sign in again.'],
    [/within 24 hours/i, 'An expense can only be deleted within 24 hours.'],
    [/cannot be edited/i, 'An approved expense can no longer be edited.'],
    [/not found/i, 'This expense no longer exists. Refresh the page.'],
  ];
  return known.find(([pattern]) => pattern.test(message ?? ''))?.[1] ?? 'Could not save. Check your connection and try again.';
}

export const addDays = (day: string, days: number): string => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
