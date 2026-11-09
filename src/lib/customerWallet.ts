import { supabase } from './supabase';
import { customerName } from './customers';
import type { EnvelopeStatus } from './cashEnvelopes';
import type { Currency } from './money';

// The wallet belongs to the customer and their bookings. A car is only a label on
// a booking, so nothing here is ever split or summed by car.
//
// Balance is IN − OUT, the same sign `transfer_booking_balance` and the
// `booking_customer_balance` view use: positive is credit we hold for the
// customer, negative is what they owe. (lib/customers' `ledgerBalance` is the
// other way round, OUT − IN, for the directory's "owes" figures.)

type Joined<T> = T | T[] | null;

const one = <T,>(value: Joined<T> | undefined): T | null =>
  (Array.isArray(value) ? value[0] ?? null : value ?? null);

export interface WalletBookingRow {
  id: number;
  booking_number: string | null;
  car_id: number;
  start_date: string;
  end_date: string;
  status: string | null;
  is_currently_active: boolean | null;
  cars: Joined<{ plate_number: string; model_group: Joined<{ name: string }> }>;
}

export interface WalletLine {
  id: string;
  booking_id: number;
  car_id: number;
  type: string;
  description: string | null;
  amount: number;
  direction: 'IN' | 'OUT';
  created_at: string | null;
  payment_ref: string | null;
  /** Set when the money came in through `record_customer_payment`, with its envelope or account. */
  pay_method?: string | null;
}

/** The envelope a recorded cash payment came in with: one per ledger line, matched on `ledger_id`. */
export interface WalletEnvelope {
  id: number;
  ref: string;
  status: EnvelopeStatus;
  amount: number;
  counted_amount: number | null;
  currency: Currency;
  created_at: string;
  created_by: string | null;
}

export interface WalletReplacement {
  id: number;
  original_booking_id: number;
  original_car_id: number | null;
  replacement_car_id: number | null;
  start_date: string | null;
}

export interface WalletCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone?: string | null;
  nationality?: string | null;
  id_number?: string | null;
  is_banned?: boolean | null;
  ban_reason?: string | null;
}

export interface WalletData {
  customer: WalletCustomer;
  bookings: WalletBookingRow[];
  lines: WalletLine[];
  replacements: WalletReplacement[];
  plates: Map<number, string>;
  /** The customer's envelopes that carry a ledger line. */
  envelopes?: Array<WalletEnvelope & { ledger_id: string }>;
}

// ─── Money ────────────────────────────────────────────────────────────────────

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** IN − OUT. Positive is credit, negative is owed. */
export function walletBalance(lines: Array<Pick<WalletLine, 'amount' | 'direction'>>): number {
  return roundMoney(lines.reduce((sum, line) => sum + (line.direction === 'IN' ? 1 : -1) * Number(line.amount), 0));
}

export type WalletTone = 'credit' | 'owes' | 'settled';

export function walletTone(balance: number): WalletTone {
  if (balance >= 0.01) return 'credit';
  return balance <= -0.01 ? 'owes' : 'settled';
}

const lira = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Kuruş only when there are some, so a move of ₺1.500,50 isn't shown as ₺1.501. */
export function formatWalletMoney(amount: number): string {
  return lira.format(roundMoney(amount));
}

export function balanceLabel(balance: number): string {
  const tone = walletTone(balance);
  if (tone === 'settled') return 'Settled';
  return `${tone === 'credit' ? 'Credit' : 'Owes'} ${formatWalletMoney(Math.abs(balance))}`;
}

// ─── Lines ────────────────────────────────────────────────────────────────────

export type LineKind = 'rental' | 'deposit' | 'payment' | 'hgs' | 'transfer' | 'refund' | 'other';

/** `type` is free text: refunds alone appear as ref, REF, refund, refound and refunfd. */
export function lineKind(type: string): LineKind {
  const key = type.trim().toLowerCase();
  if (key === 'rental' || key === 'deposit' || key === 'payment' || key === 'hgs' || key === 'transfer') return key;
  return key.startsWith('ref') ? 'refund' : 'other';
}

const OTHER_LABELS: Record<string, string> = { car_wash: 'Car wash', extra_km: 'Extra km' };

