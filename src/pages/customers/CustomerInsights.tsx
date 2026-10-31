import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown } from '../../components/media/MediaIcons';
import { CustomerAvatar } from '../../components/shared/PersonAvatar';
import {
  OTHERS,
  findDataIssues,
  languageRows,
  longMonthLabel,
  loyaltyStats,
  monthLabel,
  nationalityRows,
  newCustomersByMonth,
  topNationalities,
  type DataIssues,
  type DuplicateGroup,
  type LoyaltyStats,
  type NationalityRow,
} from '../../lib/customerInsights';
import { formatLira, type CustomerDirectory, type CustomerSummary } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import { Flag } from './ui';

const BLUES = ['#3A74C2', '#6EA4E7', '#9CC2EE', '#C6DCF5', '#94A3B8', '#CBD5E1', '#E5E7EB'];
const TOP_BARS = 8;
const TOP_SLICES = 6;

const Card: React.FC<{ title: string; note?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  title,
  note,
  action,
  className,
  children,
}) => (
  <section className={cn('flex min-w-0 flex-col rounded-[20px] border border-subtle bg-surface p-4 sm:p-5', className)}>
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[14px] font-medium tracking-[-0.01em] text-foreground">{title}</h3>
        {note && <p className="mt-0.5 text-[12px] text-black/45">{note}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const Tip: React.FC<{ align?: 'start' | 'center' | 'end'; children: React.ReactNode }> = ({ align = 'center', children }) => (
  <span
    role="tooltip"
    className={cn(
      'pointer-events-none absolute bottom-[calc(100%+6px)] z-20 whitespace-nowrap rounded-lg bg-[#111827] px-2 py-1 text-[11.5px] font-medium tabular-nums text-white opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus:opacity-100',
      align === 'start' && 'left-0',
      align === 'center' && 'left-1/2 -translate-x-1/2',
      align === 'end' && 'right-0',
    )}
  >
    {children}
  </span>
);

// ── Nationalities ────────────────────────────────────────────────────────────

type Metric = 'customers' | 'revenue';

const MetricToggle: React.FC<{ value: Metric; onChange: (value: Metric) => void }> = ({ value, onChange }) => (
  <div className="flex shrink-0 rounded-lg bg-black/[0.05] p-0.5" role="group" aria-label="Show nationalities by">
    {(['customers', 'revenue'] as Metric[]).map((metric) => (
      <button
        key={metric}
        type="button"
        aria-pressed={metric === value}
        onClick={() => onChange(metric)}
        className={cn(
          'h-11 rounded-md px-2.5 text-[12px] font-medium capitalize transition-colors md:h-7',
          metric === value ? 'bg-surface text-foreground shadow-sm' : 'text-black/50',
        )}
      >
        {metric}
      </button>
    ))}
  </div>
);

const NationalityBars: React.FC<{ rows: NationalityRow[]; onSelect: (nationality: string) => void }> = ({ rows, onSelect }) => {
  const [metric, setMetric] = useState<Metric>('customers');
  const top = useMemo(() => topNationalities(rows, metric, TOP_BARS), [rows, metric]);
  const total = rows.reduce((sum, row) => sum + row[metric], 0);
  const largest = top.reduce((max, row) => Math.max(max, row[metric]), 1);

  return (
    <Card
      title="Nationalities"
      note={`Top ${TOP_BARS}, click one to filter the list`}
      action={<MetricToggle value={metric} onChange={setMetric} />}
    >
      {top.length === 0 ? <p className="py-6 text-center text-[13px] text-black/45">No data yet.</p> : (
        <ul className="flex flex-col gap-1">
          {top.map((row) => {
            const share = total > 0 ? Math.round((row[metric] / total) * 100) : 0;
            const shown = metric === 'customers' ? row.customers : formatLira(row.revenue);
            const isOthers = row.nationality === OTHERS;
            const inner = (
              <>
                <span className="mb-1 flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                    <Flag nationality={row.nationality} />
                    <span className="truncate">{row.nationality}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-black/55">
                    {shown} <span className="text-black/35">· {share}%</span>
                  </span>
                </span>
                <span className="block h-2 overflow-hidden rounded-full bg-black/[0.05]">
                  <span
                    className={cn('block h-full rounded-full', isOthers ? 'bg-[#CBD5E1]' : 'bg-[#6EA4E7]')}
                    style={{ width: `${Math.max((row[metric] / largest) * 100, 1.5)}%` }}
                  />
                </span>
              </>
            );
            return (
              <li key={row.nationality}>
                {isOthers ? <div className="px-1.5 py-1.5">{inner}</div> : (
                  <button
                    type="button"
                    onClick={() => onSelect(row.nationality)}
                    title={`${row.customers} customers · ${formatLira(row.revenue)}`}
                    className="block w-full rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30"
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

// ── Revenue donut ────────────────────────────────────────────────────────────

const DONUT_RADIUS = 42;
const DONUT_STROKE = 15;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

const RevenueDonut: React.FC<{ rows: NationalityRow[] }> = ({ rows }) => {
  const slices = useMemo(() => topNationalities(rows, 'revenue', TOP_SLICES), [rows]);
  const total = slices.reduce((sum, row) => sum + row.revenue, 0);
  const [hovered, setHovered] = useState<string | null>(null);
  const focus = slices.find((row) => row.nationality === hovered);

  let offset = 0;

  return (
    <Card title="Revenue by nationality" note="Average is per customer who has spent">
      {total === 0 ? <p className="py-6 text-center text-[13px] text-black/45">No revenue recorded yet.</p> : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative h-[168px] w-[168px] shrink-0">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`Revenue by nationality, ${formatLira(total)} in total`}>
              {slices.map((row, index) => {
                const length = (row.revenue / total) * CIRCUMFERENCE;
                const circle = (
                  <circle
                    key={row.nationality}
                    cx="60"
                    cy="60"
                    r={DONUT_RADIUS}
                    fill="none"
                    stroke={BLUES[index % BLUES.length]}
                    strokeWidth={hovered === row.nationality ? DONUT_STROKE + 3 : DONUT_STROKE}
                    strokeDasharray={`${Math.max(length - 1, 0.5)} ${CIRCUMFERENCE}`}
                    strokeDashoffset={-offset}
                    onMouseEnter={() => setHovered(row.nationality)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setHovered(row.nationality)}
                    className="transition-[stroke-width] duration-100"
                  />
                );
                offset += length;
                return circle;
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              <span className="max-w-full truncate text-[11px] text-black/45">{focus ? focus.nationality : 'Total'}</span>
              <span className="text-[15px] font-semibold tabular-nums tracking-[-0.01em] text-foreground">
                {formatLira(focus ? focus.revenue : total)}
              </span>
              {focus && <span className="text-[11px] tabular-nums text-black/45">{Math.round((focus.revenue / total) * 100)}%</span>}
            </div>
          </div>

          <ul className="flex w-full min-w-0 flex-1 flex-col">
            {slices.map((row, index) => (
              <li
                key={row.nationality}
                onMouseEnter={() => setHovered(row.nationality)}
                onMouseLeave={() => setHovered(null)}
                className={cn('flex items-center gap-2 rounded-md px-1.5 py-1 text-[12.5px]', hovered === row.nationality && 'bg-black/[0.03]')}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: BLUES[index % BLUES.length] }} />
                <span className="flex min-w-0 flex-1 items-center gap-1 text-foreground">
                  <Flag nationality={row.nationality} />
                  <span className="truncate">{row.nationality}</span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block text-foreground">{formatLira(row.revenue)}</span>
                  <span className="block text-[11px] text-black/45">avg {formatLira(row.averageSpend)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};

// ── Languages ────────────────────────────────────────────────────────────────

const Languages: React.FC<{ customers: CustomerDirectory['customers'] }> = ({ customers }) => {
  const rows = useMemo(() => languageRows(customers), [customers]);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <Card title="Languages">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={rows.map((row) => `${row.label} ${row.count}`).join(', ')}>
        {rows.map((row, index) => (
          <span key={row.label} title={`${row.label}: ${row.count}`} style={{ flex: row.count, background: BLUES[index % BLUES.length] }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {rows.map((row, index) => (
          <li key={row.label} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: BLUES[index % BLUES.length] }} />
            <span className="flex-1 text-foreground">{row.label}</span>
            <span className="tabular-nums text-black/55">
              {row.count} <span className="text-black/35">· {total ? Math.round((row.count / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
};

// ── New customers ────────────────────────────────────────────────────────────

const NewCustomers: React.FC<{ customers: CustomerDirectory['customers']; today: string }> = ({ customers, today }) => {
  const months = useMemo(() => newCustomersByMonth(customers, today), [customers, today]);
  const peak = Math.max(...months.map((row) => row.count), 1);
  const current = months[months.length - 1];

  return (
    <Card title="New customers per month" note={`${current.count} so far in ${longMonthLabel(current.month)}`}>
      <ol className="flex h-[172px] items-end gap-1 sm:gap-1.5">
        {months.map((row, index) => {
          const isCurrent = index === months.length - 1;
          return (
            <li key={row.month} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div
                tabIndex={0}
                className="group relative flex min-h-0 flex-1 flex-col items-center justify-end rounded focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30"
                aria-label={`${longMonthLabel(row.month)}: ${row.count} new customers`}
              >
                <Tip align={index < 2 ? 'start' : index > months.length - 3 ? 'end' : 'center'}>
                  {longMonthLabel(row.month)}: {row.count}
                </Tip>
                <span className={cn('mb-1 hidden text-[11px] tabular-nums sm:block', isCurrent ? 'font-semibold text-brand-strong' : 'text-black/40')}>
                  {row.count > 0 ? row.count : ''}
                </span>
                <span
                  className={cn('w-full max-w-[34px] rounded-t-[5px] transition-colors', isCurrent ? 'bg-[#3A74C2]' : 'bg-[#6EA4E7]/45 group-hover:bg-[#6EA4E7]')}
                  style={{ height: `${Math.max((row.count / peak) * 74, row.count > 0 ? 3 : 1)}%` }}
                />
              </div>
              <span className={cn('mt-1.5 block text-center text-[10.5px] sm:text-[11px]', isCurrent ? 'font-semibold text-brand-strong' : 'text-black/45')}>
                <span className="sm:hidden">{monthLabel(row.month).charAt(0)}</span>
                <span className="hidden sm:inline">{monthLabel(row.month)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
};

// ── Loyalty ──────────────────────────────────────────────────────────────────

const Figure: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <div className="text-[20px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground sm:text-[22px]">{value}</div>
    <div className="mt-1 text-[12px] leading-snug text-black/50">{label}</div>
  </div>
);

const Loyalty: React.FC<{ stats: LoyaltyStats; records: number }> = ({ stats, records }) => (
  <Card title="Loyalty" note={`${stats.people} people with a booking, from ${records} records`}>
    <div className="grid grid-cols-3 gap-3">
      <Figure label="Repeat rate" value={`${stats.repeatRate.toFixed(1)}%`} />
      <Figure label="Bookings per person" value={stats.averageBookings.toFixed(2)} />
      <Figure label="Avg. rental days" value={stats.averageDays.toFixed(1)} />
    </div>

    <h4 className="mt-4 text-[11px] font-medium uppercase tracking-[0.08em] text-black/40">Top 5 by spend</h4>
    <ol className="mt-1">
      {stats.topSpenders.map((person) => (
        <li key={person.id}>
          <Link
            to={`/dashboard/customers/${person.id}`}
            className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-1 transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30"
          >
            <CustomerAvatar size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-foreground">{person.name}</span>
              <span className="block text-[11.5px] text-black/45">
                {person.bookings} {person.bookings === 1 ? 'booking' : 'bookings'}
                {person.records > 1 && ` · ${person.records} records`}
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-medium tabular-nums text-foreground">{formatLira(person.spent)}</span>
          </Link>
        </li>
      ))}
    </ol>

    <dl className="mt-2 flex flex-col border-t border-black/[0.05] pt-2 text-[12.5px]">
      {stats.mostFrequent && (
        <div className="flex items-center justify-between gap-3 py-1">
          <dt className="shrink-0 text-black/50">Most frequent</dt>
          <dd className="min-w-0 truncate text-right text-foreground">{stats.mostFrequent.name} · {stats.mostFrequent.bookings} bookings</dd>
        </div>
      )}
      {stats.longestRental && (
        <div className="flex items-center justify-between gap-3 py-1">
          <dt className="shrink-0 text-black/50">Longest rental</dt>
          <dd className="min-w-0 truncate text-right text-foreground">{stats.longestRental.name} · {stats.longestRental.days} days</dd>
        </div>
      )}
    </dl>
  </Card>
);

// ── Data quality ─────────────────────────────────────────────────────────────

const OPEN_LINK = 'inline-flex h-11 items-center rounded-md border border-subtle px-2 text-[12px] font-medium text-brand-strong transition-colors hover:bg-brand-strong/[0.06] md:h-7';
const GROUPS_SHOWN = 7;

const DuplicateRow: React.FC<{ group: DuplicateGroup }> = ({ group }) => {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-black/[0.05] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center gap-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">
            {group.names[0]} <span className="font-normal tabular-nums text-black/45">×{group.records.length}</span>
          </span>
          <span className="block truncate text-[11.5px] text-black/45">
            ID {group.idNumber}{group.names.length > 1 ? ` · ${group.names.length} spellings` : ''}
          </span>
        </span>
        <ChevronDown size={14} className={cn('shrink-0 text-black/35 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="flex flex-wrap gap-1 pb-2.5">
          {group.records.map((record, index) => (
            <Link
              key={record.id}
              to={`/dashboard/customers/${record.id}`}
              title={`${record.name}, added ${record.created}`}
              aria-label={`Open ${record.name}, record ${index + 1} of ${group.records.length}`}
              className={OPEN_LINK}
            >
              {record.name}
            </Link>
          ))}
        </div>
      )}
    </li>
  );
};

const DataQuality: React.FC<{ issues: DataIssues }> = ({ issues }) => {
  const [view, setView] = useState<'duplicates' | 'test'>('duplicates');
  const [showAll, setShowAll] = useState(false);
  const groups = showAll ? issues.duplicates : issues.duplicates.slice(0, GROUPS_SHOWN);
  const views = [
    { key: 'duplicates' as const, label: 'Possible duplicates', count: issues.duplicates.length },
    { key: 'test' as const, label: 'Test-looking', count: issues.testRecords.length },
  ];

  return (
    <Card title="Data quality" note={`${issues.duplicateRecords} records share an ID under different spellings. Read only.`}>
      <div className="mb-2 flex gap-1 rounded-lg bg-black/[0.05] p-0.5" role="group" aria-label="Data quality view">
        {views.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={view === item.key}
            onClick={() => setView(item.key)}
            className={cn(
              'h-11 min-w-0 flex-1 truncate rounded-md px-2 text-[12px] font-medium transition-colors md:h-8',
              view === item.key ? 'bg-surface text-foreground shadow-sm' : 'text-black/50',
            )}
          >
            {item.label} <span className="tabular-nums opacity-60">{item.count}</span>
          </button>
        ))}
      </div>

      {view === 'test' ? (
        issues.testRecords.length === 0 ? <p className="py-6 text-center text-[13px] text-black/45">Nothing looks like a test.</p> : (
          <ul>
            {issues.testRecords.map((record) => (
              <li key={record.id} className="flex items-center gap-2 border-b border-black/[0.05] py-1.5 last:border-b-0">
                <span className="text-[#B45309]"><AlertTriangle size={13} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-foreground">{record.name}</span>
                  <span className="block truncate text-[11.5px] text-black/45">{record.why}</span>
                </span>
                <Link to={`/dashboard/customers/${record.id}`} aria-label={`Open ${record.name}`} className={OPEN_LINK}>Open</Link>
              </li>
            ))}
          </ul>
        )
      ) : issues.duplicates.length === 0 ? <p className="py-6 text-center text-[13px] text-black/45">No duplicates found.</p> : (
        <>
          <ul className={cn(showAll && 'max-h-[380px] overflow-y-auto pe-1')}>
            {groups.map((group) => <DuplicateRow key={group.idNumber} group={group} />)}
          </ul>
          {issues.duplicates.length > GROUPS_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="mt-1 inline-flex h-11 items-center text-[12.5px] font-medium text-brand-strong md:h-8"
            >
              {showAll ? 'Show fewer' : `Show all ${issues.duplicates.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
};

// ── Section ──────────────────────────────────────────────────────────────────

export const CustomerInsights: React.FC<{
  directory: CustomerDirectory;
  summaries: CustomerSummary[];
  today: string;
  open: boolean;
  onToggle: () => void;
  onSelectNationality: (nationality: string) => void;
}> = ({ directory, summaries, today, open, onToggle, onSelectNationality }) => {
  const rows = useMemo(() => nationalityRows(summaries), [summaries]);
  const loyalty = useMemo(() => loyaltyStats(directory, summaries), [directory, summaries]);
  const issues = useMemo(() => findDataIssues(directory.customers), [directory.customers]);

  return (
    <section aria-label="Customer insights" className="mt-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-[15px] font-medium tracking-[-0.01em] text-foreground md:min-h-[32px]"
      >
        Customer insights
        <ChevronDown size={15} className={cn('text-black/40 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="grid min-w-0 xl:col-span-3"><NationalityBars rows={rows} onSelect={onSelectNationality} /></div>
          <div className="grid min-w-0 xl:col-span-3"><RevenueDonut rows={rows} /></div>
          <div className="grid min-w-0 md:col-span-2 xl:col-span-4"><NewCustomers customers={directory.customers} today={today} /></div>
          <div className="grid min-w-0 md:col-span-2 xl:col-span-2"><Languages customers={directory.customers} /></div>
          <div className="grid min-w-0 xl:col-span-3"><Loyalty stats={loyalty} records={directory.customers.length} /></div>
          <div className="grid min-w-0 xl:col-span-3"><DataQuality issues={issues} /></div>
        </div>
      )}
    </section>
  );
};
