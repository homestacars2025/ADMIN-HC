import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import HGSPage from './HGSPage';
import { currentMonth, shiftMonth } from '../lib/payroll';

jest.mock('../lib/supabase', () => ({ supabase: {} }));

const mockFetchHgsData = jest.fn();
const mockFetchCarTransits = jest.fn();
const mockSaveHgsBarcode = jest.fn();

jest.mock('../lib/hgs', () => {
  const actual = jest.requireActual('../lib/hgs');
  return {
    ...actual,
    fetchHgsData: (...a: unknown[]) => mockFetchHgsData(...a),
    fetchCarTransits: (...a: unknown[]) => mockFetchCarTransits(...a),
    saveHgsBarcode: (...a: unknown[]) => mockSaveHgsBarcode(...a),
  };
});

const month = currentMonth().slice(0, 7);
const lastMonth = shiftMonth(`${month}-01`, -1).slice(0, 7);

const DATA = {
  cars: [
    { id: 39, plate: '06FHN975', model: 'Chery Tiggo 7 Pro', image: null, barcode: '1131524991', active: true },
    { id: 51, plate: '34HGC631', model: 'Renault Clio', image: null, barcode: '1131524997', active: true },
    { id: 57, plate: '34MDJ129', model: 'Renault Taliant', image: null, barcode: null, active: true },
  ],
  transits: [
    { id: 1, carId: 39, plate: null, day: `${month}-02`, amount: 148.5, pending: false },
    { id: 2, carId: 39, plate: null, day: `${month}-03`, amount: 96, pending: true },
    { id: 3, carId: 51, plate: null, day: `${lastMonth}-10`, amount: 500, pending: false },
  ],
  lastSync: new Date(Date.now() - 12 * 60000).toISOString(),
};

const Where: React.FC = () => <span data-testid="where">{useLocation().search}</span>;
const renderPage = (url = '/dashboard/hgs') => render(<MemoryRouter initialEntries={[url]}><HGSPage /><Where /></MemoryRouter>);
const plates = () => screen.getAllByText(/^(06FHN975|34HGC631)$/).filter((n) => n.closest('li[class*="rounded-2xl"]')).map((n) => n.textContent);

beforeEach(() => {
  mockFetchHgsData.mockReset().mockResolvedValue(DATA);
  mockFetchCarTransits.mockReset().mockResolvedValue([
    { id: 2, day: `${month}-03`, entry: 'Avcılar', exit: 'Mahmutbey', amount: 96, pending: true, bookingId: 7, bookingNumber: 'HOM-11-26-007', bookingMonth: month, customerId: 'c1', customerName: 'Ali Veli' },
    { id: 1, day: `${month}-02`, entry: null, exit: 'İstoç', amount: 148.5, pending: false, bookingId: null, bookingNumber: null, bookingMonth: null, customerId: null, customerName: null },
  ]);
  mockSaveHgsBarcode.mockReset();
});

test('warns about the car with no barcode, and drops the old tile', async () => {
  renderPage();
  expect(await screen.findByText(/1 car has no HGS barcode — tolls for this car are not tracked/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add an HGS barcode to 34MDJ129' })).toBeInTheDocument();
  expect(screen.queryByText('Without HGS')).not.toBeInTheDocument();
  expect(screen.getByText('Last sync: 12 min ago')).toBeInTheDocument();
});

test('tiles follow the month, and All time', async () => {
  renderPage();
  const total = await screen.findByRole('button', { name: /Total spend/ });
  expect(total).toHaveTextContent('₺244,50');
  expect(screen.getByRole('button', { name: /Transits\s*\d/ })).toHaveTextContent('2');
  expect(screen.getByText('Cars on HGS').closest('.filter-tile')).toHaveTextContent('1 had no transit');
  expect(screen.getByText('This month').closest('.filter-tile')).toHaveTextContent(/−51% vs/);

  await userEvent.click(screen.getByRole('button', { name: 'All time' }));
  expect(screen.getByTestId('where')).toHaveTextContent('month=all');
  expect(screen.getByRole('button', { name: /Total spend/ })).toHaveTextContent('₺744,50');
  expect(screen.getByText('This month').closest('.filter-tile')).toHaveTextContent('₺244,50');

  await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByRole('button', { name: /Total spend/ })).toHaveTextContent('₺500,00');
});

test('the Transits tile filters to cars that used it, and clicking it again clears', async () => {
  renderPage();
  await screen.findByRole('button', { name: /Transits\s*\d/ });
  expect(plates()).toEqual(['06FHN975', '34HGC631']);
  const tile = screen.getByRole('button', { name: /Transits\s*\d/ });
  await userEvent.click(tile);
  expect(tile).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('where')).toHaveTextContent('filter=used');
  expect(plates()).toEqual(['06FHN975']);
  await userEvent.click(tile);
  expect(plates()).toEqual(['06FHN975', '34HGC631']);
});

