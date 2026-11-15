import { supabase } from './supabase';

/** One plate of an investor's model group. */
export interface InvestorPlate {
  carId: number;
  plate: string;
  active: boolean;
}

/** An investor's cars of one model. `id` is null for cars with no model group. */
export interface InvestorModelGroup {
  id: number | null;
  name: string | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  transmission: string | null;
  fuel: string | null;
  imageUrl: string | null;
  count: number;
  active: number;
  plates: InvestorPlate[];
}

/** One row of `admin_investors_overview`, figures for the month asked for. */
export interface InvestorOverview {
  id: string;
  companyName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  avatarBg: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  isActive: boolean;
  commissionRate: number | null;
  totalInvestment: number | null;
  createdAt: string;
  carsTotal: number;
  carsActive: number;
  modelTypes: number;
  carsRentedNow: number;
  /** Null when the investor has no active car to measure. */
  utilization: number | null;
  monthIn: number;
  monthOut: number;
  modelGroups: InvestorModelGroup[];
}

type Json = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const numOrNull = (value: unknown): number | null => (value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null);

function parseGroup(raw: Json): InvestorModelGroup {
  const plates = Array.isArray(raw.plates) ? (raw.plates as Json[]) : [];
  return {
    id: numOrNull(raw.model_group_id),
    name: text(raw.name),
    brand: text(raw.brand),
    model: text(raw.model),
    category: text(raw.category),
    transmission: text(raw.transmission),
    fuel: text(raw.fuel),
    imageUrl: text(raw.image_url),
    count: num(raw.count),
    active: num(raw.active),
    plates: plates.map((plate) => ({ carId: num(plate.car_id), plate: text(plate.plate) ?? '—', active: plate.active === true })),
  };
}

export function parseInvestor(raw: Json): InvestorOverview {
  const groups = Array.isArray(raw.model_groups) ? (raw.model_groups as Json[]) : [];
  return {
    id: String(raw.id),
    companyName: text(raw.company_name),
    fullName: text(raw.full_name),
    avatarUrl: text(raw.avatar_url),
    avatarBg: text(raw.avatar_bg),
    phone: text(raw.phone),
    whatsapp: text(raw.whatsapp),
    email: text(raw.email),
    isActive: raw.is_active === true,
    commissionRate: numOrNull(raw.commission_rate),
    totalInvestment: numOrNull(raw.total_investment),
    createdAt: String(raw.created_at ?? ''),
    carsTotal: num(raw.cars_total),
    carsActive: num(raw.cars_active),
    modelTypes: num(raw.model_types),
    carsRentedNow: num(raw.cars_rented_now),
    utilization: numOrNull(raw.utilization_pct),
    monthIn: num(raw.month_in),
    monthOut: num(raw.month_out),
    modelGroups: groups.map(parseGroup),
  };
}

