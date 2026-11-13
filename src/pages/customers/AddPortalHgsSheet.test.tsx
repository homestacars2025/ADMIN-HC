import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddPortalHgsSheet } from './AddPortalHgsSheet';
import type { WalletCard } from '../../lib/customerWallet';

const mockPreview = jest.fn();
const mockApply = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/hgsPortalPosting', () => ({
  ...jest.requireActual('../../lib/hgsPortalPosting'),
  previewCustomerHgs: (...args: unknown[]) => mockPreview(...args),
  applyCustomerHgs: (...args: unknown[]) => mockApply(...args),
  fetchPortalFreshness: async () => ({ lastUpload: '2026-11-05T12:53:05Z', lastTransit: '2026-11-03' }),
}));

const card = {
  id: 710, carId: 26, bookingNumber: 'HOM-09-26-037', plate: '41AGZ890', model: 'Renault Clio', startDate: '2026-09-22', endDate: '2026-12-07',
  status: 'confirmed', active: true, balance: -272, carNotes: [], entries: [],
  lines: [{ id: 'm1', booking_id: 710, car_id: 26, type: 'hgs', description: 'HGS to 31/09/2026', amount: 272, direction: 'OUT', created_at: '2026-10-07T00:00:00Z', payment_ref: null, kind: 'hgs', label: 'HGS', peer: null, note: null, editable: true, hgs: { pass: false, day: '2026-10-07', time: null, route: 'HGS to 31/09/2026', toll: null }, envelope: null }],
} as unknown as WalletCard;

const transit = (id: number, day: string, amount: number, outsideBooking = false, otherBooking: string | null = null) =>
  ({ id, day, amount, roadType: 'public', note: `${day.split('-').reverse().join('-')} Çamlıca → Kurtköy`, outsideBooking, otherBooking });

beforeEach(() => {
  mockPreview.mockReset().mockImplementation(async (_id: number, from: string) => (from >= '2026-10-01'
    ? [transit(2, '2026-10-02', 65), transit(3, '2026-10-05', 35)]
    : [transit(1, '2026-09-23', 40), transit(2, '2026-10-02', 65), transit(3, '2026-10-05', 35)]));
  mockApply.mockReset().mockResolvedValue({ count: 2, total: 100 });
});

