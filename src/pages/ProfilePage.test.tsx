import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfilePage, { passwordProblem } from './ProfilePage';

const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockUpdateUser = jest.fn();
const mockSaveBg = jest.fn();
let mockProfile: Record<string, unknown>;

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ update: (values: unknown) => { mockUpdate(values); return { eq: (...args: unknown[]) => mockEq(...args) }; } }),
    auth: { updateUser: (...args: unknown[]) => mockUpdateUser(...args) },
    storage: { from: () => ({ upload: jest.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
}));
jest.mock('../lib/staffAvatarApi', () => ({ saveAvatarBg: (...args: unknown[]) => mockSaveBg(...args) }));
jest.mock('../components/shell/shellContext', () => ({ useShell: () => ({ profile: mockProfile, reloadProfile: jest.fn() }) }));

beforeEach(() => {
  mockProfile = {
    id: 'me', full_name: 'Raja Balhoum', email: 'raja@example.com', phone: '+905321234567', avatar_url: null,
    avatar_bg: 'sky', gender: 'male', role: 'admin', department_label: 'Management', is_department_head: true,
  };
  mockUpdate.mockReset();
  mockEq.mockReset().mockResolvedValue({ error: null });
  mockUpdateUser.mockReset().mockResolvedValue({ error: null });
  mockSaveBg.mockReset().mockResolvedValue(undefined);
});

test('the header has the character, name, role, email, upload and the four colors', async () => {
  render(<ProfilePage />);
  expect(screen.getByRole('heading', { name: 'Raja Balhoum' })).toBeInTheDocument();
  expect(screen.getByText('Admin')).toBeInTheDocument();
  expect(screen.getAllByText('raja@example.com').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Upload photo' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
  ['Sky', 'Mint', 'Peach', 'Lavender'].forEach((color) => expect(screen.getByRole('button', { name: color })).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Sky' })).toHaveAttribute('aria-pressed', 'true');

  await userEvent.click(screen.getByRole('button', { name: 'Peach' }));
  await waitFor(() => expect(mockSaveBg).toHaveBeenCalledWith('me', 'peach'));
  expect(screen.getByRole('button', { name: 'Peach' })).toHaveAttribute('aria-pressed', 'true');
});

test('a photo can be replaced or removed, back to the character', () => {
  mockProfile = { ...mockProfile, avatar_url: 'https://x/me.jpg' };
  render(<ProfilePage />);
  expect(screen.getByRole('button', { name: 'Replace photo' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument();
});

test('details save name, phone with its country code, and gender; email and department are read-only', async () => {
  render(<ProfilePage />);
  expect(screen.getByRole('combobox', { name: 'Country code' })).toHaveValue('+90');
  expect(screen.getByLabelText('Phone')).toHaveValue('5321234567');
  expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument();
  expect(screen.getByText('Management · Head')).toBeInTheDocument();

  await userEvent.selectOptions(screen.getByLabelText('Gender'), 'female');
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ full_name: 'Raja Balhoum', phone: '+905321234567', gender: 'female' }));
  expect(mockEq).toHaveBeenCalledWith('id', 'me');
});

test('the password button waits for a valid, matching password', async () => {
  render(<ProfilePage />);
  const button = screen.getByRole('button', { name: 'Change password' });
  expect(button).toBeDisabled();
  await userEvent.type(screen.getByLabelText('New password'), 'short');
  expect(screen.getByRole('alert')).toHaveTextContent('Use at least 8 characters.');
  await userEvent.type(screen.getByLabelText('New password'), 'enough1');
  await userEvent.type(screen.getByLabelText('Confirm new password'), 'shortenough');
  expect(screen.getByRole('alert')).toHaveTextContent("The two passwords don't match.");
  expect(button).toBeDisabled();
  await userEvent.clear(screen.getByLabelText('Confirm new password'));
  await userEvent.type(screen.getByLabelText('Confirm new password'), 'shortenough1');
  expect(button).toBeEnabled();
  await userEvent.click(button);
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'shortenough1' }));
  expect(passwordProblem('', '')).toBeNull();
});
