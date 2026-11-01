import { compressImage } from './imageCompression';
import { CURRENCIES, csvCell, type Currency } from './money';
import { supabase } from './supabase';

export const SUPPLIER_CATEGORIES = ['workshop', 'mechanic', 'body_paint', 'tires', 'car_wash', 'parts', 'glass', 'electric', 'towing', 'insurance', 'notary', 'fuel', 'other'] as const;
export type SupplierCategory = typeof SUPPLIER_CATEGORIES[number];

export const CATEGORY_LABELS: Record<SupplierCategory, string> = {
  workshop: 'Workshop',
  mechanic: 'Mechanic',
  body_paint: 'Body & paint',
  tires: 'Tires',
  car_wash: 'Car wash',
  parts: 'Parts',
  glass: 'Glass',
  electric: 'Electric',
  towing: 'Towing',
  insurance: 'Insurance',
  notary: 'Notary',
  fuel: 'Fuel',
  other: 'Other',
};

export const SUPPLIER_FILTERS = ['owed', 'settled', 'inactive'] as const;
export type SupplierFilter = typeof SUPPLIER_FILTERS[number];

export interface Supplier {
  id: number;
  name: string;
  category: SupplierCategory;
  contact_person: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  district: string | null;
  tax_number: string | null;
  iban: string | null;
  bank_name: string | null;
  notes: string | null;
  is_active: boolean;
}

export type SupplierDraft = Omit<Supplier, 'id'>;

/** One currency of one supplier. Positive means we owe them. */
export interface SupplierBalance {
  supplier_id: number;
  currency: Currency;
  total_bills: number;
  total_paid: number;
  balance: number;
  last_tx: string | null;
}

export interface SupplierTx {
  id: number;
  supplier_id: number;
  kind: 'bill' | 'payment';
  tx_date: string;
  amount: number;
  currency: Currency;
  car_id: number | null;
  description: string | null;
  receipt_url: string | null;
  paid_from_account_id: number | null;
  custody_expense_id: number | null;
  voided_at: string | null;
  void_reason: string | null;
  plate: string | null;
  account: string | null;
}

export interface LedgerRow extends SupplierTx {
  /** The balance in this row's currency straight after it. A voided row has none. */
  running: number | null;
}

const SUPPLIER_COLUMNS = 'id, name, category, contact_person, phone, whatsapp, address, district, tax_number, iban, bank_name, notes, is_active';
const LEDGER_COLUMNS = `
  id, supplier_id, kind, tx_date, amount, currency, car_id, description, receipt_url, paid_from_account_id,
  custody_expense_id, voided_at, void_reason, car:car_id(plate_number), account:paid_from_account_id(name)
`;

const fail = (error: { message: string; code?: string } | null): void => {
  if (!error) return;
  if (error.code === '23505') throw new Error('A supplier with this name already exists.');
  throw new Error(error.message);
};

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase.from('suppliers').select(SUPPLIER_COLUMNS).order('name');
  fail(error);
  return (data ?? []) as Supplier[];
}

export async function fetchSupplierBalances(): Promise<SupplierBalance[]> {
  const { data, error } = await supabase.from('supplier_balances').select('supplier_id, currency, total_bills, total_paid, balance, last_tx');
  fail(error);
  return ((data ?? []) as SupplierBalance[]).map((row) => ({
    ...row,
    total_bills: Number(row.total_bills),
    total_paid: Number(row.total_paid),
    balance: Number(row.balance),
  }));
}

export async function fetchSupplier(id: number): Promise<Supplier | null> {
  const { data, error } = await supabase.from('suppliers').select(SUPPLIER_COLUMNS).eq('id', id).maybeSingle();
  fail(error);
  return data as Supplier | null;
}

export async function saveSupplier(id: number | null, draft: SupplierDraft): Promise<Supplier> {
  const request = id === null
    ? supabase.from('suppliers').insert(draft)
    : supabase.from('suppliers').update(draft).eq('id', id);
  const { data, error } = await request.select(SUPPLIER_COLUMNS).single();
  fail(error);
  return data as Supplier;
}

type Joined<T> = T | T[] | null;
const one = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

/** Oldest first, the order a running balance has to be worked out in. */
export async function fetchLedger(supplierId: number): Promise<SupplierTx[]> {
  const { data, error } = await supabase
    .from('supplier_transactions')
    .select(LEDGER_COLUMNS)
    .eq('supplier_id', supplierId)
    .order('tx_date')
    .order('id');
  fail(error);
  return ((data ?? []) as unknown as Array<Omit<SupplierTx, 'plate' | 'account' | 'amount'> & {
    amount: number | string;
    car: Joined<{ plate_number: string }>;
    account: Joined<{ name: string }>;
  }>).map(({ car, account, ...row }) => ({
    ...row,
    amount: Number(row.amount),
    plate: one(car)?.plate_number ?? null,
    account: one(account)?.name ?? null,
  }));
}

