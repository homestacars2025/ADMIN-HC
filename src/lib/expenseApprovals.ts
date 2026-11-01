import { istanbulDate } from './customers';
import { supabase } from './supabase';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const REVIEW_FILTERS = ['pending', 'unsigned', 'approved', 'rejected', 'no_receipt'] as const;
export type ReviewFilter = typeof REVIEW_FILTERS[number];

type Joined<T> = T | T[] | null;

interface RawInvestor {
  company_name: string | null;
  profiles: Joined<{ full_name: string | null }>;
}

interface RawCar {
  plate_number: string;
  investor_id: string | null;
  investor: Joined<RawInvestor>;
  model_group: Joined<{ name: string; image_url: string | null }>;
}

interface RawExpense {
  id: number;
  employee_id: string;
  direction: string;
  transaction_date: string;
  category: string | null;
  amount: number | string;
  description: string | null;
  receipt_url: string | null;
  expense_scope: 'car' | 'company' | null;
  car_id: number | null;
  review_status: ReviewStatus;
  reviewed_at: string | null;
  review_note: string | null;
  posted_car_tx_id: number | null;
  posted_company_expense_id: number | null;
  car: Joined<RawCar>;
  supplier: Joined<{ name: string; category: string }>;
}

export interface ReviewExpense {
  id: number;
  employee_id: string;
  direction: 'IN' | 'OUT';
  transaction_date: string;
  category: string | null;
  amount: number;
  description: string | null;
  receipt_url: string | null;
  expense_scope: 'car' | 'company' | null;
  car_id: number | null;
  review_status: ReviewStatus;
  reviewed_at: string | null;
  review_note: string | null;
  posted_car_tx_id: number | null;
  posted_company_expense_id: number | null;
  /** The car it was posted to, which reconciling can change. The row's own `car_id` stays. */
  posted_car_id: number | null;
  plate: string | null;
  model: string | null;
  image: string | null;
  investor_id: string | null;
  investor: string | null;
  supplier: string | null;
}

const one = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export function toReviewExpense(row: RawExpense): ReviewExpense {
  const car = one(row.car);
  const group = one(car?.model_group ?? null);
  const investor = one(car?.investor ?? null);
  const { car: _car, supplier, ...fields } = row;
  return {
    ...fields,
    direction: row.direction.toUpperCase() === 'IN' ? 'IN' : 'OUT',
    amount: Number(row.amount),
    posted_car_id: null,
    plate: car?.plate_number ?? null,
    model: group?.name ?? null,
    image: group?.image_url ?? null,
    investor_id: car?.investor_id ?? null,
    investor: investor?.company_name || one(investor?.profiles ?? null)?.full_name || null,
    supplier: one(supplier)?.name ?? null,
  };
}

const COLUMNS = `
  id, employee_id, direction, transaction_date, category, amount, description, receipt_url,
  expense_scope, car_id, review_status, reviewed_at, review_note, posted_car_tx_id, posted_company_expense_id,
  car:car_id(plate_number, investor_id, investor:investor_id(company_name, profiles!fk_investor_profile(full_name)), model_group:model_group_id(name, image_url)),
  supplier:supplier_id(name, category)
`;

/** Every custody movement, money in as well as expenses, newest first. */
export async function fetchCustodyMovements(): Promise<ReviewExpense[]> {
  const { data, error } = await supabase
    .from('employee_wallets')
    .select(COLUMNS)
    .order('transaction_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as RawExpense[]).map(toReviewExpense);

  // The row keeps its own `car_id`, so the car it was really posted to is on the sheet row.
  const posted = rows.flatMap((row) => (row.posted_car_tx_id === null ? [] : [row.posted_car_tx_id]));
  if (posted.length === 0) return rows;
  const cars = await fetchPostedCars(posted);
  return rows.map((row) => ({ ...row, posted_car_id: row.posted_car_tx_id === null ? null : cars.get(row.posted_car_tx_id) ?? row.car_id }));
}

export async function fetchPostedCars(txIds: number[]): Promise<Map<number, number | null>> {
  const { data, error } = await supabase.from('financial_transactions').select('id, car_id').in('id', txIds);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as Array<{ id: number; car_id: number | null }>).map((row) => [row.id, row.car_id]));
}

