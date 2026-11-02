import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check } from '../components/media/MediaIcons';
import { MediaToaster, toast } from '../components/media/MediaToast';
import { Button, Sheet, SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Spinner } from '../components/media/MediaUI';
import { ComplianceTriangle } from '../components/shared/ComplianceBits';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../components/shared/FilterTile';
import MonthNav from '../components/shared/MonthNav';
import { LoadError, PageHeader, SearchField, SkeletonRows } from '../components/shared/PageBits';
import { CustomerAvatar } from '../components/shared/PersonAvatar';
import { useUrlFilter } from '../hooks/useUrlFilter';
import { formatDate } from '../lib/customers';
import { cn } from '../lib/media/badgeColor';
import { formatMoney } from '../lib/money';
import { currentMonth, monthLabel, shiftMonth } from '../lib/payroll';
import {
  carLabel,
  customerFields,
  fetchPendingInvoices,
  inInvoiceFilter,
  INVOICE_FILTERS,
  invoiceMonth,
  invoicesCsv,
  invoiceSummary,
  invoiceTable,
  invoiceWarning,
  lineLabel,
  markInvoiced,
  matchesInvoiceSearch,
  type PendingInvoice,
} from '../lib/pendingInvoices';
import { LicensePlate, Notice } from './bookings/ui';
import { ReceiptIcon, WalletIcon } from './customers/ui';

const ALL_MONTHS = 'all';
const MONO = 'font-mono tabular-nums';

function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Couldn't copy. Your browser blocked it.");
    }
  };
  return { copied, copy };
}

const CopyIcon: React.FC<{ done: boolean; label: string; onClick: () => void }> = ({ done, label, onClick }) => (
  <button type="button" aria-label={label} onClick={onClick} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-black/40 hover:bg-black/[0.05] hover:text-foreground md:h-8 md:w-8">
    {done ? <Check size={14} strokeWidth={2.5} className="text-[#15803D]" /> : (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" />
      </svg>
    )}
  </button>
);

const Block: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section aria-label={title}>
    <h3 className="mb-1.5 text-[12.5px] font-medium text-black/50">{title}</h3>
    <div className="rounded-xl border border-[#EBEBEB] bg-white px-3 py-1">{children}</div>
  </section>
);

const Row: React.FC<{ label: string; children: React.ReactNode; action?: React.ReactNode }> = ({ label, children, action }) => (
  <div className="flex min-h-[44px] items-center justify-between gap-2 border-b border-black/[0.05] py-1 last:border-b-0">
    <div className="min-w-0">
      <p className="text-[11.5px] text-black/45">{label}</p>
      <div className="break-words text-[13.5px] text-foreground">{children}</div>
    </div>
    {action}
  </div>
);

const WarningNote: React.FC<{ row: PendingInvoice }> = ({ row }) => {
  const warning = invoiceWarning(row);
  if (warning?.kind === 'lines_differ') {
    return (
      <Notice tone="amber">
        The lines add up to {formatMoney(warning.linesTotal)}, but the total is {formatMoney(row.invoice_total)}. An IN rental row is probably cancelling the charge. Check the ledger before invoicing.
      </Notice>
    );
  }
  if (warning?.kind === 'no_rental') return <Notice tone="amber">This booking has no rental line, so the invoice only covers the extras. Check the ledger before invoicing.</Notice>;
  if (row.invoice_total === 0) return <Notice tone="amber">This booking has no amount to invoice. It's an old booking with no rental line.</Notice>;
  return null;
};

