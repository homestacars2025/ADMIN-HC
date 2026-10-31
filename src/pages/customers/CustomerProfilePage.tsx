import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, Mail, Pencil, Plus } from '../../components/media/MediaIcons';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button } from '../../components/media/MediaUI';
import { CustomerAvatar } from '../../components/shared/PersonAvatar';
import { whatsAppUrl } from '../../lib/countries';
import {
  DOCUMENT_SLOTS,
  LOW_RATING_MAX,
  VIP_MIN_BOOKINGS,
  customerName,
  documentCount,
  fetchCustomerDirectory,
  fetchCustomerProfile,
  formatDate,
  formatLira,
  istanbulDate,
  languageLabel,
  ledgerBalance,
  rentalDays,
  summarizeCustomers,
  totalSpent,
  type Customer,
  type CustomerProfile,
} from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import { AddPaymentSheet } from './AddPaymentSheet';
import { CustomerEditSheet } from './CustomerEditSheet';
import { DocumentsTab } from './DocumentsTab';
import { BookingsTab, FinesHgsTab, NotesTab, OverviewTab, WalletTab } from './ProfileTabs';
import { BalancePill, Flag, ICON_BUTTON, PhoneIcon, WhatsAppIcon } from './ui';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'documents', label: 'Documents' },
  { key: 'fines', label: 'Fines & HGS' },
  { key: 'notes', label: 'Notes & rating' },
] as const;

type TabKey = typeof TABS[number]['key'];

const isTab = (value: string | null): value is TabKey => TABS.some((tab) => tab.key === value);

const Tag: React.FC<{ tone: 'gold' | 'red' | 'amber'; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={cn(
    'rounded-full px-2.5 py-0.5 text-[12px] font-medium',
    tone === 'gold' && 'bg-[#F59E0B]/15 text-[#B45309]',
    tone === 'red' && 'bg-[#DC2626]/10 text-[#B91C1C]',
    tone === 'amber' && 'bg-[#F59E0B]/10 text-[#92400E]',
  )}>
    {children}
  </span>
);

const Kpi: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0 rounded-2xl border border-subtle bg-surface px-4 py-3">
    <div className="truncate text-[12px] text-black/50">{label}</div>
    <div className="mt-1 truncate text-[17px] font-semibold tracking-[-0.01em] tabular-nums text-foreground sm:text-[19px]">{children}</div>
  </div>
);

const ProfileSkeleton: React.FC = () => (
  <div className="mt-4 flex flex-col gap-4" aria-busy="true" aria-label="Loading customer">
    <div className="h-[168px] animate-pulse rounded-2xl bg-black/[0.04]" />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {[0, 1, 2, 3, 4, 5].map((index) => <div key={index} className="h-[72px] animate-pulse rounded-2xl bg-black/[0.04]" />)}
    </div>
    <div className="h-[280px] animate-pulse rounded-2xl bg-black/[0.04]" />
  </div>
);

const PrimaryActions: React.FC<{
  customerId: string;
  onPayment: () => void;
  onEdit: () => void;
  className?: string;
}> = ({ customerId, onPayment, onEdit, className }) => (
  <div className={cn('flex items-center gap-2', className)}>
    <Link
      to={`/dashboard/bookings?new=1&customer=${customerId}`}
      className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[var(--btn-primary-bg)] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--btn-primary-hover)] active:bg-[var(--btn-primary-active)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30 md:h-10 md:flex-none md:px-4"
    >
      <CalendarPlus size={14} className="shrink-0 max-[359px]:hidden" /> New booking
    </Link>
    <Button variant="secondary" size="lg" className="!h-11 min-w-0 flex-1 md:!h-10 md:flex-none" onClick={onPayment}>
      <Plus size={14} className="shrink-0 max-[359px]:hidden" /> Add payment
    </Button>
    <Button variant="secondary" size="lg" className="!h-11 md:!h-10" onClick={onEdit} aria-label="Edit customer">
      <Pencil size={14} /> <span className="hidden md:inline">Edit</span>
    </Button>
  </div>
);

