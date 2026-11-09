import {
  balanceLabel,
  balanceToMove,
  buildWallet,
  carNotes,
  defaultTarget,
  formatWalletMoney,
  friendlyMoveError,
  groupInvoiceEntries,
  hgsCount,
  hgsGroupSummary,
  hgsLineInfo,
  isEditableLine,
  matchesWalletSearch,
  lineKind,
  lineLabel,
  moveTargets,
  signedMoveAmount,
  summarizeWallets,
  walletBalance,
  walletTone,
  walletTotals,
  type WalletBookingRow,
  type WalletData,
  type WalletLine,
} from './customerWallet';

jest.mock('./supabase', () => ({ supabase: {} }));

const line = (over: Partial<WalletLine>): WalletLine => ({
  id: Math.random().toString(36).slice(2),
  booking_id: 1,
  car_id: 10,
  type: 'rental',
  description: null,
  amount: 0,
  direction: 'OUT',
  created_at: '2026-10-01T10:00:00Z',
  payment_ref: null,
  ...over,
});

const booking = (over: Partial<WalletBookingRow>): WalletBookingRow => ({
  id: 1,
  booking_number: 'HOM-10-26-001',
  car_id: 10,
  start_date: '2026-10-01',
  end_date: '2026-10-05',
  status: 'completed',
  is_currently_active: false,
  cars: { plate_number: '34ABC10', model_group: { name: 'Fiat Egea' } },
  ...over,
});

const plates = new Map([[10, '34ABC10'], [20, '34XYZ20'], [30, '34REP30']]);

test('balance is IN minus OUT: credit is positive, owed is negative', () => {
  expect(walletBalance([line({ amount: 5000, direction: 'OUT' }), line({ amount: 6000, direction: 'IN' })])).toBe(1000);
  expect(walletBalance([line({ amount: 5000, direction: 'OUT' }), line({ amount: 3499.5, direction: 'IN' })])).toBe(-1500.5);
  expect(walletTone(1000)).toBe('credit');
  expect(walletTone(-0.01)).toBe('owes');
  expect(walletTone(0.004)).toBe('settled');
});

test('labels read Credit, Owes or Settled, with kuruş only when there are some', () => {
  expect(balanceLabel(1500)).toBe(`Credit ${formatWalletMoney(1500)}`);
  expect(balanceLabel(-1500.5)).toBe(`Owes ${formatWalletMoney(1500.5)}`);
  expect(formatWalletMoney(1500.5)).toMatch(/1\.500,5/);
  expect(formatWalletMoney(1500)).not.toMatch(/,/);
  expect(balanceLabel(0)).toBe('Settled');
});

test('free-text types fall into a handful of kinds', () => {
  expect(lineKind(' Payment ')).toBe('payment');
  expect(['ref', 'REF', 'refund', 'refound', 'refunfd'].map(lineKind)).toEqual(Array(5).fill('refund'));
  expect(lineKind('car_wash')).toBe('other');
  expect(lineLabel({ type: 'deposit', direction: 'OUT' })).toBe('Deposit returned');
  expect(lineLabel({ type: 'car_wash', direction: 'OUT' })).toBe('Car wash');
  expect(lineLabel({ type: 'airport otopark', direction: 'OUT' })).toBe('Airport otopark');
});

const twoBookings = (): WalletData => ({
  customer: { id: 'c1', first_name: 'Omar', last_name: 'Ali' },
  bookings: [
    booking({ id: 1, booking_number: 'HOM-10-26-001', start_date: '2026-10-01' }),
    booking({ id: 2, booking_number: 'HOM-11-26-002', start_date: '2026-11-01', status: 'confirmed', is_currently_active: true, car_id: 20, cars: { plate_number: '34XYZ20', model_group: null } }),
  ],
  lines: [
    line({ booking_id: 1, amount: 5000, direction: 'OUT', created_at: '2026-10-01T09:00:00Z' }),
    line({ booking_id: 1, type: 'payment', amount: 6500, direction: 'IN', created_at: '2026-10-02T09:00:00Z' }),
    line({ booking_id: 1, type: 'transfer', amount: 500, direction: 'OUT', payment_ref: 'TRF-1', description: 'Balance moved to HOM-11-26-002 · cash', created_at: '2026-10-03T09:00:00Z' }),
    line({ booking_id: 2, car_id: 20, type: 'transfer', amount: 500, direction: 'IN', payment_ref: 'TRF-1', description: 'Balance moved from HOM-10-26-001 · cash', created_at: '2026-10-03T09:00:00Z' }),
    line({ booking_id: 2, car_id: 20, amount: 2000, direction: 'OUT', created_at: '2026-11-01T09:00:00Z' }),
  ],
  replacements: [],
  plates,
});

