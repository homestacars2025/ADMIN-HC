import { customerBalances } from './financeOverview';

jest.mock('./supabase', () => ({ supabase: {} }));

describe('customerBalances', () => {
  it('works out OUT minus IN per customer, the way the customer pages do', () => {
    const rows = customerBalances([
      { customer_id: 'a', amount: '1000', direction: 'OUT', customers: { first_name: 'Ayşe', last_name: 'Test' } },
      { customer_id: 'a', amount: 400, direction: 'IN', customers: { first_name: 'Ayşe', last_name: 'Test' } },
      { customer_id: 'b', amount: 50, direction: 'IN', customers: [{ first_name: 'Ali', last_name: null }] },
    ]);
    expect(rows).toEqual([
      { customerId: 'a', name: 'Ayşe Test', balance: 600 },
      { customerId: 'b', name: 'Ali', balance: -50 },
    ]);
  });

  it('skips entries with no customer', () => {
    expect(customerBalances([{ customer_id: null, amount: 10, direction: 'OUT', customers: null }])).toEqual([]);
  });
});
