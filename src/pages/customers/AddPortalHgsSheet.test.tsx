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

const transit = (id: number, day: string, amount: number) => ({ id, day, amount, roadType: 'public', note: `${day.split('-').reverse().join('-')} Çamlıca → Kurtköy` });

beforeEach(() => {
  mockPreview.mockReset().mockImplementation(async (_id: number, from: string) => (from >= '2026-10-01'
    ? [transit(2, '2026-10-02', 65), transit(3, '2026-10-05', 35)]
    : [transit(1, '2026-09-23', 40), transit(2, '2026-10-02', 65), transit(3, '2026-10-05', 35)]));
  mockApply.mockReset().mockResolvedValue({ count: 2, total: 100 });
});

test('reads first, in lira only, with no rate field; From starts at the booking start', async () => {
  render(<AddPortalHgsSheet card={card} onClose={jest.fn()} onPosted={jest.fn()} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  await within(sheet).findByRole('region', { name: 'Transits to add' });
  expect(mockPreview).toHaveBeenCalledWith(710, '2026-09-22');
  expect(sheet).toHaveTextContent('41AGZ890');
  expect(sheet).toHaveTextContent('HOM-09-26-037');
  expect(sheet).toHaveTextContent('Bu aracın HGS verisi en son');
  expect(sheet).toHaveTextContent('kayıttaki son geçiş 03.11.2026');
  expect(within(sheet).getByLabelText('From')).toHaveValue('2026-09-22');
  expect(within(sheet).getByLabelText('To')).toHaveAttribute('readonly');
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
  await waitFor(() => expect(mockPreview).toHaveBeenLastCalledWith(710, '2026-10-01'));
  expect(await within(sheet).findByRole('button', { name: /^Add 2 transits \(₺100,00\)$/ })).toBeInTheDocument();
});

test('confirm applies from the chosen day, then closes and refreshes', async () => {
  const onPosted = jest.fn();
  const onClose = jest.fn();
  render(<AddPortalHgsSheet card={card} onClose={onClose} onPosted={onPosted} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  fireEvent.change(within(sheet).getByLabelText('From'), { target: { value: '2026-10-01' } });
  await userEvent.click(await within(sheet).findByRole('button', { name: /^Add 2 transits/ }));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith(710, '2026-10-01'));
  expect(onPosted).toHaveBeenCalledWith('2 HGS transits added · ₺100,00');
  expect(onClose).toHaveBeenCalled();
});

test('nothing new: the button is off and says so', async () => {
  mockPreview.mockResolvedValue([]);
  render(<AddPortalHgsSheet card={card} onClose={jest.fn()} onPosted={jest.fn()} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  expect(await within(sheet).findByText('No new transits to add.')).toBeInTheDocument();
  expect(within(sheet).getByRole('button', { name: 'Add transits' })).toBeDisabled();
});
