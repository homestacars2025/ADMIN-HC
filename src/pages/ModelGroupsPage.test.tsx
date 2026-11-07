import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import ModelGroupsPage from './ModelGroupsPage';
import type { GroupCar, ModelGroupRow, ModelGroupStats, PricingTier } from '../lib/modelGroups';

const mockGroups = jest.fn();
const mockStats = jest.fn();
const mockTiers = jest.fn();
const mockCars = jest.fn();

jest.mock('../lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
jest.mock('../lib/modelGroups', () => ({
  ...jest.requireActual('../lib/modelGroups'),
  fetchModelGroups: (...args: unknown[]) => mockGroups(...args),
  fetchModelGroupStats: (...args: unknown[]) => mockStats(...args),
  fetchPricingTiers: (...args: unknown[]) => mockTiers(...args),
  fetchGroupCars: (...args: unknown[]) => mockCars(...args),
}));
jest.mock('../lib/CurrencyContext', () => ({ useCurrency: () => ({ rates: [{ currency: 'USD', rate_to_try: 40 }] }) }));

const base = { transmission: 'Automatic', fuel: 'Petrol', seats: 5, luggage: 2, daily_km: 300, monthly_km: 6000, deposit: 8000, min_age: 21, category: 'Economy' };
const GROUPS: ModelGroupRow[] = [
  { ...base, id: 1, name: 'Renault Clio', brand: 'Renault', model: 'Clio', price: 30, image_url: 'https://x/clio.jpg' },
  { ...base, id: 2, name: 'Fiat Egea', brand: 'Fiat', model: 'Egea', price: 39, image_url: null },
  { ...base, id: 3, name: 'Toyota Corolla', brand: 'Toyota', model: 'Corolla', price: 50, image_url: 'https://x/corolla.jpg', category: 'Middle' },
];
const stats = (id: number, over: Partial<ModelGroupStats>): [number, ModelGroupStats] => [id, { model_group_id: id, cars_total: 3, cars_active: 3, rented_now: 1, utilization: 70, bookings_month: 2, avg_daily_rate: 1300, ...over }];
const STATS = new Map([
  stats(1, { cars_total: 9, cars_active: 7, rented_now: 7, utilization: 62, avg_daily_rate: 1100 }),
  stats(2, { cars_total: 5, cars_active: 4, rented_now: 3, utilization: 27, avg_daily_rate: 1400 }),
  stats(3, { cars_total: 2, cars_active: 2, rented_now: 1, utilization: 85, avg_daily_rate: null }),
]);
const TIERS: PricingTier[] = [{ id: 1, min_days: 15, max_days: 30, discount_percent: 13, is_active: true }];
const CARS: GroupCar[] = [
  { id: 10, plate: '34ABC101', isActive: true, status: 'working', utilization: { days: 30, rented: 27, rate: 90 } },
  { id: 11, plate: '34KDT102', isActive: false, status: 'parking', utilization: undefined },
];

const Where: React.FC = () => <span data-testid="where">{useLocation().search}</span>;
const renderPage = (url = '/dashboard/model-groups?month=2026-11') => render(<MemoryRouter initialEntries={[url]}><ModelGroupsPage /><Where /></MemoryRouter>);
const cardNames = () => screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'));

beforeAll(() => { Element.prototype.scrollIntoView = jest.fn(); });

beforeEach(() => {
  mockGroups.mockReset().mockResolvedValue(GROUPS);
  mockStats.mockReset().mockResolvedValue(STATS);
  mockTiers.mockReset().mockResolvedValue(TIERS);
  mockCars.mockReset().mockResolvedValue(CARS);
});

test('one card per group, busiest first, with lira prices and the month\'s figures', async () => {
  renderPage();
  await screen.findByRole('article', { name: 'Renault Clio' });
  expect(mockStats).toHaveBeenCalledWith('2026-11');
  await waitFor(() => expect(cardNames()).toEqual(['Toyota Corolla', 'Renault Clio', 'Fiat Egea']));
  const clio = screen.getByRole('article', { name: 'Renault Clio' });
  expect(clio).toHaveTextContent('$30 list');
  expect(clio).toHaveTextContent('7 / 7 cars on the road now');
  expect(within(clio).getByRole('img', { name: 'Utilization 62%' })).toBeInTheDocument();
  // ₺1.100 real against a ₺1.200 list: below, so amber.
  expect(within(clio).getByText(/below list/)).toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Fiat Egea' })).toHaveTextContent('No photo yet');
});

test('the tiles count and filter, and the filter lives in the URL', async () => {
  renderPage();
  await screen.findByRole('article', { name: 'Renault Clio' });
  expect(screen.getByRole('button', { name: /^All models/ })).toHaveTextContent('3');
  await userEvent.click(screen.getByRole('button', { name: /^Fully rented now/ }));
  expect(screen.getByTestId('where')).toHaveTextContent('filter=rented');
  expect(cardNames()).toEqual(['Renault Clio']);
  await userEvent.click(screen.getByRole('button', { name: /^Low utilization/ }));
  expect(cardNames()).toEqual(['Fiat Egea']);
  await userEvent.click(screen.getByRole('button', { name: /^No image/ }));
  expect(cardNames()).toEqual(['Fiat Egea']);
  await userEvent.click(screen.getByRole('button', { name: /^No image/ }));
  expect(screen.getByTestId('where')).not.toHaveTextContent('filter=');
  expect(cardNames()).toHaveLength(3);
});

test('search by brand and sort by name or price', async () => {
  renderPage();
  await screen.findByRole('article', { name: 'Renault Clio' });
  await userEvent.click(within(screen.getByRole('group', { name: 'Sort model groups' })).getByRole('button', { name: 'Name' }));
  expect(cardNames()).toEqual(['Fiat Egea', 'Renault Clio', 'Toyota Corolla']);
  await userEvent.click(within(screen.getByRole('group', { name: 'Sort model groups' })).getByRole('button', { name: 'Price' }));
  expect(cardNames()).toEqual(['Toyota Corolla', 'Fiat Egea', 'Renault Clio']);
  await userEvent.type(screen.getByRole('searchbox'), 'toyota');
  expect(cardNames()).toEqual(['Toyota Corolla']);
});

test('View cars opens the group\'s cars with their plates, status and utilization', async () => {
  renderPage();
  const clio = await screen.findByRole('article', { name: 'Renault Clio' });
  await userEvent.click(within(clio).getByRole('button', { name: /^View cars/ }));
  const drawer = await screen.findByRole('dialog', { name: 'Renault Clio cars' });
  expect(mockCars).toHaveBeenCalledWith(1, '2026-11');
  await within(drawer).findByText('34ABC101');
  expect(within(drawer).getByText('Working')).toBeInTheDocument();
  expect(within(drawer).getByRole('img', { name: /Utilization 90%/ })).toBeInTheDocument();
  expect(within(drawer).getByText('Inactive · 1')).toBeInTheDocument();
});

test('Edit opens the drawer, counts unsaved changes and asks before discarding them', async () => {
  renderPage();
  const clio = await screen.findByRole('article', { name: 'Renault Clio' });
  await userEvent.click(within(clio).getByRole('button', { name: /Edit/ }));
  const sheet = await screen.findByRole('dialog', { name: 'Edit model group' });
  expect(within(sheet).getByText('All saved')).toBeInTheDocument();
  expect(within(sheet).getByText('These tiers apply to every model group, not only this one.')).toBeInTheDocument();
  const price = within(sheet).getByRole('textbox', { name: 'Base daily price (USD)' });
  expect(price).toHaveValue('30');
  await userEvent.clear(price);
  await userEvent.type(price, '35');
  expect(within(sheet).getByText('1 unsaved change')).toBeInTheDocument();
  expect(sheet).toHaveTextContent(/≈ ₺1[.,]400 a day at today's rate/);
  await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
  expect(await screen.findByText('Discard your changes?')).toBeInTheDocument();
});
