import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    { id: 1, carId: 39, plate: null, day: `${month}-02`, at: `${month}-02T08:00:00+00:00`, amount: 148.5, road: 'public' },
    { id: 2, carId: 39, plate: null, day: `${month}-03`, at: `${month}-03T11:04:00+00:00`, amount: 96, road: 'private' },
    { id: 3, carId: 51, plate: null, day: `${lastMonth}-10`, at: `${lastMonth}-10T08:00:00+00:00`, amount: 500, road: 'public' },
  ],
  lastSync: new Date(Date.now() - 12 * 60000).toISOString(),
};

const Where: React.FC = () => <span data-testid="where">{useLocation().search}</span>;
const renderPage = (url = '/dashboard/hgs') => render(<MemoryRouter initialEntries={[url]}><HGSPage /><Where /></MemoryRouter>);
const plates = () => screen.getAllByText(/^(06FHN975|34HGC631)$/).filter((n) => n.closest('li[class*="rounded-2xl"]')).map((n) => n.textContent);

const mockScrollIntoView = jest.fn();
beforeAll(() => { Element.prototype.scrollIntoView = mockScrollIntoView; });

beforeEach(() => {
  mockScrollIntoView.mockReset();
  mockFetchHgsData.mockReset().mockResolvedValue(DATA);
  mockFetchCarTransits.mockReset().mockResolvedValue([
    { id: 2, day: `${month}-03`, at: `${month}-03T11:04:00+00:00`, entry: null, exit: 'FENERTEPE', road: 'KCO GECIS UCRET', roadType: 'private', amount: 96, bookingId: 7, bookingNumber: 'HOM-11-26-007', bookingMonth: month, customerId: 'c1', customerName: 'Ali Veli' },
    { id: 1, day: `${month}-02`, at: `${month}-02T08:00:00+00:00`, entry: 'ORHANLI', exit: 'KURTKÖY SGS', road: 'İSTANBUL-ANKARA OTOYOLU', roadType: 'public', amount: 148.5, bookingId: null, bookingNumber: null, bookingMonth: null, customerId: null, customerName: null },
  ]);
  mockSaveHgsBarcode.mockReset();
});

test('warns about the active cars with no transits this month, barcode or not', async () => {
  renderPage();
  const banner = await screen.findByRole('alert');
  expect(banner).toHaveTextContent('2 cars have no HGS transits this month — check their HGS');
  expect(within(banner).getByRole('button', { name: 'Show 34HGC631' })).not.toHaveTextContent('No barcode');
  expect(within(banner).getByRole('button', { name: 'Show 34MDJ129' })).toHaveTextContent('No barcode');
  expect(within(banner).queryByRole('button', { name: 'Show 06FHN975' })).not.toBeInTheDocument();
  expect(screen.queryByText('Without HGS')).not.toBeInTheDocument();
  expect(screen.getByText('Last upload: 12 min ago')).toBeInTheDocument();
  expect(screen.getByText('1 private')).toBeInTheDocument();
});

test('tiles follow the month, and All time', async () => {
  renderPage();
  const total = await screen.findByRole('button', { name: /Total spend/ });
  expect(total).toHaveTextContent('₺244,50');
  expect(screen.getByRole('button', { name: /Transits\s*\d/ })).toHaveTextContent('2');
  expect(screen.getByRole('button', { name: /Cars on HGS/ })).toHaveTextContent('3Without transits: 2');
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

test('opening a car lists its transits with time, road and booking, once', async () => {
  renderPage();
  const row = (await screen.findByText('06FHN975')).closest('button') as HTMLElement;
  await userEvent.click(row);
  await waitFor(() => expect(mockFetchCarTransits).toHaveBeenCalledTimes(1));
  expect(mockFetchCarTransits.mock.calls[0][1]).toBe(month);
  expect(await screen.findByText('HOM-11-26-007')).toHaveAttribute('href', `/dashboard/bookings?month=${month}&q=HOM-11-26-007`);
  expect(screen.getByText('Ali Veli')).toHaveAttribute('href', '/dashboard/customers/c1');
  expect(screen.getByText('Private road')).toBeInTheDocument();
  expect(screen.getByText('Public road')).toBeInTheDocument();
  expect(screen.getByText('14:04')).toBeInTheDocument();
  expect(screen.getByText('KCO GECIS UCRET')).toBeInTheDocument();
  expect(screen.getByText(/ORHANLI/)).toHaveTextContent('ORHANLI → KURTKÖY SGS');
  expect(screen.getByText('Not linked')).toBeInTheDocument();

  await userEvent.click(row);
  await userEvent.click(row);
  expect(mockFetchCarTransits).toHaveBeenCalledTimes(1);
});

test('the banner follows the month, and all time is never', async () => {
  renderPage('/dashboard/hgs?month=all');
  expect(await screen.findByRole('alert')).toHaveTextContent('1 car has no HGS transits yet — check its HGS');
  await userEvent.click(screen.getByRole('button', { name: 'All time' }));
  await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/^2 cars have no HGS transits in \w+ \d{4} — check their HGS/);
});

test('the Cars on HGS tile filters to the banner cars, and clicking it again clears', async () => {
  renderPage();
  const tile = await screen.findByRole('button', { name: /Cars on HGS/ });
  await userEvent.click(tile);
  expect(tile).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('where')).toHaveTextContent('filter=idle');
  const listed = screen.getAllByText(/^(06FHN975|34HGC631|34MDJ129)$/).filter((n) => n.closest('li[id^="hgs-row-"]')).map((n) => n.textContent);
  expect(listed).toEqual(['34HGC631', '34MDJ129']);
  await userEvent.click(tile);
  expect(screen.getByTestId('where')).not.toHaveTextContent('filter=');
});