const InvoiceSheet: React.FC<{
  row: PendingInvoice;
  busy: boolean;
  onClose: () => void;
  onMark: () => void;
}> = ({ row, busy, onClose, onMark }) => {
  const { copied, copy } = useCopy();
  const fields = customerFields(row, formatDate);

  return (
    <Sheet open onClose={onClose} ariaLabel="Invoice details" maxWidthClass="sm:max-w-[520px]">
      <SheetHeader className="pe-14">
        <SheetTitle>Invoice details</SheetTitle>
        <SheetDescription>{row.booking_number}</SheetDescription>
      </SheetHeader>
      <SheetBody>
        <WarningNote row={row} />

        <Block title="Customer">
          {fields.map((field) => (
            <Row
              key={field.key}
              label={field.label}
              action={field.value ? <CopyIcon done={copied === field.key} label={`Copy ${field.label.toLowerCase()}`} onClick={() => copy(field.key, field.value as string)} /> : undefined}
            >
              {field.value ?? (
                <span className="text-[#B91C1C]">
                  Missing — {row.customer_id
                    ? <Link to={`/dashboard/customers/${row.customer_id}`} className="font-medium text-[#3A74C2] hover:underline">add in customer profile</Link>
                    : 'add in customer profile'}
                </span>
              )}
            </Row>
          ))}
        </Block>

        <Block title="Service">
          <Row label="Car">
            <span className="flex flex-wrap items-center gap-2">
              {carLabel(row) || '—'}
              {row.plate && <LicensePlate plate={row.plate} />}
            </span>
          </Row>
          <Row label="Period"><span className={MONO}>{formatDate(row.start_date)} – {formatDate(row.end_date)}</span></Row>
          <Row label="Days"><span className={MONO}>{row.days}</span></Row>
          <Row label="Booking" action={<CopyIcon done={copied === 'booking'} label="Copy booking number" onClick={() => copy('booking', row.booking_number)} />}><span className={MONO}>{row.booking_number}</span></Row>
        </Block>

        <Block title="Lines">
          {row.lines.length === 0 && <p className="py-3 text-[13px] text-black/45">No charges on this booking.</p>}
          {row.lines.map((line, index) => (
            <div key={`${line.date}-${index}`} className="flex items-center justify-between gap-3 border-b border-black/[0.05] py-2 text-[13px]">
              <span className="min-w-0">
                <span className="block break-words text-foreground">{lineLabel(line)}</span>
                <span className={cn('block text-[11.5px] text-black/45', MONO)}>{formatDate(line.date)}</span>
              </span>
              <span className={cn('shrink-0 text-foreground', MONO)}>{formatMoney(line.amount)}</span>
            </div>
          ))}
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-2 text-[13px]">
            <dt className="text-black/55">Net</dt><dd className={cn('text-end text-foreground', MONO)}>{formatMoney(row.net_amount)}</dd>
            <dt className="text-black/55">KDV 20%</dt><dd className={cn('text-end text-foreground', MONO)}>{formatMoney(row.vat_amount)}</dd>
            <dt className="font-semibold text-foreground">Total</dt><dd className={cn('text-end text-[15px] font-semibold text-foreground', MONO)}>{formatMoney(row.invoice_total)}</dd>
          </dl>
        </Block>

        <Block title="Paid so far">
          <Row label="Paid vs total, for information only">
            <span className={MONO}>{formatMoney(row.paid_total)} / {formatMoney(row.invoice_total)}</span>
          </Row>
        </Block>

        <div className="flex flex-col gap-2">
          <Button size="lg" className="!h-11 w-full" onClick={() => copy('text', row.invoice_text)}>
            {copied === 'text' ? <><Check size={14} strokeWidth={2.5} /> Copied</> : 'Copy invoice text'}
          </Button>
          <Button variant="outline" size="lg" className="!h-11 w-full" onClick={() => copy('table', invoiceTable(row, formatDate))}>
            {copied === 'table' ? <><Check size={14} strokeWidth={2.5} /> Copied</> : 'Copy all as table'}
          </Button>
        </div>
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" size="lg" className="!h-11 md:!h-10" onClick={onClose}>Close</Button>
        <Button size="lg" className="!h-11 flex-1 md:!h-10" disabled={busy} onClick={onMark}>
          {busy && <Spinner size={13} />} Mark as invoiced
        </Button>
      </SheetFooter>
    </Sheet>
  );
};

