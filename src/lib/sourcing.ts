/**
 * The Sourcing page: cars on the market we're tracking to buy, from `sourcing`.
 *
 * Leads move New → Contacted → Offer Sent → Negotiating → Bought / Lost. Rejected and
 * Ignored are older values that still read as Lost. Prices are lira. The investment
 * check uses this month's `model_group_stats` for the car's model group.
 */

import { supabase } from './supabase';
import type { FilterTileTone } from '../components/shared/FilterTile';
import type { ModelGroupStats } from './modelGroups';

// ─── Values ──────────────────────────────────────────────────────────────────

export const LEAD_STAGES = ['New', 'Contacted', 'Offer Sent', 'Negotiating', 'Bought', 'Lost'] as const;
export type LeadStage = typeof LEAD_STAGES[number];
/** What the column may hold: the stages plus the two older values shown as Lost. */
export type LeadStatus = LeadStage | 'Rejected' | 'Ignored';

export const HOT_STAGES: readonly LeadStage[] = ['Contacted', 'Offer Sent', 'Negotiating'];

export const LEAD_TONES: Record<LeadStage, { tile: FilterTileTone; ink: string; chip: string; soft: string; label: string }> = {
  New: { tile: 'blue', ink: '#1E4E8C', chip: '#4BA6EA', soft: '#E3F0FC', label: 'New' },
  Contacted: { tile: 'teal', ink: '#115E59', chip: '#14B8A6', soft: '#D5F3EF', label: 'Contacted' },
  'Offer Sent': { tile: 'violet', ink: '#4C1D95', chip: '#8B5CF6', soft: '#E9E2FB', label: 'Offer sent' },
  Negotiating: { tile: 'amber', ink: '#92400E', chip: '#F59E0B', soft: '#FBE8C4', label: 'Negotiating' },
  Bought: { tile: 'green', ink: '#166534', chip: '#22C55E', soft: '#D3EEDC', label: 'Bought' },
  Lost: { tile: 'slate', ink: '#334155', chip: '#94A3B8', soft: '#E3E8F0', label: 'Lost' },
};

/** The column a lead sits in. Unknown or older values fall back sensibly. */
export function leadStage(status: string | null): LeadStage {
  if (status === 'Rejected' || status === 'Ignored') return 'Lost';
  return (LEAD_STAGES as readonly string[]).includes(status ?? '') ? status as LeadStage : 'New';
}

export const LISTING_STATUSES = ['Active', 'Sold'] as const;
export type ListingStatus = typeof LISTING_STATUSES[number];

export const TRANSMISSIONS = ['Automatic', 'Manual'] as const;
export const FUEL_TYPES = ['Petrol', 'Diesel', 'Hybrid', 'Electric', 'LPG'] as const;
export const DAMAGE_RECORDS = ['No Damage', 'Damage Value', 'Heavy Damage'] as const;
export type DamageRecord = typeof DAMAGE_RECORDS[number];

export const PLATFORMS = ['sahibinden.com', 'arabam.com', 'letgo', 'Instagram', 'Facebook Marketplace', 'Other'] as const;
export type Platform = typeof PLATFORMS[number];

/** The oldest model year the table accepts. */
export const MIN_MODEL_YEAR = 2020;

// ─── Rows ────────────────────────────────────────────────────────────────────

export interface SourcingRow {
  id: number;
  created_at: string | null;
  updated_at: string | null;
  source_platform: string;
  source_platform_custom: string | null;
  model_group_id: number | null;
  model_group_custom: string | null;
  model_year: number;
  mileage_km: number | null;
  transmission: string | null;
  fuel_type: string | null;
  damage_record: string | null;
  damage_value: number | null;
  paint_sections_count: number | null;
  trim_package: string | null;
  listing_url: string | null;
  listing_status: string | null;
  listed_on: string | null;
  lead_status: string | null;
  asking_price: number | null;
  target_price: number | null;
  notes: string | null;
  city_id: number | null;
  district_id: number | null;
  added_by: string | null;
  city: string | null;
  district: string | null;
  group: { name: string; brand: string | null; model: string | null; image_url: string | null } | null;
}

export interface GeoOption { id: number; name: string }

