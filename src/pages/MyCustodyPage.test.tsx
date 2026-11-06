import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import MyCustodyPage from './MyCustodyPage';
import { istanbulDate } from '../lib/customers';
import type { CustodyMovement } from '../lib/myCustody';

const mockFetch = jest.fn();
const mockAdd = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockUpload = jest.fn();

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../components/shell/shellContext', () => ({ useShell: () => ({ profile: { id: 'me' }, reloadProfile: jest.fn() }) }));
jest.mock('../lib/receiptImage', () => ({
  ...jest.requireActual('../lib/receiptImage'),
  prepareReceipt: async (file: File) => file,
}));
jest.mock('../lib/myCustody', () => ({
  ...jest.requireActual('../lib/myCustody'),
  fetchMyCustody: (...args: unknown[]) => mockFetch(...args),
  addCustodyExpense: (...args: unknown[]) => mockAdd(...args),
  updateCustodyExpense: (...args: unknown[]) => mockUpdate(...args),
  deleteCustodyExpense: (...args: unknown[]) => mockDelete(...args),
  uploadCustodyReceipt: (...args: unknown[]) => mockUpload(...args),
  fetchExpenseCars: async () => [{ id: 7, plate_number: '34KDT101', model: 'Fiat Egea' }],
  fetchSupplierChoices: async () => [{ id: 3, name: 'Otopark AŞ' }],
}));

const row = (over: Partial<CustodyMovement>): CustodyMovement => ({
  id: 1, transaction_date: '2026-11-01', direction: 'OUT', category: 'Petrol', amount: 100, description: null,
  receipt_url: 'https://x/r.jpg', created_at: new Date().toISOString(), created_by: 'me', expense_scope: 'car', car_id: 7,
  supplier_id: null, posted_car_tx_id: null, posted_company_expense_id: null, review_status: 'pending', reviewed_at: null,
  review_note: null, car: { plate_number: '34KDT101' }, supplier: null, ...over,
});

const ROWS = [
  row({ id: 1, direction: 'IN', amount: 2000, category: null, created_by: 'finance', review_status: 'approved', reviewed_at: '2026-11-01', receipt_url: null }),
  row({ id: 2, amount: 300, description: 'Full tank' }),
  row({ id: 3, amount: 120, category: 'Wash', review_status: 'rejected', review_note: 'Blurry receipt', created_at: '2026-11-01T09:00:00Z' }),
  row({ id: 4, amount: 80, category: 'Branch', expense_scope: 'company', car_id: null, car: null, review_status: 'approved', reviewed_at: '2026-11-03', posted_company_expense_id: 5 }),
];

const Where: React.FC = () => <span data-testid="where">{useLocation().search}</span>;
const renderPage = (url = '/dashboard/my-custody') => render(<MemoryRouter initialEntries={[url]}><MyCustodyPage /><Where /></MemoryRouter>);

beforeAll(() => {
  URL.createObjectURL = () => 'blob:receipt';
  URL.revokeObjectURL = () => undefined;
});

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue(ROWS);
  mockAdd.mockReset().mockResolvedValue(99);
  mockUpdate.mockReset().mockResolvedValue(undefined);
  mockDelete.mockReset().mockResolvedValue(undefined);
  mockUpload.mockReset().mockResolvedValue('https://x/new.jpg');
});

test("reads only the signed-in person's custody, with balance tiles that filter", async () => {
  renderPage();
  const balance = await screen.findByRole('button', { name: /Balance/ });
  expect(mockFetch).toHaveBeenCalledWith('me');
  expect(balance).toHaveTextContent('₺1.500,00');
  expect(screen.getByRole('button', { name: /Received/ })).toHaveTextContent('₺2.000,00');
  expect(screen.getByRole('button', { name: /Spent/ })).toHaveTextContent('₺500,00');
  expect(screen.getByRole('button', { name: /Pending/ })).toHaveTextContent('1');

  await userEvent.click(screen.getByRole('button', { name: /Pending/ }));
  expect(screen.getByTestId('where')).toHaveTextContent('filter=pending');
  expect(screen.getAllByText('Full tank').length).toBeGreaterThan(0);
  expect(screen.queryAllByText('Wash')).toHaveLength(0);
});

test('chips show the review state, and only own pending or rejected expenses can be changed', async () => {
  renderPage();
  await screen.findByRole('button', { name: /Balance/ });
  expect(screen.getAllByText('From finance').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Rejected: Blurry receipt').length).toBeGreaterThan(0);
  // Edit on the pending and the rejected one; delete only on the fresh pending one.
  expect(screen.getAllByRole('button', { name: 'Edit expense' })).toHaveLength(4);
  expect(screen.getAllByRole('button', { name: 'Delete expense' })).toHaveLength(2);
});

test('adds a company expense through the same RPC as Team, receipt first', async () => {
  renderPage();
  await screen.findByRole('button', { name: /Balance/ });
  await userEvent.click(screen.getByRole('button', { name: /Add expense/ }));
  const sheet = within(screen.getByRole('dialog', { name: 'Add expense' }));
  const save = sheet.getByRole('button', { name: 'Save' });
  expect(save).toBeDisabled();
  expect(sheet.getByText(/Still needed: amount · car · category · receipt/)).toBeInTheDocument();

  await userEvent.type(sheet.getByLabelText('Amount'), '250,50');
  expect(sheet.getByText(/Your balance after this:/)).toHaveTextContent('₺1.249,50');
  await userEvent.click(sheet.getByRole('radio', { name: /Company expenses/ }));
  await userEvent.click(sheet.getByRole('radio', { name: 'Transport' }));
  await userEvent.selectOptions(sheet.getByRole('combobox', { name: 'Supplier (optional)' }), '3');
  const receipt = new File(['x'], 'slip.jpg', { type: 'image/jpeg' });
  await userEvent.upload(sheet.getByLabelText('Choose a receipt'), receipt);
  expect(await sheet.findByText('slip.jpg')).toBeInTheDocument();

  await userEvent.click(save);
  await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));
  expect(mockUpload).toHaveBeenCalledWith('me', receipt, expect.any(Function));
  expect(mockAdd).toHaveBeenCalledWith({
    amount: 250.5, category: 'Transport', description: null, date: istanbulDate(), scope: 'company', carId: null, supplierId: 3, receiptUrl: 'https://x/new.jpg',
  });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add expense' })).not.toBeInTheDocument());
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test('editing keeps the receipt and goes back for review; deleting asks first', async () => {
  renderPage();
  await screen.findByRole('button', { name: /Balance/ });
  // Newest first, so the first one is the rejected wash.
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit expense' })[0]);
  const sheet = within(screen.getByRole('dialog', { name: 'Edit expense' }));
  expect(sheet.getByText('Editing sends the expense back for review.')).toBeInTheDocument();
  expect(sheet.getByText('Rejected: Blurry receipt')).toBeInTheDocument();
  expect(sheet.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  const amount = sheet.getByLabelText('Amount');
  await userEvent.clear(amount);
  await userEvent.type(amount, '320');
  await userEvent.click(sheet.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(3, expect.objectContaining({ amount: 320, category: 'Wash', receiptUrl: null, scope: 'car', carId: 7 })));
  expect(mockUpload).not.toHaveBeenCalled();

  await userEvent.click(screen.getAllByRole('button', { name: 'Delete expense' })[0]);
  expect(screen.getByText('Delete this expense?')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(2));
});

test('a load failure offers a retry', async () => {
  mockFetch.mockRejectedValueOnce(new Error('network down'));
  renderPage();
  expect(await screen.findByText("Couldn't load your custody: network down")).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: /Balance/ })).toBeInTheDocument();
});
