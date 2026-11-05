import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildWallet, type Wallet, type WalletData } from '../../lib/customerWallet';
import { BalanceToMoveBanner, CustomerWalletView, MoveBalanceSheet } from './CustomerWallet';

const mockMove = jest.fn();
const mockFetchWallet = jest.fn();

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/customerWallet', () => ({
  ...jest.requireActual('../../lib/customerWallet'),
  fetchWallet: (...args: unknown[]) => mockFetchWallet(...args),
  moveBookingBalance: (...args: unknown[]) => mockMove(...args),
}));

const data = (): WalletData => ({
  customer: { id: 'c1', first_name: 'Omar', last_name: 'Ali' },
  bookings: [
    { id: 1, booking_number: 'HOM-10-26-001', car_id: 10, start_date: '2026-10-01', end_date: '2026-10-05', status: 'completed', is_currently_active: false, cars: { plate_number: '34ABC10', model_group: { name: 'Fiat Egea' } } },
    { id: 2, booking_number: 'HOM-11-26-002', car_id: 20, start_date: '2026-11-01', end_date: '2026-11-09', status: 'confirmed', is_currently_active: true, cars: { plate_number: '34XYZ20', model_group: { name: 'Renault Clio' } } },
  ],
  lines: [
    { id: 'a', booking_id: 1, car_id: 10, type: 'rental', description: null, amount: 5000, direction: 'OUT', created_at: '2026-10-01T09:00:00Z', payment_ref: null },
    { id: 'b', booking_id: 1, car_id: 10, type: 'payment', description: null, amount: 6500, direction: 'IN', created_at: '2026-10-02T09:00:00Z', payment_ref: null },
    { id: 'c', booking_id: 1, car_id: 30, type: 'hgs', description: null, amount: 0, direction: 'OUT', created_at: '2026-10-02T10:00:00Z', payment_ref: null },
    { id: 'd', booking_id: 2, car_id: 20, type: 'rental', description: null, amount: 2000, direction: 'OUT', created_at: '2026-11-01T09:00:00Z', payment_ref: null },
  ],
  replacements: [],
  plates: new Map([[10, '34ABC10'], [20, '34XYZ20'], [30, '34OLD30']]),
});

let wallet: Wallet;

beforeEach(() => {
  wallet = buildWallet(data());
  mockMove.mockReset().mockResolvedValue({ ref: 'TRF-1', amount: 1500, from: 'HOM-10-26-001', to: 'HOM-11-26-002', from_balance_after: 0 });
  mockFetchWallet.mockReset().mockImplementation(async () => wallet);
});

test('shows one total, then each booking with its car, balance and lines', async () => {
  render(<CustomerWalletView customerId="c1" notify={jest.fn()} onChanged={jest.fn()} />);
  const hero = await screen.findByRole('region', { name: 'Wallet balance' });
  expect(within(hero).getByText('Omar Ali')).toBeInTheDocument();
  expect(within(hero).getByText('Owes')).toBeInTheDocument();
  const older = screen.getByRole('article', { name: 'HOM-10-26-001' });
  expect(within(older).getByText('34ABC10')).toBeInTheDocument();
  expect(within(older).getByText(/^Credit/)).toBeInTheDocument();
  expect(within(older).getByText('Car changed 34OLD30 → 34ABC10')).toBeInTheDocument();
  expect(within(older).getByText('Payment')).toBeInTheDocument();
  expect(within(screen.getByRole('article', { name: 'HOM-11-26-002' })).getByText(/^Owes/)).toBeInTheDocument();
});

test('Move balance sends the signed amount to the default target, then toasts and refreshes', async () => {
  const notify = jest.fn();
  const onChanged = jest.fn();
  render(<CustomerWalletView customerId="c1" notify={notify} onChanged={onChanged} />);
  const older = await screen.findByRole('article', { name: 'HOM-10-26-001' });
  await userEvent.click(within(older).getByRole('button', { name: 'Move balance' }));
  const sheet = screen.getByRole('dialog', { name: 'Move balance' });
  expect(within(sheet).getByRole('radio', { name: /HOM-11-26-002/ })).toBeChecked();
  expect(within(sheet).getByLabelText('Amount')).toHaveValue(1500);
  await userEvent.type(within(sheet).getByLabelText('Note'), 'carry over');
  await userEvent.click(within(sheet).getByRole('button', { name: /^Move/ }));
  await waitFor(() => expect(mockMove).toHaveBeenCalledWith({ fromId: 1, toId: 2, amount: 1500, note: 'carry over' }));
  expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^Moved .* to HOM-11-26-002$/), 'success');
  expect(onChanged).toHaveBeenCalled();
});

test('a debt moves with a negative amount, and too much is refused', async () => {
  const from = wallet.cards.find((card) => card.id === 2)!;
  const targets = wallet.cards.filter((card) => card.id === 1);
  render(<MoveBalanceSheet from={from} targets={targets} initialTargetId={1} onClose={jest.fn()} onMoved={jest.fn()} />);
  const amount = screen.getByLabelText('Amount');
  await userEvent.clear(amount);
  await userEvent.type(amount, '2500');
  expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  await userEvent.clear(amount);
  await userEvent.type(amount, '500');
  await userEvent.click(screen.getByRole('button', { name: /^Move/ }));
  await waitFor(() => expect(mockMove).toHaveBeenCalledWith({ fromId: 2, toId: 1, amount: -500, note: '' }));
});

test('a refused move stays open with the reason', async () => {
  mockMove.mockRejectedValueOnce(new Error("Your account can't move balances."));
  const onClose = jest.fn();
  const from = wallet.cards.find((card) => card.id === 1)!;
  render(<MoveBalanceSheet from={from} targets={[wallet.cards[0]]} initialTargetId={2} onClose={onClose} onMoved={jest.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /^Move/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent("Your account can't move balances.");
  expect(onClose).not.toHaveBeenCalled();
});

test('after a new booking, the banner offers the older balance and Later dismisses it', async () => {
  const onDismiss = jest.fn();
  render(<BalanceToMoveBanner customerId="c1" bookingId={2} notify={jest.fn()} onDismiss={onDismiss} />);
  const banner = await screen.findByRole('status');
  expect(banner).toHaveTextContent(/HOM-10-26-001 still has a credit of .*1\.500 — move it to HOM-11-26-002\?/);
  await userEvent.click(within(banner).getByRole('button', { name: 'Move' }));
  expect(within(screen.getByRole('dialog', { name: 'Move balance' })).getByRole('radio', { name: /HOM-11-26-002/ })).toBeChecked();
  await userEvent.click(within(banner).getByRole('button', { name: 'Later' }));
  expect(onDismiss).toHaveBeenCalled();
});

test('no banner when the other bookings are settled', async () => {
  const settled = data();
  settled.lines = settled.lines.filter((entry) => entry.booking_id === 2);
  wallet = buildWallet(settled);
  render(<BalanceToMoveBanner customerId="c1" bookingId={2} notify={jest.fn()} onDismiss={jest.fn()} />);
  await waitFor(() => expect(mockFetchWallet).toHaveBeenCalled());
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