const num = (value: unknown): number | null => (value === null || value === undefined || value === '' || Number.isNaN(Number(value)) ? null : Number(value));
const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

export function toSourcingRow(raw: Record<string, unknown>): SourcingRow {
  const group = one(raw.model_group as Record<string, unknown> | Record<string, unknown>[] | null);
  return {
    id: Number(raw.id),
    created_at: (raw.created_at as string | null) ?? null,
    updated_at: (raw.updated_at as string | null) ?? null,
    source_platform: String(raw.source_platform ?? 'Other'),
    source_platform_custom: (raw.source_platform_custom as string | null) ?? null,
    model_group_id: num(raw.model_group_id),
    model_group_custom: (raw.model_group_custom as string | null) ?? null,
    model_year: Number(raw.model_year),
    mileage_km: num(raw.mileage_km),
    transmission: (raw.transmission as string | null) ?? null,
    fuel_type: (raw.fuel_type as string | null) ?? null,
    damage_record: (raw.damage_record as string | null) ?? null,
    damage_value: num(raw.damage_value),
    paint_sections_count: num(raw.paint_sections_count),
    trim_package: (raw.trim_package as string | null) || null,
    listing_url: (raw.listing_url as string | null) || null,
    listing_status: (raw.listing_status as string | null) ?? 'Active',
    listed_on: (raw.listed_on as string | null) ?? null,
    lead_status: (raw.lead_status as string | null) ?? 'New',
    asking_price: num(raw.asking_price),
    target_price: num(raw.target_price),
    notes: (raw.notes as string | null) || null,
    city_id: num(raw.city_id),
    district_id: num(raw.district_id),
    added_by: (raw.added_by as string | null) ?? null,
    city: (one(raw.geo_cities as { name: string } | { name: string }[] | null)?.name) ?? null,
    district: (one(raw.geo_districts as { name: string } | { name: string }[] | null)?.name) ?? null,
    group: group ? {
      name: String(group.name ?? ''),
      brand: (group.brand as string | null) ?? null,
      model: (group.model as string | null) ?? null,
      image_url: (group.image_url as string | null) || null,
    } : null,
  };
}