test('a chip opens that car in the list, with no fetch when it has no transits', async () => {
  renderPage('/dashboard/hgs?filter=used');
  await userEvent.click(await screen.findByRole('button', { name: 'Show 34HGC631' }));
  expect(screen.getByTestId('where')).not.toHaveTextContent('filter=used');
  expect(await screen.findByText(/^No HGS transits in /)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open in Cars' })).toHaveAttribute('href', '/dashboard/cars?car=51');
  expect(screen.queryByRole('button', { name: 'Add barcode' })).not.toBeInTheDocument();
  expect(mockFetchCarTransits).not.toHaveBeenCalled();
  expect(mockScrollIntoView).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { expanded: true })).toHaveFocus();
});

test('past twelve cars the banner ends in +N more, which filters to them all', async () => {
  const many = Array.from({ length: 14 }, (_, index) => ({ id: 100 + index, plate: `34TST${100 + index}`, model: 'Fiat Egea', image: null, barcode: '1131500000', active: true }));
  mockFetchHgsData.mockResolvedValue({ ...DATA, cars: [...DATA.cars, ...many] });
  renderPage();
  const banner = await screen.findByRole('alert');
  expect(within(banner).getAllByRole('button', { name: /^Show / })).toHaveLength(12);
  expect(within(banner).getByRole('button', { name: '+4 more' })).toBeInTheDocument();
  expect(within(banner).getByRole('button', { name: '+11 more' })).toBeInTheDocument();
  await userEvent.click(within(banner).getByRole('button', { name: '+4 more' }));
  expect(screen.getByTestId('where')).toHaveTextContent('filter=idle');
});

test('one car reads its, not their', async () => {
  renderPage('/dashboard/hgs?month=all');
  expect(await screen.findByRole('alert')).toHaveTextContent('1 car has no HGS transits yet — check its HGS');
});

test('a barcode added from the open row takes the No barcode tag off its chip', async () => {
  mockSaveHgsBarcode.mockResolvedValue('1131525011');
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: 'Show 34MDJ129' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Add barcode' }));
  const sheet = within(screen.getByRole('dialog'));
  expect(sheet.getByRole('link', { name: 'Open in Cars' })).toHaveAttribute('href', '/dashboard/cars?car=57');
  await userEvent.type(sheet.getByRole('textbox'), '1131525011');
  await userEvent.click(sheet.getByRole('button', { name: /Save barcode/ }));
  expect(mockSaveHgsBarcode).toHaveBeenCalledWith(57, '1131525011');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Show 34MDJ129' })).not.toHaveTextContent('No barcode');
  expect(screen.queryByRole('button', { name: 'Add barcode' })).not.toBeInTheDocument();
});

