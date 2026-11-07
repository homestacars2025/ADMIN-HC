import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import SourcingPage from './SourcingPage';
import type { SourcingRow } from '../lib/sourcing';

const mockRows = jest.fn();
const mockUpdate = jest.fn();
const mockGroups = jest.fn();
const mockStats = jest.fn();

jest.mock('../lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } } }));
jest.mock('../lib/customers', () => ({ ...jest.requireActual('../lib/customers'), istanbulDate: () => '2026-11-07' }));
jest.mock('../lib/notifications', () => ({ getAvatarProfiles: async () => ({ u1: { id: 'u1', full_name: 'Omar', role: 'admin', avatar_url: null, gender: 'male' } }) }));
jest.mock('../lib/modelGroups', () => ({
  ...jest.requireActual('../lib/modelGroups'),
  fetchModelGroups: (...args: unknown[]) => mockGroups(...args),
  fetchModelGroupStats: (...args: unknown[]) => mockStats(...args),
}));
jest.mock('../lib/sourcing', () => ({
  ...jest.requireActual('../lib/sourcing'),
  fetchSourcing: (...args: unknown[]) => mockRows(...args),
  fetchCities: async () => [{ id: 34, name: 'İstanbul' }],
  fetchDistricts: async () => [{ id: 7, name: 'Şişli' }],
  updateLeadStatus: (...args: unknown[]) => mockUpdate(...args),
}));

const base: SourcingRow = {
  id: 1, created_at: null, updated_at: '2026-11-03T10:00:00Z', source_platform: 'sahibinden.com', source_platform_custom: null,
  model_group_id: 4, model_group_custom: null, model_year: 2023, mileage_km: 42000, transmission: 'Automatic', fuel_type: 'Petrol',
  damage_record: 'No Damage', damage_value: null, paint_sections_count: 0, trim_package: 'Touch', listing_url: 'https://www.sahibinden.com/ilan/1',
  listing_status: 'Active', listed_on: '2026-11-01', lead_status: 'New', asking_price: 1_100_000, target_price: 1_000_000, notes: null,
  city_id: 34, district_id: 7, added_by: 'u1', city: 'İstanbul', district: 'Şişli', group: { name: 'Renault Clio', brand: 'Renault', model: 'Clio', image_url: null },
};
const ROWS: SourcingRow[] = [
  base,
  { ...base, id: 2, lead_status: 'Negotiating', model_group_id: null, model_group_custom: 'Peugeot 2008', group: null, source_platform: 'arabam.com', asking_price: 950_000, damage_record: 'Damage Value', damage_value: 12_500, paint_sections_count: 2 },
  { ...base, id: 3, lead_status: 'Bought', updated_at: '2026-11-05T09:00:00Z', listing_status: 'Sold', group: { name: 'Fiat Egea', brand: 'Fiat', model: 'Egea', image_url: null } },
];

const Where: React.FC = () => <span data-testid="where">{useLocation().search}</span>;
const renderPage = (url = '/dashboard/sourcing') => render(<MemoryRouter initialEntries={[url]}><SourcingPage /><Where /></MemoryRouter>);
const column = (name: RegExp) => screen.getByRole('region', { name });

beforeAll(() => { Element.prototype.scrollIntoView = jest.fn(); });

beforeEach(() => {
  mockRows.mockReset().mockResolvedValue(ROWS);
  mockUpdate.mockReset().mockResolvedValue(undefined);
  mockGroups.mockReset().mockResolvedValue([{ id: 4, name: 'Renault Clio', brand: 'Renault', model: 'Clio', category: 'Economy', transmission: 'Automatic', fuel: 'Petrol', seats: 5, luggage: 3, daily_km: 150, monthly_km: 3500, deposit: 8000, min_age: 23, price: 30, image_url: null }]);
  mockStats.mockReset().mockResolvedValue(new Map([[4, { model_group_id: 4, cars_total: 9, cars_active: 7, rented_now: 6, utilization: 60, bookings_month: 3, avg_daily_rate: 1500 }]]));
});

test('the pipeline puts each lead in its stage, with price gap, damage and the investment check', async () => {
  renderPage();
  const clio = await screen.findByRole('article', { name: 'Renault Clio 2023' });
  expect(within(column(/^New, 1 lead/)).getByRole('article', { name: 'Renault Clio 2023' })).toBe(clio);
  expect(within(column(/^Negotiating, 1 lead/)).getByRole('article', { name: 'Peugeot 2008 2023' })).toBeInTheDocument();
  expect(within(column(/^Bought, 1 lead/)).getByText('Sold')).toBeInTheDocument();
  expect(clio).toHaveTextContent('Sahibinden');
  expect(clio).toHaveTextContent('+10%');
  expect(clio).toHaveTextContent('Clean');
  expect(clio).toHaveTextContent('Listed 6 days ago');
  await waitFor(() => expect(clio).toHaveTextContent('Payback 40.7 mo'));
  expect(within(clio).getByRole('link', { name: /Open the listing/ })).toHaveAttribute('href', 'https://www.sahibinden.com/ilan/1');
  const peugeot = screen.getByRole('article', { name: 'Peugeot 2008 2023' });
  expect(peugeot).toHaveTextContent('2 painted parts');
  expect(peugeot).toHaveTextContent('Custom model: no fleet data');
});

test('dragging a card to another column moves it at once and saves it', async () => {
  renderPage();
  const clio = await screen.findByRole('article', { name: 'Renault Clio 2023' });
  const data = new Map<string, string>();
  const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', dropEffect: '' };
  fireEvent.dragStart(clio, { dataTransfer });
  fireEvent.dragOver(column(/^Contacted/), { dataTransfer });
  fireEvent.drop(column(/^Contacted/), { dataTransfer });
  expect(within(column(/^Contacted, 1 lead/)).getByRole('article', { name: 'Renault Clio 2023' })).toBeInTheDocument();
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, 'Contacted'));
  expect(await screen.findByText('Moved to Contacted')).toBeInTheDocument();
});