test('sorts and searches', async () => {
  renderPage('/dashboard/hgs?month=all');
  await screen.findByRole('button', { name: /Total spend/ });
  expect(plates()).toEqual(['34HGC631', '06FHN975']);
  await userEvent.click(screen.getByRole('button', { name: 'Transits' }));
  expect(plates()).toEqual(['06FHN975', '34HGC631']);
  await userEvent.type(screen.getByRole('searchbox'), 'clio');
  expect(plates()).toEqual(['34HGC631']);
});

test('opening a car lists its transits with booking and customer, once', async () => {
  renderPage();
  const row = (await screen.findByText('06FHN975')).closest('button') as HTMLElement;
  await userEvent.click(row);
  await waitFor(() => expect(mockFetchCarTransits).toHaveBeenCalledTimes(1));
  expect(mockFetchCarTransits.mock.calls[0][1]).toBe(month);
  expect(await screen.findByText('HOM-11-26-007')).toHaveAttribute('href', `/dashboard/bookings?month=${month}&q=HOM-11-26-007`);
  expect(screen.getByText('Ali Veli')).toHaveAttribute('href', '/dashboard/customers/c1');
  expect(screen.getByText('Pending')).toBeInTheDocument();
  expect(screen.getByText('Not linked')).toBeInTheDocument();

  await userEvent.click(row);
  await userEvent.click(row);
  expect(mockFetchCarTransits).toHaveBeenCalledTimes(1);
});

test('a car with no transits in the period is not expandable', async () => {
  renderPage();
  expect((await screen.findByText('34HGC631')).closest('button')).toBeDisabled();
});

test('a barcode saved from the banner takes the car off it', async () => {
  mockSaveHgsBarcode.mockResolvedValue('1131525011');
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: 'Add an HGS barcode to 34MDJ129' }));
  const sheet = within(screen.getByRole('dialog'));
  expect(sheet.getByRole('link', { name: 'Open in Cars' })).toHaveAttribute('href', '/dashboard/cars?car=57');
  await userEvent.type(sheet.getByRole('textbox'), '1131525011');
  await userEvent.click(sheet.getByRole('button', { name: /Save barcode/ }));
  expect(mockSaveHgsBarcode).toHaveBeenCalledWith(57, '1131525011');
  await waitFor(() => expect(screen.queryByText(/no HGS barcode/)).not.toBeInTheDocument());
  expect(screen.getByText('34MDJ129')).toBeInTheDocument();
});

test('a failed save stays open with the reason', async () => {
  mockSaveHgsBarcode.mockRejectedValue(new Error('That barcode is already on 34HGC631.'));
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: 'Add an HGS barcode to 34MDJ129' }));
  const sheet = within(screen.getByRole('dialog'));
  await userEvent.type(sheet.getByRole('textbox'), '1131524997');
  await userEvent.click(sheet.getByRole('button', { name: /Save barcode/ }));
  expect(await sheet.findByRole('alert')).toHaveTextContent('already on 34HGC631');
});

test('surfaces a load failure with a retry', async () => {
  mockFetchHgsData.mockRejectedValueOnce(new Error('network down'));
  renderPage();
  expect(await screen.findByText("Couldn't load HGS: network down")).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('06FHN975')).toBeInTheDocument();
});
