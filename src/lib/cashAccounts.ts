import type { Currency } from './money';
import { supabase } from './supabase';

export const ACCOUNT_KINDS = ['safe', 'bank', 'pos', 'gateway', 'custody', 'other'] as const;
export type AccountKind = typeof ACCOUNT_KINDS[number];

export const KIND_LABELS: Record<AccountKind, string> = {
  safe: 'Safe',
  bank: 'Bank',
  pos: 'POS',
  gateway: 'Gateway',
  custody: 'Custody',
  other: 'Other',
};

export const ACCOUNT_FILTERS = ['safe', 'bank', 'pos', 'custody'] as const;
export type AccountFilter = typeof ACCOUNT_FILTERS[number];

export interface CashAccount {
  id: number;
  code: string;
  name: string;
  kind: AccountKind;
  branch: string | null;
  currencies: Currency[];
  bank_name: string | null;
  iban: string | null;
  holder_profile_id: string | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
}

export type CashAccountDraft = Omit<CashAccount, 'id' | 'sort_order'>;

const COLUMNS = 'id, code, name, kind, branch, currencies, bank_name, iban, holder_profile_id, is_active, sort_order, notes';

export async function fetchCashAccounts(): Promise<CashAccount[]> {
  const { data, error } = await supabase.from('cash_accounts').select(COLUMNS).order('sort_order').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as CashAccount[];
}

export async function saveCashAccount(id: number | null, draft: CashAccountDraft): Promise<CashAccount> {
  const request = id === null
    ? supabase.from('cash_accounts').insert(draft)
    : supabase.from('cash_accounts').update(draft).eq('id', id);
  const { data, error } = await request.select(COLUMNS).single();
  if (error?.code === '23505') throw new Error('Another account already uses this code.');
  if (error) throw new Error(error.message);
  return data as CashAccount;
}

/** The row has to come back, because RLS rejects an update by matching no rows. */
export async function setAccountActive(id: number, active: boolean): Promise<void> {
  const { data, error } = await supabase.from('cash_accounts').update({ is_active: active }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("You can't change this account.");
}

/** The tiles group the two card-style kinds, and "other" only shows under All. */
export function inAccountFilter(account: Pick<CashAccount, 'kind'>, filter: AccountFilter | 'all'): boolean {
  if (filter === 'all') return true;
  if (filter === 'pos') return account.kind === 'pos' || account.kind === 'gateway';
  return account.kind === filter;
}

/** Spaces are for reading, so they aren't stored. Empty is allowed. */
export const cleanIban = (text: string): string => text.replace(/\s/g, '').toUpperCase();

export const validIban = (iban: string): boolean => iban === '' || /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban);

/** Grouped in fours, the way it's printed on a bank card. */
export const formatIban = (iban: string): string => iban.replace(/(.{4})/g, '$1 ').trim();
