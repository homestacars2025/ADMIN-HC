import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, List, Pencil, Search, X } from '../../components/media/MediaIcons';
import { PageHeader } from '../../components/media/MediaShared';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button, DropdownMenu, Input } from '../../components/media/MediaUI';
import { CustomerAvatar } from '../../components/shared/PersonAvatar';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { whatsAppUrl } from '../../lib/countries';
import {
  LANGUAGE_OPTIONS,
  customerStats,
  fetchCustomerDirectory,
  formatDate,
  formatLira,
  inSegment,
  istanbulDate,
  matchesSearch,
  normalizeLanguage,
  summarizeCustomers,
  type Customer,
  type CustomerDirectory,
  type CustomerSegment,
  type CustomerSummary,
} from '../../lib/customers';
import { customerTrends } from '../../lib/customerInsights';
import { cn } from '../../lib/media/badgeColor';
import { Eye } from '../tasks/icons';
import { FilterPill, type FilterOption } from '../tasks/FilterBar';
import { BanFlow } from './BanFlow';
import { CustomerEditSheet } from './CustomerEditSheet';
import { CustomerInsights } from './CustomerInsights';
import { PremiumTile, TileSkeleton } from './PremiumTile';
import {
  BalancePill,
  BannedBadge,
  CarIcon,
  DocumentsRing,
  Flag,
  GridIcon,
  ICON_BUTTON,
  MoreIcon,
  PlateChip,
  RatingBadge,
  UserPlusIcon,
  UsersIcon,
  WalletIcon,
  WhatsAppIcon,
} from './ui';

const PAGE_SIZE = 24;

const SEGMENTS: Array<{ key: CustomerSegment; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active now' },
  { key: 'owes', label: 'Owes us' },
  { key: 'credit', label: 'In credit' },
  { key: 'documents', label: 'Docs missing' },
  { key: 'vip', label: 'VIP' },
  { key: 'low', label: 'Low rating' },
  { key: 'new', label: 'New this month' },
  { key: 'banned', label: 'Banned' },
];

const isSegment = (value: string | null): value is CustomerSegment =>
  SEGMENTS.some((segment) => segment.key === value);

const newBookingPath = (customerId: string) => `/dashboard/bookings?new=1&customer=${customerId}`;

// ── Rows ─────────────────────────────────────────────────────────────────────

interface RowActions {
  onEdit: (customer: Customer) => void;
  onBan: (customer: Customer) => void;
}

const PhoneLink: React.FC<{ phone: string | null }> = ({ phone }) => {
  const url = whatsAppUrl(phone);
  if (!url) return <span className="text-black/30">{phone || '—'}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      title="Open in WhatsApp"
      className="tabular-nums text-black/60 hover:text-brand-strong hover:underline"
      dir="ltr"
    >
      {phone}
    </a>
  );
};

const QuickActions: React.FC<{ summary: CustomerSummary; profilePath: string } & RowActions> = ({ summary, profilePath, onEdit, onBan }) => {
  const location = useLocation();
  const url = whatsAppUrl(summary.customer.phone);
  const stop = (event: React.MouseEvent) => event.stopPropagation();
  return (
    <>
      <Link to={profilePath} state={{ fromList: true, listSearch: location.search }} onClick={stop} aria-label={`View ${summary.name}`} title="View" className={ICON_BUTTON}><Eye size={15} /></Link>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" onClick={stop} aria-label={`WhatsApp ${summary.name}`} title="WhatsApp" className={ICON_BUTTON}><WhatsAppIcon /></a>
      ) : (
        <span aria-hidden="true" className={cn(ICON_BUTTON, 'pointer-events-none opacity-40')}><WhatsAppIcon /></span>
      )}
      {summary.customer.is_banned ? (
        <span aria-hidden="true" title="Banned customers can't book" className={cn(ICON_BUTTON, 'pointer-events-none opacity-40')}><CalendarPlus size={15} /></span>
      ) : (
        <Link to={newBookingPath(summary.customer.id)} onClick={stop} aria-label={`New booking for ${summary.name}`} title="New booking" className={ICON_BUTTON}><CalendarPlus size={15} /></Link>
      )}
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onEdit(summary.customer); }}
        aria-label={`Edit ${summary.name}`}
        title="Edit"
        className={ICON_BUTTON}
      >
        <Pencil size={14} />
      </button>
      {/* The menu renders in a portal, and React still bubbles its clicks to the row. */}
      <span onClick={stop} className="contents">
        <DropdownMenu
          ariaLabel={`More actions for ${summary.name}`}
          align="end"
          minWidth={150}
          triggerClassName={ICON_BUTTON}
          items={[{
            key: 'ban',
            label: summary.customer.is_banned ? 'Remove ban' : 'Ban customer',
            onSelect: () => onBan(summary.customer),
          }]}
        >
          {() => <MoreIcon />}
        </DropdownMenu>
      </span>
    </>
  );
};