test('the wallet is one total over bookings, newest first, each with its own balance', () => {
  const wallet = buildWallet(twoBookings());
  expect(wallet.name).toBe('Omar Ali');
  expect(wallet.cards.map((card) => card.bookingNumber)).toEqual(['HOM-11-26-002', 'HOM-10-26-001']);
  expect(wallet.cards.map((card) => card.balance)).toEqual([-1500, 1000]);
  expect(wallet.total).toBe(-500);
  expect(wallet.cards[1].lines[0].kind).toBe('transfer');
});

test('a transfer links to the other booking by payment_ref, and keeps its note', () => {
  const wallet = buildWallet(twoBookings());
  const out = wallet.cards[1].lines.find((entry) => entry.kind === 'transfer');
  const into = wallet.cards[0].lines.find((entry) => entry.kind === 'transfer');
  expect(out?.peer).toEqual({ direction: 'to', bookingId: 2, bookingNumber: 'HOM-11-26-002' });
  expect(into?.peer).toEqual({ direction: 'from', bookingId: 1, bookingNumber: 'HOM-10-26-001' });
  expect(out?.note).toBe('cash');
});

test('a transfer to another customer still names the booking from its description', () => {
  const data = twoBookings();
  data.lines = [line({ booking_id: 1, type: 'transfer', amount: 100, direction: 'OUT', payment_ref: 'TRF-9', description: 'Balance moved to HOM-09-26-777' })];
  const peer = buildWallet(data).cards[1].lines[0].peer;
  expect(peer).toEqual({ direction: 'to', bookingId: null, bookingNumber: 'HOM-09-26-777' });
});

test('car notes come from lines left on another car and from replacement sheets', () => {
  const lines = [
    line({ booking_id: 1, car_id: 20, type: 'hgs', created_at: '2026-10-02T00:00:00Z' }),
    line({ booking_id: 1, car_id: 10 }),
    line({ booking_id: 1, car_id: 30, type: 'hgs' }),
    line({ booking_id: 2, car_id: 20 }),
  ];
  const sheets = [{ id: 5, original_booking_id: 1, original_car_id: 10, replacement_car_id: 30, start_date: '2026-10-03' }];
  expect(carNotes({ id: 1, car_id: 10 }, lines, sheets, plates)).toEqual([
    { key: 'car-20', text: 'Car changed 34XYZ20 → 34ABC10', date: null },
    { key: 'sheet-5', text: 'Replacement car 34ABC10 → 34REP30', date: '2026-10-03' },
  ]);
  expect(carNotes({ id: 2, car_id: 20 }, lines, sheets, plates)).toEqual([]);
});

test('targets leave out the booking itself and cancelled ones; the default is the one on the road', () => {
  const data = twoBookings();
  data.bookings.push(booking({ id: 3, booking_number: 'HOM-12-26-003', start_date: '2026-12-01', status: 'cancelled' }));
  const wallet = buildWallet(data);
  const targets = moveTargets(wallet, 1);
  expect(targets.map((card) => card.id)).toEqual([2]);
  expect(wallet.cards.map((card) => card.id)).toEqual([2, 1]);
  expect(defaultTarget(targets)?.id).toBe(2);
  expect(defaultTarget(moveTargets(wallet, 2))?.id).toBe(1);
  expect(defaultTarget([])).toBeNull();
});

test('the prompt picks the newest other booking that still has a balance', () => {
  const wallet = buildWallet(twoBookings());
  expect(balanceToMove(wallet, 2)?.id).toBe(1);
  expect(balanceToMove(wallet, 999)).toBeNull();
  const settled = twoBookings();
  settled.lines = settled.lines.filter((entry) => entry.booking_id === 2);
  expect(balanceToMove(buildWallet(settled), 2)).toBeNull();
});

test('the typed amount gets the balance sign and may not exceed it', () => {
  expect(signedMoveAmount(1000, '1000')).toEqual({ ok: true, amount: 1000 });
  expect(signedMoveAmount(-1500.5, '1500,5')).toEqual({ ok: true, amount: -1500.5 });
  expect(signedMoveAmount(-1500, '200')).toEqual({ ok: true, amount: -200 });
  expect(signedMoveAmount(1000, '1000.01')).toMatchObject({ ok: false });
  expect(signedMoveAmount(1000, '0')).toMatchObject({ ok: false, error: 'Enter an amount above zero.' });
  expect(signedMoveAmount(1000, '')).toMatchObject({ ok: false });
});

test('a refused move is said plainly', () => {
  expect(friendlyMoveError('forbidden')).toBe("Your account can't move balances.");
  expect(friendlyMoveError('Both bookings must belong to the same customer')).toBe('Both bookings must belong to the same customer');
});

