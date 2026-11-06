import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CalendarPage from './CalendarPage';
import type { CalendarConflict, FleetMonth } from '../lib/fleetCalendar';

const mockMonth = jest.fn();
const mockConflicts = jest.fn();
const mockHistory = jest.fn();

jest.mock('../lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
jest.mock('../lib/fleetCalendar', () => ({
  ...jest.requireActual('../lib/fleetCalendar'),
  fetchFleetMonth: (...args: unknown[]) => mockMonth(...args),
  fetchConflicts: (...args: unknown[]) => mockConflicts(...args),
  fetchCarHistory: (...args: unknown[]) => mockHistory(...args),
}));

const MONTH = '2026-11';
const DATA: FleetMonth = {
  cars: [
    { id: 1, plate: '34ABC101', model: 'Fiat Egea', status: 'working' },
    { id: 2, plate: '34KDT102', model: 'Renault Clio', status: 'parking' },
    { id: 3, plate: '06XYZ103', model: 'Fiat Egea', status: 'maintenance' },
  ],
  bars: [
    { key: 'booking-11', carId: 1, status: 'booked', start: '2026-11-02', end: '2026-11-10', booking: { id: 11, number: 'HOM-11-26-011', customer: 'Ali Veli', customerId: 'c1', status: 'confirmed' }, block: null },
    { key: 'booking-12', carId: 1, status: 'pending', start: '2026-11-08', end: '2026-11-12', booking: { id: 12, number: 'HOM-11-26-012', customer: 'Ayşe Kaya', customerId: 'c2', status: 'pending' }, block: null },
    { key: 'block-5', carId: 3, status: 'maintenance', start: '2026-11-04', end: '2026-11-06', booking: null, block: { id: 5, type: 'maintenance', notes: 'Brakes' } },
  ],
};
const CONFLICTS: CalendarConflict[] = [
  { kind: 'double_booking', severity: 'high', carId: 1, plate: '34ABC101', bookingId: 11, bookingNumber: 'HOM-11-26-011', otherRef: 'HOM-11-26-012', from: '2026-11-08', to: '2026-11-10', message: 'Two bookings overlap on the same car' },
  { kind: 'missing_pickup', severity: 'medium', carId: 2, plate: '34KDT102', bookingId: 20, bookingNumber: 'HOM-10-26-020', otherRef: null, from: '2026-10-01', to: '2026-10-05', message: 'Booking ended but no pickup (return) recorded' },
];

const Where: React.FC = () => <span data-testid="where">{useLocation().pathname + useLocation().search}</span>;
const renderPage = (url = `/dashboard/calendar?month=${MONTH}`) => render(<MemoryRouter initialEntries={[url]}><CalendarPage /><Where /></MemoryRouter>);
const rows = () => screen.getAllByRole('button', { name: /^History of / }).map((button) => button.getAttribute('aria-label'));

const mockScroll = jest.fn();
beforeAll(() => { Element.prototype.scrollIntoView = mockScroll; });

beforeEach(() => {
  mockScroll.mockReset();
  mockMonth.mockReset().mockResolvedValue(DATA);
  mockConflicts.mockReset().mockResolvedValue(CONFLICTS);
  mockHistory.mockReset().mockResolvedValue([
    { kind: 'operation', at: '2026-11-05T12:37:26+00:00', end: null, title: 'DELIVERY', status: null, customer: null, customerId: null, amount: null, km: 39088, fuel: 170, by: 'Omar', note: null, fromCar: null, toCar: null, refId: 1, bookingId: 11 },
    { kind: 'booking', at: '2026-11-02', end: '2026-11-10', title: 'HOM-11-26-011', status: 'confirmed', customer: 'Ali Veli', customerId: 'c1', amount: null, km: null, fuel: null, by: null, note: null, fromCar: null, toCar: null, refId: 11, bookingId: null },
    { kind: 'fine', at: '2026-09-01', end: null, title: 'Speeding', status: 'unpaid', customer: null, customerId: null, amount: 1500, km: null, fuel: null, by: null, note: null, fromCar: null, toCar: null, refId: 3, bookingId: null },
  ]);
});

test('one bar per booking or block, coloured by status, the double booking outlined in red', async () => {
  renderPage();
  const ali = await screen.findByRole('button', { name: /^Ali Veli, Booked/ });
  expect(mockMonth).toHaveBeenCalledWith(MONTH);
  expect(ali).toHaveStyle({ outline: '2px solid #DC2626', color: '#166534' });
  expect(screen.getByRole('button', { name: /^Ayşe Kaya, Pending/ })).toHaveStyle({ outline: '2px solid #DC2626', color: '#92400E' });
  expect(screen.getByRole('button', { name: /^Maintenance · Brakes, Maintenance/ })).not.toHaveStyle({ outline: '2px solid #DC2626' });
  expect(screen.getByRole('list', { name: 'Colours' })).toHaveTextContent('Working / BookedPendingCompletedParking (free)MaintenanceSellingReplacement');
});

test('the tiles count cars per status and filter the rows; search finds a customer', async () => {
  renderPage();
  const all = await screen.findByRole('button', { name: /^All/ });
  expect(all).toHaveTextContent('3');
  expect(rows()).toEqual(['History of 34ABC101', 'History of 34KDT102', 'History of 06XYZ103']);
  await userEvent.click(screen.getByRole('button', { name: /^Parking/ }));
  expect(screen.getByTestId('where')).toHaveTextContent('filter=parking');
  expect(rows()).toEqual(['History of 34KDT102']);
  await userEvent.click(screen.getByRole('button', { name: /^Parking/ }));
  await userEvent.type(screen.getByRole('searchbox'), 'ayşe');
  expect(rows()).toEqual(['History of 34ABC101']);
});

test('issues list on top with a count, and one jumps to its bar', async () => {
  renderPage();
  const panel = await screen.findByRole('button', { name: /2 issues this month/ });
  expect(panel).toHaveAttribute('aria-expanded', 'true');
  await userEvent.click(screen.getByRole('button', { name: /Double booking/ }));
  await waitFor(() => expect(mockScroll).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: /^Ali Veli, Booked/ })).toHaveClass('cal-pulse');
  await userEvent.click(panel);
  expect(panel).toHaveAttribute('aria-expanded', 'false');
});

