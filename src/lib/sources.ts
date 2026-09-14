import { supabase } from './supabase';

/**
 * Distribution-source CRM.
 *
 * Every enum here mirrors a Postgres enum exactly; the orders below are the
 * orders declared in the database, so the Kanban columns and the select options
 * stay in step with what the column will actually accept.
 */

export const STAGES = [
  'backlog',
  'shortlist',
  'contacted',
  'in_discussion',
  'demo_scheduled',
  'negotiation',
  'contract',
  'integration',
  'live',
  'on_hold',
  'rejected',
] as const;
export type Stage = (typeof STAGES)[number];

export const PRIORITIES = ['top', 'high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const KINDS = ['ota', 'aggregator', 'broker', 'rentacar_software', 'marketplace', 'other'] as const;
export type Kind = (typeof KINDS)[number];

export const INVENTORY_TYPES = ['car_fleet', 'car_classes', 'mixed', 'other'] as const;
export type InventoryType = (typeof INVENTORY_TYPES)[number];

export const LICENSE_REQUIREMENTS = ['none', 'company_docs', 'rental_license', 'tursab', 'unknown'] as const;
export type LicenseRequirement = (typeof LICENSE_REQUIREMENTS)[number];

export const TECH_MODELS = ['manual', 'xml_feed', 'pull_api', 'push_api', 'two_way', 'unknown'] as const;
export type TechModel = (typeof TECH_MODELS)[number];

export interface Source {
  id: string;
  name: string;
  slug: string | null;
  website: string | null;
  logo_url: string | null;
  kind: Kind;
  inventory_type: InventoryType;
  headquarters_country: string | null;
  is_turkish_local: boolean;
  supports_istanbul: boolean | null;
  stage: Stage;
  priority: Priority;
  turkey_locations_est: number | null;
  suppliers_count_est: number | null;
  markets_note: string | null;
  license_requirement: LicenseRequirement;
  requires_contract: boolean | null;
  requires_certification: boolean | null;
  has_sandbox: boolean | null;
  self_signup_url: string | null;
  other_requirements: string | null;
  tech_model: TechModel;
  has_content_api: boolean | null;
  has_availability_api: boolean | null;
  has_booking_api: boolean | null;
  has_webhooks: boolean | null;
  api_docs_url: string | null;
  est_time_to_live_weeks_min: number | null;
  est_time_to_live_weeks_max: number | null;
  setup_fee_note: string | null;
  monthly_fee_note: string | null;
  commission_note: string | null;
  pricing_is_quote_only: boolean | null;
  overall_score: number | null;
  next_action: string | null;
  next_action_due: string | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface SourceContact {
  id: string;
  source_id: string;
  full_name: string | null;
  role_title: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferred_channel: string | null;
  is_primary: boolean | null;
  notes: string | null;
}

export const STAGE_LABEL: Record<Stage, string> = {
  backlog: 'Backlog',
  shortlist: 'Shortlist',
  contacted: 'Contacted',
  in_discussion: 'In discussion',
  demo_scheduled: 'Demo scheduled',
  negotiation: 'Negotiation',
  contract: 'Contract',
  integration: 'Integration',
  live: 'Live',
  on_hold: 'On hold',
  rejected: 'Rejected',
};

export const KIND_LABEL: Record<Kind, string> = {
  ota: 'OTA',
  aggregator: 'Aggregator',
  broker: 'Broker',
  rentacar_software: 'Rent-a-car software',
  marketplace: 'Marketplace',
  other: 'Other',
};

export const TECH_LABEL: Record<TechModel, string> = {
  manual: 'Manual',
  xml_feed: 'XML feed',
  pull_api: 'Pull API',
  push_api: 'Push API',
  two_way: 'Two-way',
  unknown: 'Unknown',
};

export const LICENSE_LABEL: Record<LicenseRequirement, string> = {
  none: 'None',
  company_docs: 'Company documents',
  rental_license: 'Rental licence',
  tursab: 'TÜRSAB',
  unknown: 'Unknown',
};

export const INVENTORY_LABEL: Record<InventoryType, string> = {
  car_fleet: 'Car fleet',
  car_classes: 'Car classes',
  mixed: 'Mixed',
  other: 'Other',
};

/** Turns any enum value into something readable if a new one appears in the DB. */
export function humanise(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listSources(): Promise<Source[]> {
  const { data, error } = await supabase
    .from('integration_sources')
    .select('*')
    .order('priority', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Source[];
}

export async function updateSource(id: string, fields: Partial<Source>): Promise<void> {
  const { error } = await supabase.from('integration_sources').update(fields).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listContacts(sourceId: string): Promise<SourceContact[]> {
  const { data, error } = await supabase
    .from('integration_source_contacts')
    .select('id, source_id, full_name, role_title, email, phone, whatsapp, preferred_channel, is_primary, notes')
    .eq('source_id', sourceId)
    .order('is_primary', { ascending: false, nullsFirst: false })
    .order('full_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SourceContact[];
}

export async function upsertContact(contact: Partial<SourceContact> & { source_id: string }): Promise<void> {
  const { id, ...fields } = contact;
  const { error } = id
    ? await supabase.from('integration_source_contacts').update(fields).eq('id', id)
    : await supabase.from('integration_source_contacts').insert(fields);
  if (error) throw new Error(error.message);
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('integration_source_contacts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Due dates ─────────────────────────────────────────────────────────────────

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'none';

/**
 * Compared as calendar days in the viewer's own timezone: `next_action_due` is a
 * DATE column, so treating it as an instant would shift it a day for anyone east
 * or west of the server.
 */
export function dueState(due: string | null, soonDays = 3): DueState {
  if (!due) return 'none';
  const [y, m, d] = due.split('-').map(Number);
  if (!y || !m || !d) return 'none';
  const target = new Date(y, m - 1, d);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= soonDays) return 'soon';
  return 'later';
}

export const DUE_CLASS: Record<DueState, string> = {
  overdue: 'text-[#d4183d] font-semibold',
  today: 'text-[#a6702a] font-semibold',
  soon: 'text-[#a6702a]',
  later: 'text-black/45',
  none: 'text-black/30',
};

export function dueLabel(due: string | null): string {
  if (!due) return 'No date';
  const state = dueState(due);
  const [y, m, d] = due.split('-').map(Number);
  const text = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' }).format(
    new Date(y, m - 1, d),
  );
  if (state === 'overdue') return `Overdue · ${text}`;
  if (state === 'today') return `Due today`;
  return text;
}
