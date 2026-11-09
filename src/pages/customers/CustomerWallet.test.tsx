import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildWallet, type Wallet, type WalletData } from '../../lib/customerWallet';
import { BalanceToMoveBanner, CustomerWalletView, MoveBalanceSheet } from './CustomerWallet';

const mockMove = jest.fn();
const mockFetchWallet = jest.fn();
const mockDelete = jest.fn();
const mockPrint = jest.fn();
const mockDeleteEnvelopes = jest.fn();
let mockRole = 'admin';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/customerWallet', () => ({
  ...jest.requireActual('../../lib/customerWallet'),
  fetchWallet: (...args: unknown[]) => mockFetchWallet(...args),
  moveBookingBalance: (...args: unknown[]) => mockMove(...args),
  deleteLedgerLine: (...args: unknown[]) => mockDelete(...args),
}));
jest.mock('../../hooks/useCurrentProfile', () => ({ useCurrentProfile: () => ({ profile: { id: 'me', role: mockRole } }) }));
jest.mock('../../lib/cashEnvelopes', () => ({
  ...jest.requireActual('../../lib/cashEnvelopes'),
  deleteEnvelopes: (...args: unknown[]) => mockDeleteEnvelopes(...args),
}));
jest.mock('../../lib/CurrencyContext', () => ({ useCurrency: () => ({ fmt: (amount: number) => `TRY ${amount}` }) }));
jest.mock('../accounting/CustomerLedgerForms', () => ({
  printLedgerInvoice: (...args: unknown[]) => mockPrint(...args),
  AddCustomerTxModal: (props: { bookingId: number; carId: number; bookingLabel: string; onSaved: () => void; onClose: () => void }) => (
    <div role="dialog" aria-label="Add Transaction">
      {`booking ${props.bookingId} car ${props.carId} ${props.bookingLabel}`}
      <button type="button" onClick={() => { props.onSaved(); props.onClose(); }}>Save it</button>
    </div>
  ),
  EditTxModal: (props: { entry: { id: string; amount: number } }) => (
    <div role="dialog" aria-label="Edit Transaction">{`edit ${props.entry.id} ${props.entry.amount}`}</div>
  ),
}));

