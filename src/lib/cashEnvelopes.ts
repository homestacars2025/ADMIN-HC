import { CURRENCIES, type Currency } from './money';
import { supabase } from './supabase';

export type EnvelopeStatus = 'with_employee' | 'in_safe' | 'with_admin' | 'cancelled';

export const ENVELOPE_LABELS: Record<EnvelopeStatus, string> = {
  with_employee: 'With staff',
  in_safe: 'In safe',
  with_admin: 'With admin',
  cancelled: 'Cancelled',
};

export type MovementKind = 'customer_payment' | 'envelope_handover' | 'transfer' | 'bank_deposit' | 'pos_settlement' | 'admin_receipt' | 'custody_out' | 'refund' | 'adjustment' | 'reversal';

/** All Cash & Envelopes ever calls a movement. The stored kinds stay as they are. */
export type MovementType = 'customer_payment' | 'bank_deposit' | 'admin_receipt';

export const MOVEMENT_TYPES: Record<MovementType, string> = {
  customer_payment: 'Customer payment',
  bank_deposit: 'Bank deposit',
  admin_receipt: 'Admin receipt',
};

const TYPE_OF_KIND: Partial<Record<MovementKind, MovementType>> = {
  customer_payment: 'customer_payment',
  bank_deposit: 'bank_deposit',
  pos_settlement: 'bank_deposit',
  admin_receipt: 'admin_receipt',
  envelope_handover: 'admin_receipt',
};

type Joined<T> = T | T[] | null;
const one = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export interface Envelope {
  id: number;
  ref: string;
  amount: number;
  currency: Currency;
  holder_profile_id: string | null;
  status: EnvelopeStatus;
  current_account_id: number | null;
  counted_amount: number | null;
  difference: number | null;
  difference_note: string | null;
  created_at: string;
  customer: string | null;
  plate: string | null;
}

export interface Movement {
  id: number;
  ref: string;
  kind: MovementKind;
  status: 'pending' | 'done';
  from_account_id: number | null;
  to_account_id: number | null;
  amount: number;
  currency: Currency;
  amount_try: number | null;
  expected_at: string | null;
  note: string | null;
  reverses_id: number | null;
  created_by: string | null;
  created_at: string;
}

export interface AccountBalance {
  account_id: number;
  currency: Currency;
  balance: number;
}

export async function fetchEnvelopes(): Promise<Envelope[]> {
  const { data, error } = await supabase
    .from('money_envelopes')
    .select('id, ref, amount, currency, holder_profile_id, status, current_account_id, counted_amount, difference, difference_note, created_at, customer:customer_id(first_name, last_name), car:car_id(plate_number)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<Omit<Envelope, 'customer' | 'plate' | 'amount'> & {
    amount: number | string;
    customer: Joined<{ first_name: string | null; last_name: string | null }>;
    car: Joined<{ plate_number: string }>;
  }>).map(({ customer, car, ...row }) => {
    const person = one(customer);
    return {
      ...row,
      amount: Number(row.amount),
      counted_amount: row.counted_amount === null ? null : Number(row.counted_amount),
      difference: row.difference === null ? null : Number(row.difference),
      customer: [person?.first_name, person?.last_name].filter(Boolean).join(' ') || null,
      plate: one(car)?.plate_number ?? null,
    };
  });
}

const MOVEMENT_LIMIT = 500;

export async function fetchMovements(): Promise<Movement[]> {
  const { data, error } = await supabase
    .from('money_movements')
    .select('id, ref, kind, status, from_account_id, to_account_id, amount, currency, amount_try, expected_at, note, reverses_id, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(MOVEMENT_LIMIT);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Omit<Movement, 'amount'> & { amount: number | string }>).map((row) => ({
    ...row,
    amount: Number(row.amount),
    amount_try: row.amount_try === null ? null : Number(row.amount_try),
  }));
}

