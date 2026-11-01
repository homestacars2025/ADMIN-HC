import { istanbulDate } from './customers';
import { supabase } from './supabase';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const REVIEW_FILTERS = ['pending', 'approved', 'rejected', 'no_receipt'] as const;
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
    amount: Number(row.amount),
    plate: car?.plate_number ?? null,
    model: group?.name ?? null,
    image: group?.image_url ?? null,
    investor_id: car?.investor_id ?? null,
    investor: investor?.company_name || one(investor?.profiles ?? null)?.full_name || null,
    supplier: one(supplier)?.name ?? null,
  };
}

const COLUMNS = `
  id, employee_id, transaction_date, category, amount, description, receipt_url,
  expense_scope, car_id, review_status, reviewed_at, review_note, posted_car_tx_id, posted_company_expense_id,
  car:car_id(plate_number, investor_id, investor:investor_id(company_name, profiles!fk_investor_profile(full_name)), model_group:model_group_id(name, image_url)),
  supplier:supplier_id(name, category)
`;

export async function fetchReviewExpenses(): Promise<ReviewExpense[]> {
  const { data, error } = await supabase
    .from('employee_wallets')
    .select(COLUMNS)
    .eq('direction', 'OUT')
    .order('transaction_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawExpense[]).map(toReviewExpense);
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

export async function approveExpense(id: number): Promise<Posting> {
  const { data, error } = await supabase.rpc('finance_approve_custody_expense', { p_id: id, p_note: null });
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
  if (/forbidden/i.test(message)) return "You don't have permission to do this.";
  return message;
}

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

/** The row this expense became. Null for one approved before anything was posted. */
export function sheetLink(row: Pick<ReviewExpense, 'transaction_date' | 'car_id' | 'investor_id' | 'posted_car_tx_id' | 'posted_company_expense_id'>): string | null {
  const month = row.transaction_date.slice(0, 7);
  if (row.posted_car_tx_id !== null && row.investor_id && row.car_id !== null) {
    return `/dashboard/accounting/report?investor_id=${encodeURIComponent(row.investor_id)}&month=${month}&car=${row.car_id}&entry=${row.posted_car_tx_id}`;
  }
  if (row.posted_company_expense_id !== null) return `/dashboard/accounting?tab=expenses&month=${month}&entry=${row.posted_company_expense_id}`;
  return null;
}

/**
 * Rows from before approvals existed count as approved, but nothing was posted for
 * them. Undoing one would send it back to be posted for the first time.
 */
export const canUndo = (row: Pick<ReviewExpense, 'review_status' | 'reviewed_at'>): boolean => (
  row.review_status === 'approved' && row.reviewed_at !== null
);

/** "This month" counts the day it was approved, which older rows never had. */
export function inReviewFilter(row: ReviewExpense, filter: ReviewFilter | 'all', month: string): boolean {
  if (filter === 'pending') return row.review_status === 'pending';
  if (filter === 'approved') return row.review_status === 'approved' && !!row.reviewed_at && istanbulDate(row.reviewed_at).startsWith(month);
  if (filter === 'rejected') return row.review_status === 'rejected';
  if (filter === 'no_receipt') return !row.receipt_url;
  return true;
}

export function reviewStats(rows: ReviewExpense[], month: string) {
  const group = (filter: ReviewFilter | 'all') => {
    const matched = rows.filter((row) => inReviewFilter(row, filter, month));
    return { count: matched.length, total: matched.reduce((sum, row) => sum + row.amount, 0) };
  };
  return { all: group('all'), pending: group('pending'), approved: group('approved'), rejected: group('rejected'), noReceipt: group('no_receipt') };
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
