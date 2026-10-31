import { istanbulToday } from './homeData';
import { supabase } from './supabase';

export type EntryType = 'salary' | 'bonus' | 'advance' | 'deduction' | 'payout';
export type ManualEntryType = Exclude<EntryType, 'salary'>;

export interface WalletEntry {
  id: number;
  profile_id: string;
  entry_type: EntryType;
  amount: number;
  month: string;
  note: string | null;
  /** A path inside the `payroll` bucket, so receipts are never exposed by a public URL. */
  receipt_url: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface PayrollStaff {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  gender: string | null;
  status: string | null;
  department: string | null;
  monthly_salary: number;
  salary_active: boolean;
  balance: number;
}

export interface MonthTotals {
  salaries: number;
  bonuses: number;
  advances: number;
  deductions: number;
  paidOut: number;
}

export interface PayrollData {
  staff: PayrollStaff[];
  /** Live entries for the month, for every employee. */
  entries: WalletEntry[];
  /** What the company owes all staff across all months. */
  remainingOwed: number;
}

type Joined<T> = T | T[] | null;

interface TeamRow {
  profile_id: string;
  departments: Joined<{ label_en: string }>;
}

const RECEIPT_BUCKET = 'payroll';
const ENTRY_COLUMNS = 'id, profile_id, entry_type, amount, month, note, receipt_url, created_at, voided_at, void_reason';

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

/** Payroll is always in lira, whatever the dashboard's currency selector says. */
export function formatTry(amount: number): string {
  return currency.format(amount);
}

/** The first of the current Istanbul month, as stored in `staff_wallet_entries.month`. */
export function currentMonth(): string {
  return `${istanbulToday().slice(0, 7)}-01`;
}

export function shiftMonth(month: string, by: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1 + by, 1));
  return date.toISOString().slice(0, 10);
}

export function monthLabel(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, monthIndex - 1, 1)));
}

/** Salary and bonus raise what the company owes; everything else lowers it. */
export function signedAmount(entry: Pick<WalletEntry, 'entry_type' | 'amount'>): number {
  const amount = Number(entry.amount);
  return entry.entry_type === 'salary' || entry.entry_type === 'bonus' ? amount : -amount;
}

export function monthTotals(entries: WalletEntry[]): MonthTotals {
  const sum = (type: EntryType) =>
    entries.filter((e) => e.entry_type === type).reduce((total, e) => total + Number(e.amount), 0);
  return {
    salaries: sum('salary'),
    bonuses: sum('bonus'),
    advances: sum('advance'),
    deductions: sum('deduction'),
    paidOut: sum('payout'),
  };
}

export function staffMonth(entries: WalletEntry[], staffId: string): { earned: number; paid: number } {
  const own = entries.filter((e) => e.profile_id === staffId);
  const sum = (types: EntryType[]) =>
    own.filter((e) => types.includes(e.entry_type)).reduce((total, e) => total + Number(e.amount), 0);
  return { earned: sum(['salary', 'bonus']), paid: sum(['payout']) };
}

/** Who the posting RPC would pay now: it skips anyone already posted for the month. */
export function salariesToPost(staff: PayrollStaff[], entries: WalletEntry[]): PayrollStaff[] {
  const posted = new Set(entries.filter((e) => e.entry_type === 'salary').map((e) => e.profile_id));
  return staff.filter((s) => s.salary_active && s.monthly_salary > 0 && s.status === 'active' && !posted.has(s.id));
}

function failIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function fetchPayroll(month: string): Promise<PayrollData> {
  const [profiles, team, settings, balances, entries] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, avatar_url, gender, status').eq('role', 'staff').order('full_name'),
    supabase.from('team_members').select('profile_id, departments(label_en)'),
    supabase.from('staff_salary_settings').select('profile_id, monthly_salary, is_active'),
    supabase.from('staff_wallet_balances').select('profile_id, balance'),
    supabase.from('staff_wallet_entries').select(ENTRY_COLUMNS).eq('month', month).is('voided_at', null),
  ]);
  [profiles, team, settings, balances, entries].forEach((result) => failIf(result.error));

  const departmentOf = new Map(
    ((team.data ?? []) as TeamRow[]).map((row) => {
      const department = Array.isArray(row.departments) ? row.departments[0] : row.departments;
      return [row.profile_id, department?.label_en ?? null];
    }),
  );
  const salaryOf = new Map((settings.data ?? []).map((row) => [row.profile_id, row]));
  const balanceOf = new Map((balances.data ?? []).map((row) => [row.profile_id, Number(row.balance ?? 0)]));

  return {
    staff: (profiles.data ?? []).map((profile) => ({
      ...profile,
      department: departmentOf.get(profile.id) ?? null,
      monthly_salary: Number(salaryOf.get(profile.id)?.monthly_salary ?? 0),
      salary_active: salaryOf.get(profile.id)?.is_active ?? true,
      balance: balanceOf.get(profile.id) ?? 0,
    })),
    entries: (entries.data ?? []) as WalletEntry[],
    remainingOwed: Array.from(balanceOf.values()).reduce((total, balance) => total + balance, 0),
  };
}

export async function fetchStaffEntries(profileId: string): Promise<WalletEntry[]> {
  const { data, error } = await supabase
    .from('staff_wallet_entries')
    .select(ENTRY_COLUMNS)
    .eq('profile_id', profileId)
    .order('month', { ascending: false })
    .order('created_at', { ascending: false });
  failIf(error);
  return (data ?? []) as WalletEntry[];
}

export async function postSalaries(month: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_post_monthly_salaries', { p_month: month });
  failIf(error);
  return Number(data ?? 0);
}

export async function saveMonthlySalary(profileId: string, monthlySalary: number, adminId: string): Promise<void> {
  const { error } = await supabase.from('staff_salary_settings').upsert(
    { profile_id: profileId, monthly_salary: monthlySalary, updated_by: adminId, updated_at: new Date().toISOString() },
    { onConflict: 'profile_id' },
  );
  failIf(error);
}

export async function uploadReceipt(profileId: string, file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${profileId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, file, { contentType: file.type });
  if (error) {
    throw new Error(
      /bucket/i.test(error.message)
        ? 'Receipt storage isn’t set up yet. Remove the receipt to save this entry without one.'
        : error.message,
    );
  }
  return path;
}

export async function receiptLink(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 300);
  failIf(error);
  return data?.signedUrl ?? '';
}

export async function addEntry(entry: {
  profile_id: string;
  entry_type: ManualEntryType;
  amount: number;
  month: string;
  note: string | null;
  receipt_url: string | null;
  created_by: string;
}): Promise<void> {
  const { error } = await supabase.from('staff_wallet_entries').insert(entry);
  failIf(error);
}

export async function voidEntry(id: number, reason: string): Promise<void> {
  const { error } = await supabase.rpc('admin_void_wallet_entry', { p_id: id, p_reason: reason });
  failIf(error);
}