/** Every investor with the month's figures. Admin only; the RPC refuses anyone else. */
export async function fetchInvestorsOverview(month: string): Promise<InvestorOverview[]> {
  const { data, error } = await supabase.rpc('admin_investors_overview', { p_month: month });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? (data as Json[]) : [];
  return rows.map(parseInvestor);
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** The company, or the person when there's no company. */
export const investorName = (investor: Pick<InvestorOverview, 'companyName' | 'fullName'>): string =>
  investor.companyName ?? investor.fullName ?? 'Unnamed investor';

export const monthNet = (investor: Pick<InvestorOverview, 'monthIn' | 'monthOut'>): number => investor.monthIn - investor.monthOut;

/** Named as on Model Groups: brand and model, else the group's name; a plain label for cars with no group. */
export function modelLabel(group: Pick<InvestorModelGroup, 'brand' | 'model' | 'name' | 'id'>): string {
  const brand = group.brand?.trim();
  const model = group.model?.trim();
  const label = brand && model ? `${brand} ${model}` : group.name?.trim() || brand || model || '';
  return label || (group.id === null ? 'No model group' : 'Unnamed model');
}

/** Digits only, the way wa.me wants the number. */
export function whatsappLink(number: string | null): string | null {
  const digits = (number ?? '').replace(/\D/g, '');
  return digits.length >= 7 ? `https://wa.me/${digits}` : null;
}

export function telLink(number: string | null): string | null {
  const cleaned = (number ?? '').replace(/[^\d+]/g, '');
  return cleaned.replace(/\D/g, '').length >= 7 ? `tel:${cleaned}` : null;
}

/** Name, company, model and plate; spaces in a plate don't matter. */
export function matchesInvestorSearch(investor: InvestorOverview, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('tr');
  if (!needle) return true;
  const squeezed = needle.replace(/\s+/g, '');
  const haystack = [investor.companyName, investor.fullName, investor.email].filter(Boolean).join(' ').toLocaleLowerCase('tr');
  if (haystack.includes(needle)) return true;
  return investor.modelGroups.some((group) =>
    modelLabel(group).toLocaleLowerCase('tr').includes(needle)
    || group.plates.some((plate) => plate.plate.replace(/\s+/g, '').toLocaleLowerCase('tr').includes(squeezed)),
  );
}

// ── Tiles ────────────────────────────────────────────────────────────────────

/** Below this, an investor's month counts as low utilization. The Model Groups line. */
export const INVESTOR_LOW_UTILIZATION = 60;

export const INVESTOR_FILTERS = ['cars', 'rented', 'low', 'in', 'out', 'net'] as const;
export type InvestorFilter = typeof INVESTOR_FILTERS[number];

export function matchesInvestorFilter(investor: InvestorOverview, filter: InvestorFilter | 'all'): boolean {
  switch (filter) {
    case 'cars': return investor.carsTotal > 0;
    case 'rented': return investor.carsRentedNow > 0;
    case 'low': return investor.utilization !== null && investor.utilization < INVESTOR_LOW_UTILIZATION;
    case 'in': return investor.monthIn > 0;
    case 'out': return investor.monthOut > 0;
    case 'net': return monthNet(investor) < 0;
    default: return true;
  }
}

export interface InvestorTotals {
  investors: number;
  activeInvestors: number;
  cars: number;
  carsActive: number;
  rentedNow: number;
  /** The whole fleet's: each investor's rate weighted by their active cars. Null with no active car. */
  utilization: number | null;
  monthIn: number;
  monthOut: number;
  net: number;
  counts: Record<InvestorFilter, number>;
}

export function investorTotals(investors: InvestorOverview[]): InvestorTotals {
  let weighted = 0;
  let weight = 0;
  const counts = Object.fromEntries(INVESTOR_FILTERS.map((key) => [key, 0])) as Record<InvestorFilter, number>;
  const totals = investors.reduce((sum, investor) => {
    if (investor.utilization !== null && investor.carsActive > 0) {
      weighted += investor.utilization * investor.carsActive;
      weight += investor.carsActive;
    }
    INVESTOR_FILTERS.forEach((key) => { if (matchesInvestorFilter(investor, key)) counts[key] += 1; });
    return {
      activeInvestors: sum.activeInvestors + (investor.isActive ? 1 : 0),
      cars: sum.cars + investor.carsTotal,
      carsActive: sum.carsActive + investor.carsActive,
      rentedNow: sum.rentedNow + investor.carsRentedNow,
      monthIn: sum.monthIn + investor.monthIn,
      monthOut: sum.monthOut + investor.monthOut,
    };
  }, { activeInvestors: 0, cars: 0, carsActive: 0, rentedNow: 0, monthIn: 0, monthOut: 0 });
  return {
    investors: investors.length,
    ...totals,
    utilization: weight > 0 ? Math.round((weighted / weight) * 10) / 10 : null,
    net: totals.monthIn - totals.monthOut,
    counts,
  };
}

// ── Fleet mix ────────────────────────────────────────────────────────────────

/** Light enough to sit behind dark text, apart enough to tell sixteen models apart. */
export const FLEET_MIX_COLORS = [
  '#A9CDF5', '#B5E5C4', '#F8D99B', '#F5C2D7', '#CEC3F5', '#A8E3EC', '#F9CBA7', '#C3CCF6',
  '#D6EDA6', '#F6B9B9', '#9EE0D2', '#E2C8F2', '#F2E7A0', '#B8DDF3', '#F1C6EC', '#D9DDE3',
] as const;

export interface FleetSlice {
  key: string;
  label: string;
  count: number;
  share: number;
  color: string;
}

/** The fleet by model, largest first, each with its share of the cars. */
export function fleetMix(groups: InvestorModelGroup[]): FleetSlice[] {
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  if (total === 0) return [];
  return [...groups]
    .sort((a, b) => b.count - a.count)
    .map((group, index) => ({
      key: String(group.id ?? 'none'),
      label: modelLabel(group),
      count: group.count,
      share: group.count / total,
      color: FLEET_MIX_COLORS[index % FLEET_MIX_COLORS.length],
    }));
}

/** "Nov 2025" from a timestamp, or null when there's none. */
export function memberSince(createdAt: string): string | null {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' });
}
