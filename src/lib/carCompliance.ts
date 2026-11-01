import { daysBetween, istanbulDate } from './customers';
import { supabase } from './supabase';

/**
 * Whether an active car may legally be rented. A date that isn't recorded counts
 * as a problem, not as fine: `cars_registration` has no row at all for some cars.
 */
export type ComplianceDoc = 'insurance' | 'inspection';
export type IssueState = 'missing' | 'expired';
export type ComplianceTone = 'red' | 'amber';

export interface ComplianceIssue {
  doc: ComplianceDoc;
  state: IssueState;
  /** Whole days since it expired. Null when no date is recorded. */
  daysAgo: number | null;
}

export interface RegistrationDates {
  car_id: number;
  insurance_expiry: string | null;
  inspection_expiry: string | null;
}

export interface ComplianceCar {
  id: number;
  plate_number: string;
  model: string;
}

export interface CarCompliance extends ComplianceCar {
  issues: ComplianceIssue[];
  /** A car with both an expired and a missing date counts as expired. */
  severity: IssueState;
}

export interface ComplianceSummary {
  expired: number;
  missing: number;
  total: number;
  tone: ComplianceTone;
}

const DOC_LABEL: Record<ComplianceDoc, string> = { insurance: 'Insurance', inspection: 'Inspection' };

export const toneOf = (state: IssueState): ComplianceTone => (state === 'expired' ? 'red' : 'amber');

/** A car is still covered on the day its date falls. */
function docIssue(doc: ComplianceDoc, date: string | null | undefined, today: string): ComplianceIssue | null {
  if (!date) return { doc, state: 'missing', daysAgo: null };
  const day = date.slice(0, 10);
  return day < today ? { doc, state: 'expired', daysAgo: daysBetween(day, today) } : null;
}

export function carIssues(registration: RegistrationDates | undefined, today: string = istanbulDate()): ComplianceIssue[] {
  return [
    docIssue('insurance', registration?.insurance_expiry, today),
    docIssue('inspection', registration?.inspection_expiry, today),
  ].filter((issue): issue is ComplianceIssue => issue !== null);
}

export function issueLabel(issue: ComplianceIssue): string {
  const doc = DOC_LABEL[issue.doc];
  if (issue.state === 'missing') return `${doc} date not recorded`;
  return `${doc} expired ${issue.daysAgo} ${issue.daysAgo === 1 ? 'day' : 'days'} ago`;
}

const longestOverdue = (car: CarCompliance) => Math.max(...car.issues.map((issue) => issue.daysAgo ?? 0));

/** Only the cars with a problem: the longest expired first, then missing dates by plate. */
export function buildCompliance(
  cars: ComplianceCar[],
  registrations: RegistrationDates[],
  today: string = istanbulDate(),
): CarCompliance[] {
  const byCar = new Map(registrations.map((registration) => [registration.car_id, registration]));
  return cars
    .map((car) => {
      const issues = carIssues(byCar.get(car.id), today);
      const severity: IssueState = issues.some((issue) => issue.state === 'expired') ? 'expired' : 'missing';
      return { ...car, issues, severity };
    })
    .filter((car) => car.issues.length > 0)
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'expired' ? -1 : 1;
      return longestOverdue(b) - longestOverdue(a) || a.plate_number.localeCompare(b.plate_number);
    });
}

export function summarize(cars: CarCompliance[]): ComplianceSummary {
  const expired = cars.filter((car) => car.severity === 'expired').length;
  return { expired, missing: cars.length - expired, total: cars.length, tone: expired > 0 ? 'red' : 'amber' };
}

/** "8 expired · 7 no date", leaving out a side that has nothing in it. */
export function summaryLabel({ expired, missing }: ComplianceSummary): string {
  return [expired > 0 && `${expired} expired`, missing > 0 && `${missing} no date`].filter(Boolean).join(' · ');
}

const REGISTRATION_DATES = 'car_id, insurance_expiry, inspection_expiry';

export async function fetchRegistrationDates(): Promise<RegistrationDates[]> {
  const { data, error } = await supabase.from('cars_registration').select(REGISTRATION_DATES);
  if (error) throw error;
  return (data ?? []) as RegistrationDates[];
}

interface ActiveCarRow {
  id: number;
  plate_number: string;
  model_group: { name: string } | { name: string }[] | null;
}

export async function fetchCarCompliance(): Promise<CarCompliance[]> {
  const [carsRes, registrations] = await Promise.all([
    supabase.from('cars').select('id, plate_number, model_group(name)').eq('is_active', true),
    fetchRegistrationDates(),
  ]);
  if (carsRes.error) throw carsRes.error;
  const cars = ((carsRes.data ?? []) as unknown as ActiveCarRow[]).map((car) => ({
    id: car.id,
    plate_number: car.plate_number,
    model: (Array.isArray(car.model_group) ? car.model_group[0]?.name : car.model_group?.name) ?? '—',
  }));
  return buildCompliance(cars, registrations);
}
