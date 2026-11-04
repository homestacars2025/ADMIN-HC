import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SessionGuard } from './SessionGuard';
import type { SessionHealth } from '../../lib/session';

let mockHealth: SessionHealth;
const mockSignIn = jest.fn();
const mockEndSession = jest.fn();

jest.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } } }));
jest.mock('../../lib/adminAccess', () => ({ signInAsAdmin: (...a: unknown[]) => mockSignIn(...a) }));
jest.mock('../../lib/session', () => ({
  useSessionHealth: () => mockHealth,
  ensureFreshSession: jest.fn(),
  endSession: (...a: unknown[]) => mockEndSession(...a),
}));

const HEALTHY: SessionHealth = { reconnecting: false, gaveUp: false, expired: false, email: 'admin@homestacars.com', userId: 'u1' };
const renderGuard = () => render(<MemoryRouter><input aria-label="Draft" defaultValue="unsaved note" /><SessionGuard /></MemoryRouter>);

beforeEach(() => {
  mockHealth = HEALTHY;
  mockSignIn.mockReset().mockResolvedValue(null);
  mockEndSession.mockReset();
});

test('shows nothing while the session is fine', () => {
  renderGuard();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('shows Reconnecting… while a refresh is retried, then offers to try again', () => {
  mockHealth = { ...HEALTHY, reconnecting: true };
  const { rerender } = renderGuard();
  expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…');

  mockHealth = { ...HEALTHY, reconnecting: true, gaveUp: true };
  rerender(<MemoryRouter><input aria-label="Draft" defaultValue="unsaved note" /><SessionGuard /></MemoryRouter>);
  expect(screen.getByRole('status')).toHaveTextContent("Can't reach the server. Your work is still here.");
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});

test('an ended session opens the login over the page, which keeps what was typed', async () => {
  mockHealth = { ...HEALTHY, expired: true };
  renderGuard();
  const dialog = screen.getByRole('dialog', { name: 'Sign in again' });
  expect(screen.getByLabelText('Email')).toHaveValue('admin@homestacars.com');
  expect(screen.getByLabelText('Draft')).toHaveValue('unsaved note');

  await userEvent.type(screen.getByLabelText('Password'), 'secret');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('admin@homestacars.com', 'secret'));
  expect(dialog).toBeInTheDocument();
  expect(mockEndSession).not.toHaveBeenCalled();
});

test('a wrong password stays in the modal with the reason', async () => {
  mockHealth = { ...HEALTHY, expired: true };
  mockSignIn.mockResolvedValue('Invalid login credentials');
  renderGuard();
  await userEvent.type(screen.getByLabelText('Password'), 'nope');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
});