const data = (): WalletData => ({
  customer: { id: 'c1', first_name: 'Omar', last_name: 'Ali' },
  bookings: [
    { id: 1, booking_number: 'HOM-10-26-001', car_id: 10, start_date: '2026-10-01', end_date: '2026-10-05', status: 'completed', is_currently_active: false, cars: { plate_number: '34ABC10', model_group: { name: 'Fiat Egea' } } },
    { id: 2, booking_number: 'HOM-11-26-002', car_id: 20, start_date: '2026-11-01', end_date: '2026-11-09', status: 'confirmed', is_currently_active: true, cars: { plate_number: '34XYZ20', model_group: { name: 'Renault Clio' } } },
  ],
  lines: [
    { id: 'a', booking_id: 1, car_id: 10, type: 'rental', description: null, amount: 5000, direction: 'OUT', created_at: '2026-10-01T09:00:00Z', payment_ref: null },
    { id: 'b', booking_id: 1, car_id: 10, type: 'payment', description: null, amount: 6500, direction: 'IN', created_at: '2026-10-02T09:00:00Z', payment_ref: null, pay_method: 'cash' },
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
  mockDelete.mockReset().mockResolvedValue(undefined);
  mockPrint.mockReset();
  mockRole = 'admin';
  mockDeleteEnvelopes.mockReset().mockResolvedValue({ deleted: [{ ref: 'ENV-2611-0007', amount: 6500, currency: 'TRY', ledgerRowsDeleted: 1 }], failed: [] });
});

test('shows one total, then each booking with its car, balance and lines', async () => {
  render(<CustomerWalletView customerId="c1" notify={jest.fn()} onChanged={jest.fn()} />);
  const hero = await screen.findByRole('region', { name: 'Wallet balance' });
  expect(within(hero).getByText('Omar Ali')).toBeInTheDocument();
  expect(within(hero).getByText('Total balance')).toBeInTheDocument();
  expect(within(hero).getByText(/^Owes .*500$/)).toBeInTheDocument();
  expect(within(hero).getByText('Across 2 bookings')).toBeInTheDocument();
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

test('every free line has Edit and Delete; a recorded payment says Recorded', async () => {
  const notify = jest.fn();
  const onChanged = jest.fn();
  render(<CustomerWalletView customerId="c1" notify={notify} onChanged={onChanged} />);
  const older = await screen.findByRole('article', { name: 'HOM-10-26-001' });
  const payment = within(older).getByText('Payment').closest('li') as HTMLElement;
  expect(within(payment).getByText('Recorded')).toBeInTheDocument();
  expect(within(payment).queryByRole('button', { name: 'Edit transaction' })).not.toBeInTheDocument();
  const rental = within(older).getByText('Rental').closest('li') as HTMLElement;
  await userEvent.click(within(rental).getByRole('button', { name: 'Edit transaction' }));
  expect(screen.getByRole('dialog', { name: 'Edit Transaction' })).toHaveTextContent('edit a 5000');
  await userEvent.click(within(rental).getByRole('button', { name: 'Delete transaction' }));
  expect(mockDelete).not.toHaveBeenCalled();
  await userEvent.click(within(within(rental).getByRole('group', { name: 'Delete this line?' })).getByRole('button', { name: 'Yes' }));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('a'));
  expect(notify).toHaveBeenCalledWith('Transaction deleted', 'success');
  expect(onChanged).toHaveBeenCalled();
});

test('each booking adds a transaction through the old form and prints its own invoice', async () => {
  const notify = jest.fn();
  render(<CustomerWalletView customerId="c1" notify={notify} onChanged={jest.fn()} />);
  const older = await screen.findByRole('article', { name: 'HOM-10-26-001' });
  await userEvent.click(within(older).getByRole('button', { name: 'Add Transaction' }));
  const form = screen.getByRole('dialog', { name: 'Add Transaction' });
  expect(form).toHaveTextContent('booking 1 car 10 HOM-10-26-001');
  await userEvent.click(within(form).getByRole('button', { name: 'Save it' }));
  expect(notify).toHaveBeenCalledWith('Transaction added', 'success');
  expect(screen.queryByRole('dialog', { name: 'Add Transaction' })).not.toBeInTheDocument();
  await userEvent.click(within(older).getByRole('button', { name: 'Print invoice' }));
  const [invoice, car] = mockPrint.mock.calls[0];
  expect(invoice).toMatchObject({ bookingNumber: 'HOM-10-26-001', first_name: 'Omar', last_name: 'Ali', totalIn: 6500, totalOut: 5000 });
  expect(invoice.entries).toHaveLength(3);
  expect(car).toEqual({ plate_number: '34ABC10', model_name: 'Fiat Egea' });
});

test('HGS lines fold into one row, closed, and open onto passes that keep Edit and Delete', async () => {
  const withHgs = data();
  withHgs.lines.push(
    { id: 'h1', booking_id: 2, car_id: 20, type: 'hgs', description: '[AUTO-HGS] 02-11-2026 MAHMUTBEY → AVCILAR', amount: 40, direction: 'OUT', created_at: '2026-11-02T09:00:00Z', payment_ref: null },
    { id: 'h2', booking_id: 2, car_id: 20, type: 'hgs', description: '[AUTO-HGS] 04-11-2026 08:15 AVCILAR → MAHMUTBEY · KMO AVRUPA', amount: 60, direction: 'OUT', created_at: '2026-11-04T09:00:00Z', payment_ref: null },
  );
  wallet = buildWallet(withHgs);
  render(<CustomerWalletView customerId="c1" notify={jest.fn()} onChanged={jest.fn()} />);
  const card = within(await screen.findByRole('article', { name: 'HOM-11-26-002' }));
  const row = card.getByRole('button', { name: /^HGS/ });
  expect(row).toHaveAttribute('aria-expanded', 'false');
  expect(row).toHaveTextContent('from 02/11 to 04/11 · 2 passes');
  expect(row).toHaveTextContent('−₺100');
  expect(card.queryByText('MAHMUTBEY → AVCILAR')).not.toBeInTheDocument();

  await userEvent.click(card.getByRole('button', { name: /Print invoice/ }));
  expect(mockPrint.mock.calls[0][3]).toEqual({ hgsDetails: false });

  await userEvent.click(row);
  expect(row).toHaveAttribute('aria-expanded', 'true');
  await userEvent.click(card.getByRole('button', { name: /Print invoice/ }));
  expect(mockPrint.mock.calls[1][3]).toEqual({ hgsDetails: true });
  const passes = within(card.getByRole('list', { name: 'HGS passes' }));
  expect(passes.getAllByRole('listitem')).toHaveLength(2);
  expect(passes.getByText('AVCILAR → MAHMUTBEY')).toBeInTheDocument();
  expect(passes.getByText(/08:15 · KMO AVRUPA/)).toBeInTheDocument();
  expect(passes.getAllByRole('button', { name: 'Edit transaction' })).toHaveLength(2);

  await userEvent.click(passes.getAllByRole('button', { name: 'Delete transaction' })[1]);
  await userEvent.click(passes.getByRole('button', { name: 'Yes' }));
  expect(mockDelete).toHaveBeenCalledWith('h1');
});

test('a payment paid in with an envelope shows its ref and status, and admins can delete the envelope', async () => {
  const notify = jest.fn();
  const onChanged = jest.fn();
  wallet = buildWallet({ ...data(), envelopes: [{ id: 7, ref: 'ENV-2611-0007', status: 'with_admin', amount: 6500, counted_amount: null, currency: 'TRY', created_at: '2026-10-02T09:00:00Z', created_by: 's1', ledger_id: 'b' }] });
  render(<CustomerWalletView customerId="c1" notify={notify} onChanged={onChanged} />);
  const older = await screen.findByRole('article', { name: 'HOM-10-26-001' });
  const payment = within(older).getByText('Payment').closest('li') as HTMLElement;
  expect(within(payment).getByText('ENV-2611-0007')).toBeInTheDocument();
  expect(within(payment).getByText('With admin')).toBeInTheDocument();
  expect(within(payment).queryByText('Recorded')).not.toBeInTheDocument();

  await userEvent.click(within(payment).getByRole('button', { name: 'Delete envelope ENV-2611-0007' }));
  const dialog = within(screen.getByRole('alertdialog', { name: 'Delete ENV-2611-0007?' }));
  expect(dialog.getByRole('alert')).toHaveTextContent('already received by admin');
  expect(dialog.getByText('HOM-10-26-001')).toBeInTheDocument();
  await userEvent.click(dialog.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(mockDeleteEnvelopes).toHaveBeenCalledWith([expect.objectContaining({ id: 7, ref: 'ENV-2611-0007' })], null, expect.any(Function)));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(notify).toHaveBeenCalledWith(expect.stringContaining('ENV-2611-0007'), 'success');
});

test('staff see the envelope but no delete', async () => {
  mockRole = 'staff';
  wallet = buildWallet({ ...data(), envelopes: [{ id: 7, ref: 'ENV-2611-0007', status: 'in_safe', amount: 6500, counted_amount: null, currency: 'TRY', created_at: '2026-10-02T09:00:00Z', created_by: 's1', ledger_id: 'b' }] });
  render(<CustomerWalletView customerId="c1" notify={jest.fn()} onChanged={jest.fn()} />);
  const older = await screen.findByRole('article', { name: 'HOM-10-26-001' });
  const payment = within(older).getByText('Payment').closest('li') as HTMLElement;
  expect(within(payment).getByText('In safe')).toBeInTheDocument();
  expect(within(payment).queryByRole('button', { name: /Delete envelope/ })).not.toBeInTheDocument();
});
