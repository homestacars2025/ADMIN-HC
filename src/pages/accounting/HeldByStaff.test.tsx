import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CashEnvelopesTab } from './CashEnvelopesTab';
import type { Envelope } from '../../lib/cashEnvelopes';

const mockRpc = jest.fn();
const mockAgo = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();

jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock('../../hooks/useCurrentProfile', () => ({ useCurrentProfile: () => ({ profile: { id: 'me', role: 'admin' } }) }));
jest.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
jest.mock('../../lib/cashAccounts', () => ({
  ...jest.requireActual('../../lib/cashAccounts'),
  fetchCashAccounts: async () => [{ id: 1, name: 'Şişli safe', kind: 'safe', is_active: true, is_final: false }],
}));
jest.mock('../../lib/notifications', () => ({
  getAvatarProfiles: async () => ({
    s1: { id: 's1', full_name: 'Omar Staff', avatar_url: null, gender: 'male' },
    s2: { id: 's2', full_name: 'Lina Desk', avatar_url: null, gender: 'female' },
  }),
}));
jest.mock('./AccountsSection', () => ({ AccountsSection: () => null }));

const envelope = (id: number, over: Partial<Envelope>): Envelope => ({
  id, ref: `ENV-2611-000${id}`, amount: 100, currency: 'TRY', holder_profile_id: 's1', status: 'with_employee', current_account_id: null,
  counted_amount: null, difference: null, difference_note: null, created_at: mockAgo(1), created_by: 's1', note: null,
  customer_id: 'c1', customer: 'Ali Veli', plate: '34 ABC 101', booking_number: `HOM-11-26-00${id}`, ...over,
});

const mockEnvelopes = [
  envelope(1, { amount: 3000, created_at: mockAgo(2) }),
  envelope(2, { amount: 50, currency: 'USD', created_at: mockAgo(30) }),
  envelope(3, { holder_profile_id: 's2', amount: 1200, created_at: mockAgo(80) }),
  envelope(4, { status: 'in_safe', current_account_id: 1 }),
];

const mockHeld = mockEnvelopes.filter((row) => row.status === 'with_employee').map((row) => ({
  id: row.id, ref: row.ref, amount: String(row.amount), currency: row.currency, created_at: row.created_at,
  booking_number: row.booking_number, plate: row.plate, customer: row.customer, note: row.id === 1 ? 'Deposit for the Clio' : null,
}));

jest.mock('../../lib/cashEnvelopes', () => ({
  ...jest.requireActual('../../lib/cashEnvelopes'),
  fetchEnvelopes: async () => mockEnvelopes,
  fetchMovements: async () => [],
  fetchAccountBalances: async () => [],
}));

const Where: React.FC = () => <span data-testid="where">{useLocation().search}</span>;
const renderTab = (url = '/dashboard/accounting?tab=vault') => render(<MemoryRouter initialEntries={[url]}><CashEnvelopesTab /><Where /></MemoryRouter>);

beforeEach(() => {
  mockRpc.mockReset().mockImplementation(async (name: string) => (name === 'my_held_envelopes' ? { data: mockHeld, error: null } : { data: null, error: null }));
});

test('the Cash with staff tile shows each currency and the count, and opens Held by staff', async () => {
  renderTab();
  const tile = await screen.findByRole('button', { name: /Cash with staff/ });
  expect(tile).toHaveTextContent('₺4.200,00');
  expect(tile).toHaveTextContent('$50.00 · 3 envelopes');
  expect(screen.getByRole('tab', { name: 'Envelopes' })).toHaveAttribute('aria-selected', 'true');

  await userEvent.click(tile);
  expect(tile).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('where')).toHaveTextContent('filter=held');
  expect(screen.getByRole('tab', { name: /Held by staff/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('region', { name: 'Movements' })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('tab', { name: 'Envelopes' }));
  expect(screen.getByTestId('where')).not.toHaveTextContent('filter=');
  expect(screen.getByRole('region', { name: 'Movements' })).toBeInTheDocument();
});

test('groups by holder, oldest first, with totals, oldest age and amber or red rows', async () => {
  mockRpc.mockClear();
  renderTab('/dashboard/accounting?tab=vault&filter=held');
  const lina = await screen.findByRole('region', { name: 'Lina Desk' });
  const omar = screen.getByRole('region', { name: 'Omar Staff' });
  expect(lina.compareDocumentPosition(omar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(mockRpc).toHaveBeenCalledWith('my_held_envelopes');

  expect(within(lina).getByText('1 envelope')).toBeInTheDocument();
  expect(within(lina).getByText('Oldest 3 days')).toHaveClass('text-[#B91C1C]');
  expect(within(omar).getByText('2 envelopes')).toBeInTheDocument();
  expect(within(omar).getByText('₺3.000,00 · $50.00')).toBeInTheDocument();
  expect(within(omar).getByText('Oldest 1 day')).toHaveClass('text-[#92400E]');

  const rows = within(omar).getAllByRole('row').slice(1);
  expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['ENV-2611-0002', 'ENV-2611-0001']);
  const fresh = within(rows[1]);
  expect(fresh.getByText('Deposit for the Clio')).toBeInTheDocument();
  expect(fresh.getByText('HOM-11-26-001')).toBeInTheDocument();
  expect(fresh.getByText('Ali Veli')).toBeInTheDocument();
  expect(fresh.getByText('2 h')).toHaveClass('text-black/55');
  expect(within(rows[0]).getByText('1 day')).toHaveClass('text-[#92400E]');
});

test('Receive into safe opens the receive sheet on that envelope', async () => {
  renderTab('/dashboard/accounting?tab=vault&filter=held');
  await userEvent.click(await screen.findByRole('button', { name: 'Receive ENV-2611-0003 into safe' }));
  expect(screen.getByRole('textbox', { name: 'Envelope number' })).toHaveValue('ENV-2611-0003');
  expect(screen.getByText('₺1.200,00', { selector: 'p' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Receive' })).toBeEnabled();
});