export async function fetchSourcing(): Promise<SourcingRow[]> {
  const { data, error } = await supabase
    .from('sourcing')
    .select('*, geo_cities(name), geo_districts(name), model_group(name, brand, model, image_url)')
    .order('listed_on', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map(toSourcingRow);
}

/** Active cities, İstanbul first. */
export async function fetchCities(): Promise<GeoOption[]> {
  const { data, error } = await supabase.from('geo_cities').select('id, name').eq('is_active', true).order('name');
  if (error) throw new Error(error.message);
  const cities = ((data ?? []) as Array<{ id: number; name: string }>).map((city) => ({ id: Number(city.id), name: city.name }));
  const istanbul = cities.findIndex((city) => city.name === 'İstanbul');
  if (istanbul > 0) cities.unshift(...cities.splice(istanbul, 1));
  return cities;
}

export async function fetchDistricts(cityId: number): Promise<GeoOption[]> {
  const { data, error } = await supabase.from('geo_districts').select('id, name').eq('city_id', cityId).eq('is_active', true).order('name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: number; name: string }>).map((district) => ({ id: Number(district.id), name: district.name }));
}

/** The constraint name Postgres reports when a stage isn't allowed yet. */
const STAGE_CHECK = 'sourcing_lead_status_check';

export function leadUpdateError(message: string, stage: LeadStage): string {
  return message.includes(STAGE_CHECK)
    ? `The database doesn't accept "${LEAD_TONES[stage].label}" yet. Apply supabase/migrations/20261107_sourcing_pipeline_lead_statuses.sql.`
    : message;
}

export async function updateLeadStatus(id: number, stage: LeadStage): Promise<void> {
  const { error } = await supabase.from('sourcing').update({ lead_status: stage }).eq('id', id);
  if (error) throw new Error(leadUpdateError(error.message, stage));
}

// ─── Reading a row ───────────────────────────────────────────────────────────

/** "Renault Clio", the custom model typed in, or a fallback. */
export function carName(row: Pick<SourcingRow, 'group' | 'model_group_custom'>): string {
  if (row.group) {
    const brand = row.group.brand?.trim();
    const model = row.group.model?.trim();
    return brand && model ? `${brand} ${model}` : row.group.name;
  }
  return row.model_group_custom?.trim() || 'Unknown model';
}

export function platformLabel(row: Pick<SourcingRow, 'source_platform' | 'source_platform_custom'>): string {
  if (row.source_platform === 'Other') return row.source_platform_custom?.trim() || 'Other';
  if (row.source_platform === 'sahibinden.com') return 'Sahibinden';
  if (row.source_platform === 'arabam.com') return 'Arabam';
  if (row.source_platform === 'letgo') return 'Letgo';
  if (row.source_platform === 'Facebook Marketplace') return 'Facebook';
  return row.source_platform;
}

/** The platform behind a listing URL, from its domain. Null when it isn't a URL. */
export function detectPlatform(url: string): { platform: Platform; custom: string | null } | null {
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host.includes('.')) return null;
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (is('sahibinden.com')) return { platform: 'sahibinden.com', custom: null };
  if (is('arabam.com')) return { platform: 'arabam.com', custom: null };
  if (is('letgo.com') || is('letgo.com.tr')) return { platform: 'letgo', custom: null };
  if (is('instagram.com')) return { platform: 'Instagram', custom: null };
  if (is('facebook.com') || is('fb.com')) return { platform: 'Facebook Marketplace', custom: null };
  return { platform: 'Other', custom: host.replace(/^www\./, '') };
}

/** How far the asking price is from our target, as a share of the target: below zero is under target. */
export function gapPercent(asking: number | null, target: number | null): number | null {
  if (asking === null || target === null || target <= 0) return null;
  return Math.round(((asking - target) / target) * 1000) / 10;
}

export type DamageBadge = { tone: 'clean' | 'damage' | 'heavy' | 'paint' | 'unknown'; label: string };

/** The damage record in one badge: clean, the damage amount, heavy, or painted parts. */
export function damageBadges(row: Pick<SourcingRow, 'damage_record' | 'damage_value' | 'paint_sections_count'>, formatLira: (amount: number) => string): DamageBadge[] {
  const badges: DamageBadge[] = [];
  if (row.damage_record === 'Heavy Damage') badges.push({ tone: 'heavy', label: 'Heavy damage' });
  else if (row.damage_record === 'Damage Value') badges.push({ tone: 'damage', label: row.damage_value ? `${formatLira(row.damage_value)} damage` : 'Damage on record' });
  const painted = row.paint_sections_count ?? 0;
  if (painted > 0) badges.push({ tone: 'paint', label: `${painted} painted ${painted === 1 ? 'part' : 'parts'}` });
  if (badges.length === 0) badges.push(row.damage_record === 'No Damage' ? { tone: 'clean', label: 'Clean' } : { tone: 'unknown', label: 'No record' });
  return badges;
}

/** Whole days from the listing date to today (Istanbul); null without a date. */
export function daysListed(listedOn: string | null, today: string): number | null {
  if (!listedOn) return null;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${listedOn.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  return Number.isNaN(days) ? null : Math.max(0, days);
}

export const listedLabel = (days: number | null): string => (days === null ? 'Listing date unknown' : days === 0 ? 'Listed today' : days === 1 ? 'Listed yesterday' : `Listed ${days} days ago`);

// ─── Investment check ────────────────────────────────────────────────────────

export type PaybackTone = 'green' | 'amber' | 'red';

export interface InvestmentCheck {
  utilization: number | null;
  avgDailyRate: number | null;
  /** avg real daily rate × 30 × utilization. */
  monthlyRevenue: number | null;
  /** asking price / monthly revenue, in months. */
  paybackMonths: number | null;
  tone: PaybackTone | null;
}

export const paybackTone = (months: number): PaybackTone => (months <= 18 ? 'green' : months <= 30 ? 'amber' : 'red');

export function investmentCheck(asking: number | null, stats: ModelGroupStats | undefined): InvestmentCheck {
  const utilization = stats?.utilization ?? null;
  const avgDailyRate = stats?.avg_daily_rate ?? null;
  const monthlyRevenue = utilization !== null && avgDailyRate !== null ? Math.round(avgDailyRate * 30 * (utilization / 100)) : null;
  const paybackMonths = monthlyRevenue && asking !== null && asking > 0 ? Math.round((asking / monthlyRevenue) * 10) / 10 : null;
  return { utilization, avgDailyRate, monthlyRevenue, paybackMonths, tone: paybackMonths === null ? null : paybackTone(paybackMonths) };
}

export const PAYBACK_COLORS: Record<PaybackTone, { ink: string; soft: string; dot: string }> = {
  green: { ink: '#166534', soft: '#E7F6EC', dot: '#22C55E' },
  amber: { ink: '#92400E', soft: '#FDF1DB', dot: '#F59E0B' },
  red: { ink: '#991B1B', soft: '#FDE8E8', dot: '#DC2626' },
};

// ─── Tiles and filters ───────────────────────────────────────────────────────

export const SOURCING_TILES = ['active', 'hot', 'bought'] as const;
export type SourcingTile = typeof SOURCING_TILES[number];

/** Bought in the month of `today`: the last change to a bought lead is taken as the day it was bought. */
export const boughtThisMonth = (row: SourcingRow, today: string): boolean =>
  leadStage(row.lead_status) === 'Bought' && (row.updated_at ?? '').slice(0, 7) === today.slice(0, 7);

export function matchesTile(row: SourcingRow, tile: SourcingTile | 'all', today: string): boolean {
  if (tile === 'active') return row.listing_status !== 'Sold';
  if (tile === 'hot') return HOT_STAGES.includes(leadStage(row.lead_status));
  if (tile === 'bought') return boughtThisMonth(row, today);
  return true;
}

export interface SourcingFilters {
  query: string;
  platform: string;
  listing: string;
  lead: string;
  city: number | null;
  district: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  priceMin: number | null;
  priceMax: number | null;
}

export const NO_FILTERS: SourcingFilters = { query: '', platform: '', listing: '', lead: '', city: null, district: null, yearFrom: null, yearTo: null, priceMin: null, priceMax: null };

export const activeFilterCount = (filters: SourcingFilters): number =>
  (Object.keys(NO_FILTERS) as Array<keyof SourcingFilters>).filter((key) => key !== 'query' && filters[key] !== NO_FILTERS[key]).length;

const fold = (text: string) => text.toLocaleLowerCase('en-US').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

export function matchesFilters(row: SourcingRow, filters: SourcingFilters): boolean {
  const words = fold(filters.query).split(/\s+/).filter(Boolean);
  if (words.length) {
    const haystack = fold([carName(row), row.trim_package, row.city, row.district, platformLabel(row), row.notes, String(row.model_year)].filter(Boolean).join(' '));
    if (!words.every((word) => haystack.includes(word))) return false;
  }
  if (filters.platform && row.source_platform !== filters.platform) return false;
  if (filters.listing && (row.listing_status ?? 'Active') !== filters.listing) return false;
  if (filters.lead && leadStage(row.lead_status) !== filters.lead) return false;
  if (filters.city !== null && row.city_id !== filters.city) return false;
  if (filters.district !== null && row.district_id !== filters.district) return false;
  if (filters.yearFrom !== null && row.model_year < filters.yearFrom) return false;
  if (filters.yearTo !== null && row.model_year > filters.yearTo) return false;
  if (filters.priceMin !== null && (row.asking_price === null || row.asking_price < filters.priceMin)) return false;
  if (filters.priceMax !== null && (row.asking_price === null || row.asking_price > filters.priceMax)) return false;
  return true;
}

export interface SourcingSummary {
  total: number;
  active: number;
  hot: number;
  bought: number;
  /** Average gap to target over the leads that have both prices; null when none do. */
  avgGap: number | null;
  gapCount: number;
}

export function summarize(rows: SourcingRow[], today: string): SourcingSummary {
  const gaps = rows.map((row) => gapPercent(row.asking_price, row.target_price)).filter((gap): gap is number => gap !== null);
  return {
    total: rows.length,
    active: rows.filter((row) => matchesTile(row, 'active', today)).length,
    hot: rows.filter((row) => matchesTile(row, 'hot', today)).length,
    bought: rows.filter((row) => matchesTile(row, 'bought', today)).length,
    avgGap: gaps.length ? Math.round((gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) * 10) / 10 : null,
    gapCount: gaps.length,
  };
}

export const TABLE_SORTS = ['listed', 'year', 'km', 'asking', 'gap'] as const;
export type TableSort = typeof TABLE_SORTS[number];
export const firstTableDirection = (key: TableSort): 'asc' | 'desc' => (key === 'km' || key === 'gap' ? 'asc' : 'desc');

/** Rows without the figure go last either way; ties keep the newest listing first. */
export function sortRows(rows: SourcingRow[], key: TableSort, direction: 'asc' | 'desc'): SourcingRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  const value = (row: SourcingRow): number | null => {
    if (key === 'listed') return row.listed_on ? Date.parse(row.listed_on) : null;
    if (key === 'year') return row.model_year;
    if (key === 'km') return row.mileage_km;
    if (key === 'asking') return row.asking_price;
    return gapPercent(row.asking_price, row.target_price);
  };
  const newest = (a: SourcingRow, b: SourcingRow) => (b.listed_on ?? '').localeCompare(a.listed_on ?? '') || b.id - a.id;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) return (va === null ? 1 : 0) - (vb === null ? 1 : 0) || newest(a, b);
    return sign * (va - vb) || newest(a, b);
  });
}