export function lineLabel(line: Pick<WalletLine, 'type' | 'direction'>): string {
  switch (lineKind(line.type)) {
    case 'rental': return 'Rental';
    case 'deposit': return line.direction === 'IN' ? 'Deposit' : 'Deposit returned';
    case 'payment': return 'Payment';
    case 'hgs': return 'HGS';
    case 'transfer': return line.direction === 'IN' ? 'Balance moved in' : 'Balance moved out';
    case 'refund': return 'Refund';
    default: {
      const key = line.type.trim().toLowerCase();
      if (OTHER_LABELS[key]) return OTHER_LABELS[key];
      const words = line.type.trim().replace(/_/g, ' ');
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}

// ─── HGS ──────────────────────────────────────────────────────────────────────

/** What an HGS line says about its pass. Only what the line itself carries. */
export interface HgsLineInfo {
  /** One pass from the sync. A typed HGS line is an entry, often a lump for many passes. */
  pass: boolean;
  /** The pass's Istanbul day, YYYY-MM-DD. */
  day: string | null;
  /** HH:MM, when the line has one. */
  time: string | null;
  /** "ENTRY → EXIT", the exit alone, or a typed line's own text. */
  route: string | null;
  toll: string | null;
}

const ISTANBUL_DAY = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Istanbul' });

function istanbulDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : ISTANBUL_DAY.format(date);
}

/** An unknown station is written `?` or `*`. */
const knownStation = (value: string) => (value === '?' || value === '*' ? '' : value);

/**
 * The sync writes `[AUTO-HGS] DD-MM-YYYY ENTRY → EXIT`, and may add a time after the
 * date and ` · TOLL` at the end. A typed line is free text dated by when it was entered.
 */
export function hgsLineInfo(line: Pick<WalletLine, 'description' | 'created_at'>): HgsLineInfo {
  const text = (line.description ?? '').trim();
  const auto = text.match(/^\[AUTO-HGS\]\s*(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}:\d{2}))?\s*(.*)$/);
  if (!auto) return { pass: false, day: istanbulDay(line.created_at), time: null, route: text || null, toll: null };
  const [, dd, mm, yyyy, time, rest] = auto;
  const [where, ...tollParts] = rest.split(' · ');
  const toll = tollParts.join(' · ').trim() || null;
  let route: string | null = where.trim() || null;
  if (route && route.includes('→')) {
    const [entry, exit] = route.split('→').map((part) => knownStation(part.trim()));
    route = entry && exit && entry !== exit ? `${entry} → ${exit}` : exit || entry || null;
  }
  return { pass: true, day: `${yyyy}-${mm}-${dd}`, time: time ? time.padStart(5, '0') : null, route, toll };
}

export interface HgsGroup {
  key: string;
  /** Newest pass first. */
  lines: WalletCardLine[];
  /** IN − OUT, as every balance here. */
  net: number;
  first: string | null;
  last: string | null;
}

export type WalletEntry = { kind: 'line'; line: WalletCardLine } | { kind: 'hgs'; group: HgsGroup };

/** Every HGS line of a booking folds into one entry, where its newest line would be. */
export function groupWalletLines(lines: WalletCardLine[], bookingId: number): WalletEntry[] {
  const hgs = lines.filter((line) => line.kind === 'hgs');
  if (hgs.length === 0) return lines.map((line) => ({ kind: 'line', line }));
  const days = hgs.map((line) => line.hgs?.day).filter((day): day is string => Boolean(day)).sort();
  const group: HgsGroup = {
    key: `hgs-${bookingId}`,
    lines: hgs.slice().sort((a, b) => (b.hgs?.day ?? '').localeCompare(a.hgs?.day ?? '') || (b.hgs?.time ?? '').localeCompare(a.hgs?.time ?? '')),
    net: walletBalance(hgs),
    first: days[0] ?? null,
    last: days[days.length - 1] ?? null,
  };
  const entries: WalletEntry[] = [];
  lines.forEach((line) => {
    if (line.kind !== 'hgs') entries.push({ kind: 'line', line });
    else if (line === hgs[0]) entries.push({ kind: 'hgs', group });
  });
  return entries;
}