test('no issues, no panel', async () => {
  mockConflicts.mockResolvedValue([]);
  renderPage();
  await screen.findByRole('button', { name: /^Ali Veli/ });
  expect(screen.queryByText(/issues? this month/)).not.toBeInTheDocument();
});

test('a bar opens its details, with Open booking and Car history', async () => {
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: /^Ali Veli, Booked/ }));
  const popover = within(screen.getByRole('dialog', { name: 'Booking HOM-11-26-011' }));
  expect(popover.getByText('02.11.2026 → 10.11.2026')).toBeInTheDocument();
  expect(popover.getByText('8')).toBeInTheDocument();
  expect(popover.getByText('In a high-severity conflict this month.')).toBeInTheDocument();
  await userEvent.click(popover.getByRole('button', { name: 'Open booking' }));
  expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/bookings?month=2026-11&q=HOM-11-26-011');
});

test('hovering a block previews it; Edit block opens the block editor', async () => {
  renderPage();
  fireEvent.mouseEnter(await screen.findByRole('button', { name: /^Maintenance · Brakes/ }));
  const popover = within(screen.getByRole('dialog', { name: 'Maintenance block' }));
  await userEvent.click(popover.getByRole('button', { name: 'Edit block' }));
  expect(screen.getByText('Edit')).toBeInTheDocument();
});

test("a car opens its whole history, newest first, with a summary and filters", async () => {
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: 'History of 34ABC101' }));
  expect(mockHistory).toHaveBeenCalledWith(1);
  const drawer = within(await screen.findByRole('dialog', { name: 'History of 34ABC101' }));
  expect(await drawer.findByText('Delivery')).toBeInTheDocument();
  expect(drawer.getByText(/39,088 km · fuel 170 · by Omar/)).toBeInTheDocument();
  expect(drawer.getByText('Booking HOM-11-26-011')).toBeInTheDocument();
  expect(drawer.getByText('Current km').nextSibling).toHaveTextContent('39,088');
  await userEvent.click(drawer.getByRole('button', { name: 'Fines' }));
  expect(drawer.queryByText('Delivery')).not.toBeInTheDocument();
  expect(drawer.getByText(/₺1\.500/)).toBeInTheDocument();
});

test('two empty days offer a booking or a block', async () => {
  renderPage();
  const row = (await screen.findByRole('button', { name: 'History of 34KDT102' })).parentElement as HTMLElement;
  const cells = row.querySelectorAll('[role="presentation"]');
  fireEvent.click(cells[19]);
  fireEvent.click(cells[21]);
  expect(await screen.findByText('Add Booking')).toBeInTheDocument();
  await userEvent.click(screen.getByText('Add Booking'));
  expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/bookings?car_id=2&start_date=2026-11-20&end_date=2026-11-22');
});

test('a load failure offers a retry', async () => {
  mockMonth.mockRejectedValueOnce(new Error('network down'));
  renderPage();
  expect(await screen.findByText("Couldn't load the calendar: network down")).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: /^Ali Veli/ })).toBeInTheDocument();
});