// ─── The form ────────────────────────────────────────────────────────────────

export interface SourcingForm {
  listing_url: string;
  source_platform: string;
  source_platform_custom: string;
  model_group_id: string; // '' for none, 'custom' for a typed model
  model_group_custom: string;
  model_year: string;
  mileage_km: string;
  transmission: string;
  fuel_type: string;
  trim_package: string;
  damage_record: string;
  damage_value: string;
  paint_sections_count: string;
  city_id: string;
  district_id: string;
  asking_price: string;
  target_price: string;
  listed_on: string;
  listing_status: string;
  lead_status: string;
  notes: string;
}

export type SourcingField = keyof SourcingForm;

export const CUSTOM_MODEL = 'custom';

export const emptyForm = (today: string): SourcingForm => ({
  listing_url: '', source_platform: '', source_platform_custom: '', model_group_id: '', model_group_custom: '',
  model_year: '', mileage_km: '', transmission: 'Automatic', fuel_type: 'Petrol', trim_package: '',
  damage_record: 'No Damage', damage_value: '', paint_sections_count: '0', city_id: '', district_id: '',
  asking_price: '', target_price: '', listed_on: today, listing_status: 'Active', lead_status: 'New', notes: '',
});

const str = (value: number | string | null | undefined) => (value === null || value === undefined ? '' : String(value));