/** "28/09". */
export const dayMonth = (day: string | null): string => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}` : '—');

const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "42 passes", "3 entries" or "40 passes + 2 entries". */
export function hgsCount(lines: Array<{ hgs: Pick<HgsLineInfo, 'pass'> | null }>): string {
  const passes = lines.filter((line) => line.hgs?.pass).length;
  const entries = lines.length - passes;
  if (!entries) return counted(passes, 'pass', 'passes');
  if (!passes) return counted(entries, 'entry', 'entries');
  return `${counted(passes, 'pass', 'passes')} + ${counted(entries, 'entry', 'entries')}`;
}

/** "from 28/09 to 22/10 · 42 passes", or "on 28/09 · 1 pass". */
export function hgsGroupSummary(group: Pick<HgsGroup, 'first' | 'last'> & { lines: Array<{ hgs: Pick<HgsLineInfo, 'pass'> | null }> }): string {
  const passes = hgsCount(group.lines);
  if (!group.first || !group.last) return passes;
  const when = group.first === group.last ? `on ${dayMonth(group.first)}` : `from ${dayMonth(group.first)} to ${dayMonth(group.last)}`;
  return `${when} · ${passes}`;
}

/** The car customer sheet prints its own rows, which are looser than the wallet's. */
type PrintedLine = { type: string | null; description: string | null; direction: string; amount: number; created_at: string | null };

const isHgs = (entry: Pick<PrintedLine, 'type'>) => lineKind(entry.type ?? '') === 'hgs';

export type InvoiceRow<E extends PrintedLine> =
  | { kind: 'line'; entry: E }
  | { kind: 'hgs'; summary: string; net: number; first: string | null; last: string | null; passes: Array<{ entry: E; info: HgsLineInfo }> };

/** The printed invoice folds HGS the same way: one row where the first HGS line was. */
export function groupInvoiceEntries<E extends PrintedLine>(entries: E[]): InvoiceRow<E>[] {
  const hgs = entries.filter(isHgs);
  if (hgs.length === 0) return entries.map((entry) => ({ kind: 'line', entry }));
  const passes = hgs
    .map((entry) => ({ entry, info: hgsLineInfo(entry) }))
    .sort((a, b) => (b.info.day ?? '').localeCompare(a.info.day ?? '') || (b.info.time ?? '').localeCompare(a.info.time ?? ''));
  const days = passes.map((pass) => pass.info.day).filter((day): day is string => Boolean(day)).sort();
  const first = days[0] ?? null;
  const last = days[days.length - 1] ?? null;
  const summary = hgsGroupSummary({ first, last, lines: passes.map((pass) => ({ hgs: pass.info })) });
  const net = roundMoney(hgs.reduce((sum, entry) => sum + (entry.direction.toUpperCase() === 'IN' ? 1 : -1) * Number(entry.amount), 0));
  const row: InvoiceRow<E> = { kind: 'hgs', summary, net, first, last, passes };
  const rows: InvoiceRow<E>[] = [];
  entries.forEach((entry) => {
    if (!isHgs(entry)) rows.push({ kind: 'line', entry });
    else if (entry === hgs[0]) rows.push(row);
  });
  return rows;
}

export interface TransferPeer {
  direction: 'to' | 'from';
  bookingNumber: string | null;
  /** Set when the other booking is one of this customer's, so the card can link to it. */
  bookingId: number | null;
}

const TRANSFER_TEXT = /^Balance moved (to|from) (\S+)/;

/**
 * The other side of a transfer: the row with the same `payment_ref` on another
 * booking. The description names the booking too, for the rare transfer an admin
 * made to another customer, whose half isn't in this wallet.
 */
export function transferPeer(
  line: WalletLine,
  lines: WalletLine[],
  bookingsByNumber: Map<string, number>,
  numbersById: Map<number, string | null>,
): TransferPeer {
  const direction = line.direction === 'OUT' ? 'to' : 'from';
  const peer = line.payment_ref
    ? lines.find((other) => other.id !== line.id
      && other.payment_ref === line.payment_ref
      && lineKind(other.type) === 'transfer'
      && other.booking_id !== line.booking_id
      && other.direction !== line.direction
      && roundMoney(Number(other.amount)) === roundMoney(Number(line.amount)))
    : undefined;
  if (peer) return { direction, bookingId: peer.booking_id, bookingNumber: numbersById.get(peer.booking_id) ?? null };
  const named = line.description?.match(TRANSFER_TEXT)?.[2] ?? null;
  return { direction, bookingNumber: named, bookingId: named ? bookingsByNumber.get(named) ?? null : null };
}

/** A note left by the Move balance sheet, after the " · " the RPC adds. */
export function transferNote(description: string | null): string | null {
  if (!description || !TRANSFER_TEXT.test(description)) return null;
  const index = description.indexOf(' · ');
  return index === -1 ? null : description.slice(index + 3).trim() || null;
}

// ─── Car history ──────────────────────────────────────────────────────────────

export interface CarNote {
  key: string;
  text: string;
  date: string | null;
}

/**
 * Nothing records when a booking's car changes. The trigger moves every line but
 * HGS to the new car, so the old car survives on the lines left behind (HGS, and
 * anything from before the trigger). A replacement sheet is a real record, with
 * its own date. Lines on a replacement car are already explained by its sheet.
 */
export function carNotes(
  booking: Pick<WalletBookingRow, 'id' | 'car_id'>,
  lines: Array<Pick<WalletLine, 'booking_id' | 'car_id' | 'created_at'>>,
  replacements: WalletReplacement[],
  plates: Map<number, string>,
): CarNote[] {
  const plate = (carId: number | null) => (carId === null ? '—' : plates.get(carId) ?? `Car #${carId}`);
  const sheets = replacements.filter((sheet) => sheet.original_booking_id === booking.id);
  const explained = new Set(sheets.map((sheet) => sheet.replacement_car_id));

  const firstSeen = new Map<number, string>();
  lines
    .filter((line) => line.booking_id === booking.id && line.car_id !== booking.car_id && !explained.has(line.car_id))
    .forEach((line) => {
      const seen = firstSeen.get(line.car_id);
      const at = line.created_at ?? '';
      if (seen === undefined || at < seen) firstSeen.set(line.car_id, at);
    });

  const changes: CarNote[] = Array.from(firstSeen.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([carId]) => ({ key: `car-${carId}`, text: `Car changed ${plate(carId)} → ${plate(booking.car_id)}`, date: null }));

  const swaps: CarNote[] = sheets
    .slice()
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
    .map((sheet) => ({
      key: `sheet-${sheet.id}`,
      text: `Replacement car ${plate(sheet.original_car_id ?? booking.car_id)} → ${plate(sheet.replacement_car_id)}`,
      date: sheet.start_date,
    }));

  return [...changes, ...swaps];
}