test('reads first, in lira only, with no rate field; From and To start at the booking\'s dates', async () => {
  render(<AddPortalHgsSheet card={card} onClose={jest.fn()} onPosted={jest.fn()} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  await within(sheet).findByRole('region', { name: 'Transits to add' });
  expect(mockPreview).toHaveBeenCalledWith(710, '2026-09-22', '2026-12-07');
  expect(sheet).toHaveTextContent('41AGZ890');
  expect(sheet).toHaveTextContent('HOM-09-26-037');
  expect(sheet).toHaveTextContent('Bu aracın HGS verisi en son');
  expect(sheet).toHaveTextContent('kayıttaki son geçiş 03.11.2026');
  expect(within(sheet).getByLabelText('From')).toHaveValue('2026-09-22');
  expect(within(sheet).getByLabelText('To')).toHaveValue('2026-12-07');
  expect(within(sheet).getByLabelText('To')).not.toHaveAttribute('readonly');
  expect(within(sheet).queryByLabelText(/rate/i)).not.toBeInTheDocument();
  expect(sheet).not.toHaveTextContent(/USD|\$/);
  expect(within(sheet).getByRole('button', { name: /^Add 3 transits \(₺140,00\)$/ })).toBeEnabled();
  expect(mockApply).not.toHaveBeenCalled();
});

test('the hand-typed HGS warning moves From past what it covers, and the preview follows', async () => {
  render(<AddPortalHgsSheet card={card} onClose={jest.fn()} onPosted={jest.fn()} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  expect(sheet).toHaveTextContent('already has HGS typed by hand: HGS to 31/09/2026');
  await userEvent.click(within(sheet).getByRole('button', { name: 'From 01.10.2026' }));
  await waitFor(() => expect(mockPreview).toHaveBeenLastCalledWith(710, '2026-10-01', '2026-12-07'));
  expect(await within(sheet).findByRole('button', { name: /^Add 2 transits \(₺100,00\)$/ })).toBeInTheDocument();
});

test('confirm applies from the chosen day, then closes and refreshes', async () => {
  const onPosted = jest.fn();
  const onClose = jest.fn();
  render(<AddPortalHgsSheet card={card} onClose={onClose} onPosted={onPosted} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  fireEvent.change(within(sheet).getByLabelText('From'), { target: { value: '2026-10-01' } });
  await userEvent.click(await within(sheet).findByRole('button', { name: /^Add 2 transits/ }));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith(710, '2026-10-01', '2026-12-07'));
  expect(onPosted).toHaveBeenCalledWith('2 HGS transits added · ₺100,00');
  expect(onClose).toHaveBeenCalled();
});

test('both dates are free: a range wider than the booking goes to the database as typed', async () => {
  render(<AddPortalHgsSheet card={card} onClose={jest.fn()} onPosted={jest.fn()} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  fireEvent.change(within(sheet).getByLabelText('From'), { target: { value: '2026-01-01' } });
  fireEvent.change(within(sheet).getByLabelText('To'), { target: { value: '2027-06-30' } });
  await waitFor(() => expect(mockPreview).toHaveBeenLastCalledWith(710, '2026-01-01', '2027-06-30'));
  expect(within(sheet).getByLabelText('From')).toHaveValue('2026-01-01');
  expect(within(sheet).getByLabelText('To')).toHaveValue('2027-06-30');
});

test('From after To reads nothing and says why', async () => {
  render(<AddPortalHgsSheet card={card} onClose={jest.fn()} onPosted={jest.fn()} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  await within(sheet).findByRole('region', { name: 'Transits to add' });
  mockPreview.mockClear();
  fireEvent.change(within(sheet).getByLabelText('To'), { target: { value: '2026-09-01' } });
  expect(await within(sheet).findByText('From is after To.')).toBeInTheDocument();
  expect(mockPreview).not.toHaveBeenCalled();
  expect(within(sheet).getByRole('button', { name: 'Add transits' })).toBeDisabled();
});

test('nothing new: the button is off and says so', async () => {
  mockPreview.mockResolvedValue([]);
  render(<AddPortalHgsSheet card={card} onClose={jest.fn()} onPosted={jest.fn()} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  expect(await within(sheet).findByText('No new transits to add.')).toBeInTheDocument();
  expect(within(sheet).getByRole('button', { name: 'Add transits' })).toBeDisabled();
});

test('rows outside the booking are marked, counted above the list, and asked about before charging', async () => {
  mockPreview.mockResolvedValue([
    transit(1, '2026-09-20', 40, true, 'HOM-09-26-011'),
    transit(2, '2026-10-02', 65),
    transit(3, '2026-12-09', 35, true),
  ]);
  render(<AddPortalHgsSheet card={card} onClose={jest.fn()} onPosted={jest.fn()} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  const list = await within(sheet).findByRole('region', { name: 'Transits to add' });
  expect(list).toHaveTextContent('3 transits·₺140,00·2 outside this booking');
  expect(within(list).getAllByText('Outside this booking')).toHaveLength(2);
  expect(list).toHaveTextContent("On HOM-09-26-011's dates");

  await userEvent.click(within(sheet).getByRole('button', { name: /^Add 3 transits/ }));
  const ask = await screen.findByRole('alertdialog', { name: 'Charge transits outside this booking?' });
  expect(ask).toHaveTextContent("2 of the 3 transits (₺75,00) are outside this booking's dates.");
  expect(ask).toHaveTextContent("1 falls on another booking's dates.");
  expect(mockApply).not.toHaveBeenCalled();

  await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(mockApply).not.toHaveBeenCalled();

  await userEvent.click(within(sheet).getByRole('button', { name: /^Add 3 transits/ }));
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Add 3 transits/ }));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith(710, '2026-09-22', '2026-12-07'));
});

test('typing a date reads once it settles, not on every change', async () => {
  render(<AddPortalHgsSheet card={card} onClose={jest.fn()} onPosted={jest.fn()} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  await within(sheet).findByRole('region', { name: 'Transits to add' });
  mockPreview.mockClear();
  const from = within(sheet).getByLabelText('From');
  fireEvent.change(from, { target: { value: '2026-09-25' } });
  fireEvent.change(from, { target: { value: '2026-09-28' } });
  fireEvent.change(from, { target: { value: '2026-10-01' } });
  await waitFor(() => expect(mockPreview).toHaveBeenCalledWith(710, '2026-10-01', '2026-12-07'));
  expect(mockPreview).toHaveBeenCalledTimes(1);
});