export function toForm(row: SourcingRow): SourcingForm {
  return {
    listing_url: row.listing_url ?? '',
    source_platform: row.source_platform,
    source_platform_custom: row.source_platform_custom ?? '',
    model_group_id: row.model_group_id !== null ? String(row.model_group_id) : row.model_group_custom ? CUSTOM_MODEL : '',
    model_group_custom: row.model_group_custom ?? '',
    model_year: str(row.model_year),
    mileage_km: str(row.mileage_km),
    transmission: row.transmission ?? 'Automatic',
    fuel_type: row.fuel_type ?? 'Petrol',
    trim_package: row.trim_package ?? '',
    damage_record: row.damage_record ?? 'No Damage',
    damage_value: str(row.damage_value),
    paint_sections_count: str(row.paint_sections_count ?? 0),
    city_id: str(row.city_id),
    district_id: str(row.district_id),
    asking_price: str(row.asking_price),
    target_price: str(row.target_price),
    listed_on: row.listed_on?.slice(0, 10) ?? '',
    listing_status: row.listing_status ?? 'Active',
    lead_status: leadStage(row.lead_status),
    notes: row.notes ?? '',
  };
}

export const changedFields = (form: SourcingForm, baseline: SourcingForm): SourcingField[] =>
  (Object.keys(form) as SourcingField[]).filter((key) => form[key].trim() !== baseline[key].trim());