// ─── The wallet ───────────────────────────────────────────────────────────────

export interface WalletCardLine extends WalletLine {
  kind: LineKind;
  label: string;
  peer: TransferPeer | null;
  note: string | null;
  /** A recorded payment belongs to its envelope and a transfer to its other half, so neither changes alone. */
  editable: boolean;
  /** Set on HGS lines. */
  hgs: HgsLineInfo | null;
  /** The envelope the payment came in with, which deletes it along with its money movements. */
  envelope: WalletEnvelope | null;
}

export const isEditableLine = (line: Pick<WalletLine, 'type' | 'pay_method'>): boolean =>
  !line.pay_method && lineKind(line.type) !== 'transfer';

export interface WalletCard {
  id: number;
  carId: number;
  bookingNumber: string;
  plate: string | null;
  model: string | null;
  startDate: string;
  endDate: string;
  status: string | null;
  active: boolean;
  balance: number;
  /** Newest first. */
  lines: WalletCardLine[];
  /** The lines as shown: newest first, HGS folded into one. */
  entries: WalletEntry[];
  carNotes: CarNote[];
}

export interface Wallet {
  customerId: string;
  name: string;
  customer: WalletCustomer;
  /** The sum of the bookings' balances, nothing else. */
  total: number;
  /** Newest first. */
  cards: WalletCard[];
}

const newestFirst = (a: { start_date: string; id: number }, b: { start_date: string; id: number }) =>
  b.start_date.localeCompare(a.start_date) || b.id - a.id;