const HEADERS = ['Customer', 'Phone', 'Bookings', 'Spent', 'Balance', 'Documents', 'Rating', 'Last booking'];

const CustomerTable: React.FC<{ rows: CustomerSummary[] } & RowActions> = ({ rows, onEdit, onBan }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const from = { fromList: true, listSearch: location.search };

  return (
    <div className="overflow-x-auto rounded-2xl border border-subtle bg-surface">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="border-b border-subtle">
            {HEADERS.map((header, index) => (
              <th key={header} scope="col" className={cn('whitespace-nowrap px-4 py-3 text-[11px] font-medium uppercase tracking-[0.06em] text-black/40', index >= 2 && index <= 3 && 'text-right')}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((summary) => {
            const path = `/dashboard/customers/${summary.customer.id}`;
            return (
              <tr
                key={summary.customer.id}
                onClick={() => navigate(path, { state: from })}
                className="group relative cursor-pointer border-b border-black/[0.05] transition-colors last:border-b-0 hover:bg-[#F8FAFD] focus-within:bg-[#F8FAFD]"
              >
                <td className="px-4 py-2.5">
                  <div className="flex min-w-[190px] max-w-[260px] items-center gap-2.5">
                    <CustomerAvatar alt="" size={34} />
                    <Link to={path} state={from} onClick={(event) => event.stopPropagation()} className="truncate text-[13.5px] font-medium text-foreground hover:text-brand-strong">
                      {summary.name}
                    </Link>
                    <Flag nationality={summary.customer.nationality} />
                    {summary.customer.is_banned && <BannedBadge reason={summary.customer.ban_reason} />}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-[13px]"><PhoneLink phone={summary.customer.phone} /></td>
                <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-foreground">{summary.bookingCount}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-[13px] tabular-nums text-foreground">{summary.spent > 0 ? formatLira(summary.spent) : '—'}</td>
                <td className="px-4 py-2.5"><BalancePill balance={summary.balance} /></td>
                <td className="px-4 py-2.5"><DocumentsRing count={summary.documents} /></td>
                <td className="px-4 py-2.5"><RatingBadge rating={summary.rating} /></td>
                <td className="relative whitespace-nowrap px-4 py-2.5 text-[13px] tabular-nums text-black/55">
                  {formatDate(summary.lastBooking)}
                  <div className="absolute inset-y-0 right-2 flex items-center gap-1 bg-[#F8FAFD] pl-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                    <QuickActions summary={summary} profilePath={path} onEdit={onEdit} onBan={onBan} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const CustomerCard: React.FC<{ summary: CustomerSummary } & RowActions> = ({ summary, onEdit, onBan }) => {
  const location = useLocation();
  const path = `/dashboard/customers/${summary.customer.id}`;
  const { customer } = summary;

  return (
    <article className="relative flex min-w-0 flex-col gap-3 rounded-2xl border border-subtle bg-surface p-4 transition-colors hover:border-black/15">
      <div className="flex items-center gap-3">
        <CustomerAvatar alt="" size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {/* The stretched link makes the whole card open the profile. */}
            <Link
              to={path}
              state={{ fromList: true, listSearch: location.search }}
              className="truncate text-[14.5px] font-medium text-foreground after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-[3px] focus-visible:after:ring-primary/30"
            >
              {summary.name}
            </Link>
            <Flag nationality={customer.nationality} />
            {summary.isVip && <span className="shrink-0 rounded-full bg-[#F59E0B]/15 px-1.5 text-[10.5px] font-semibold text-[#B45309]">VIP</span>}
            {customer.is_banned && <BannedBadge reason={customer.ban_reason} />}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] tabular-nums text-black/55" dir="ltr">{customer.phone ?? '—'}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BalancePill balance={summary.balance} />
        <DocumentsRing count={summary.documents} />
        <RatingBadge rating={summary.rating} />
        {summary.currentPlate && <PlateChip plate={summary.currentPlate} />}
      </div>

      <dl className="grid grid-cols-[1fr_1fr_auto] gap-2 border-t border-black/[0.05] pt-3 text-[12px]">
        <div><dt className="text-black/45">Bookings</dt><dd className="mt-0.5 font-medium tabular-nums text-foreground">{summary.bookingCount}</dd></div>
        <div><dt className="text-black/45">Spent</dt><dd className="mt-0.5 truncate font-medium tabular-nums text-foreground">{summary.spent > 0 ? formatLira(summary.spent) : '—'}</dd></div>
        <div><dt className="text-black/45">Last booking</dt><dd className="mt-0.5 font-medium tabular-nums text-foreground">{formatDate(summary.lastBooking)}</dd></div>
      </dl>

      <div className="relative z-10 flex items-center justify-end gap-1.5">
        <QuickActions summary={summary} profilePath={path} onEdit={onEdit} onBan={onBan} />
      </div>
    </article>
  );
};

const TableSkeleton: React.FC = () => (
  <div className="overflow-hidden rounded-2xl border border-subtle bg-surface">
    {Array.from({ length: 8 }, (_, index) => (
      <div key={index} className="flex items-center gap-3 border-b border-black/[0.05] px-4 py-3 last:border-b-0">
        <div className="h-[34px] w-[34px] animate-pulse rounded-full bg-black/[0.05]" />
        <div className="h-3.5 w-40 animate-pulse rounded bg-black/[0.05]" />
        <div className="ms-auto h-3.5 w-24 animate-pulse rounded bg-black/[0.05]" />
        <div className="hidden h-3.5 w-32 animate-pulse rounded bg-black/[0.05] md:block" />
      </div>
    ))}
  </div>
);

// ── Page ─────────────────────────────────────────────────────────────────────

const CustomersPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const wide = useMediaQuery('(min-width: 1280px)');

  const [directory, setDirectory] = useState<CustomerDirectory | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [banning, setBanning] = useState<Customer | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetchCustomerDirectory()
      .then((result) => { if (!cancelled) setDirectory(result); })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load customers.');
      });
    return () => { cancelled = true; };
  }, [attempt]);

  // The filters live in the URL, so coming back from a profile restores the list.
  const search = params.get('q') ?? '';
  const segmentParam = params.get('segment');
  const segment: CustomerSegment = isSegment(segmentParam) ? segmentParam : 'all';
  const nationality = params.get('nationality') ?? '';
  const language = params.get('language') ?? '';
  const cardView = params.get('view') === 'cards';
  const requestedPage = Math.max(Number(params.get('page')) || 1, 1);
  const insightsOpen = params.get('insights') !== 'hidden';

  const update = useCallback((changes: Record<string, string>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });
      if (!('page' in changes)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);

  const today = istanbulDate();
  const summaries = useMemo(
    () => (directory ? summarizeCustomers(directory, today) : []),
    [directory, today],
  );
  const stats = useMemo(() => customerStats(summaries), [summaries]);
  const trends = useMemo(() => (directory ? customerTrends(directory, today) : null), [directory, today]);

  /** A tile or a chart filters what's below it, so bring that into view. */
  const showInList = useCallback((changes: Record<string, string>) => {
    update(changes);
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [update]);

  const nationalityOptions = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>();
    summaries.forEach(({ customer }) => {
      const value = customer.nationality?.trim();
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    return Array.from(counts, ([value, count]) => ({ value, label: `${value} (${count})`, count }))
      .sort((a, b) => b.count - a.count)
      .map(({ value, label }) => ({ value, label }));
  }, [summaries]);

  const filtered = useMemo(() => summaries.filter((summary) => (
    inSegment(summary, segment)
    && matchesSearch(summary, search)
    && (!nationality || summary.customer.nationality?.trim() === nationality)
    && (!language || normalizeLanguage(summary.customer.language) === language)
  )), [summaries, segment, search, nationality, language]);

  const pageCount = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
  const page = Math.min(requestedPage, pageCount);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = Boolean(search || nationality || language || segment !== 'all');

  const onSaved = useCallback((updated: Customer) => {
    setDirectory((current) => current && ({
      ...current,
      customers: current.customers.map((customer) => (customer.id === updated.id ? updated : customer)),
    }));
    toast.success('Customer saved');
  }, []);

  /** In the grid straight away, then on to their profile, the same way a row opens it. */
  const onCreated = useCallback((created: Customer) => {
    setDirectory((current) => current && ({ ...current, customers: [created, ...current.customers] }));
    navigate(`/dashboard/customers/${created.id}`, { state: { fromList: true, listSearch: location.search } });
  }, [navigate, location.search]);

  return (
    <div className="media-scope mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <MediaToaster />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader eyebrow="Management" title="Customers" subtitle="Browse customers, what they owe, and their rental history." />
        <Button size="lg" className="!h-11 w-full shrink-0 sm:w-auto md:!h-10" onClick={() => setCreating(true)}>
          <UserPlusIcon size={15} /> New customer
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {!directory && !loadError && <TileSkeleton />}
        {directory && trends && (
          <>
            <PremiumTile
              tone="blue"
              icon={<UsersIcon size={16} />}
              label="Total customers"
              value={stats.total}
              hint={`+${trends.total.addedThisMonth} this month`}
              change={trends.total.change}
              spark={trends.total.series}
              active={segment === 'all'}
              onClick={() => showInList({ segment: '' })}
            />
            <PremiumTile
              tone="teal"
              icon={<CarIcon size={16} />}
              label="Active rentals now"
              value={trends.active.rentals}
              hint={`${trends.active.carsOut} ${trends.active.carsOut === 1 ? 'car' : 'cars'} out today`}
              change={trends.active.change}
              spark={trends.active.series}
              active={segment === 'active'}
              onClick={() => showInList({ segment: 'active' })}
            />
            <PremiumTile
              tone="red"
              icon={<WalletIcon size={16} />}
              label="Owe us"
              value={stats.owingCount}
              hint={`${formatLira(stats.owingTotal)} total`}
              change={trends.owed.change}
              upIsBad
              spark={trends.owed.series}
              active={segment === 'owes'}
              onClick={() => showInList({ segment: 'owes' })}
            />
            <PremiumTile
              tone="violet"
              icon={<UserPlusIcon size={16} />}
              label="New this month"
              value={stats.newThisMonth}
              hint={`${trends.newCustomers.previous} by this day last month`}
              change={trends.newCustomers.change}
              spark={trends.newCustomers.series}
              active={segment === 'new'}
              onClick={() => showInList({ segment: 'new' })}
            />
          </>
        )}
      </div>

      {directory && (
        <CustomerInsights
          directory={directory}
          summaries={summaries}
          today={today}
          open={insightsOpen}
          onToggle={() => update({ insights: insightsOpen ? 'hidden' : '', page: params.get('page') ?? '' })}
          onSelectNationality={(value) => showInList({ nationality: value })}
        />
      )}

      <div ref={listRef} className="scroll-mt-20" />

      <div className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Customer segments">
        {SEGMENTS.map((item) => {
          const active = item.key === segment;
          const count = directory ? summaries.filter((summary) => inSegment(summary, item.key)).length : null;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() => update({ segment: item.key === 'all' ? '' : item.key })}
              className={cn(
                'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition-colors md:h-9',
                active ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.12] font-medium text-brand-strong' : 'border-subtle bg-surface text-black/60 hover:bg-black/[0.03]',
              )}
            >
              {item.label}
              {count !== null && <span className="text-[11.5px] tabular-nums opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-[320px] sm:max-w-[420px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
          <Input
            value={search}
            onChange={(event) => update({ q: event.target.value })}
            placeholder="Name, phone, ID or plate…"
            aria-label="Search customers"
            className="!h-11 ps-9 md:!h-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => update({ q: '' })}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-black/40 hover:bg-black/[0.04] md:h-7 md:w-7"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <FilterPill label="Nationality" value={nationality} options={nationalityOptions} onChange={(value) => update({ nationality: value })} />
        <FilterPill
          label="Language"
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={(value) => update({ language: value })}
        />

        <div className="ms-auto flex items-center gap-2">
          {directory && (
            <span className="text-[12.5px] tabular-nums text-black/45">
              {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
            </span>
          )}
          {wide && (
            <div className="flex rounded-lg border border-subtle p-0.5" role="group" aria-label="View">
              <button type="button" aria-pressed={!cardView} aria-label="List view" onClick={() => update({ view: '' })} className={cn('grid h-8 w-8 place-items-center rounded-md', !cardView ? 'bg-black/[0.06] text-foreground' : 'text-black/45')}>
                <List size={14} />
              </button>
              <button type="button" aria-pressed={cardView} aria-label="Card view" onClick={() => update({ view: 'cards' })} className={cn('grid h-8 w-8 place-items-center rounded-md', cardView ? 'bg-black/[0.06] text-foreground' : 'text-black/45')}>
                <GridIcon size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3">
        {loadError ? (
          <div role="alert" className="rounded-2xl border border-subtle bg-surface p-8 text-center">
            <p className="text-[13.5px] text-foreground">Couldn't load customers.</p>
            <p className="mt-1 text-[12.5px] text-black/45">{loadError}</p>
            <Button size="lg" className="mt-4 !h-11 md:!h-10" onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
          </div>
        ) : !directory ? (
          <TableSkeleton />
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-subtle bg-surface p-10 text-center">
            <p className="text-[13.5px] text-foreground">{hasFilters ? 'No customers match those filters.' : 'No customers yet.'}</p>
            {hasFilters && (
              <Button
                variant="secondary"
                size="lg"
                className="mt-4 !h-11 md:!h-10"
                onClick={() => update({ q: '', segment: '', nationality: '', language: '' })}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : wide && !cardView ? (
          <CustomerTable rows={visible} onEdit={setEditing} onBan={setBanning} />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((summary) => <CustomerCard key={summary.customer.id} summary={summary} onEdit={setEditing} onBan={setBanning} />)}
          </div>
        )}
      </div>

      {directory && pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
          <span className="text-[12.5px] tabular-nums text-black/45">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" className={cn(ICON_BUTTON, 'disabled:opacity-40')} disabled={page <= 1} aria-label="Previous page" onClick={() => update({ page: page > 2 ? String(page - 1) : '' })}>
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-[56px] text-center text-[12.5px] tabular-nums text-black/55">{page} / {pageCount}</span>
            <button type="button" className={cn(ICON_BUTTON, 'disabled:opacity-40')} disabled={page >= pageCount} aria-label="Next page" onClick={() => update({ page: String(page + 1) })}>
              <ChevronRight size={15} />
            </button>
          </div>
        </nav>
      )}

      {editing && <CustomerEditSheet customer={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
      {creating && <CustomerEditSheet onClose={() => setCreating(false)} onSaved={onCreated} />}
      <BanFlow customer={banning} onClose={() => setBanning(null)} onChanged={() => setAttempt((value) => value + 1)} />
    </div>
  );
};

export default CustomersPage;