export async function fetchAccountBalances(): Promise<AccountBalance[]> {
  const { data, error } = await supabase.from('cash_account_balances').select('account_id, currency, balance');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<AccountBalance & { balance: number | string }>).map((row) => ({ ...row, balance: Number(row.balance) }));
}

export async function receiveEnvelope(ref: string, counted: number, accountId: number, note: string | null): Promise<void> {
  const { error } = await supabase.rpc('finance_receive_envelope', { p_ref: ref, p_counted: counted, p_to_account_id: accountId, p_note: note });
  if (error) throw new Error(error.message);
}

export async function adminReceiveEnvelopes(ids: number[]): Promise<number> {
  const { data, error } = await supabase.rpc('admin_receive_envelopes', { p_ids: ids });
  if (error) throw new Error(error.message);
  return data as number;
}

export async function transferMoney(from: number, to: number, amount: number, currency: Currency, note: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('finance_transfer', { p_from: from, p_to: to, p_amount: amount, p_currency: currency, p_note: note });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function completeMovement(id: number): Promise<void> {
  const { error } = await supabase.rpc('finance_complete_movement', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function reverseMovement(id: number, reason: string): Promise<string> {
  const { data, error } = await supabase.rpc('admin_reverse_movement', { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
  return data as string;
}

// ─── Working it out ───────────────────────────────────────────────────────────

export type CurrencyTotal = { currency: Currency; total: number };

/** Currencies never add up to one figure. Zero ones are left out. */
export function totalsByCurrency(rows: Array<{ currency: Currency; amount: number }>): CurrencyTotal[] {
  return CURRENCIES.flatMap((currency) => {
    const total = rows.filter((row) => row.currency === currency).reduce((sum, row) => sum + row.amount, 0);
    return total !== 0 ? [{ currency, total }] : [];
  });
}

export const balancesOf = (balances: AccountBalance[], accountId: number): CurrencyTotal[] => (
  totalsByCurrency(balances.filter((row) => row.account_id === accountId).map((row) => ({ currency: row.currency, amount: row.balance })))
);

const DAY = 24 * 60 * 60 * 1000;

export const isOverdue = (envelope: Pick<Envelope, 'status' | 'created_at'>, now: number): boolean => (
  envelope.status === 'with_employee' && now - Date.parse(envelope.created_at) > DAY
);

export function ageLabel(createdAt: string, now: number): string {
  const hours = Math.floor(Math.max(0, now - Date.parse(createdAt)) / (60 * 60 * 1000));
  if (hours < 1) return 'Under 1 h';
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

export function withStaff(envelopes: Envelope[], now: number) {
  const held = envelopes.filter((envelope) => envelope.status === 'with_employee');
  return { count: held.length, totals: totalsByCurrency(held), overdue: held.some((envelope) => isOverdue(envelope, now)) };
}

export function posPending(movements: Movement[]) {
  const pending = movements.filter((row) => row.kind === 'pos_settlement' && row.status === 'pending');
  const next = pending.map((row) => row.expected_at).filter((day): day is string => Boolean(day)).sort()[0] ?? null;
  return { count: pending.length, totals: totalsByCurrency(pending), next };
}

export const findEnvelope = (envelopes: Envelope[], ref: string): Envelope | null => {
  const wanted = ref.trim().toUpperCase();
  return (wanted && envelopes.find((envelope) => envelope.ref.toUpperCase() === wanted)) || null;
};

/** A reversal can't be reversed, and nothing is reversed twice. */
export function canReverse(row: Movement, all: Movement[]): boolean {
  return row.status === 'done' && row.kind !== 'reversal' && !all.some((other) => other.reverses_id === row.id);
}

export const canComplete = (row: Pick<Movement, 'status'>): boolean => row.status === 'pending';

/** Each reversed movement's id, with the reversal that cancelled it. */
export function reversalsOf(movements: Movement[]): Map<number, Movement> {
  return new Map(movements.flatMap((row) => (row.reverses_id === null ? [] : [[row.reverses_id, row] as const])));
}

/**
 * Null for what the page leaves out: custody payouts, refunds, adjustments, reversals
 * and transfers that don't reach a bank.
 */
export function movementType(row: Pick<Movement, 'kind' | 'to_account_id'>, banks: ReadonlySet<number>): MovementType | null {
  if (row.kind === 'transfer') return row.to_account_id !== null && banks.has(row.to_account_id) ? 'bank_deposit' : null;
  return TYPE_OF_KIND[row.kind] ?? null;
}

export type VaultFilter = 'staff' | 'pos' | `account-${number}`;

export const accountFilter = (id: number): VaultFilter => `account-${id}`;

export function filteredAccountId(filter: string): number | null {
  const match = /^account-(\d+)$/.exec(filter);
  return match ? Number(match[1]) : null;
}

export function inEnvelopeFilter(envelope: Envelope, filter: string): boolean {
  if (filter === 'staff') return envelope.status === 'with_employee';
  if (filter === 'pos') return false;
  const accountId = filteredAccountId(filter);
  return accountId === null || envelope.current_account_id === accountId;
}

export interface MovementFilters {
  accountId: number | null;
  type: MovementType | null;
  from: string | null;
  to: string | null;
  banks: ReadonlySet<number>;
  showInternal: boolean;
}

export function inMovementFilter(row: Movement, tile: string, filters: MovementFilters, day: (at: string) => string): boolean {
  const type = movementType(row, filters.banks);
  if (type === null && !(filters.showInternal && row.kind === 'transfer')) return false;
  if (tile === 'pos' && !(row.kind === 'pos_settlement' && row.status === 'pending')) return false;
  if (tile === 'staff') return false;
  const tileAccount = filteredAccountId(tile);
  const touches = (id: number) => row.from_account_id === id || row.to_account_id === id;
  if (tileAccount !== null && !touches(tileAccount)) return false;
  if (filters.accountId !== null && !touches(filters.accountId)) return false;
  if (filters.type && type !== filters.type) return false;
  const date = day(row.created_at);
  if (filters.from && date < filters.from) return false;
  if (filters.to && date > filters.to) return false;
  return true;
}

export interface WaitingForAdmin {
  envelopes: { count: number; totals: CurrencyTotal[] };
  accounts: CurrencyTotal[];
}

/** Cash sitting in safes, and what banks and POS devices hold, none of it with the admin yet. */
export async function fetchWaitingForAdmin(): Promise<WaitingForAdmin> {
  const [{ data, error }, balances, accounts] = await Promise.all([
    supabase.from('money_envelopes').select('amount, counted_amount, currency').eq('status', 'in_safe'),
    fetchAccountBalances(),
    supabase.from('cash_accounts').select('id, kind'),
  ]);
  if (error) throw new Error(error.message);
  if (accounts.error) throw new Error(accounts.error.message);
  return waitingForAdmin(
    (data ?? []) as Array<{ amount: number | string; counted_amount: number | string | null; currency: Currency }>,
    balances,
    (accounts.data ?? []) as Array<{ id: number; kind: string }>,
  );
}

export function waitingForAdmin(
  inSafes: Array<{ amount: number | string; counted_amount: number | string | null; currency: Currency }>,
  balances: AccountBalance[],
  accounts: Array<{ id: number; kind: string }>,
): WaitingForAdmin {
  const held = new Set(accounts.filter((account) => ['bank', 'pos', 'gateway'].includes(account.kind)).map((account) => account.id));
  return {
    envelopes: {
      count: inSafes.length,
      totals: totalsByCurrency(inSafes.map((row) => ({ currency: row.currency, amount: Number(row.counted_amount ?? row.amount) }))),
    },
    accounts: totalsByCurrency(balances.filter((row) => held.has(row.account_id)).map((row) => ({ currency: row.currency, amount: row.balance }))),
  };
}
