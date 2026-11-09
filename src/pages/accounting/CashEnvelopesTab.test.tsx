import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CashEnvelopesTab } from './CashEnvelopesTab';
import type { Envelope } from '../../lib/cashEnvelopes';

const mockRpc = jest.fn();
const mockFetchEnvelopes = jest.fn();
let mockRole = 'admin';
let mockWide = true;

jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock('../../hooks/useCurrentProfile', () => ({ useCurrentProfile: () => ({ profile: { id: 'me', role: mockRole } }) }));
jest.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => mockWide }));
jest.mock('../../hooks/useUrlFilter', () => ({ useUrlFilter: () => ({ filter: 'all', toggle: jest.fn(), clear: jest.fn() }) }));
jest.mock('../../lib/cashAccounts', () => ({
  ...jest.requireActual('../../lib/cashAccounts'),
  fetchCashAccounts: async () => [{ id: 1, name: 'Şişli safe', kind: 'safe', is_active: true, is_final: false }],
}));
jest.mock('../../lib/notifications', () => ({
  getAvatarProfiles: async () => ({ s1: { id: 's1', full_name: 'Omar Staff', avatar_url: null, gender: 'male' } }),
}));
jest.mock('./AccountsSection', () => ({ AccountsSection: () => null }));
jest.mock('../../lib/cashEnvelopes', () => ({
  ...jest.requireActual('../../lib/cashEnvelopes'),
  fetchEnvelopes: (...a: unknown[]) => mockFetchEnvelopes(...a),
  fetchMovements: async () => [],
  fetchAccountBalances: async () => [],
}));

const envelope = (id: number, over: Partial<Envelope> = {}): Envelope => ({
  id, ref: `ENV-2611-000${id}`, amount: 100 * id, currency: 'TRY', holder_profile_id: 's1', status: 'in_safe', current_account_id: 1,
  counted_amount: null, difference: null, difference_note: null, created_at: '2026-11-03T09:00:00Z', created_by: 's1', note: null,
  customer_id: 'c1', customer: 'Ali Veli', plate: '34 ABC 101', booking_number: `HOM-11-26-00${id}`, ...over,
});

const renderTab = () => render(<MemoryRouter><CashEnvelopesTab /></MemoryRouter>);

beforeEach(() => {
  mockRole = 'admin';
  mockWide = true;
  mockRpc.mockReset().mockImplementation(async (name: string, args: { p_envelope_id: number }) => (
    name === 'admin_delete_envelope'
      ? { data: { deleted_envelope: `ENV-2611-000${args.p_envelope_id}`, amount: 100, currency: 'TRY', ledger_rows_deleted: 1 }, error: null }
      : { data: null, error: null }
  ));
  mockFetchEnvelopes.mockReset().mockResolvedValue([envelope(1), envelope(2, { currency: 'USD', status: 'with_employee' }), envelope(3)]);
});

test('a row deletes after a confirm that names what goes, with the reason passed on', async () => {
  renderTab();
  await userEvent.click(await screen.findByRole('button', { name: 'Delete ENV-2611-0001' }));
  const dialog = within(screen.getByRole('alertdialog', { name: 'Delete ENV-2611-0001?' }));
  expect(dialog.getByText('HOM-11-26-001')).toBeInTheDocument();
  expect(dialog.getByText('Ali Veli')).toBeInTheDocument();
  expect(dialog.getByText('Omar Staff')).toBeInTheDocument();
  expect(dialog.getByText('₺100,00')).toBeInTheDocument();
  expect(dialog.getByText(/its customer payment line and its money movements\. This cannot be undone\./)).toBeInTheDocument();

  await userEvent.type(dialog.getByRole('textbox'), 'test envelope');
  await userEvent.click(dialog.getByRole('button', { name: 'Delete' }));

  expect(mockRpc).toHaveBeenCalledWith('admin_delete_envelope', { p_envelope_id: 1, p_reason: 'test envelope' });
  expect(await screen.findByText('ENV-2611-0001 deleted')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(mockFetchEnvelopes).toHaveBeenCalledTimes(2);
});

test('Cancel deletes nothing, and a blank reason goes as null', async () => {
  renderTab();
  await userEvent.click(await screen.findByRole('button', { name: 'Delete ENV-2611-0003' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(mockRpc).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: 'Delete ENV-2611-0003' }));
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
  expect(mockRpc).toHaveBeenCalledWith('admin_delete_envelope', { p_envelope_id: 3, p_reason: null });
});

test('bulk: any envelope can be picked, and Delete selected loops the RPC', async () => {
  renderTab();
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Select ENV-2611-0001' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select ENV-2611-0002' })); // with staff, still deletable
  await userEvent.click(screen.getByRole('button', { name: 'Delete selected (2)' }));

  const dialog = within(screen.getByRole('alertdialog', { name: 'Delete 2 envelopes?' }));
  expect(dialog.getByText('₺100,00 · $200.00')).toBeInTheDocument();
  await userEvent.click(dialog.getByRole('button', { name: 'Delete' }));

  expect(await screen.findByText('2 envelopes deleted')).toBeInTheDocument();
  expect(mockRpc.mock.calls.map((call) => call[1].p_envelope_id)).toEqual([1, 2]);
});