export interface NewSupplierTx {
  supplier_id: number;
  kind: SupplierTx['kind'];
  tx_date: string;
  amount: number;
  currency: Currency;
  car_id: number | null;
  description: string | null;
  receipt_url: string | null;
  paid_from_account_id: number | null;
}

export async function addSupplierTx(tx: NewSupplierTx): Promise<void> {
  const { error } = await supabase.from('supplier_transactions').insert(tx);
  fail(error);
}

const RECEIPTS = 'transaction-receipts';

export async function uploadSupplierReceipt(supplierId: number, original: File): Promise<string> {
  const file = await compressImage(original);
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `suppliers/${supplierId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(RECEIPTS).upload(path, file, { cacheControl: '3600', upsert: false });
  fail(error);
  return supabase.storage.from(RECEIPTS).getPublicUrl(path).data.publicUrl;
}

/** The update has to come back, because RLS rejects one by matching no rows. */
export async function voidSupplierTx(id: number, reason: string): Promise<void> {
  const { data, error } = await supabase
    .from('supplier_transactions')
    .update({ voided_at: new Date().toISOString(), void_reason: reason })
    .eq('id', id)
    .is('voided_at', null)
    .select('id');
  fail(error);
  if (!data?.length) throw new Error('This entry was already voided.');
}

/**
 * Rows made by approving a custody expense come in a pair, and voiding one would
 * leave the other behind. Undoing the approval removes both.
 */
export const canVoid = (row: Pick<SupplierTx, 'voided_at' | 'custody_expense_id'>): boolean => (
  !row.voided_at && row.custody_expense_id === null
);

/** `rows` oldest first. Each currency keeps its own balance, and a voided row moves neither. */
export function withRunning(rows: SupplierTx[]): LedgerRow[] {
  const balances = new Map<Currency, number>();
  return rows.map((row) => {
    if (row.voided_at) return { ...row, running: null };
    const next = (balances.get(row.currency) ?? 0) + (row.kind === 'bill' ? row.amount : -row.amount);
    balances.set(row.currency, next);
    return { ...row, running: next };
  });
}

export interface LedgerTotals {
  currency: Currency;
  bills: number;
  paid: number;
  balance: number;
}

export function ledgerTotals(rows: SupplierTx[]): LedgerTotals[] {
  return CURRENCIES.flatMap((currency) => {
    const own = rows.filter((row) => row.currency === currency && !row.voided_at);
    if (own.length === 0) return [];
    const sum = (kind: SupplierTx['kind']) => own.filter((row) => row.kind === kind).reduce((total, row) => total + row.amount, 0);
    return [{ currency, bills: sum('bill'), paid: sum('payment'), balance: sum('bill') - sum('payment') }];
  });
}

export function inSupplierFilter(supplier: Supplier, balances: SupplierBalance[], filter: SupplierFilter | 'all'): boolean {
  if (filter === 'inactive') return !supplier.is_active;
  if (filter === 'owed') return balances.some((row) => row.balance > 0);
  if (filter === 'settled') return !balances.some((row) => row.balance > 0);
  return true;
}

/** What we owe in each currency. Currencies never add up to one figure. */
export function owedByCurrency(balances: SupplierBalance[]): Array<{ currency: Currency; total: number }> {
  return CURRENCIES.flatMap((currency) => {
    const total = balances.filter((row) => row.currency === currency && row.balance > 0).reduce((sum, row) => sum + row.balance, 0);
    return total > 0 ? [{ currency, total }] : [];
  });
}

/** Spaces and case never matter, and neither do Turkish letters typed on an English keyboard. */
const searchable = (text: string): string => text.toLowerCase().replace(/[\s.-]+/g, '')
  .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/i̇/g, 'i');

export function matchesSupplier(supplier: Pick<Supplier, 'name'>, query: string): boolean {
  const needle = searchable(query);
  return !needle || searchable(supplier.name).includes(needle);
}

/** `wa.me` needs the country code, and numbers here are usually written from the 0. */
export function whatsappLink(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits.startsWith('0') ? `90${digits.slice(1)}` : digits}`;
}

export function ledgerCsv(rows: LedgerRow[]): string {
  const header = 'date,type,description,car,bill,payment,currency,balance,paid_from,voided,void_reason';
  const lines = rows.map((row) => [
    row.tx_date,
    row.kind,
    row.description,
    row.plate,
    row.kind === 'bill' ? row.amount : null,
    row.kind === 'payment' ? row.amount : null,
    row.currency,
    row.running,
    row.account,
    row.voided_at ? 'yes' : null,
    row.void_reason,
  ].map(csvCell).join(','));
  return ['﻿' + header, ...lines].join('\r\n');
}