/** Digits with an optional dot or comma for decimals, and spaces or dots as thousands left out. */
export function parseAmount(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '');
  if (!trimmed) return null;
  // 1.250.000 or 1,250,000 → thousands; a single comma or dot before 1–2 digits → decimals.
  const normalised = /^\d{1,3}([.,]\d{3})+$/.test(trimmed) ? trimmed.replace(/[.,]/g, '') : trimmed.replace(',', '.');
  return /^\d+(\.\d+)?$/.test(normalised) ? Number(normalised) : Number.NaN;
}

export function validateForm(form: SourcingForm, currentYear: number): Partial<Record<SourcingField, string>> {
  const errors: Partial<Record<SourcingField, string>> = {};
  if (!form.model_group_id) errors.model_group_id = 'Pick a model group, or type the model.';
  else if (form.model_group_id === CUSTOM_MODEL && !form.model_group_custom.trim()) errors.model_group_custom = 'Type the model.';
  const year = parseAmount(form.model_year);
  if (year === null) errors.model_year = 'Enter the model year.';
  else if (Number.isNaN(year) || !Number.isInteger(year) || year < MIN_MODEL_YEAR || year > currentYear) errors.model_year = `Between ${MIN_MODEL_YEAR} and ${currentYear}.`;
  const km = parseAmount(form.mileage_km);
  if (km === null) errors.mileage_km = 'Enter the mileage.';
  else if (Number.isNaN(km) || !Number.isInteger(km)) errors.mileage_km = 'Enter whole kilometres.';
  const asking = parseAmount(form.asking_price);
  if (asking === null) errors.asking_price = 'Enter the asking price.';
  else if (Number.isNaN(asking) || asking <= 0) errors.asking_price = 'Enter a price above zero.';
  const target = parseAmount(form.target_price);
  if (target !== null && (Number.isNaN(target) || target <= 0)) errors.target_price = 'Enter a price above zero, or leave it empty.';
  if (form.damage_record === 'Damage Value') {
    const damage = parseAmount(form.damage_value);
    if (damage !== null && Number.isNaN(damage)) errors.damage_value = 'Enter an amount, or leave it empty.';
  }
  const painted = parseAmount(form.paint_sections_count);
  if (painted !== null && (Number.isNaN(painted) || !Number.isInteger(painted))) errors.paint_sections_count = 'Enter a whole number.';
  if (form.source_platform === 'Other' && !form.source_platform_custom.trim()) errors.source_platform_custom = 'Name the platform.';
  if (!form.source_platform) errors.source_platform = 'Pick the platform, or paste the listing link.';
  if (form.listing_url.trim() && detectPlatform(form.listing_url) === null) errors.listing_url = "That doesn't look like a link.";
  return errors;
}

/** The row to save. Only call it on a form that passed validateForm. */
export function formPayload(form: SourcingForm) {
  const amount = (value: string) => parseAmount(value);
  const whole = (value: string) => { const parsed = parseAmount(value); return parsed === null ? null : Math.round(parsed); };
  const custom = form.model_group_id === CUSTOM_MODEL;
  const url = form.listing_url.trim();
  return {
    listing_url: url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : null,
    source_platform: form.source_platform,
    source_platform_custom: form.source_platform === 'Other' ? form.source_platform_custom.trim() || null : null,
    model_group_id: custom ? null : Number(form.model_group_id),
    model_group_custom: custom ? form.model_group_custom.trim() : null,
    model_year: Number(whole(form.model_year)),
    mileage_km: whole(form.mileage_km),
    transmission: form.transmission || null,
    fuel_type: form.fuel_type || null,
    trim_package: form.trim_package.trim() || null,
    damage_record: form.damage_record || null,
    damage_value: form.damage_record === 'Damage Value' ? amount(form.damage_value) : null,
    paint_sections_count: whole(form.paint_sections_count) ?? 0,
    city_id: form.city_id ? Number(form.city_id) : null,
    district_id: form.city_id && form.district_id ? Number(form.district_id) : null,
    asking_price: amount(form.asking_price),
    target_price: amount(form.target_price),
    listed_on: form.listed_on || null,
    listing_status: form.listing_status || 'Active',
    lead_status: form.lead_status || 'New',
    notes: form.notes.trim() || null,
  };
}