test('Accounting lists only customers with lines, biggest balance first, with totals per tile', () => {
  const rows = summarizeWallets(
    [
      { id: 'a', first_name: 'Ada', last_name: null, phone: null },
      { id: 'b', first_name: 'Bo', last_name: null, phone: '+90 555' },
      { id: 'c', first_name: 'Cem', last_name: null, phone: null },
      { id: 'd', first_name: 'Dee', last_name: null, phone: null },
    ],
    [
      { customer_id: 'a', booking_id: 1, amount: 100, direction: 'IN' },
      { customer_id: 'b', booking_id: 2, amount: 900, direction: 'OUT' },
      { customer_id: 'b', booking_id: 3, amount: 100, direction: 'IN' },
      { customer_id: 'c', booking_id: 4, amount: 50, direction: 'IN' },
      { customer_id: 'c', booking_id: 4, amount: 50, direction: 'OUT' },
    ],
  );
  expect(rows.map((row) => [row.name, row.balance, row.bookings])).toEqual([['Bo', -800, 2], ['Ada', 100, 1], ['Cem', 0, 1]]);
  expect(walletTotals(rows)).toEqual({ all: 3, owesCount: 1, owesTotal: 800, creditCount: 1, creditTotal: 100, settledCount: 1, net: 700 });
});

test('the list carries every car a customer had, newest first, and finds them by plate, name or phone', () => {
  const [row] = summarizeWallets(
    [{ id: 'a', first_name: 'Ada', last_name: 'Kaya', phone: '+90 536 111 22 33', is_banned: true, ban_reason: 'Late' }],
    [
      { customer_id: 'a', booking_id: 1, amount: 100.004, direction: 'OUT' },
      { customer_id: 'a', booking_id: 2, amount: 100.004, direction: 'OUT' },
    ],
    [
      { id: 1, customer_id: 'a', start_date: '2026-01-01', status: 'completed', is_currently_active: false, cars: { plate_number: '34 KDT 101' } },
      { id: 2, customer_id: 'a', start_date: '2026-10-01', status: 'confirmed', is_currently_active: true, cars: [{ plate_number: '34 ABC 22' }] },
      { id: 3, customer_id: 'a', start_date: '2026-11-01', status: 'cancelled', is_currently_active: false, cars: { plate_number: '34 ZZZ 9' } },
      { id: 4, customer_id: 'a', start_date: '2025-05-01', status: 'completed', is_currently_active: false, cars: { plate_number: '34KDT101' } },
    ],
  );
  // The empty cancelled booking isn't counted, as the wallet doesn't list it.
  expect(row).toMatchObject({ plates: ['34 ABC 22', '34 KDT 101'], onRoad: true, banned: true, banReason: 'Late', balance: -200, bookings: 3 });
  expect(matchesWalletSearch(row, '34KDT')).toBe(true);
  expect(matchesWalletSearch(row, '34zzz')).toBe(false);
  expect(matchesWalletSearch(row, 'kaya')).toBe(true);
  expect(matchesWalletSearch(row, '0536 111')).toBe(true);
  expect(matchesWalletSearch(row, '11')).toBe(false);
});

test('a recorded payment and a transfer half are not edited on their own', () => {
  expect(isEditableLine({ type: 'payment', pay_method: 'cash' })).toBe(false);
  expect(isEditableLine({ type: 'transfer', pay_method: null })).toBe(false);
  expect(isEditableLine({ type: 'payment', pay_method: null })).toBe(true);
  expect(isEditableLine({ type: 'hgs' })).toBe(true);
});