test('a move the database refuses goes back, with the reason', async () => {
  mockUpdate.mockRejectedValueOnce(new Error('The database doesn\'t accept "Lost" yet.'));
  renderPage();
  const clio = await screen.findByRole('article', { name: 'Renault Clio 2023' });
  await userEvent.selectOptions(within(clio).getByRole('combobox', { name: 'Lead stage' }), 'Lost');
  expect(await screen.findByText('The database doesn\'t accept "Lost" yet.')).toBeInTheDocument();
  await waitFor(() => expect(within(column(/^New, 1 lead/)).getByRole('article', { name: 'Renault Clio 2023' })).toBeInTheDocument());
});

test('the tiles count and filter; the table view lives in the URL', async () => {
  renderPage();
  await screen.findByRole('article', { name: 'Renault Clio 2023' });
  expect(screen.getByRole('button', { name: /^Total/ })).toHaveTextContent('3');
  expect(screen.getByRole('button', { name: /^Hot leads/ })).toHaveTextContent('1');
  expect(screen.getByRole('button', { name: /^Bought this month/ })).toHaveTextContent('1');
  expect(screen.getByText('Avg gap to target').closest('.filter-tile')).toHaveTextContent('+5%'); // +10, −5 and +10
  await userEvent.click(screen.getByRole('button', { name: /^Hot leads/ }));
  expect(screen.getByTestId('where')).toHaveTextContent('filter=hot');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  await userEvent.click(within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'Table' }));
  expect(screen.getByTestId('where')).toHaveTextContent('view=table');
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  expect(within(table).getByText('Peugeot 2008')).toBeInTheDocument();
});

test('opening a card shows the drawer with the investment check', async () => {
  renderPage();
  await userEvent.click(await screen.findByRole('article', { name: 'Renault Clio 2023' }));
  const sheet = await screen.findByRole('dialog', { name: 'Edit listing' });
  expect(within(sheet).getByRole('region', { name: 'Investment check' })).toHaveTextContent('Pays back in 40.7 mo');
  expect(within(sheet).getByRole('region', { name: 'Investment check' })).toHaveTextContent('₺27.000');
});

test('adding a listing detects the platform from the pasted link and asks for what is required', async () => {
  renderPage();
  await screen.findByRole('article', { name: 'Renault Clio 2023' });
  await userEvent.click(screen.getByRole('button', { name: /Add listing/ }));
  const sheet = await screen.findByRole('dialog', { name: 'Add listing' });
  await userEvent.type(within(sheet).getByRole('textbox', { name: 'Listing link' }), 'https://www.arabam.com/ilan/1');
  expect(within(within(sheet).getByRole('group', { name: 'Platform' })).getByRole('button', { name: 'Arabam' })).toHaveAttribute('aria-pressed', 'true');
  await act(async () => { fireEvent.submit(sheet.querySelector('form') as HTMLFormElement); });
  expect(within(sheet).getByText('Pick a model group, or type the model.')).toBeInTheDocument();
  expect(within(sheet).getByText('Enter the model year.')).toBeInTheDocument();
  expect(within(sheet).getByText('Enter the asking price.')).toBeInTheDocument();
});

test('with no listings, an empty state invites the first one', async () => {
  mockRows.mockResolvedValue([]);
  renderPage();
  expect(await screen.findByText('No cars on the radar yet')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Add first listing/ })).toBeInTheDocument();
});
