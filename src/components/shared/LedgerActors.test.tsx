import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DeletedLedgerEntries, LedgerActorsProvider, LedgerStamp } from './LedgerActors';
import { clearLedgerActorCache } from '../../lib/ledgerActors';

const mockRpc = jest.fn();
const mockAudit = jest.fn();
const mockFilters: Array<[string, unknown]> = [];

/** The audit table answers `mockAudit`; cars, bookings and accounts answer with fixed names. */
jest.mock('../../lib/supabase', () => {
  const names: Record<string, Array<Record<string, unknown>>> = {
    cars: [{ id: 4, plate_number: '34 ABC 12' }, { id: 7, plate_number: '34 XYZ 99' }],
    bookings: [{ id: 9, booking_number: 'HOM-09' }],
    cash_accounts: [],
  };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    ['select', 'order', 'in'].forEach((k) => { chain[k] = () => chain; });
    chain.eq = (column: string, value: unknown) => { mockFilters.push([column, value]); return chain; };
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(
      table === 'customer_ledger_audit' ? mockAudit() : { data: names[table] ?? [], error: null },
    ).then(resolve);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => mockRpc(...args), from } };
});

const LINA = { id: 'u-lina', full_name: 'Lina Aydın', avatar_url: null, avatar_bg: 'mint', role: 'admin' };
const KEREM = { id: 'u-kerem', full_name: 'Kerem Şahin', avatar_url: 'https://cdn.example/kerem.jpg', avatar_bg: 'sky', role: 'staff' };

beforeEach(() => {
  clearLedgerActorCache();
  mockRpc.mockReset().mockResolvedValue({ data: [LINA, KEREM], error: null });
  mockAudit.mockReset();
  mockFilters.length = 0;
});

const renderRows = (enabled = true) => render(
  <LedgerActorsProvider ids={['u-lina', 'u-kerem', null]} enabled={enabled}>
    <ul>
      <li><LedgerStamp ledgerId="l1" createdBy="u-lina" createdAt="2026-11-10T09:30:00Z" updatedBy="u-kerem" updatedAt="2026-11-11T15:05:00Z" /></li>
      <li><LedgerStamp ledgerId="l2" createdBy={null} createdAt="2026-11-09T08:00:00Z" updatedBy={null} updatedAt={null} /></li>
    </ul>
  </LedgerActorsProvider>,
);

it('loads everyone in one call and names the creator, the editor and the system', async () => {
  renderRows();
  const edited = await screen.findByRole('button', { name: /^Recorded by Lina Aydın · 10 Nov 2026.*Last edited by Kerem Şahin · 11 Nov 2026.*Show history$/ });
  expect(edited).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Automatic entry (HGS, fines, system). Show history' })).toBeInTheDocument();
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledWith('ledger_actor_cards', { p_ids: ['u-kerem', 'u-lina'] });
  // Initials on the person's colour when there's no photo; the photo when there is.
  expect(within(edited).getByText('LA')).toBeInTheDocument();
  expect(edited.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/kerem.jpg');
});

it('renders nothing for someone who is not finance', () => {
  renderRows(false);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(mockRpc).not.toHaveBeenCalled();
});

it('opens the history: newest first, only changed fields, old → new, then who recorded it', async () => {
  mockAudit.mockReturnValue({
    data: [
      {
        id: 2, ledger_id: 'l1', action: 'update', changed_by: 'u-kerem', changed_at: '2026-11-11T15:05:00Z',
        old_row: { amount: 100, type: 'payment', direction: 'IN', description: 'Cash', car_id: 4, booking_id: 9, account_id: null },
        new_row: { amount: 100, type: 'payment', direction: 'IN', description: 'Cash at Şişli', car_id: 7, booking_id: 9, account_id: null },
      },
    ],
    error: null,
  });
  renderRows();
  fireEvent.click(await screen.findByRole('button', { name: /Last edited by Kerem/ }));
  const history = await screen.findByRole('dialog', { name: 'History' });
  await within(history).findByText('Edited');
  expect(mockFilters).toContainEqual(['ledger_id', 'l1']);
  expect(within(history).getByText('Description')).toBeInTheDocument();
  expect(within(history).getByText('Cash')).toBeInTheDocument();
  expect(within(history).getByText('Cash at Şişli')).toBeInTheDocument();
  expect(within(history).getByText('34 ABC 12')).toBeInTheDocument();
  expect(within(history).getByText('34 XYZ 99')).toBeInTheDocument();
  expect(within(history).queryByText('Amount')).not.toBeInTheDocument();
  const people = within(history).getAllByText(/Kerem Şahin|Lina Aydın/).map((node) => node.textContent);
  expect(people).toEqual(['Kerem Şahin', 'Lina Aydın']);
  expect(within(history).getByText('Recorded')).toBeInTheDocument();

  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'History' })).not.toBeInTheDocument());
});

it('lists a customer\'s deleted entries with who deleted them', async () => {
  mockAudit.mockReturnValue({
    data: [{
      id: 5, ledger_id: 'l9', action: 'delete', changed_by: 'u-lina', changed_at: '2026-11-12T10:00:00Z',
      old_row: { customer_id: 'c1', amount: 250, type: 'fine', direction: 'OUT', description: 'Speeding', booking_id: 9, created_by: null, created_at: '2026-11-01T10:00:00Z' },
      new_row: null,
    }],
    error: null,
  });
  render(<LedgerActorsProvider ids={[]} enabled><DeletedLedgerEntries customerId="c1" /></LedgerActorsProvider>);
  const toggle = screen.getByRole('button', { name: /Deleted entries/ });
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(toggle);
  expect(await screen.findByText('Speeding')).toBeInTheDocument();
  expect(mockFilters).toEqual(expect.arrayContaining([['action', 'delete'], ['old_row->>customer_id', 'c1']]));
  expect(screen.getByText('Lina Aydın')).toBeInTheDocument();
  expect(screen.getByText('HOM-09')).toBeInTheDocument();
  expect(screen.getByText(/Automatic entry/)).toBeInTheDocument();
});
