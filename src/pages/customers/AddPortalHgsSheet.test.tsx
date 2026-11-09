import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddPortalHgsSheet } from './AddPortalHgsSheet';
import type { WalletCard } from '../../lib/customerWallet';

const mockRpc = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock('../../lib/CurrencyContext', () => ({ useCurrency: () => ({ rates: [{ currency: 'USD', rate_to_try: 50 }] }) }));

const card = {
  id: 710, carId: 26, bookingNumber: 'HOM-09-26-037', plate: '41AGZ890', model: 'Renault Clio', startDate: '2026-09-22', endDate: '2026-12-07',
  status: 'confirmed', active: true, balance: -272, carNotes: [], entries: [],
  lines: [{ id: 'm1', booking_id: 710, car_id: 26, type: 'hgs', description: 'HGS to 31/09/2026', amount: 272, direction: 'OUT', created_at: '2026-10-07T00:00:00Z', payment_ref: null, exchange_rate_at_entry: 48.5, kind: 'hgs', label: 'HGS', peer: null, note: null, editable: true, hgs: { pass: false, day: '2026-10-07', time: null, route: 'HGS to 31/09/2026', toll: null }, envelope: null }],
} as unknown as WalletCard;

const transit = (id: number, at: string, amount: number) => ({ id, at, amount, road_type: 'public', entry_location: 'Çamlıca', exit_location: 'Kurtköy', otoyol: null });
const preview = (transits: unknown[]) => ({ data: { from: '2026-10-01', to: '2026-12-07', last_upload: '2026-11-05T15:53', last_transit: '2026-11-03T18:20', rate_hint: 48.5, investor_count: 0, investor_total: 0, transits }, error: null });

beforeEach(() => {
  mockRpc.mockReset().mockImplementation(async (name: string) => (
    name === 'booking_portal_hgs_preview'
      ? preview([transit(1, '2026-10-04 08:12', 65), transit(2, '2026-10-05 19:40', 35)])
      : { data: { posted: 2, total: 100, from: '2026-10-01', to: '2026-12-07' }, error: null }
  ));
});

test('reads first: the upload banner, the typed HGS warning, the passes and their total', async () => {
  render(<AddPortalHgsSheet card={card} onClose={jest.fn()} onPosted={jest.fn()} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  await within(sheet).findByRole('region', { name: 'Transits to add' });
  expect(mockRpc).toHaveBeenCalledWith('booking_portal_hgs_preview', { p_booking_id: 710, p_from: '2026-10-01', p_to: '2026-12-07' });
  expect(sheet).toHaveTextContent('Bu aracın (41AGZ890) HGS verisi en son 05.11.2026 15:53 yüklendi. Kayıttaki son geçiş: 03.11.2026.');
  expect(sheet).toHaveTextContent('already has HGS typed by hand: HGS to 31/09/2026');
  expect(within(sheet).getByRole('region', { name: 'Transits to add' })).toHaveTextContent('04.10.2026 08:12');
  expect(within(sheet).getByRole('textbox', { name: 'USD rate' })).toHaveValue('48.5');
  expect(within(sheet).getByRole('button', { name: 'Add 2 passes' })).toBeEnabled();
  expect(mockRpc).not.toHaveBeenCalledWith('post_booking_portal_hgs', expect.anything());
});

test('Confirm posts the range at the chosen rate and refreshes the wallet', async () => {
  const onPosted = jest.fn();
  const onClose = jest.fn();
  render(<AddPortalHgsSheet card={card} onClose={onClose} onPosted={onPosted} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  const add = await within(sheet).findByRole('button', { name: 'Add 2 passes' });
  fireEvent.change(within(sheet).getByRole('textbox', { name: 'USD rate' }), { target: { value: '49,5' } });
  await userEvent.click(add);
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('post_booking_portal_hgs', { p_booking_id: 710, p_from: '2026-10-01', p_to: '2026-12-07', p_rate: 49.5 }));
  expect(onPosted).toHaveBeenCalledWith(expect.stringMatching(/^2 HGS passes added/));
  expect(onClose).toHaveBeenCalled();
});

test('a second run finds nothing new and cannot post', async () => {
  mockRpc.mockImplementation(async () => preview([]));
  render(<AddPortalHgsSheet card={card} onClose={jest.fn()} onPosted={jest.fn()} />);
  const sheet = await screen.findByRole('dialog', { name: 'Add HGS from portal' });
  expect(await within(sheet).findByText(/No new portal transits for this car/)).toBeInTheDocument();
  expect(within(sheet).getByRole('button', { name: 'Nothing to add' })).toBeDisabled();
});

test('without the database functions it says so instead of failing quietly', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.booking_portal_hgs_preview', code: 'PGRST202' } });
  render(<AddPortalHgsSheet card={card} onClose={jest.fn()} onPosted={jest.fn()} />);
  expect(await screen.findByText('Adding HGS from the portal is not set up in the database yet.')).toBeInTheDocument();
});
