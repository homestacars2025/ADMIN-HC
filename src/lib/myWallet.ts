import { fetchStaffEntries, signedAmount, type EntryType, type WalletEntry } from './payroll';
import { supabase } from './supabase';

/**
 * The signed-in person's pay, read-only: what the company owes them. Not custody,
 * which is company money they hold. Team's My wallet, rule for rule. RLS lets an
 * admin read every row, so each query names the person.
 */

export interface MyWalletRow extends WalletEntry {
  /** The balance straight after this entry. */
  running: number;
}

export const ENTRY_LABELS: Record<EntryType, string> = {
  salary: 'Salary',
  bonus: 'Bonus',
  advance: 'Advance',
  deduction: 'Deduction',
  payout: 'Payout',
};

/** Oldest first, voided entries left out. */
export async function fetchMyWallet(userId: string): Promise<WalletEntry[]> {
  const entries = await fetchStaffEntries(userId);
  return entries
    .filter((entry) => !entry.voided_at)
    .map((entry) => ({ ...entry, amount: Number(entry.amount) }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
}

export async function fetchMyWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase.from('staff_wallet_balances').select('balance').eq('profile_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return Number(data?.balance ?? 0);
}

/** Null when no active salary is set. */
export async function fetchMyMonthlySalary(userId: string): Promise<number | null> {
  const { data, error } = await supabase.from('staff_salary_settings').select('monthly_salary, is_active').eq('profile_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.is_active ? Number(data.monthly_salary) : null;
}

export function withWalletRunning(rows: WalletEntry[]): MyWalletRow[] {
  let running = 0;
  return rows.map((row) => {
    running += signedAmount(row);
    return { ...row, running: Math.round(running * 100) / 100 };
  });
}

export interface MyWalletTotals {
  balance: number;
  earned: number;
  paid: number;
}

/** Earned is salary and bonuses; paid is everything that came off it. */
export function myWalletTotals(rows: WalletEntry[]): MyWalletTotals {
  let earned = 0;
  let paid = 0;
  rows.forEach((row) => {
    const value = signedAmount(row);
    if (value > 0) earned += value;
    else paid -= value;
  });
  return { balance: Math.round((earned - paid) * 100) / 100, earned, paid };
}

export const WALLET_FILTERS = ['earned', 'paid'] as const;
export type MyWalletFilter = typeof WALLET_FILTERS[number];

export const inMyWalletFilter = (row: WalletEntry, filter: MyWalletFilter | 'all'): boolean =>
  filter === 'all' || (filter === 'earned' ? signedAmount(row) > 0 : signedAmount(row) < 0);