const InvoiceCard: React.FC<{
  row: PendingInvoice;
  picked: boolean;
  onPick: (on: boolean) => void;
  onOpen: () => void;
}> = ({ row, picked, onPick, onOpen }) => {
  const warning = invoiceWarning(row);
  return (
    <li className={cn('surface-depth relative min-w-0 rounded-2xl border bg-white transition-colors', picked ? 'border-[#6EA4E7]' : 'border-[#EBEBEB] hover:border-[#6EA4E7]/60')}>
      <label className="absolute end-1.5 top-1.5 z-10 grid h-11 w-11 cursor-pointer place-items-center">
        <input type="checkbox" checked={picked} aria-label={`Select ${row.booking_number}`} onChange={(event) => onPick(event.target.checked)} className="h-[18px] w-[18px] accent-[#6EA4E7]" />
      </label>
      <button type="button" onClick={onOpen} className="block w-full rounded-2xl p-4 text-start">
        <span className="flex min-w-0 items-center gap-2.5 pe-9">
          <CustomerAvatar person={null} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium text-foreground">{row.customer_name || '—'}</span>
            <span className={cn('block truncate text-[12px] text-black/50', MONO)}>{row.booking_number}</span>
          </span>
        </span>
        <span className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-[12.5px] text-black/60">
          {row.plate && <LicensePlate plate={row.plate} />}
          <span className="truncate">{carLabel(row)}</span>
        </span>
        <span className={cn('mt-1.5 block text-[12px] text-black/50', MONO)}>{formatDate(row.start_date)} – {formatDate(row.end_date)} · {row.days === 1 ? '1 day' : `${row.days} days`}</span>
        <span className={cn('mt-3 block text-[22px] font-semibold leading-tight', MONO, row.invoice_total === 0 ? 'text-[#92400E]' : 'text-foreground')}>{formatMoney(row.invoice_total)}</span>
        <span className={cn('mt-0.5 block text-[12px] text-black/50', MONO)}>Net {formatMoney(row.net_amount)} · KDV {formatMoney(row.vat_amount)}</span>
        {warning && (
          <span className="mt-2 inline-block rounded-full bg-[#F59E0B]/[0.16] px-2 py-0.5 text-[12px] font-medium text-[#92400E]">
            {warning.kind === 'lines_differ' ? "Lines don't match total" : 'No rental line'}
          </span>
        )}
      </button>
    </li>
  );
};

const PendingInvoicesPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const requested = params.get('month');
  const allMonths = requested === ALL_MONTHS;
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : currentMonth().slice(0, 7);

  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const { filter, toggle, clear } = useUrlFilter(INVOICE_FILTERS);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchPendingInvoices()
      .then((rows) => { if (!cancelled) setInvoices(rows); })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const setMonth = (next: string) => {
    const updated = new URLSearchParams(params);
    updated.set('month', next);
    setParams(updated);
    setSelected(new Set());
  };
  const moveMonth = (by: number) => setMonth(shiftMonth(`${month}-01`, by).slice(0, 7));

  const inPeriod = useMemo(() => (allMonths ? invoices : invoices.filter((row) => invoiceMonth(row) === month)), [invoices, allMonths, month]);
  const summary = useMemo(() => invoiceSummary(inPeriod), [inPeriod]);
  const visible = useMemo(() => inPeriod.filter((row) => inInvoiceFilter(row, filter) && matchesInvoiceSearch(row, query)), [inPeriod, filter, query]);
  const picked = useMemo(() => visible.filter((row) => selected.has(row.booking_id)), [visible, selected]);
  const open = invoices.find((row) => row.booking_id === openId) ?? null;
  const periodLabel = allMonths ? 'All months' : monthLabel(`${month}-01`);

  const pick = (id: number, on: boolean) => setSelected((current) => {
    const next = new Set(current);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });

  const undo = useCallback(async (rows: PendingInvoice[]) => {
    try {
      await markInvoiced(rows.map((row) => row.booking_id), false);
      setInvoices((current) => [...current, ...rows].sort((a, b) => a.end_date.localeCompare(b.end_date) || a.booking_id - b.booking_id));
      toast.success(rows.length === 1 ? 'Back in pending.' : `${rows.length} invoices back in pending.`);
    } catch (failure) {
      toast.error(`Couldn't undo it: ${failure instanceof Error ? failure.message : 'try again'}`);
    }
  }, []);

  const mark = async (rows: PendingInvoice[]) => {
    const ids = new Set(rows.map((row) => row.booking_id));
    setBusy(true);
    try {
      await markInvoiced(Array.from(ids), true);
      setInvoices((current) => current.filter((row) => !ids.has(row.booking_id)));
      setSelected(new Set());
      setOpenId(null);
      toast.success(rows.length === 1 ? `${rows[0].booking_number} marked as invoiced.` : `${rows.length} bookings marked as invoiced.`, { label: 'Undo', onClick: () => undo(rows) });
    } catch (failure) {
      toast.error(`Couldn't mark it: ${failure instanceof Error ? failure.message : 'try again'}`);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => downloadCsv(`pending-invoices-${allMonths ? 'all' : month}.csv`, invoicesCsv(inPeriod));

  return (
    <div className="media-scope mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <PageHeader eyebrow="Finance" title="Pending invoices" subtitle="Completed bookings reported to KABIS, waiting for an e-Fatura." />

      <div className="mb-4 flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
        <div className={cn('flex flex-wrap items-center gap-3', allMonths && 'opacity-60')}>
          <MonthNav label={monthLabel(`${month}-01`)} justify="flex-start" onPrev={() => moveMonth(-1)} onNext={() => moveMonth(1)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={allMonths ? 'default' : 'outline'} size="lg" aria-pressed={allMonths} className="!h-11 px-3 md:!h-10" onClick={() => setMonth(allMonths ? currentMonth().slice(0, 7) : ALL_MONTHS)}>All months</Button>
          <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-10" disabled={inPeriod.length === 0} onClick={exportCsv}>{allMonths ? 'Export all (CSV)' : 'Export month (CSV)'}</Button>
        </div>
      </div>

      {error && <LoadError message={`Couldn't load pending invoices: ${error}`} onRetry={() => { setLoading(true); setReload((value) => value + 1); }} />}

      {!error && (loading ? <FilterTileSkeleton count={5} /> : (
        <FilterTileRow label="Filter invoices">
          <FilterTile tone="blue" mono icon={<ReceiptIcon size={15} />} label="Pending" value={String(summary.count)} sub={summary.count === 1 ? 'booking' : 'bookings'} active={filter === 'all'} onClick={clear} />
          <FilterTile tone="teal" mono icon={<WalletIcon size={15} />} label="Total to invoice" value={formatMoney(summary.total)} sub={`${summary.ready} with an amount`} active={filter === 'ready'} onClick={() => toggle('ready')} />
          <FilterTile tone="neutral" mono icon={<WalletIcon size={15} />} label="Net" value={formatMoney(summary.net)} sub="excl. KDV" />
          <FilterTile tone="neutral" mono icon={<WalletIcon size={15} />} label="KDV" value={formatMoney(summary.vat)} sub="20%" />
          <FilterTile tone="amber" mono bareIcon icon={<ComplianceTriangle tone="amber" size={32} />} label="Missing amount" value={String(summary.missing)} sub="no rental line" active={filter === 'missing'} onClick={() => toggle('missing')} />
        </FilterTileRow>
      ))}

      {!error && (
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Search name, plate, booking or ID number" className="mt-4 max-w-[420px]" />

          {picked.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[#6EA4E7]/[0.1] px-3 py-1.5 text-[13px]">
              <span className="font-medium text-foreground">{picked.length} selected</span>
              <Button size="lg" className="!h-11 px-3 md:!h-9" disabled={busy} onClick={() => mark(picked)}>{busy && <Spinner size={13} />} Mark selected as invoiced</Button>
              <button type="button" onClick={() => setSelected(new Set())} className="min-h-[44px] text-[12.5px] font-medium text-black/55 hover:underline md:min-h-[36px]">Clear</button>
            </div>
          )}

          <div className="mt-3">
            {loading ? <div className="rounded-xl border border-subtle bg-surface"><SkeletonRows count={5} /></div>
              : visible.length === 0 ? (
                <div className="rounded-xl border border-subtle bg-surface px-4 py-8 text-center text-[13.5px] text-black/45">
                  {inPeriod.length > 0 ? 'No invoices in this view.' : invoices.length === 0 ? 'Nothing is waiting for an invoice.' : (
                    <>
                      <p>Nothing pending for {periodLabel}.</p>
                      <button type="button" onClick={() => setMonth(ALL_MONTHS)} className="mt-1 min-h-[44px] font-medium text-[#3A74C2] hover:underline">
                        {invoices.length === 1 ? 'Show 1 pending in another month' : `Show ${invoices.length} pending in other months`}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visible.map((row) => <InvoiceCard key={row.booking_id} row={row} picked={selected.has(row.booking_id)} onPick={(on) => pick(row.booking_id, on)} onOpen={() => setOpenId(row.booking_id)} />)}
                </ul>
              )}
          </div>
        </>
      )}

      {open && <InvoiceSheet row={open} busy={busy} onClose={() => setOpenId(null)} onMark={() => mark([open])} />}
      <MediaToaster />
    </div>
  );
};

export default PendingInvoicesPage;