export function buildWallet(data: WalletData): Wallet {
  const numbersById = new Map(data.bookings.map((booking) => [booking.id, booking.booking_number]));
  const bookingsByNumber = new Map<string, number>();
  data.bookings.forEach((booking) => { if (booking.booking_number) bookingsByNumber.set(booking.booking_number, booking.id); });

  // A cancelled booking only shows when it still holds money.
  const withLines = new Set(data.lines.map((line) => line.booking_id));
  const listed = data.bookings.filter((booking) => booking.status !== 'cancelled' || withLines.has(booking.id));
  const envelopeByLine = new Map((data.envelopes ?? []).map(({ ledger_id, ...envelope }) => [ledger_id, envelope]));
  const cards = listed.slice().sort(newestFirst).map((booking): WalletCard => {
    const car = one(booking.cars);
    const own = data.lines.filter((line) => line.booking_id === booking.id);
    const lines = own
      .slice()
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id.localeCompare(a.id))
      .map((line): WalletCardLine => {
        const kind = lineKind(line.type);
        return {
          ...line,
          amount: Number(line.amount),
          kind,
          label: lineLabel(line),
          peer: kind === 'transfer' ? transferPeer(line, data.lines, bookingsByNumber, numbersById) : null,
          note: kind === 'transfer' ? transferNote(line.description) : null,
          editable: isEditableLine(line),
          hgs: kind === 'hgs' ? hgsLineInfo(line) : null,
          envelope: envelopeByLine.get(line.id) ?? null,
        };
      });
    return {
      id: booking.id,
      carId: booking.car_id,
      bookingNumber: booking.booking_number ?? `#${booking.id}`,
      plate: car?.plate_number ?? data.plates.get(booking.car_id) ?? null,
      model: one(car?.model_group)?.name ?? null,
      startDate: booking.start_date,
      endDate: booking.end_date,
      status: booking.status,
      active: Boolean(booking.is_currently_active),
      balance: walletBalance(own),
      lines,
      entries: groupWalletLines(lines, booking.id),
      carNotes: carNotes(booking, data.lines, data.replacements, data.plates),
    };
  });

  return {
    customerId: data.customer.id,
    name: customerName(data.customer),
    customer: data.customer,
    total: roundMoney(cards.reduce((sum, card) => sum + card.balance, 0)),
    cards,
  };
}

// ─── Moving a balance ─────────────────────────────────────────────────────────

/** Where a booking's balance can go: the customer's other bookings, cancelled ones aside. */
export function moveTargets(wallet: Wallet, fromId: number): WalletCard[] {
  return wallet.cards.filter((card) => card.id !== fromId && card.status !== 'cancelled');
}

/** The newest booking that's on the road now, otherwise simply the newest. */
export function defaultTarget(targets: WalletCard[]): WalletCard | null {
  return targets.find((card) => card.active) ?? targets[0] ?? null;
}

/** The newest other booking still holding a balance, to offer moving it onto `targetId`. */
export function balanceToMove(wallet: Wallet, targetId: number): WalletCard | null {
  if (!wallet.cards.some((card) => card.id === targetId)) return null;
  return wallet.cards.find((card) => card.id !== targetId && walletTone(card.balance) !== 'settled') ?? null;
}

export type AmountCheck = { ok: true; amount: number } | { ok: false; error: string };

/**
 * The typed amount is always positive. The RPC wants it with the balance's sign,
 * no bigger than the balance.
 */
export function signedMoveAmount(balance: number, typed: string): AmountCheck {
  const value = Number(typed.trim().replace(',', '.'));
  if (!typed.trim() || !Number.isFinite(value) || value <= 0) return { ok: false, error: 'Enter an amount above zero.' };
  const amount = roundMoney(value);
  if (amount > roundMoney(Math.abs(balance))) return { ok: false, error: `That's more than the balance of ${formatWalletMoney(Math.abs(balance))}.` };
  return { ok: true, amount: balance < 0 ? -amount : amount };
}

/** What the database raises, said plainly. */
export function friendlyMoveError(message: string): string {
  const text = message.trim();
  if (text.toLowerCase() === 'forbidden') return "Your account can't move balances.";
  return text || 'The balance was not moved. Try again.';
}

export interface MoveResult {
  ref: string;
  amount: number;
  from: string;
  to: string;
  from_balance_after: number;
}

export async function moveBookingBalance(input: { fromId: number; toId: number; amount: number; note: string }): Promise<MoveResult> {
  const { data, error } = await supabase.rpc('transfer_booking_balance', {
    p_from_booking: input.fromId,
    p_to_booking: input.toId,
    p_amount: input.amount,
    p_note: input.note.trim() || null,
  });
  if (error) throw new Error(friendlyMoveError(error.message));
  return data as MoveResult;
}

// ─── Reading ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;

type PageResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** PostgREST stops at 1000 rows without saying so. */
async function fetchAll<T>(page: (from: number, to: number) => PageResult): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

const LINE_COLUMNS = 'id, booking_id, car_id, type, description, amount, direction, created_at, payment_ref, pay_method';