test('a failed save stays open with the reason', async () => {
  mockSaveHgsBarcode.mockRejectedValue(new Error('That barcode is already on 34HGC631.'));
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: 'Show 34MDJ129' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Add barcode' }));
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

describe('ranges of days', () => {
  const mm = month.slice(5, 7);
  const carRow = (id: number) => document.getElementById(`hgs-row-car-${id}`) as HTMLElement;

  test('a page range from the URL counts every row and tile over it, and its ✕ goes back to the month', async () => {
    renderPage(`/dashboard/hgs?from=${month}-02&to=${month}-02`);
    expect(await screen.findByRole('button', { name: /Total spend/ })).toHaveTextContent(`₺148,50from 02.${mm} to 02.${mm}`.replace(`from 02.${mm} to 02.${mm}`, `on 02.${mm}`));
    expect(screen.getByRole('alert')).toHaveTextContent(`2 cars have no HGS transits on 02.${mm} — check their HGS`);
    expect(screen.getByRole('button', { name: 'Date range' })).toHaveTextContent(`02.${mm}`);
    expect(within(carRow(39)).getByText('₺148,50', { selector: '.lg\\:hidden *' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear date range' }));
    expect(screen.getByTestId('where')).not.toHaveTextContent('from=');
    expect(screen.getByRole('button', { name: /Total spend/ })).toHaveTextContent('₺244,50');
  });

  test('a preset sets the page range, and the month switcher takes over again', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Date range' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Date range' })).getByRole('button', { name: 'Last month' }));
    expect(screen.getByTestId('where')).toHaveTextContent(`from=${lastMonth}-01`);
    expect(screen.getByRole('button', { name: /Total spend/ })).toHaveTextContent('₺500,00');
    await userEvent.click(screen.getByRole('button', { name: 'Date range' }));
    expect(within(screen.getByRole('dialog', { name: 'Date range' })).getByRole('button', { name: 'Last month' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByTestId('where')).not.toHaveTextContent('from=');
  });

  test("a car's own range changes only its row and its list, and its chip clears it", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Dates for 06FHN975' }));
    const picker = within(screen.getByRole('dialog', { name: 'Dates for 06FHN975' }));
    await userEvent.click(picker.getByRole('button', { name: 'Custom' }));
    // Backwards on purpose: Apply puts the ends the right way round.
    fireEvent.change(picker.getByLabelText('From'), { target: { value: `${month}-04` } });
    fireEvent.change(picker.getByLabelText('To'), { target: { value: `${month}-03` } });
    await userEvent.click(picker.getByRole('button', { name: 'Apply' }));
    expect(screen.getByTestId('where')).toHaveTextContent(`car=39&cfrom=${month}-03&cto=${month}-04`);
    expect(carRow(39)).toHaveTextContent('₺96,00');
    expect(carRow(39)).toHaveTextContent('100% of spend');
    expect(screen.getByRole('button', { name: /Total spend/ })).toHaveTextContent('₺244,50');

    await userEvent.click(carRow(39).querySelector('button') as HTMLElement);
    await waitFor(() => expect(mockFetchCarTransits).toHaveBeenCalledWith(expect.objectContaining({ carId: 39 }), { from: `${month}-03`, to: `${month}-04` }));
    expect(await within(carRow(39)).findByText(`2 transits from 03.${mm} to 04.${mm}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear dates for 06FHN975' }));
    expect(screen.getByTestId('where')).not.toHaveTextContent('car=');
    expect(carRow(39)).toHaveTextContent('₺244,50');
    await waitFor(() => expect(mockFetchCarTransits).toHaveBeenLastCalledWith(expect.anything(), month));
  });

  test("a shared link opens that car over its range, and its CSV is named after it", async () => {
    const created: Blob[] = [];
    URL.createObjectURL = jest.fn((blob: Blob) => { created.push(blob); return 'blob:hgs'; });
    URL.revokeObjectURL = jest.fn();
    const names: string[] = [];
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    renderPage(`/dashboard/hgs?car=39&cfrom=${month}-01&cto=${month}-06`);
    expect(await screen.findByText(`01.${mm} → 06.${mm}`)).toBeInTheDocument();
    expect(await within(carRow(39)).findByRole('button', { expanded: true })).toHaveFocus();
    expect(mockScrollIntoView).toHaveBeenCalledTimes(1);
    await userEvent.click(await within(carRow(39)).findByRole('button', { name: 'Export CSV' }));
    expect(names).toEqual([`hgs-06FHN975-${month}-01_${month}-06.csv`]);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(created[0]);
    });
    expect(text).toContain('Date,Time,Entry,Exit,Toll,Amount');
    expect(text).toContain(`${month}-03,14:04,,FENERTEPE,KCO GECIS UCRET,96.00`);
    click.mockRestore();
  });
});
