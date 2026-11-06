import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UserMenu } from './UserMenu';
import type { CurrentProfile } from '../../hooks/useCurrentProfile';

const mockCustody = jest.fn();
const mockWallet = jest.fn();

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/session', () => ({ endSession: jest.fn() }));
jest.mock('../../lib/myCustody', () => ({ fetchMyCustodyBalance: (...args: unknown[]) => mockCustody(...args) }));
jest.mock('../../lib/myWallet', () => ({ fetchMyWalletBalance: (...args: unknown[]) => mockWallet(...args) }));

const profile: CurrentProfile = {
  id: 'me', full_name: 'Raja Balhoum', email: 'raja@example.com', phone: null, avatar_url: null, gender: 'male',
  role: 'admin', department_label: 'Management', is_department_head: false,
};

test('the menu lists My profile, then My wallet and My custody with their balances', async () => {
  mockWallet.mockResolvedValue(12500);
  mockCustody.mockResolvedValue(-250);
  render(<MemoryRouter><UserMenu profile={profile} /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
  const menu = within(screen.getByRole('menu'));
  const items = menu.getAllByRole('menuitem').map((item) => item.textContent);
  expect(items[0]).toBe('My profile');
  expect(menu.getByRole('menuitem', { name: /My wallet/ })).toHaveAttribute('href', '/dashboard/my-wallet');
  expect(menu.getByRole('menuitem', { name: /My custody/ })).toHaveAttribute('href', '/dashboard/my-custody');
  expect(await menu.findByText('₺12.500,00')).toBeInTheDocument();
  expect(await menu.findByText('−₺250,00')).toBeInTheDocument();
  expect(mockWallet).toHaveBeenCalledWith('me');
  expect(mockCustody).toHaveBeenCalledWith('me');
});