/** Null when there's no such customer. Everything is read at once, with no waterfall. */
export async function fetchWalletData(customerId: string): Promise<WalletData | null> {
  const [customer, bookings, lines, replacements, cars, envelopes] = await Promise.all([
    supabase.from('customers').select('id, first_name, last_name, phone, nationality, id_number, is_banned, ban_reason').eq('id', customerId).maybeSingle(),
    supabase
      .from('bookings')
      .select('id, booking_number, car_id, start_date, end_date, status, is_currently_active, cars(plate_number, model_group(name))')
      .eq('customer_id', customerId),
    fetchAll<WalletLine>((from, to) => supabase
      .from('customer_accounting_ledger')
      .select(LINE_COLUMNS)
      .eq('customer_id', customerId)
      .order('id')
      .range(from, to)),
    supabase
      .from('replacement_sheets')
      .select('id, original_booking_id, original_car_id, replacement_car_id, start_date')
      .eq('customer_id', customerId)
      .is('deleted_at', null),
    supabase.from('cars').select('id, plate_number'),
    supabase
      .from('money_envelopes')
      .select('id, ref, status, amount, counted_amount, currency, created_at, created_by, ledger_id')
      .eq('customer_id', customerId)
      .not('ledger_id', 'is', null),
  ]);
  const failure = customer.error ?? bookings.error ?? replacements.error ?? cars.error ?? envelopes.error;
  if (failure) throw new Error(failure.message);
  if (!customer.data) return null;
  return {
    customer: customer.data as WalletData['customer'],
    bookings: (bookings.data ?? []) as unknown as WalletBookingRow[],
    lines,
    replacements: (replacements.data ?? []) as WalletReplacement[],
    plates: new Map(((cars.data ?? []) as Array<{ id: number; plate_number: string }>).map((car) => [car.id, car.plate_number])),
    envelopes: ((envelopes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id),
      ref: String(row.ref),
      status: row.status as EnvelopeStatus,
      amount: Number(row.amount),
      counted_amount: row.counted_amount === null || row.counted_amount === undefined ? null : Number(row.counted_amount),
      currency: row.currency as Currency,
      created_at: String(row.created_at),
      created_by: (row.created_by as string | null) ?? null,
      ledger_id: String(row.ledger_id),
    })),
  };
}

/** The car history of one booking, for the booking itself. */
export async function fetchBookingCarNotes(bookingId: number, carId: number): Promise<CarNote[]> {
  const [lines, replacements, cars] = await Promise.all([
    fetchAll<Pick<WalletLine, 'booking_id' | 'car_id' | 'created_at'>>((from, to) => supabase
      .from('customer_accounting_ledger')
      .select('booking_id, car_id, created_at')
      .eq('booking_id', bookingId)
      .order('id')
      .range(from, to)),
    supabase
      .from('replacement_sheets')
      .select('id, original_booking_id, original_car_id, replacement_car_id, start_date')
      .eq('original_booking_id', bookingId)
      .is('deleted_at', null),
    supabase.from('cars').select('id, plate_number'),
  ]);
  const failure = replacements.error ?? cars.error;
  if (failure) throw new Error(failure.message);
  const plates = new Map(((cars.data ?? []) as Array<{ id: number; plate_number: string }>).map((car) => [car.id, car.plate_number]));
  return carNotes({ id: bookingId, car_id: carId }, lines, (replacements.data ?? []) as WalletReplacement[], plates);
}

/** The ledger's own delete, as the car customer sheet does it. */
export async function deleteLedgerLine(lineId: string): Promise<void> {
  const { error } = await supabase.from('customer_accounting_ledger').delete().eq('id', lineId);
  if (error) throw new Error(error.message);
}

export async function fetchWallet(customerId: string): Promise<Wallet | null> {
  const data = await fetchWalletData(customerId);
  return data && buildWallet(data);
}

// ─── Every customer's wallet, for Accounting ──────────────────────────────────

export interface WalletSummary {
  customerId: string;
  name: string;
  phone: string | null;
  banned: boolean;
  banReason: string | null;
  balance: number;
  bookings: number;
  /** Every car they've had, newest first: labels and search terms, never a split. */
  plates: string[];
  onRoad: boolean;
}

export type WalletFilter = 'owes' | 'credit' | 'settled';
export const WALLET_FILTERS: readonly WalletFilter[] = ['owes', 'credit', 'settled'];

export interface SummaryCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_banned?: boolean | null;
  ban_reason?: string | null;
}

export interface SummaryBooking {
  id: number;
  customer_id: string | null;
  start_date: string;
  status: string | null;
  is_currently_active: boolean | null;
  cars: Joined<{ plate_number: string | null }>;
}

const compact = (value: string) => value.replace(/[\s\-+().]/g, '').toLowerCase();

