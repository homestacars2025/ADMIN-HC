import { ledgerBalance } from './customers';
import { fetchFines, unpaidFines, unpaidSummary } from './fines';
import { supabase } from './supabase';

export interface CustomerBalance {
  customerId: string;
  name: string;
  balance: number;
}

interface LedgerEntry {
  customer_id: string | null;
  amount: number | string;
  direction: string;
  customers: { first_name: string | null; last_name: string | null } | Array<{ first_name: string | null; last_name: string | null }> | null;
}

/** Balances the way the customer pages work them out: OUT − IN, so above zero they owe us. */
export function customerBalances(entries: LedgerEntry[]): CustomerBalance[] {
  const byCustomer = new Map<string, LedgerEntry[]>();
  entries.forEach((entry) => {
    if (entry.customer_id) byCustomer.set(entry.customer_id, [...(byCustomer.get(entry.customer_id) ?? []), entry]);
  });
  return Array.from(byCustomer, ([customerId, own]) => {
    const person = Array.isArray(own[0].customers) ? own[0].customers[0] : own[0].customers;
    const name = [person?.first_name, person?.last_name].filter(Boolean).join(' ') || 'Unknown';
    const balance = ledgerBalance(own.map((entry) => ({ amount: Number(entry.amount), direction: entry.direction as 'IN' | 'OUT' })));
    return { customerId, name, balance };
  });
}

export interface FinanceOverview {
  customersOwing: { count: number; total: number };
  fines: { count: number; total: number };
}

export async function fetchFinanceOverview(): Promise<FinanceOverview> {
  const [ledger, fines] = await Promise.all([
    supabase.from('customer_accounting_ledger').select('customer_id, amount, direction, customers(first_name, last_name)'),
    fetchFines(),
  ]);
  if (ledger.error) throw new Error(ledger.error.message);

  const owing = customerBalances((ledger.data ?? []) as unknown as LedgerEntry[]).filter((row) => row.balance > 0);
  const unpaid = unpaidSummary(unpaidFines(fines));
  return {
    customersOwing: { count: owing.length, total: owing.reduce((sum, row) => sum + row.balance, 0) },
    fines: { count: unpaid.count, total: unpaid.total },
  };
}