describe('HGS lines', () => {
  it('read the sync line: date, route, and a time or toll when it has them', () => {
    expect(hgsLineInfo({ description: '[AUTO-HGS] 05-11-2026 ISPARTAKULE → AVCILAR', created_at: '2026-11-06T06:05:57Z' }))
      .toEqual({ pass: true, day: '2026-11-05', time: null, route: 'ISPARTAKULE → AVCILAR', toll: null });
    expect(hgsLineInfo({ description: '[AUTO-HGS] 05-11-2026 9:04 MAHMUTBEY → AVCILAR · KMO AVRUPA', created_at: null }))
      .toEqual({ pass: true, day: '2026-11-05', time: '09:04', route: 'MAHMUTBEY → AVCILAR', toll: 'KMO AVRUPA' });
  });

  it('show only the exit for an unknown entry, and one gate once', () => {
    expect(hgsLineInfo({ description: '[AUTO-HGS] 31-10-2026 ? → FSM KÖPRÜSÜ', created_at: null }).route).toBe('FSM KÖPRÜSÜ');
    expect(hgsLineInfo({ description: '[AUTO-HGS] 31-10-2026 * → FSM KÖPRÜSÜ', created_at: null }).route).toBe('FSM KÖPRÜSÜ');
    expect(hgsLineInfo({ description: '[AUTO-HGS] 05-11-2026 ÇAMLIK → ÇAMLIK', created_at: null }).route).toBe('ÇAMLIK');
  });

  it('take a typed line as an entry, dated by when it was entered in Istanbul', () => {
    expect(hgsLineInfo({ description: 'HGS TO 07/10/2026', created_at: '2026-10-07T22:30:00Z' }))
      .toEqual({ pass: false, day: '2026-10-08', time: null, route: 'HGS TO 07/10/2026', toll: null });
    expect(hgsLineInfo({ description: null, created_at: '2026-10-07T09:00:00Z' }).route).toBeNull();
  });

  it('count passes and entries apart', () => {
    const pass = { hgs: { pass: true } };
    const entry = { hgs: { pass: false } };
    expect(hgsCount([pass, pass])).toBe('2 passes');
    expect(hgsCount([pass])).toBe('1 pass');
    expect(hgsCount([entry, entry, entry])).toBe('3 entries');
    expect(hgsCount([pass, pass, entry])).toBe('2 passes + 1 entry');
    expect(hgsGroupSummary({ first: '2026-09-28', last: '2026-10-22', lines: [pass, pass] })).toBe('from 28/09 to 22/10 · 2 passes');
    expect(hgsGroupSummary({ first: '2026-09-28', last: '2026-09-28', lines: [pass] })).toBe('on 28/09 · 1 pass');
  });

  it('fold into one entry where the newest was, with the same balance', () => {
    const data: WalletData = {
      customer: { id: 'c1', first_name: 'Omar', last_name: 'Ali' },
      bookings: [booking({})],
      lines: [
        line({ id: 'r', type: 'rental', amount: 5000, created_at: '2026-10-01T09:00:00Z' }),
        line({ id: 'h1', type: 'hgs', amount: 40, description: '[AUTO-HGS] 28-09-2026 MAHMUTBEY → AVCILAR', created_at: '2026-10-02T09:00:00Z' }),
        line({ id: 'p', type: 'payment', amount: 3000, direction: 'IN', created_at: '2026-10-03T09:00:00Z' }),
        line({ id: 'h2', type: 'HGS', amount: 60, description: '[AUTO-HGS] 22-10-2026 AVCILAR → MAHMUTBEY', created_at: '2026-10-04T09:00:00Z' }),
        line({ id: 'h3', type: 'hgs', amount: 10, direction: 'IN', description: 'refund', created_at: '2026-10-05T09:00:00Z' }),
      ],
      replacements: [],
      plates,
    };
    const card = buildWallet(data).cards[0];
    expect(card.balance).toBe(-5000 - 40 + 3000 - 60 + 10);
    expect(card.entries.map((entry) => (entry.kind === 'hgs' ? 'HGS' : entry.line.id))).toEqual(['HGS', 'p', 'r']);
    const group = card.entries[0].kind === 'hgs' ? card.entries[0].group : null;
    expect(group).toMatchObject({ net: -90, first: '2026-09-28', last: '2026-10-22' });
    expect(group?.lines.map((item) => item.id)).toEqual(['h2', 'h3', 'h1']);
    expect(hgsGroupSummary(group!)).toBe('from 28/09 to 22/10 · 2 passes + 1 entry');
  });

  it('print as one row with its passes behind it, totals untouched', () => {
    const entries = [
      { type: 'rental', description: null, direction: 'OUT', amount: 5000, created_at: '2026-10-01' },
      { type: 'hgs', description: '[AUTO-HGS] 28-09-2026 MAHMUTBEY → AVCILAR', direction: 'OUT', amount: 40, created_at: '2026-10-02' },
      { type: 'hgs', description: 'HGS TO 22/10/2026', direction: 'OUT', amount: 1127, created_at: '2026-10-22T09:00:00Z' },
    ];
    const rows = groupInvoiceEntries(entries);
    expect(rows.map((row) => row.kind)).toEqual(['line', 'hgs']);
    expect(rows[1]).toMatchObject({ kind: 'hgs', net: -1167, first: '2026-09-28', last: '2026-10-22', summary: 'from 28/09 to 22/10 · 1 pass + 1 entry' });
    expect(rows[1].kind === 'hgs' && rows[1].passes.map((pass) => pass.entry.amount)).toEqual([1127, 40]);
    expect(groupInvoiceEntries([entries[0]])).toEqual([{ kind: 'line', entry: entries[0] }]);
  });
});

describe('the net across wallets', () => {
  const summary = (customerId: string, balance: number) => ({ customerId, balance } as unknown as Parameters<typeof walletTotals>[0][number]);

  it('is what customers owe us after the credit we hold', () => {
    expect(walletTotals([summary('a', -250_000), summary('b', -12_037), summary('c', 70_000), summary('d', 0)])).toMatchObject({
      all: 4, owesTotal: 262_037, creditTotal: 70_000, net: 192_037,
    });
    expect(walletTotals([summary('a', -1000), summary('b', 4000)]).net).toBe(-3000);
  });
});
