import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CustomerWalletsTab } from './CustomerWalletsTab';
import type { WalletSummary } from '../../lib/customerWallet';

let mockCurrency = 'TRY';
const mockRates = [{ currency: 'USD', rate_to_try: 50, updated_at: '2026-11-09T08:15:56.648' }];

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/CurrencyContext', () => ({ useCurrency: () => ({ currency: mockCurrency, rates: mockRates }) }));
jest.mock('../../lib/customerWallet', () => ({
  ...jest.requireActual('../../lib/customerWallet'),
  fetchWalletSummaries: async () => mockRows,
}));
jest.mock('../customers/CustomerWallet', () => ({
  ...jest.requireActual('../customers/CustomerWallet'),
  CustomerWalletSheet: () => null,
}));

const row = (customerId: string, name: string, balance: number, plates: string[] = []): WalletSummary => ({
  customerId, name, phone: null, banned: false, banReason: null, balance, bookings: 1, plates, onRoad: false,
});
let mockRows: WalletSummary[] = [];

const renderTab = () => render(<MemoryRouter><CustomerWalletsTab /></MemoryRouter>);
const netTile = () => screen.getByRole('button', { name: /^Net (receivable|payable)|^All/ });

beforeEach(() => {
  mockCurrency = 'TRY';
  mockRows = [
    row('a', 'Ali Veli', -250_000, ['34 ABC 101']),
    row('b', 'Ayşe Kaya', -12_037, ['34 KDT 202']),
    row('c', 'Omar Said', 70_000, ['06 XYZ 303']),
    row('d', 'Sara Lee', 0),
  ];
});

test('the All tile shows the net receivable, with the wallet count under it', async () => {
  renderTab();
  expect(await screen.findByText('Net receivable')).toBeInTheDocument();
  expect(netTile()).toHaveTextContent('₺192.037,00');
  expect(netTile()).toHaveTextContent('Customers owe us after credits');
  expect(netTile()).toHaveTextContent('4 wallets');
  expect(netTile()).toHaveAttribute('aria-pressed', 'true');
});

test('the net follows the search', async () => {
  renderTab();
  await screen.findByText('Net receivable');
  await userEvent.type(screen.getByRole('searchbox'), '06 XYZ');
  expect(screen.getByText('Net payable')).toBeInTheDocument();
  expect(netTile()).toHaveTextContent('₺70.000,00');
  expect(netTile()).toHaveTextContent('We owe customers after credits');
  expect(netTile()).toHaveTextContent('1 wallet');
});

test('in dollars the tiles convert at the latest rate', async () => {
  mockCurrency = 'USD';
  renderTab();
  await screen.findByText('Net receivable');
  expect(netTile()).toHaveTextContent('$3,840.74');
  expect(screen.getByRole('button', { name: /^Owe us/ })).toHaveTextContent('$5,240.74');
  expect(screen.getByRole('button', { name: /^In credit/ })).toHaveTextContent('$1,400.00');
});
