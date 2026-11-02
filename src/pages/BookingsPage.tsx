import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Button, Select } from '../components/media/MediaUI';
import { ComplianceTriangle } from '../components/shared/ComplianceBits';
import { Icon3D } from '../components/shared/Icon3D';
import MonthNav from '../components/shared/MonthNav';
import { LoadError, SearchField, SkeletonRows } from '../components/shared/PageBits';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useUrlFilter } from '../hooks/useUrlFilter';
import { useUrlSort } from '../hooks/useUrlSort';
import {
  BOOKING_SORTS,
  BOOKING_TABS,
  bookingsCsv,
  bookingSummary,
  extensionsCsv,
  extensionSummary,
  fetchExtensions,
  fetchReplacementSheets,
  hasPeriod,
  inBookingFilter,
  inExtensionFilter,
  inSheetFilter,
  matchesBookingSearch,
  matchesExtensionSearch,
  matchesSheetSearch,
  sheetInMonth,
  sheetsCsv,
  sheetSummary,
  sortBookings,
  TAB_FILTERS,
  type BookingExtension,
  type BookingFilter,
  type BookingSort,
  type BookingTab,
  type ExtensionFilter,
  type ReplacementSheetRow,
  type SheetFilter,
} from '../lib/bookingTabs';
import { istanbulToday } from '../lib/homeData';
import { formatMoney } from '../lib/money';
import { currentMonth, monthLabel, shiftMonth } from '../lib/payroll';
import { printBookingContract } from '../lib/printContract';
import { supabase } from '../lib/supabase';
import type { Booking, BookingStatus } from '../types';
import { BookingFormSheet } from './bookings/BookingFormSheet';
import { BigTile, BigTileRow, BigTileSkeleton, BookingList, ExtensionList, PillTabs, SheetList } from './bookings/BookingsTabs';
import { ExtendSheet } from './bookings/ExtendSheet';
import { ReplacementSheet } from './bookings/ReplacementSheet';
import { WalletIcon } from './customers/ui';

// ─── Raw Supabase join shapes ─────────────────────────────────────────────────

interface ModelJoin { name: string; image_url?: string | null }

interface CarJoin {
  plate_number: string;
  model_group: ModelJoin | ModelJoin[] | null;
}

interface CustomerJoin {
  is_banned?: boolean;
  first_name: string;
  last_name: string;
}

interface BookingRow {
  id: number;
  booking_number: string;
  status: BookingStatus;
  car_id: number;
  customer_id: number;
  start_date: string;
  end_date: string;
  kabis_reported: boolean;
  invoice_issued: boolean;
  is_currently_active: boolean;
  pickup_location: string | null;
  dropoff_location: string | null;
  km_at_delivery: number | null;
  fuel_at_delivery: string | null;
  insurance_type: string | null;
  additional_services: string | null;
  cars: CarJoin | CarJoin[] | null;
  customers: CustomerJoin | CustomerJoin[] | null;
}

const BOOKING_SELECT = `
  id, booking_number, status, car_id, customer_id,
  start_date, end_date, kabis_reported, invoice_issued, is_currently_active,
  pickup_location, dropoff_location, km_at_delivery, fuel_at_delivery,
  insurance_type, additional_services,
  cars(plate_number, model_group(name, image_url)),
  customers(first_name, last_name, is_banned)
`;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthBounds(month: string) {
  return { from: `${month}-01`, before: `${shiftMonth(`${month}-01`, 1).slice(0, 7)}-01` };
}

function resolveBooking(row: BookingRow): Booking {
  const car = Array.isArray(row.cars) ? row.cars[0] : row.cars;
  const model = Array.isArray(car?.model_group) ? car?.model_group[0] : car?.model_group;
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return {
    id: row.id,
    created_at: '',
    car_id: row.car_id,
    start_date: row.start_date,
    end_date: row.end_date,
    insurance_type: row.insurance_type ?? null,
    notes: null,
    booking_number: row.booking_number,
    additional_driver: null,
    customer_id: row.customer_id,
    kabis_reported: row.kabis_reported,
    invoice_issued: row.invoice_issued,
    is_currently_active: row.is_currently_active,
    status: row.status,
    additional_services: row.additional_services ?? null,
    pickup_location: row.pickup_location ?? null,
    dropoff_location: row.dropoff_location ?? null,
    km_at_delivery: row.km_at_delivery ?? null,
    fuel_at_delivery: row.fuel_at_delivery ?? null,
    plate_number: car?.plate_number ?? '—',
    car_model: model?.name ?? '—',
    car_image: model?.image_url ?? null,
    customer_name: customer ? `${customer.first_name} ${customer.last_name}`.trim() : '—',
    customer_banned: Boolean(customer?.is_banned),
  };
}

