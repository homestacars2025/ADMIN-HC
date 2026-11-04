import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

const mockGetSession = jest.fn();
const mockCheckAccess = jest.fn();
const mockEndSession = jest.fn();

jest.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: (...a: unknown[]) => mockGetSession(...a) } } }));
jest.mock('../lib/adminAccess', () => ({ checkAdminAccess: (...a: unknown[]) => mockCheckAccess(...a) }));
jest.mock('../lib/session', () => ({ endSession: (...a: unknown[]) => mockEndSession(...a) }));

const SESSION = { data: { session: { user: { id: 'u1' } } }, error: null };

const Page: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div>
      <input aria-label="Draft" />
      <button type="button" onClick={() => navigate('/dashboard/other')}>Go</button>
    </div>
  );
};

const renderAt = (path = '/dashboard/bookings') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/login" element={<p>Login page</p>} />
      <Route path="/dashboard/*" element={<ProtectedRoute><Page /></ProtectedRoute>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue(SESSION);
  mockCheckAccess.mockReset().mockResolvedValue('allowed');
  mockEndSession.mockReset().mockResolvedValue(undefined);
});

test('a check that cannot get through keeps the page and what was typed', async () => {
  renderAt();
  await userEvent.type(await screen.findByLabelText('Draft'), 'half a booking');

  mockGetSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
  await userEvent.click(screen.getByRole('button', { name: 'Go' }));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByLabelText('Draft')).toHaveValue('half a booking');

  mockGetSession.mockResolvedValue(SESSION);
  mockCheckAccess.mockResolvedValue('unreachable');
  await userEvent.click(screen.getByRole('button', { name: 'Go' }));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByLabelText('Draft')).toHaveValue('half a booking');
  expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  expect(mockEndSession).not.toHaveBeenCalled();
});

test('a session that ends while on a page stays on it, for the login to open over it', async () => {
  renderAt();
  await screen.findByLabelText('Draft');
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  await userEvent.click(screen.getByRole('button', { name: 'Go' }));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByLabelText('Draft')).toBeInTheDocument();
  expect(mockEndSession).not.toHaveBeenCalled();
});

test('opening the app offline waits to reconnect instead of going to the login', async () => {
  mockCheckAccess.mockResolvedValue('unreachable');
  renderAt();
  expect(await screen.findByText('Reconnecting…')).toBeInTheDocument();
  expect(screen.queryByText('Login page')).not.toBeInTheDocument();

  mockCheckAccess.mockResolvedValue('allowed');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Draft')).toBeInTheDocument();
});

test('with no session at all it goes to the login', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  renderAt();
  expect(await screen.findByText('Login page')).toBeInTheDocument();
});

test('a disabled account is signed out', async () => {
  renderAt();
  await screen.findByLabelText('Draft');
  mockCheckAccess.mockResolvedValue('disabled');
  await userEvent.click(screen.getByRole('button', { name: 'Go' }));
  expect(await screen.findByText('Login page')).toBeInTheDocument();
  expect(mockEndSession).toHaveBeenCalledTimes(1);
});