const CustomerProfilePage: React.FC = () => {
  const { id = '' } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: TabKey = isTab(tabParam) ? tabParam : 'overview';

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [isVip, setIsVip] = useState(false);
  const [sheet, setSheet] = useState<'edit' | 'payment' | null>(null);
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});

  const today = istanbulDate();

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetchCustomerProfile(id)
      .then((result) => {
        if (cancelled) return;
        setProfile(result);
        setState(result ? 'ready' : 'missing');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Could not load this customer.');
        setState('error');
      });
    return () => { cancelled = true; };
  }, [id, attempt]);

  // VIP depends on every other customer's spend. The tag just arrives a moment later.
  useEffect(() => {
    let cancelled = false;
    fetchCustomerDirectory()
      .then((directory) => {
        if (cancelled) return;
        setIsVip(summarizeCustomers(directory, istanbulDate()).some((row) => row.customer.id === id && row.isVip));
      })
      .catch(() => {
        // Only the tag is affected, and the profile itself has already loaded.
      });
    return () => { cancelled = true; };
  }, [id, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const onCustomerSaved = useCallback((updated: Customer) => {
    setProfile((current) => current && ({ ...current, customer: updated }));
  }, []);

  const totals = useMemo(() => {
    if (!profile) return null;
    return {
      spent: totalSpent(profile.bookings, profile.ledger),
      balance: ledgerBalance(profile.ledger),
      days: rentalDays(profile.bookings),
      hgs: profile.hgs.reduce((sum, row) => sum + Number(row.amount), 0),
    };
  }, [profile]);

  const selectTab = (key: TabKey, focus = false) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (key === 'overview') next.delete('tab');
      else next.set('tab', key);
      return next;
    }, { replace: true });
    if (focus) tabRefs.current[key]?.focus();
  };

  const onTabKey = (event: React.KeyboardEvent) => {
    const index = TABS.findIndex((item) => item.key === tab);
    const moves: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    selectTab(TABS[moves[event.key]].key, true);
  };

  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? '';
  const back = (
    <Link to={`/dashboard/customers${listSearch}`} className="inline-flex min-h-[44px] items-center gap-1 text-[13px] text-black/55 hover:text-foreground md:min-h-[32px]">
      <ChevronLeft size={14} /> Customers
    </Link>
  );

  if (state === 'missing' || state === 'error') {
    return (
      <div className="media-scope mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        {back}
        <div role="alert" className="mt-4 rounded-2xl border border-subtle bg-surface p-10 text-center">
          <p className="text-[14px] text-foreground">{state === 'missing' ? "This customer doesn't exist." : "Couldn't load this customer."}</p>
          {loadError && <p className="mt-1 text-[12.5px] text-black/45">{loadError}</p>}
          {state === 'error' && <Button size="lg" className="mt-4 !h-11 md:!h-10" onClick={() => { setState('loading'); reload(); }}>Try again</Button>}
        </div>
      </div>
    );
  }

  if (!profile || !totals) {
    return (
      <div className="media-scope mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        {back}
        <ProfileSkeleton />
      </div>
    );
  }

  const { customer, bookings, fines, review } = profile;
  const name = customerName(customer);
  const whatsapp = whatsAppUrl(customer.phone);
  const documents = documentCount(customer);
  const vip = isVip || bookings.filter((booking) => booking.status !== 'cancelled').length >= VIP_MIN_BOOKINGS;
  const lowRating = review?.our_rating != null && review.our_rating <= LOW_RATING_MAX;

  return (
    <div className="media-scope mx-auto max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 md:pb-9 lg:px-10 lg:pt-9">
      <MediaToaster />
      {back}

      <header className="mt-2 rounded-[20px] border border-subtle bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <CustomerAvatar alt={name} size={88} style={{ border: '1px solid var(--border-subtle)' }} />
            <div className="min-w-0">
              <h1 className="truncate text-[20px] font-medium tracking-[-0.022em] text-foreground sm:text-[24px]">{name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-black/55">
                <span className="inline-flex items-center gap-1.5"><Flag nationality={customer.nationality} /> {customer.nationality ?? 'Nationality unknown'}</span>
                <span aria-hidden="true">·</span>
                <span>{languageLabel(customer.language)}</span>
                {customer.created_at && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">Customer since {formatDate(istanbulDate(customer.created_at))}</span>
                  </>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {vip && <Tag tone="gold">VIP</Tag>}
                {totals.balance > 0 && <Tag tone="red">Owes money</Tag>}
                {documents < DOCUMENT_SLOTS.length && <Tag tone="amber">Docs missing</Tag>}
                {lowRating && <Tag tone="red">Low rating</Tag>}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:items-end">
            <div className="flex items-center gap-1.5">
              {customer.phone && <a href={`tel:${customer.phone}`} aria-label={`Call ${customer.phone}`} title={customer.phone} className={ICON_BUTTON}><PhoneIcon /></a>}
              {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Open in WhatsApp" title="WhatsApp" className={ICON_BUTTON}><WhatsAppIcon /></a>}
              {customer.email && <a href={`mailto:${customer.email}`} aria-label={`Email ${customer.email}`} title={customer.email} className={ICON_BUTTON}><Mail size={15} /></a>}
              {customer.phone && <span className="ms-1 truncate text-[13px] tabular-nums text-black/55" dir="ltr">{customer.phone}</span>}
            </div>
            <PrimaryActions customerId={customer.id} onPayment={() => setSheet('payment')} onEdit={() => setSheet('edit')} className="hidden md:flex" />
          </div>
        </div>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Bookings">{bookings.filter((booking) => booking.status !== 'cancelled').length}</Kpi>
        <Kpi label="Days rented">{totals.days}</Kpi>
        <Kpi label="Total spent">{totals.spent > 0 ? formatLira(totals.spent) : '—'}</Kpi>
        <Kpi label="Balance"><BalancePill balance={totals.balance} className="!text-[13.5px]" /></Kpi>
        <Kpi label="Fines">{fines.length}</Kpi>
        <Kpi label="HGS total">{formatLira(totals.hgs)}</Kpi>
      </div>

      <div
        role="tablist"
        aria-label="Customer sections"
        onKeyDown={onTabKey}
        className="-mx-4 mt-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {TABS.map((item) => {
          const active = item.key === tab;
          return (
            <button
              key={item.key}
              ref={(element) => { tabRefs.current[item.key] = element; }}
              type="button"
              role="tab"
              id={`customer-tab-${item.key}`}
              aria-selected={active}
              aria-controls="customer-tab-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => selectTab(item.key)}
              className={cn(
                'h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30 md:h-9',
                active ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.12] font-medium text-brand-strong' : 'border-transparent text-black/55 hover:bg-black/[0.04]',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div id="customer-tab-panel" role="tabpanel" aria-labelledby={`customer-tab-${tab}`} tabIndex={0} className="mt-3 rounded-2xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20">
        {tab === 'overview' && <OverviewTab profile={profile} today={today} />}
        {tab === 'bookings' && <BookingsTab bookings={bookings} />}
        {tab === 'wallet' && <WalletTab profile={profile} onAddPayment={() => setSheet('payment')} />}
        {tab === 'documents' && (
          <DocumentsTab customer={customer} bookings={bookings} today={today} onUploaded={onCustomerSaved} onEdit={() => setSheet('edit')} />
        )}
        {tab === 'fines' && <FinesHgsTab profile={profile} />}
        {tab === 'notes' && <NotesTab key={customer.notes ?? ''} profile={profile} onCustomerSaved={onCustomerSaved} onRated={reload} />}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-subtle bg-surface px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:hidden">
        <PrimaryActions customerId={customer.id} onPayment={() => setSheet('payment')} onEdit={() => setSheet('edit')} />
      </div>

      {sheet === 'edit' && (
        <CustomerEditSheet
          customer={customer}
          onClose={() => setSheet(null)}
          onSaved={(updated) => { onCustomerSaved(updated); toast.success('Customer saved'); }}
        />
      )}
      {sheet === 'payment' && (
        <AddPaymentSheet
          customer={customer}
          bookings={bookings}
          onClose={() => setSheet(null)}
          onSaved={() => { toast.success('Payment added'); reload(); }}
        />
      )}
    </div>
  );
};

export default CustomerProfilePage;
