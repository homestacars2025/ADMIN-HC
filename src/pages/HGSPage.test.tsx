import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HGSPage from './HGSPage';

jest.mock('../lib/supabase', () => ({ supabase: {} }));

const mockGetHgsDashboard = jest.fn();
const mockGetCarTransits = jest.fn();

jest.mock('../lib/hgs', () => {
  const actual = jest.requireActual('../lib/hgs');
  return {
    ...actual,
    getHgsDashboard: (...a: unknown[]) => mockGetHgsDashboard(...a),
    getCarTransits: (...a: unknown[]) => mockGetCarTransits(...a),
  };
});

const DASHBOARD = {
  summary: { totalAmount: 1408.5, transitCount: 28, carsWithHgs: 41, carsWithoutHgs: 9 },
  cars: [
    {
      carId: 39, plateNumber: '06FHN975', hgsBarcode: '1131524991',
      modelGroup: 'Chery Tiggo 7 Pro',
      transitCount: 5, totalAmount: 744.5, lastTransit: '2026-09-09T00:00:00+00:00',
    },
    {
      carId: 51, plateNumber: '34HGC631', hgsBarcode: '1131524997',
      modelGroup: 'Renault Clio',
      transitCount: 2, totalAmount: 204.5, lastTransit: '2026-09-10T00:00:00+00:00',
    },
    {
      carId: 7, plateNumber: '34ABC123', hgsBarcode: '1131500000',
      modelGroup: null,
      transitCount: 0, totalAmount: 0, lastTransit: null,
    },
  ],
};

/**
 * One transit today and one 200 days back, built relative to the clock so the
 * "This month" assertion holds whatever month the suite runs in.
 */
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00+00:00`;
};

const TRANSITS = [
  {
    id: 1, tollLocation: 'Mahmutbey', entryLocation: 'Avcılar', exitLocation: 'Mahmutbey',
    direction: 'KMO ASYA KESIMI GECIS UCRETI', transitDatetime: daysAgo(0), amount: 148.5,
  },
  {
    id: 2, tollLocation: 'İstoç', entryLocation: 'İkitelli', exitLocation: 'İstoç',
    direction: 'KCO GECIS UCRETI', transitDatetime: daysAgo(200), amount: 596,
  },
];

beforeEach(() => {
  mockGetHgsDashboard.mockReset().mockResolvedValue(DASHBOARD);
  mockGetCarTransits.mockReset().mockResolvedValue(TRANSITS);
});

test('renders the summary in Turkish format and the model group column', async () => {
  render(<HGSPage />);

  expect(await screen.findByText('1.408,50 TL')).toBeInTheDocument();
  expect(screen.getByText('28')).toBeInTheDocument();

  expect(screen.getByText('06FHN975')).toBeInTheDocument();
  expect(screen.getByText('Chery Tiggo 7 Pro')).toBeInTheDocument();
  expect(screen.getByText('Renault Clio')).toBeInTheDocument();
  // A car with no model group falls back to an em-dash rather than blank.
  expect(screen.getAllByText('—').length).toBeGreaterThan(0);
});

test('sorting cycles asc -> desc -> off on a column header', async () => {
  render(<HGSPage />);
  await screen.findByText('06FHN975');

  const plates = () =>
    screen.getAllByText(/^(06FHN975|34HGC631|34ABC123)$/).map((n) => n.textContent);

  // Default is the RPC order: spend descending.
  expect(plates()).toEqual(['06FHN975', '34HGC631', '34ABC123']);

  const header = screen.getByRole('button', { name: /Sort by Plate/i });
  await userEvent.click(header);
  expect(plates()).toEqual(['06FHN975', '34ABC123', '34HGC631']);

  await userEvent.click(header);
  expect(plates()).toEqual(['34HGC631', '34ABC123', '06FHN975']);

  await userEvent.click(header);   // third click clears back to the default
  expect(plates()).toEqual(['06FHN975', '34HGC631', '34ABC123']);
});

test('details are collapsed until asked for, and the range total updates', async () => {
  render(<HGSPage />);
  const row = await screen.findByText('06FHN975');

  await userEvent.click(row);
  await waitFor(() => expect(mockGetCarTransits).toHaveBeenCalledTimes(1));

  // Both transits, summed, and no detail table yet.
  expect(await screen.findByText('744,50 TL')).toBeInTheDocument();     // the row total
  expect(screen.getByText(/2 transits in total/)).toBeInTheDocument();
  expect(screen.queryByText('Mahmutbey')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Show details/i }));
  // Entry and exit are separate cells now, not one joined string.
  expect(screen.getByText('Avcılar')).toBeInTheDocument();
  expect(screen.getByText('Mahmutbey')).toBeInTheDocument();

  // Pick a range in the popover. Nothing filters until Apply, which is the
  // whole point of staging the draft.
  await userEvent.click(screen.getByRole('button', { name: /All dates/i }));
  const dialog = within(screen.getByRole('dialog'));

  await userEvent.click(dialog.getByRole('button', { name: 'This month' }));
  expect(screen.getByText(/2 transits in total/)).toBeInTheDocument();   // still unfiltered

  await userEvent.click(dialog.getByRole('button', { name: 'Apply' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText(/1 transit in range/)).toBeInTheDocument();    // July dropped

  // Applying a range re-collapses the table, so re-open it.
  await userEvent.click(screen.getByRole('button', { name: /Show details/i }));
  expect(screen.getByText('Mahmutbey')).toBeInTheDocument();
  expect(screen.queryByText('İstoç')).not.toBeInTheDocument();
});

test('expanding a car fetches its history only once', async () => {
  render(<HGSPage />);
  const row = await screen.findByText('06FHN975');

  await userEvent.click(row);
  await waitFor(() => expect(mockGetCarTransits).toHaveBeenCalledTimes(1));
  await userEvent.click(row);            // collapse
  await userEvent.click(row);            // re-open — served from the kept entry
  await waitFor(() => expect(screen.getByText(/2 transits in total/)).toBeInTheDocument());
  expect(mockGetCarTransits).toHaveBeenCalledTimes(1);
});

test('a car with no transits is not expandable', async () => {
  render(<HGSPage />);
  await screen.findByText('34ABC123');
  expect(screen.getByText('34ABC123').closest('button')).toBeDisabled();
});

test('the All cars / With transits filter still works', async () => {
  render(<HGSPage />);
  await screen.findByText('06FHN975');
  expect(screen.getByText('34ABC123')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /With transits/ }));
  expect(screen.queryByText('34ABC123')).not.toBeInTheDocument();
  expect(screen.getByText('06FHN975')).toBeInTheDocument();
});

test('surfaces a load failure with a retry', async () => {
  mockGetHgsDashboard.mockRejectedValueOnce(new Error('network down'));
  render(<HGSPage />);

  expect(await screen.findByText('Could not load HGS data')).toBeInTheDocument();
  expect(screen.getByText('network down')).toBeInTheDocument();

  await userEvent.click(screen.getAllByRole('button', { name: /Try again/ })[0]);
  expect(await screen.findByText('06FHN975')).toBeInTheDocument();
});
