import {
  customerFields,
  idTypeLabel,
  inInvoiceFilter,
  invoiceMonth,
  invoicesCsv,
  invoiceSummary,
  invoiceTable,
  invoiceWarning,
  lineLabel,
  linesTotal,
  matchesInvoiceSearch,
  type PendingInvoice,
} from './pendingInvoices';

jest.mock('./supabase', () => ({ supabase: {} }));

const invoice = (over: Partial<PendingInvoice>): PendingInvoice => ({
  booking_id: 1, booking_number: 'HOM-09-26-003', start_date: '2026-09-01', end_date: '2026-09-06', days: 5, plate: '34 ABC 101', car_brand: 'Fiat', car_model: 'Egea',
  customer_id: 'c', customer_name: 'Ali Veli', nationality: 'Turkey', id_type: 'PASSPORT', id_number: 'P123', phone: '+90', email: 'a@b.co', address: 'Şişli', birth_date: '1990-01-02',
  rental_total: 1000, extras_total: 200, invoice_total: 1200, net_amount: 1000, vat_amount: 200, paid_total: 500,
  lines: [{ type: 'rental', description: null, amount: 1000, date: '2026-09-01' }, { type: 'car_wash', description: 'Car wash ‹op:598›', amount: 200, date: '2026-09-06' }],
  invoice_text: 'Ad Soyad: Ali Veli\nToplam: 1200', ...over,
});
const day = (date: string) => date.split('-').reverse().join('.');

describe('month and filters', () => {
  it('files a booking under the month it ended', () => {
    expect(invoiceMonth(invoice({ start_date: '2026-08-30', end_date: '2026-09-02' }))).toBe('2026-09');
  });

  it('tells ready from missing', () => {
    expect(inInvoiceFilter(invoice({}), 'ready')).toBe(true);
    expect(inInvoiceFilter(invoice({ invoice_total: 0 }), 'ready')).toBe(false);
    expect(inInvoiceFilter(invoice({ invoice_total: 0 }), 'missing')).toBe(true);
    expect(inInvoiceFilter(invoice({ invoice_total: 0 }), 'all')).toBe(true);
  });

  it('adds up the tiles', () => {
    expect(invoiceSummary([invoice({}), invoice({ invoice_total: 0, net_amount: 0, vat_amount: 0 })])).toEqual({ count: 2, total: 1200, net: 1000, vat: 200, ready: 1, missing: 1 });
  });

  it('searches name, plate, booking and ID, ignoring spaces and case', () => {
    expect(matchesInvoiceSearch(invoice({}), 'ali')).toBe(true);
    expect(matchesInvoiceSearch(invoice({}), '34abc')).toBe(true);
    expect(matchesInvoiceSearch(invoice({}), 'hom-09')).toBe(true);
    expect(matchesInvoiceSearch(invoice({}), 'p123')).toBe(true);
    expect(matchesInvoiceSearch(invoice({}), 'nope')).toBe(false);
  });
});

describe('invoiceWarning', () => {
  it('stays quiet when the lines add up', () => {
    expect(invoiceWarning(invoice({}))).toBeNull();
  });

  it('catches a total below its lines, like an IN rental row cancelling the charge', () => {
    const row = invoice({
      rental_total: 0, invoice_total: 1500, lines: [{ type: 'rental', description: null, amount: 20390, date: 'x' }, { type: 'cleaning', description: null, amount: 800, date: 'x' }, { type: 'car_wash', description: null, amount: 700, date: 'x' }],
    });
    expect(invoiceWarning(row)).toEqual({ kind: 'lines_differ', linesTotal: 21890 });
  });

  it('catches a zero total hiding real lines', () => {
    expect(invoiceWarning(invoice({ rental_total: 0, invoice_total: 0, lines: [{ type: 'rental', description: null, amount: 36000, date: 'x' }] }))?.kind).toBe('lines_differ');
  });

  it('catches a booking with extras but no rental', () => {
    expect(invoiceWarning(invoice({ rental_total: 0, invoice_total: 200, lines: [{ type: 'fuel', description: null, amount: 200, date: 'x' }] }))).toEqual({ kind: 'no_rental' });
  });

  it('leaves a plain missing amount to its tile', () => {
    expect(invoiceWarning(invoice({ rental_total: 0, extras_total: 0, invoice_total: 0, lines: [] }))).toBeNull();
  });
});

describe('words', () => {
  it('drops internal operation numbers and tidies the type', () => {
    expect(lineLabel({ type: 'car_wash', description: 'Car wash ‹op:598›' })).toBe('Car wash');
    expect(lineLabel({ type: 'car_wash', description: null })).toBe('Car wash');
    expect(lineLabel({ type: 'rental', description: '  ' })).toBe('Rental');
  });

  it('adds lines', () => {
    expect(linesTotal(invoice({}))).toBe(1200);
  });

  it('leaves blank customer fields empty so they show as missing', () => {
    const fields = customerFields(invoice({ email: '  ', address: null, birth_date: null }), day);
    expect(fields.find((field) => field.key === 'email')?.value).toBeNull();
    expect(fields.find((field) => field.key === 'address')?.value).toBeNull();
    expect(fields.find((field) => field.key === 'birth')?.value).toBeNull();
    expect(fields.find((field) => field.key === 'id')?.label).toBe('ID (Passport)');
  });

  it('reads the ID type the same however it was stored', () => {
    expect(idTypeLabel('NATIONAL_ID')).toBe('National ID');
    expect(idTypeLabel('national_id')).toBe('National ID');
    expect(idTypeLabel('passport')).toBe('Passport');
    expect(idTypeLabel(null)).toBeNull();
  });
});

describe('export', () => {
  it('writes a table that pastes into a spreadsheet', () => {
    const table = invoiceTable(invoice({}), day);
    expect(table).toContain('Name\tAli Veli');
    expect(table).toContain('Period\t01.09.2026 - 06.09.2026');
    expect(table).toContain('Car wash\t');
    expect(table.split('\n').pop()).toContain('Total\t');
  });

  it('exports every column, and keeps the multi-line invoice text in one cell', () => {
    const csv = invoicesCsv([invoice({ customer_name: '=SUM(A1)' })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Invoice text');
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain('"Ad Soyad: Ali Veli\nToplam: 1200"');
    expect(csv).toContain('Car wash: 200');
  });
});