test('a failure in a bulk delete is reported, and that envelope stays selected', async () => {
  mockRpc.mockImplementation(async (_name: string, args: { p_envelope_id: number }) => (
    args.p_envelope_id === 3
      ? { data: null, error: { message: 'Envelope not found' } }
      : { data: { deleted_envelope: `ENV-2611-000${args.p_envelope_id}`, amount: 100, currency: 'TRY', ledger_rows_deleted: 1 }, error: null }
  ));
  renderTab();
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Select all envelopes' }));
  await userEvent.click(screen.getByRole('button', { name: 'Delete selected (3)' }));
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

  expect(await screen.findByText('2 envelopes deleted')).toBeInTheDocument();
  expect(screen.getByText("Couldn't delete ENV-2611-0003: Envelope not found")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select ENV-2611-0003' })).toBeChecked());
});

test('the detail drawer shows the envelope and deletes it too', async () => {
  mockWide = false;
  renderTab();
  await userEvent.click(await screen.findByRole('button', { name: 'ENV-2611-0001' }));
  const sheet = within(screen.getByRole('dialog', { name: 'Envelope ENV-2611-0001' }));
  expect(sheet.getByText('HOM-11-26-001')).toBeInTheDocument();
  expect(sheet.getByRole('link', { name: 'Ali Veli' })).toHaveAttribute('href', '/dashboard/customers/c1');
  await userEvent.click(sheet.getByRole('button', { name: /Delete/ }));
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
  expect(mockRpc).toHaveBeenCalledWith('admin_delete_envelope', { p_envelope_id: 1, p_reason: null });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Envelope ENV-2611-0001' })).not.toBeInTheDocument());
});

test('without the admin role there is no delete anywhere', async () => {
  mockRole = 'finance';
  renderTab();
  await screen.findByRole('button', { name: 'ENV-2611-0001' });
  expect(screen.queryByRole('button', { name: /^Delete ENV/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Select ENV-2611-0002' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'ENV-2611-0001' }));
  expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
});

test('every status can be deleted; one admin already received warns that it reaches the safe and the admin account', async () => {
  mockFetchEnvelopes.mockResolvedValue([envelope(1), envelope(2, { status: 'with_employee' }), envelope(4, { status: 'with_admin', current_account_id: null })]);
  renderTab();
  for (const ref of ['ENV-2611-0001', 'ENV-2611-0002', 'ENV-2611-0004']) {
    expect(await screen.findByRole('button', { name: `Delete ${ref}` })).toBeInTheDocument();
  }

  await userEvent.click(screen.getByRole('button', { name: 'Delete ENV-2611-0001' }));
  expect(within(screen.getByRole('alertdialog')).queryByText(/already received by admin/)).not.toBeInTheDocument();
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

  await userEvent.click(screen.getByRole('button', { name: 'Delete ENV-2611-0004' }));
  const dialog = within(screen.getByRole('alertdialog', { name: 'Delete ENV-2611-0004?' }));
  expect(dialog.getByRole('alert')).toHaveTextContent('This envelope was already received by admin — deleting removes the payment from the customer wallet, the safe and the admin account.');
  await userEvent.click(dialog.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_delete_envelope', { p_envelope_id: 4, p_reason: null }));
});
