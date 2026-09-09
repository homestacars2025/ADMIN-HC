import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
      carId: 39,
      plateNumber: '06FHN975',
      hgsBarcode: '1131524991',
      transitCount: 5,
      totalAmount: 744.5,
      lastTransit: '2026-09-09T00:00:00+00:00',
    },
    {
      carId: 7,
      plateNumber: '34ABC123',
      hgsBarcode: '1131500000',
      transitCount: 0,
      totalAmount: 0,
      lastTransit: null,
    },
  ],
};

beforeEach(() => {
  mockGetHgsDashboard.mockReset().mockResolvedValue(DASHBOARD);
  mockGetCarTransits.mockReset().mockResolvedValue([
    {
      id: 1,
      tollLocation: 'Mahmutbey',
      direction: 'KMO ASYA KESIMI GECIS UCRETI',
      transitDatetime: '2026-09-08T07:14:00+00:00',
      amount: 148.5,
    },
  ]);
});

test('renders summary in Turkish format and lists cars by spend', async () => {
  render(<HGSPage />);

  expect(await screen.findByText('1.408,50 TL')).toBeInTheDocument();
  expect(screen.getByText('28')).toBeInTheDocument();
  expect(screen.getByText('41')).toBeInTheDocument();
  expect(screen.getByText('9')).toBeInTheDocument();

  expect(screen.getByText('06FHN975')).toBeInTheDocument();
  expect(screen.getByText('744,50 TL')).toBeInTheDocument();
});

test('filters out cars with no transits', async () => {
  render(<HGSPage />);
  await screen.findByText('06FHN975');
  expect(screen.getByText('34ABC123')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /With transits/ }));

  expect(screen.queryByText('34ABC123')).not.toBeInTheDocument();
  expect(screen.getByText('06FHN975')).toBeInTheDocument();
});

test('expanding a car loads its history once', async () => {
  render(<HGSPage />);
  const row = await screen.findByText('06FHN975');

  await userEvent.click(row);

  expect(await screen.findByText('Mahmutbey')).toBeInTheDocument();
  expect(screen.getByText('148,50 TL')).toBeInTheDocument();
  // The full provider label is the tooltip; the pill shows the leading token.
  expect(screen.getByTitle('KMO ASYA KESIMI GECIS UCRETI')).toHaveTextContent('KMO');
  expect(mockGetCarTransits).toHaveBeenCalledTimes(1);

  // Collapse and re-open — the kept entry must not trigger a second query.
  await userEvent.click(row);
  await userEvent.click(row);
  await waitFor(() => expect(screen.getByText('Mahmutbey')).toBeInTheDocument());
  expect(mockGetCarTransits).toHaveBeenCalledTimes(1);
});

test('a car with no transits is not expandable', async () => {
  render(<HGSPage />);
  await screen.findByText('34ABC123');

  const button = screen.getByText('34ABC123').closest('button');
  expect(button).toBeDisabled();
});

test('surfaces a load failure with a retry', async () => {
  mockGetHgsDashboard.mockRejectedValueOnce(new Error('network down'));
  render(<HGSPage />);

  expect(await screen.findByText('Could not load HGS data')).toBeInTheDocument();
  expect(screen.getByText('network down')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
  expect(await screen.findByText('06FHN975')).toBeInTheDocument();
});