/** Waiting expenses dated in one month, the ones its sheet can suggest. */
export async function fetchSuggestedExpenses(scope: 'car' | 'company', month: string): Promise<ReviewExpense[]> {
  const [year, number] = month.split('-').map(Number);
  const nextMonth = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('employee_wallets')
    .select(COLUMNS)
    .eq('direction', 'OUT')
    .eq('review_status', 'pending')
    .eq('expense_scope', scope)
    .gte('transaction_date', `${month}-01`)
    .lt('transaction_date', nextMonth)
    .order('transaction_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawExpense[]).map(toReviewExpense);
}

/** Adding a suggestion posts it where it's already shown, under its own category. */
export function suggestionChoice(row: Pick<ReviewExpense, 'car_id' | 'category'>, scope: 'car' | 'company'): ReconcileChoice {
  return scope === 'car'
    ? { target: 'car', carId: row.car_id, category: carCategoryFor(row.category), note: null }
    : { target: 'company', carId: null, category: companyCategoryFor(row.category), note: null };
}

export interface WalletBalance {
  employee_id: string;
  full_name: string | null;
  balance: number;
}

export async function fetchWalletBalances(): Promise<WalletBalance[]> {
  const { data, error } = await supabase.from('employee_wallet_balances').select('employee_id, full_name, balance');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<WalletBalance & { balance: number | string }>).map((row) => ({ ...row, balance: Number(row.balance) }));
}

export interface Signer {
  profile_id: string;
  full_name: string | null;
  avatar_url: string | null;
  gender: string | null;
  avatar_bg: string | null;
  role: string;
}

export async function fetchSigners(): Promise<Signer[]> {
  const { data, error } = await supabase.rpc('finance_signers');
  if (error) throw new Error(error.message);
  return (data ?? []) as Signer[];
}

export interface Signature {
  expense_id: number;
  profile_id: string;
  signed_at: string;
}

export async function fetchSignatures(): Promise<Signature[]> {
  const { data, error } = await supabase.from('custody_expense_signatures').select('expense_id, profile_id, signed_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as Signature[];
}

export async function signExpense(id: number, sign: boolean): Promise<void> {
  const { error } = await supabase.rpc('finance_sign_custody_expense', { p_id: id, p_sign: sign });
  if (error) throw new Error(approvalMessage(error.message));
}

export interface PendingSummary {
  count: number;
  total: number;
}

export async function fetchPendingSummary(): Promise<PendingSummary> {
  const { data, error } = await supabase.from('employee_wallets').select('amount').eq('direction', 'OUT').eq('review_status', 'pending');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ amount: number | string }>;
  return { count: rows.length, total: rows.reduce((sum, row) => sum + Number(row.amount), 0) };
}

export interface Posting {
  car_tx_id: number | null;
  company_expense_id: number | null;
}

export type PostTarget = 'car' | 'company' | 'other';

export const CAR_SHEET_CATEGORIES = ['Petrol', 'Oil', 'Wash', 'Maintenance', 'Other'] as const;

/** Stored as free text, but the Company expenses tab groups by exactly these values. */
export const COMPANY_EXPENSE_CATEGORIES = [
  { value: 'marketing', label: 'Marketing', icon: '📣' },
  { value: 'operations', label: 'Operations', icon: '⚙️' },
  { value: 'branch', label: 'Branch', icon: '🏢' },
  { value: 'maintenance', label: 'Maintenance', icon: '🔧' },
  { value: 'food', label: 'Food', icon: '🍽️' },
  { value: 'other', label: 'Other', icon: '📦' },
] as const;

/** What a staff member typed, as the choice it matches on each sheet. */
export function carCategoryFor(category: string | null): string {
  const lower = (category ?? '').toLowerCase();
  if (lower === 'fuel') return 'Petrol';
  return CAR_SHEET_CATEGORIES.find((option) => option.toLowerCase() === lower) ?? 'Other';
}

export function companyCategoryFor(category: string | null): string {
  const lower = (category ?? '').toLowerCase();
  return COMPANY_EXPENSE_CATEGORIES.find((option) => option.value === lower)?.value ?? 'other';
}