function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="rounded-2xl border border-[#EBEBEB] bg-white px-4 py-10 text-center text-[13.5px] text-black/45">{children}</p>
);

interface ToastState { message: string; type: 'success' | 'error'; }
const Toast: React.FC<ToastState> = ({ message, type }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: type === 'success' ? '#0f1117' : '#ef4444',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'slideUpIn 200ms ease',
    }}>
      {type === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
      }
      {message}
    </div>,
    document.body,
  );



// ─── Delete confirm modal ─────────────────────────────────────────────────────

const DeleteConfirm: React.FC<{
  booking: Booking;
  deleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ booking, deleting, onConfirm, onClose }) => {
  const backdropPressRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      onMouseDown={e => { backdropPressRef.current = e.target === e.currentTarget; }}
      onClick={e => {
        if (e.target === e.currentTarget && backdropPressRef.current) onClose();
        backdropPressRef.current = false;
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'fadeIn 150ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, width: '100%', maxWidth: 400,
          padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
          animation: 'slideUp 180ms ease',
        }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#0f1117', marginBottom: 8 }}>Delete Booking?</div>
        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.6 }}>
          Booking <strong className="font-mono tabular-nums" style={{ color: '#0f1117' }}>{booking.booking_number}</strong> for{' '}
          <strong style={{ color: '#0f1117' }}>{booking.customer_name}</strong> will be permanently deleted.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #EBEBEB', background: '#fff', fontSize: 14, fontWeight: 500, color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={deleting}
            style={{ padding: '9px 22px', fontSize: 14, fontFamily: 'inherit' }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

type EditTarget = { booking: Booking; openAt?: 'payment' };

const BookingsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') as BookingTab | null;
  const tab: BookingTab = requestedTab && BOOKING_TABS.includes(requestedTab) ? requestedTab : 'bookings';
  const requestedMonth = params.get('month');
  const month = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : currentMonth().slice(0, 7);
  const today = istanbulToday();
  const wide = useMediaQuery('(min-width: 1280px)');

  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [extensions, setExtensions] = useState<BookingExtension[] | null>(null);
  const [sheets, setSheets] = useState<ReplacementSheetRow[] | null>(null);
  const [errors, setErrors] = useState<Partial<Record<BookingTab, string>>>({});
  const [reload, setReload] = useState(0);

  const [search, setSearch] = useState(() => params.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | ''>('');
  const [showUndated, setShowUndated] = useState(false);
  const [modal, setModal] = useState<null | 'add' | 'replacement'>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [bookingFor, setBookingFor] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null);
  const [extendTarget, setExtendTarget] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { filter, toggle, clear } = useUrlFilter<BookingFilter | ExtensionFilter | SheetFilter>(TAB_FILTERS[tab]);
  const sort = useUrlSort<BookingSort>(BOOKING_SORTS, { key: 'created', direction: 'desc' }, () => 'asc');

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    const q = params.get('q');
    if (q !== null) setSearch(q);
  }, [params]);

  // "New booking" on a customer opens the form for that customer, once.
  useEffect(() => {
    const customer = params.get('customer');
    if (params.get('new') !== '1' || !customer) return;
    setBookingFor(customer);
    setModal('add');
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('new');
      next.delete('customer');
      return next;
    }, { replace: true });
  }, [params, setParams]);

  // All three at once, so every tab's count is there whichever tab is open.
  useEffect(() => {
    let cancelled = false;
    const fail = (key: BookingTab, failure: unknown) => {
      if (!cancelled) setErrors((current) => ({ ...current, [key]: failure instanceof Error ? failure.message : 'Try again.' }));
    };
    setErrors({});
    setBookings(null);
    setExtensions(null);
    setShowUndated(false);
    const { from, before } = monthBounds(month);
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .gte('start_date', from)
      .lt('start_date', before)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { fail('bookings', new Error(error.message)); setBookings([]); return; }
        setBookings(((data ?? []) as unknown as BookingRow[]).map(resolveBooking));
      });
    fetchExtensions(month)
      .then((rows) => { if (!cancelled) setExtensions(rows); })
      .catch((failure: unknown) => { fail('extensions', failure); if (!cancelled) setExtensions([]); });
    return () => { cancelled = true; };
  }, [month, reload]);

  useEffect(() => {
    let cancelled = false;
    fetchReplacementSheets()
      .then((rows) => { if (!cancelled) setSheets(rows); })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setErrors((current) => ({ ...current, replacements: failure instanceof Error ? failure.message : 'Try again.' }));
        setSheets([]);
      });
    return () => { cancelled = true; };
  }, [reload]);

  const openTab = (next: BookingTab) => {
    const updated = new URLSearchParams(params);
    updated.set('tab', next);
    updated.delete('filter');
    updated.delete('sort');
    updated.delete('dir');
    setParams(updated);
    setSearch('');
    setStatusFilter('');
    setShowUndated(false);
  };

  const moveMonth = (by: number) => {
    const updated = new URLSearchParams(params);
    updated.set('month', shiftMonth(`${month}-01`, by).slice(0, 7));
    setParams(updated);
  };

  // Tiles follow the search and status filter. Only the active tile narrows the list further.
  const matchedBookings = useMemo(() => (bookings ?? []).filter((row) => matchesBookingSearch(row, search) && (!statusFilter || row.status === statusFilter)), [bookings, search, statusFilter]);
  const matchedExtensions = useMemo(() => (extensions ?? []).filter((row) => matchesExtensionSearch(row, search) && (!statusFilter || row.booking_status === statusFilter)), [extensions, search, statusFilter]);
  const monthSheets = useMemo(() => (sheets ?? []).filter((row) => sheetInMonth(row, month)), [sheets, month]);
  const matchedSheets = useMemo(() => monthSheets.filter((row) => matchesSheetSearch(row, search)), [monthSheets, search]);

  const bookingTiles = useMemo(() => bookingSummary(matchedBookings, today), [matchedBookings, today]);
  const extensionTiles = useMemo(() => extensionSummary(matchedExtensions), [matchedExtensions]);
  const sheetTiles = useMemo(() => sheetSummary(matchedSheets, today), [matchedSheets, today]);

  const visibleBookings = useMemo(
    () => sortBookings(matchedBookings.filter((row) => inBookingFilter(row, filter as BookingFilter | 'all')), sort.key, sort.direction),
    [matchedBookings, filter, sort.key, sort.direction],
  );
  const visibleExtensions = useMemo(() => {
    const shown = matchedExtensions.filter((row) => inExtensionFilter(row, filter as ExtensionFilter | 'all'));
    return [...shown.filter(hasPeriod), ...(showUndated ? shown.filter((row) => !hasPeriod(row)) : [])];
  }, [matchedExtensions, filter, showUndated]);
  const visibleSheets = useMemo(() => matchedSheets.filter((row) => inSheetFilter(row, filter as SheetFilter | 'all', today)), [matchedSheets, filter, today]);

  const loading = tab === 'bookings' ? bookings === null : tab === 'extensions' ? extensions === null : sheets === null;
  const tabError = errors[tab];
  const narrowed = Boolean(search.trim() || statusFilter || filter !== 'all');
  const hasRows = tab === 'bookings' ? visibleBookings.length > 0 : tab === 'extensions' ? visibleExtensions.length > 0 : visibleSheets.length > 0;

  const handleToggle = useCallback(async (bookingId: number, field: 'kabis_reported' | 'invoice_issued', currentValue: boolean) => {
    const set = (value: boolean) => setBookings((prev) => prev && prev.map((row) => (row.id === bookingId ? { ...row, [field]: value } : row)));
    set(!currentValue);
    const { error } = await supabase.from('bookings').update({ [field]: !currentValue }).eq('id', bookingId);
    if (error) {
      set(currentValue);
      showToast('Update failed', 'error');
    }
  }, [showToast]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('bookings').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      showToast('Failed to delete booking', 'error');
    } else {
      showToast('Booking deleted', 'success');
      setBookings((prev) => prev && prev.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
      refresh();
    }
  };

  // An extension can belong to a booking from an earlier month, so it's fetched on its own.
  const openExtension = async (row: BookingExtension) => {
    const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT).eq('id', row.booking_id).single();
    if (error || !data) { showToast("Couldn't open that booking", 'error'); return; }
    setEditing({ booking: resolveBooking(data as unknown as BookingRow), openAt: 'payment' });
  };

  const handleExport = () => {
    if (tab === 'bookings') downloadCsv(`bookings-${month}.csv`, bookingsCsv(visibleBookings));
    else if (tab === 'extensions') downloadCsv(`extensions-${month}.csv`, extensionsCsv(visibleExtensions));
    else downloadCsv(`replacement-sheets-${month}.csv`, sheetsCsv(visibleSheets));
  };

  const emptyMessage = narrowed ? 'Nothing matches your filters.'
    : tab === 'bookings' ? 'No bookings starting this month.'
      : tab === 'extensions' ? 'No extensions starting this month'
        : 'No replacement sheets starting this month';

  return (
    <div className="media-scope mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] text-black/45">Operations</p>
          <h1 className="mt-1 text-[22px] font-medium tracking-[-0.022em] text-foreground sm:text-[26px]">Bookings</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="lg" className="!h-11 px-3.5 md:!h-10" onClick={() => setModal('replacement')}>Replacement car</Button>
          <Button size="lg" className="!h-11 px-4 md:!h-10" onClick={() => setModal('add')}>+ New booking</Button>
        </div>
      </header>

      <PillTabs active={tab} counts={{ bookings: bookings?.length ?? null, extensions: extensions === null ? null : extensionSummary(extensions).count, replacements: sheets === null ? null : monthSheets.length }} onChange={openTab} />

      <div className="my-4">
        <MonthNav label={monthLabel(`${month}-01`)} justify="flex-start" onPrev={() => moveMonth(-1)} onNext={() => moveMonth(1)} />
      </div>

      {loading ? <BigTileSkeleton count={tab === 'replacements' ? 3 : 4} /> : (
        <BigTileRow>
          {tab === 'bookings' && (
            <>
              <BigTile icon={<Icon3D name="total" />} label="Total" value={String(bookingTiles.total)} caption="starting this month" active={filter === 'all'} onClick={clear} />
              <BigTile icon={<Icon3D name="confirmed" />} label="Confirmed" value={String(bookingTiles.confirmed)} caption={`${bookingTiles.activeNow} active now`} active={filter === 'confirmed'} onClick={() => toggle('confirmed')} />
              <BigTile icon={<Icon3D name="pending" />} label="Pending" value={String(bookingTiles.pending)} caption="waiting" active={filter === 'pending'} onClick={() => toggle('pending')} />
              <BigTile icon={<Icon3D name="completed" />} label="Completed" value={String(bookingTiles.completed)} caption="returned" active={filter === 'completed'} onClick={() => toggle('completed')} />
            </>
          )}
          {tab === 'extensions' && (
            <>
              <BigTile icon={<Icon3D name="total" />} label="Extensions" value={String(extensionTiles.count)} caption="starting this month" active={filter === 'all'} onClick={clear} />
              <BigTile icon={<span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#14B8A6]/15 text-[#0F766E]"><WalletIcon size={24} /></span>} label="Extension value" value={formatMoney(extensionTiles.value)} caption="rental added" wide />
              <BigTile icon={<Icon3D name="pending" />} label="Avg days" value={extensionTiles.avgDays === null ? '—' : extensionTiles.avgDays.toFixed(1)} caption="per extension" />
              <BigTile icon={<ComplianceTriangle tone="amber" size={56} />} label="Zero amount" value={String(extensionTiles.zero)} caption="no charge entered" wide active={filter === 'zero'} onClick={() => toggle('zero')} />
            </>
          )}
          {tab === 'replacements' && (
            <>
              <BigTile icon={<Icon3D name="total" />} label="Total this month" value={String(sheetTiles.total)} caption="starting this month" wide active={filter === 'all'} onClick={clear} />
              <BigTile icon={<Icon3D name="confirmed" />} label="Open" value={String(sheetTiles.open)} caption="end date not passed" active={filter === 'open'} onClick={() => toggle('open')} />
              <BigTile icon={<Icon3D name="completed" />} label="Closed" value={String(sheetTiles.closed)} caption="ended" active={filter === 'closed'} onClick={() => toggle('closed')} />
            </>
          )}
        </BigTileRow>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder={tab === 'replacements' ? 'Search sheet, customer, booking or plate' : 'Search booking, customer or plate'} className="w-full max-w-[420px]" />
        {tab !== 'replacements' && (
          <div className="w-full sm:w-[170px]">
            <Select value={statusFilter} options={STATUS_OPTIONS} size="lg" className="!h-11" ariaLabel="Filter by status" onChange={(value) => setStatusFilter(value as BookingStatus | '')} />
          </div>
        )}
        <Button variant="outline" size="lg" className="!h-11 px-3.5" disabled={loading || !hasRows} onClick={handleExport}>Export</Button>
      </div>

      <div className="mt-3">
        {tabError && <LoadError message={`Couldn't load this list: ${tabError}`} onRetry={refresh} />}
        {!tabError && loading && <div className="rounded-2xl border border-[#EBEBEB] bg-white"><SkeletonRows count={6} /></div>}
        {!tabError && !loading && !hasRows && <Empty>{emptyMessage}</Empty>}
        {!tabError && !loading && hasRows && tab === 'bookings' && (
          <BookingList
            rows={visibleBookings}
            wide={wide}
            today={today}
            sort={sort}
            actions={{
              onToggle: handleToggle,
              onEdit: (booking) => setEditing({ booking }),
              onDelete: setDeleteTarget,
              onPrint: printBookingContract,
              onExtend: setExtendTarget,
            }}
          />
        )}
        {!tabError && !loading && hasRows && tab === 'extensions' && <ExtensionList rows={visibleExtensions} wide={wide} onOpen={openExtension} />}
        {!tabError && !loading && tab === 'extensions' && extensionTiles.undated > 0 && (
          <p className="mt-2 text-[12.5px] text-black/50">
            {extensionTiles.undated === 1 ? "1 extension with no recorded dates isn't counted." : `${extensionTiles.undated} extensions with no recorded dates aren't counted.`}{' '}
            <button type="button" onClick={() => setShowUndated((value) => !value)} className="min-h-[44px] font-medium text-[#3A74C2] hover:underline md:min-h-[28px]">{showUndated ? 'Hide them' : 'Show them'}</button>
          </p>
        )}
        {!tabError && !loading && hasRows && tab === 'replacements' && <SheetList rows={visibleSheets} today={today} />}
      </div>

      {modal === 'add' && (
        <BookingFormSheet
          mode="add"
          existingCustomerId={bookingFor}
          showToast={showToast}
          onClose={() => { setModal(null); setBookingFor(undefined); }}
          onSaved={() => { showToast('Booking added successfully', 'success'); refresh(); }}
        />
      )}
      {modal === 'replacement' && (
        <ReplacementSheet showToast={showToast} onClose={() => setModal(null)} onSaved={refresh} />
      )}
      {editing && (
        <BookingFormSheet
          mode="edit"
          booking={editing.booking}
          openAt={editing.openAt}
          showToast={showToast}
          onClose={() => setEditing(null)}
          onSaved={() => { showToast('Booking updated', 'success'); refresh(); }}
        />
      )}
      {extendTarget && (
        <ExtendSheet booking={extendTarget} showToast={showToast} onClose={() => setExtendTarget(null)} onSaved={refresh} />
      )}
      {deleteTarget && (
        <DeleteConfirm booking={deleteTarget} deleting={deleting} onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />
      )}
      {toast && <Toast {...toast} />}
      <style>{`@keyframes slideUpIn { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }`}</style>
    </div>
  );
};

export default BookingsPage;
