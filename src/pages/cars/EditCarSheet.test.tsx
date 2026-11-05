import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditCarSheet } from './EditCarSheet';

const BASE = 'https://x.supabase.co/storage/v1/object/public';
const mockSaveFields = jest.fn();
const mockRemoveDoc = jest.fn();
let mockTables: Record<string, unknown>;

jest.mock('../../lib/session', () => ({ ensureFreshSession: async () => 'token' }));
jest.mock('../../lib/carEditor', () => ({
  ...jest.requireActual('../../lib/carEditor'),
  saveFields: (...args: unknown[]) => mockSaveFields(...args),
  removeDoc: (...args: unknown[]) => mockRemoveDoc(...args),
}));
jest.mock('../../lib/supabase', () => {
  const builder = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => chain,
      then: (resolve: (value: unknown) => unknown) => resolve({ data: mockTables[table], error: null }),
    };
    return chain;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});
jest.mock('../../lib/customers', () => ({
  ...jest.requireActual('../../lib/customers'),
  istanbulDate: () => '2026-11-05',
}));

const renderSheet = (onClose = jest.fn(), showToast = jest.fn()) => {
  render(<EditCarSheet carId={7} onClose={onClose} showToast={showToast} />);
  return { onClose, showToast };
};

beforeEach(() => {
  mockSaveFields.mockReset().mockResolvedValue(undefined);
  mockRemoveDoc.mockReset().mockResolvedValue(undefined);
  mockTables = {
    cars: { plate_number: '34ABC123', investor_id: 'i1', model_group_id: 2, car_photo_urls: [{ url: `${BASE}/cars-photos/a.jpg`, name: 'a.jpg', uploaded_at: '' }] },
    cars_registration: [{ manufacture_year: 2022, car_package: 'Premium', insurance_expiry: '2026-11-12', inspection_expiry: '2027-03-01', purchase_date: null, ruhsat_url: `${BASE}/doc/R-34ABC123`, kasko: null }],
    car_photos: [{ id: 9, car_id: 7, file_path: `${BASE}/car_photos/car_7/old.jpg`, is_primary: true, sort_order: 0, created_at: null }],
    model_group: [{ id: 2, name: 'Fiat Egea' }],
    investors: [{ id: 'i1', profiles: { full_name: 'Omar Investor' } }],
  };
});

test('shows the car in the header and the five sections', async () => {
  renderSheet();
  expect(await screen.findByRole('heading', { name: 'Fiat Egea' })).toBeInTheDocument();
  expect(screen.getByText('34ABC123')).toBeInTheDocument();
  expect(screen.getByText('Investor · Omar Investor')).toBeInTheDocument();
  for (const name of ['Car info', 'Registration', 'Expiry dates', 'Documents', 'Photos']) {
    expect(screen.getByRole('region', { name })).toBeInTheDocument();
  }
});

test('colours the expiry chips by days left', async () => {
  renderSheet();
  const expiry = await screen.findByRole('region', { name: 'Expiry dates' });
  expect(within(expiry).getByText('7 days left')).toHaveAttribute('data-tone', 'red');
  expect(within(expiry).getByText('116 days left')).toHaveAttribute('data-tone', 'green');
  await userEvent.clear(within(expiry).getByLabelText('Insurance expiry'));
  expect(within(expiry).getByText('Not set')).toHaveAttribute('data-tone', 'grey');
});

test('marks each document uploaded or missing', async () => {
  renderSheet();
  const docs = await screen.findByRole('region', { name: 'Documents' });
  const ruhsat = within(docs).getByRole('group', { name: 'Ruhsat' });
  const kasko = within(docs).getByRole('group', { name: 'Kasko' });
  expect(within(ruhsat).getByText('Uploaded')).toBeInTheDocument();
  expect(within(kasko).getByText('Missing')).toBeInTheDocument();
  expect(within(docs).getByText('4 of 5 missing · PDF or image')).toBeInTheDocument();
});

test('asks before a document is removed', async () => {
  const { showToast } = renderSheet();
  const docs = await screen.findByRole('region', { name: 'Documents' });
  const ruhsat = within(docs).getByRole('group', { name: 'Ruhsat' });
  await userEvent.click(within(ruhsat).getByRole('button', { name: 'Remove' }));
  expect(mockRemoveDoc).not.toHaveBeenCalled();
  await userEvent.click(within(within(ruhsat).getByRole('group', { name: 'Remove Ruhsat?' })).getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(within(ruhsat).getByText('Missing')).toBeInTheDocument());
  expect(mockRemoveDoc).toHaveBeenCalledWith(7, expect.objectContaining({ column: 'ruhsat_url' }), `${BASE}/doc/R-34ABC123`);
  expect(showToast).toHaveBeenCalledWith('Ruhsat removed', 'success');
});

test('shows mirror photos as primary and a dead row as unavailable', async () => {
  renderSheet();
  const photos = await screen.findByRole('region', { name: 'Photos' });
  expect(within(photos).getByText('Primary')).toBeInTheDocument();
  expect(within(photos).getByText('Image unavailable')).toBeInTheDocument();
  expect(within(photos).getByRole('button', { name: 'Delete photo 2' })).toBeInTheDocument();
});

test('saves only the changed fields, then toasts and closes', async () => {
  const { onClose, showToast } = renderSheet();
  const registration = await screen.findByRole('region', { name: 'Registration' });
  const year = within(registration).getByLabelText('Manufacture year');
  await userEvent.clear(year);
  await userEvent.type(year, '2023');
  expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
  const [carId, current, baseline] = mockSaveFields.mock.calls[0];
  expect(carId).toBe(7);
  expect(current.manufactureYear).toBe('2023');
  expect(baseline.manufactureYear).toBe('2022');
  expect(showToast).toHaveBeenCalledWith('Car saved', 'success');
});

test('a bad year stops the save', async () => {
  renderSheet();
  const year = await screen.findByLabelText('Manufacture year');
  await userEvent.clear(year);
  await userEvent.type(year, '1700');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Enter a year between 1980 and 2027.')).toBeInTheDocument();
  expect(mockSaveFields).not.toHaveBeenCalled();
});

test('closing with unsaved changes asks first', async () => {
  const { onClose } = renderSheet();
  const plate = await screen.findByLabelText('Plate number');
  await userEvent.type(plate, '9');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Discard your changes?')).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(onClose).toHaveBeenCalledWith(false);
});

test('closing untouched closes straight away', async () => {
  const { onClose } = renderSheet();
  await screen.findByRole('heading', { name: 'Fiat Egea' });
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalledWith(false);
});