export interface ReconcileChoice {
  target: PostTarget;
  carId: number | null;
  category: string | null;
  note: string | null;
}

/**
 * Always names all five arguments, which selects the newer overload. Left null they
 * post the way the expense asked to, so a bulk approve just passes nothing.
 */
export async function approveExpense(id: number, choice?: ReconcileChoice): Promise<Posting> {
  const { data, error } = await supabase.rpc('finance_approve_custody_expense', {
    p_id: id,
    p_note: choice?.note ?? null,
    p_target: choice?.target ?? null,
    p_car_id: choice?.carId ?? null,
    p_category: choice?.category ?? null,
  });
  if (error) throw new Error(approvalMessage(error.message));
  return data as Posting;
}

export async function rejectExpense(id: number, reason: string): Promise<void> {
  const { error } = await supabase.rpc('finance_reject_custody_expense', { p_id: id, p_reason: reason });
  if (error) throw new Error(approvalMessage(error.message));
}

export async function unapproveExpense(id: number): Promise<void> {
  const { error } = await supabase.rpc('finance_unapprove_custody_expense', { p_id: id });
  if (error) throw new Error(approvalMessage(error.message));
}

/** The server's refusals, in the words this page uses. */
export function approvalMessage(message: string): string {
  if (/no investor/i.test(message)) return "This car has no investor, so there's no sheet to post it to.";
  if (/already approved/i.test(message)) return 'This expense was already approved.';
  if (/only pending/i.test(message)) return "This expense isn't waiting any more.";
  if (/choose a car/i.test(message)) return 'Choose a car.';
  if (/forbidden/i.test(message)) return "You don't have permission to do this.";
  return message;
}

/** Where it goes if nobody chooses otherwise, as the server decides it. */
export const defaultTarget = (row: Pick<ReviewExpense, 'expense_scope' | 'car_id'>): PostTarget => (
  row.expense_scope === 'car' && row.car_id !== null ? 'car' : 'company'
);

export type PostingTarget =
  | { kind: 'car'; plate: string; investor: string | null }
  | { kind: 'company' };

/** The same test `finance_approve_custody_expense` makes. */
export function postingTarget(row: Pick<ReviewExpense, 'expense_scope' | 'car_id' | 'plate' | 'investor'>): PostingTarget {
  if (row.expense_scope === 'car' && row.car_id !== null) return { kind: 'car', plate: row.plate ?? '—', investor: row.investor };
  return { kind: 'company' };
}

export function postingLabel(target: PostingTarget): string {
  if (target.kind === 'company') return 'Company expenses';
  return `Car sheet ${target.plate}${target.investor ? ` — investor ${target.investor}` : ''}`;
}

/** The row this expense became. Null for one approved without posting anything. */
export function sheetLink(row: Pick<ReviewExpense, 'transaction_date' | 'posted_car_id' | 'posted_car_tx_id' | 'posted_company_expense_id'>): string | null {
  const month = row.transaction_date.slice(0, 7);
  if (row.posted_car_tx_id !== null && row.posted_car_id !== null) {
    return `/dashboard/accounting?tab=investors&view=cars&month=${month}&car=${row.posted_car_id}&entry=${row.posted_car_tx_id}`;
  }
  if (row.posted_company_expense_id !== null) return `/dashboard/accounting?tab=expenses&month=${month}&entry=${row.posted_company_expense_id}`;
  return null;
}

/** The migration marked older rows approved, but nothing was ever posted for them. */
export const isLegacy = (row: Pick<ReviewExpense, 'review_status' | 'reviewed_at'>): boolean => (
  row.review_status === 'approved' && row.reviewed_at === null
);

/** Undoing a legacy row would send it to be posted for the first time. */
export const canUndo = (row: Pick<ReviewExpense, 'review_status' | 'reviewed_at'>): boolean => (
  row.review_status === 'approved' && row.reviewed_at !== null
);

/** Rejected expenses and legacy rows aren't waiting for anyone's signature. */
export const wantsSignature = (row: Pick<ReviewExpense, 'review_status' | 'reviewed_at'>): boolean => (
  row.review_status !== 'rejected' && !isLegacy(row)
);

export type SignatureMap = Map<number, Map<string, string>>;

