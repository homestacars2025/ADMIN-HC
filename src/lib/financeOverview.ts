import { ledgerBalance } from './customers';
import { fetchFines, unpaidFines, unpaidSummary } from './fines';
import { fetchSupplierBalances, owedByCurrency } from './suppliers';
import { supabase } from './supabase';
import type { Currency } from './money';

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
  customers: {
    owing: { count: number; total: number };
    credit: { count: number; total: number };
    topDebtors: CustomerBalance[];
  };
  fines: { count: number; total: number };
  suppliers: { count: number; owed: Array<{ currency: Currency; total: number }> };
  carExpenses: number;
  companyExpenses: number;
}

const TOP_DEBTORS = 5;

const fail = (result: { error: { message: string } | null }) => {
  if (result.error) throw new Error(result.error.message);
};

const monthEnd = (month: string): string => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
};

export async function fetchFinanceOverview(month: string): Promise<FinanceOverview> {
  const [ledger, fines, balances, carRows, companyRows] = await Promise.all([
    supabase.from('customer_accounting_ledger').select('customer_id, amount, direction, customers(first_name, last_name)'),
    fetchFines(),
    fetchSupplierBalances(),
    supabase.from('financial_transactions').select('amount, direction').eq('month_key', month).eq('sheet_type', 'car'),
    supabase.from('company_expenses').select('amount, direction').gte('expense_date', `${month}-01`).lt('expense_date', monthEnd(month)),
  ]);
  [ledger, carRows, companyRows].forEach(fail);

  const all = customerBalances((ledger.data ?? []) as unknown as LedgerEntry[]);
  const owing = all.filter((row) => row.balance > 0).sort((a, b) => b.balance - a.balance);
  const credit = all.filter((row) => row.balance < 0);
  const unpaid = unpaidSummary(unpaidFines(fines));
  const spent = (rows: unknown) => ((rows ?? []) as Array<{ amount: number | string; direction: string | null }>)
    .filter((row) => row.direction?.toUpperCase() === 'OUT')
    .reduce((sum, row) => sum + Number(row.amount), 0);

  return {
    customers: {
      owing: { count: owing.length, total: owing.reduce((sum, row) => sum + row.balance, 0) },
      credit: { count: credit.length, total: credit.reduce((sum, row) => sum - row.balance, 0) },
      topDebtors: owing.slice(0, TOP_DEBTORS),
    },
    fines: { count: unpaid.count, total: unpaid.total },
    suppliers: { count: new Set(balances.filter((row) => row.balance > 0).map((row) => row.supplier_id)).size, owed: owedByCurrency(balances) },
    carExpenses: spent(carRows.data),
    companyExpenses: spent(companyRows.data),
  };
}