/**
 * Customers with at least one line. Each booking's balance is rounded to the kuruş
 * and then summed, the same total the wallet shows. Biggest balance either way first.
 */
export function summarizeWallets(
  customers: SummaryCustomer[],
  lines: Array<Pick<WalletLine, 'booking_id' | 'amount' | 'direction'> & { customer_id: string }>,
  bookings: SummaryBooking[] = [],
): WalletSummary[] {
  const perBooking = new Map<string, Map<number, number>>();
  lines.forEach((line) => {
    const own = perBooking.get(line.customer_id) ?? new Map<number, number>();
    own.set(line.booking_id, (own.get(line.booking_id) ?? 0) + (line.direction === 'IN' ? 1 : -1) * Number(line.amount));
    perBooking.set(line.customer_id, own);
  });
  const theirs = new Map<string, SummaryBooking[]>();
  bookings.forEach((booking) => {
    if (!booking.customer_id) return;
    theirs.set(booking.customer_id, [...(theirs.get(booking.customer_id) ?? []), booking]);
  });
  return customers
    .filter((customer) => perBooking.has(customer.id))
    .map((customer): WalletSummary => {
      const own = perBooking.get(customer.id) as Map<number, number>;
      const rides = (theirs.get(customer.id) ?? []).slice().sort((a, b) => b.start_date.localeCompare(a.start_date) || b.id - a.id);
      // The same bookings the wallet lists: a cancelled one only when it holds money.
      const listed = rides.filter((booking) => booking.status !== 'cancelled' || own.has(booking.id));
      const plates: string[] = [];
      const seen = new Set<string>();
      rides.filter((booking) => booking.status !== 'cancelled').forEach((booking) => {
        const plate = one(booking.cars)?.plate_number?.trim();
        if (!plate || seen.has(compact(plate))) return;
        seen.add(compact(plate));
        plates.push(plate);
      });
      return {
        customerId: customer.id,
        name: customerName(customer),
        phone: customer.phone,
        banned: Boolean(customer.is_banned),
        banReason: customer.ban_reason ?? null,
        balance: roundMoney(Array.from(own.values()).reduce((sum, value) => sum + roundMoney(value), 0)),
        // All their bookings, as the wallet lists them, not only those with money on.
        bookings: Math.max(listed.length, own.size),
        plates,
        onRoad: rides.some((booking) => booking.is_currently_active),
      };
    })
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name));
}

export function walletTotals(rows: WalletSummary[]) {
  const owes = rows.filter((row) => walletTone(row.balance) === 'owes');
  const credit = rows.filter((row) => walletTone(row.balance) === 'credit');
  return {
    all: rows.length,
    owesCount: owes.length,
    owesTotal: roundMoney(owes.reduce((sum, row) => sum - row.balance, 0)),
    creditCount: credit.length,
    creditTotal: roundMoney(credit.reduce((sum, row) => sum + row.balance, 0)),
    settledCount: rows.length - owes.length - credit.length,
  };
}

export function inWalletFilter(row: WalletSummary, filter: WalletFilter | 'all'): boolean {
  return filter === 'all' || walletTone(row.balance) === filter;
}

/** Name, phone, or any car they've had: "34KDT" finds "34 KDT 123". */
export function matchesWalletSearch(row: WalletSummary, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  const bare = compact(term);
  return row.name.toLowerCase().includes(term)
    || (bare.replace(/\D/g, '').length >= 3 && compact(row.phone ?? '').includes(bare))
    || (bare !== '' && row.plates.some((plate) => compact(plate).includes(bare)));
}

export async function fetchWalletSummaries(): Promise<WalletSummary[]> {
  const [customers, lines, bookings] = await Promise.all([
    fetchAll<SummaryCustomer>((from, to) => supabase
      .from('customers').select('id, first_name, last_name, phone, is_banned, ban_reason').order('id').range(from, to)),
    fetchAll<Pick<WalletLine, 'booking_id' | 'amount' | 'direction'> & { customer_id: string }>((from, to) => supabase
      .from('customer_accounting_ledger').select('customer_id, booking_id, amount, direction').order('id').range(from, to)),
    fetchAll<SummaryBooking>((from, to) => supabase
      .from('bookings').select('id, customer_id, start_date, status, is_currently_active, cars(plate_number)').order('id').range(from, to)),
  ]);
  return summarizeWallets(customers, lines, bookings);
}