export function signatureMap(signatures: Signature[]): SignatureMap {
  const map: SignatureMap = new Map();
  signatures.forEach((signature) => {
    const own = map.get(signature.expense_id) ?? new Map<string, string>();
    own.set(signature.profile_id, signature.signed_at);
    map.set(signature.expense_id, own);
  });
  return map;
}

export function setSignature(map: SignatureMap, expenseId: number, profileId: string, signedAt: string | null): SignatureMap {
  const next = new Map(map);
  const own = new Map(next.get(expenseId) ?? []);
  if (signedAt) own.set(profileId, signedAt);
  else own.delete(profileId);
  next.set(expenseId, own);
  return next;
}

export interface ReviewContext {
  month: string;
  me: string | null;
  signatures: SignatureMap;
}

/** Only expenses are reviewed. "This month" counts the day it was approved. */
export function inReviewFilter(row: ReviewExpense, filter: ReviewFilter | 'all', { month, me, signatures }: ReviewContext): boolean {
  if (row.direction !== 'OUT') return filter === 'all';
  if (filter === 'pending') return row.review_status === 'pending';
  if (filter === 'unsigned') return wantsSignature(row) && !(me && signatures.get(row.id)?.has(me));
  if (filter === 'approved') return row.review_status === 'approved' && !!row.reviewed_at && istanbulDate(row.reviewed_at).startsWith(month);
  if (filter === 'rejected') return row.review_status === 'rejected';
  if (filter === 'no_receipt') return !row.receipt_url;
  return true;
}

export function reviewStats(rows: ReviewExpense[], context: ReviewContext) {
  const group = (filter: ReviewFilter) => {
    const matched = rows.filter((row) => inReviewFilter(row, filter, context));
    return { count: matched.length, total: matched.reduce((sum, row) => sum + row.amount, 0) };
  };
  return { pending: group('pending'), unsigned: group('unsigned'), approved: group('approved'), rejected: group('rejected'), noReceipt: group('no_receipt') };
}

export interface EmployeeSummary {
  employeeId: string;
  balance: number;
  received: number;
  spent: number;
  pending: number;
}

/** "This month" by the date on the movement, and a rejected expense wasn't spent. */
export function employeeSummaries(rows: ReviewExpense[], balances: WalletBalance[], month: string): EmployeeSummary[] {
  const ids = new Set(rows.map((row) => row.employee_id));
  balances.forEach((row) => { if (row.balance !== 0) ids.add(row.employee_id); });
  return Array.from(ids, (employeeId) => {
    const own = rows.filter((row) => row.employee_id === employeeId);
    const thisMonth = own.filter((row) => row.transaction_date.startsWith(month));
    const sum = (list: ReviewExpense[]) => list.reduce((total, row) => total + row.amount, 0);
    return {
      employeeId,
      balance: balances.find((row) => row.employee_id === employeeId)?.balance ?? 0,
      received: sum(thisMonth.filter((row) => row.direction === 'IN')),
      spent: sum(thisMonth.filter((row) => row.direction === 'OUT' && row.review_status !== 'rejected')),
      pending: own.filter((row) => row.direction === 'OUT' && row.review_status === 'pending').length,
    };
  }).sort((a, b) => b.pending - a.pending || b.balance - a.balance);
}

export interface EmployeeGroup {
  employeeId: string;
  rows: ReviewExpense[];
  pendingTotal: number;
}

/** Whoever is waiting comes first, and inside a group so do the rows to act on. */
export function groupByEmployee(rows: ReviewExpense[]): EmployeeGroup[] {
  const groups = new Map<string, ReviewExpense[]>();
  rows.forEach((row) => groups.set(row.employee_id, [...(groups.get(row.employee_id) ?? []), row]));
  const waiting = (row: ReviewExpense) => (row.review_status === 'pending' ? 0 : 1);
  return Array.from(groups, ([employeeId, own]) => ({
    employeeId,
    rows: [...own].sort((a, b) => waiting(a) - waiting(b) || b.transaction_date.localeCompare(a.transaction_date) || b.id - a.id),
    pendingTotal: own.filter((row) => row.review_status === 'pending').reduce((sum, row) => sum + row.amount, 0),
  })).sort((a, b) => b.pendingTotal - a.pendingTotal);
}
