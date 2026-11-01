import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Plus } from '../../components/media/MediaIcons';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button, Select } from '../../components/media/MediaUI';
import { PdfGlyph } from '../../components/shared/FileDrop';
import { isPdfUrl, Lightbox } from '../../components/shared/Lightbox';
import { LoadError, SkeletonRows } from '../../components/shared/PageBits';
import { ReasonSheet } from '../../components/shared/ReasonSheet';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatDate, istanbulDate } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import { formatMoney } from '../../lib/money';
import {
  canVoid,
  CATEGORY_LABELS,
  fetchLedger,
  fetchSupplier,
  ledgerCsv,
  ledgerTotals,
  voidSupplierTx,
  whatsappLink,
  withRunning,
  type LedgerRow,
  type Supplier,
  type SupplierTx,
} from '../../lib/suppliers';
import { LicensePlate } from '../bookings/ui';
import { PhoneIcon, WhatsAppIcon } from '../customers/ui';
import { SupplierFormSheet } from '../suppliers/SupplierFormSheet';
import { SupplierTxSheet } from '../suppliers/SupplierTxSheet';
import { CategoryIcon } from '../suppliers/ui';

const ALL = 'all';
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthLabel = (month: string) => MONTH.format(new Date(`${month}-01T00:00:00Z`));

const KindPill: React.FC<{ kind: SupplierTx['kind'] }> = ({ kind }) => (
  <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-medium', kind === 'bill' ? 'bg-[#DC2626]/10 text-[#B91C1C]' : 'bg-[#16A34A]/10 text-[#15803D]')}>
    {kind === 'bill' ? 'Bill' : 'Payment'}
  </span>
);

const ReceiptButton: React.FC<{ url: string | null; onOpen: (url: string) => void }> = ({ url, onOpen }) => {
  if (!url) return <span className="text-black/25">—</span>;
  return (
    <button type="button" aria-label="Open receipt" onClick={() => onOpen(url)} className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg border border-subtle bg-black/[0.03] text-black/40 hover:opacity-80 md:h-9 md:w-9">
      {isPdfUrl(url) ? <PdfGlyph size={18} /> : <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
    </button>
  );
};

const VoidAction: React.FC<{ row: LedgerRow; onVoid: () => void }> = ({ row, onVoid }) => {
  if (row.voided_at) return <span className="text-[12px] text-[#B91C1C]" title={row.void_reason ?? undefined}>Voided</span>;
  if (!canVoid(row)) return <span className="text-[12px] text-black/40" title="Undo the approval to remove this.">From custody</span>;
  return <button type="button" onClick={onVoid} className="min-h-[44px] text-[12.5px] font-medium text-[#B91C1C] hover:underline md:min-h-[32px]">Void</button>;
};

const Details: React.FC<{ row: LedgerRow }> = ({ row }) => (
  <>
    <span className={cn('block break-words text-foreground', row.voided_at && 'line-through')}>{row.description || (row.kind === 'bill' ? 'Bill' : 'Payment')}</span>
    {row.account && <span className="block text-[12px] text-black/45">From {row.account}</span>}
    {row.voided_at && row.void_reason && <span className="block break-words text-[12px] text-[#B91C1C]">Voided: {row.void_reason}</span>}
  </>
);

function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export const SupplierSheet: React.FC<{ supplierId: number }> = ({ supplierId }) => {
  const wide = useMediaQuery('(min-width: 1280px)');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [ledger, setLedger] = useState<SupplierTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<SupplierTx['kind'] | null>(null);
  const [voiding, setVoiding] = useState<LedgerRow | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [car, setCar] = useState(ALL);
  const [month, setMonth] = useState(ALL);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([fetchSupplier(supplierId), fetchLedger(supplierId)])
      .then(([supplierRow, rows]) => {
        if (cancelled) return;
        setSupplier(supplierRow);
        setLedger(rows);
      })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [supplierId, reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  // Running balances come from the whole sheet, so a filter never changes what a row says.
  const rows = useMemo(() => withRunning(ledger), [ledger]);
  const visible = useMemo(() => rows
    .filter((row) => (car === ALL || String(row.car_id) === car) && (month === ALL || row.tx_date.startsWith(month)))
    .reverse(), [rows, car, month]);

  const filtered = car !== ALL || month !== ALL;
  const totals = useMemo(() => ledgerTotals(visible), [visible]);

  const carOptions = useMemo(() => {
    const seen = new Map<number, string>();
    ledger.forEach((row) => { if (row.car_id !== null) seen.set(row.car_id, row.plate ?? String(row.car_id)); });
    return [{ value: ALL, label: 'All cars' }, ...Array.from(seen, ([value, label]) => ({ value: String(value), label }))];
  }, [ledger]);
  const monthOptions = useMemo(() => {
    const months = Array.from(new Set(ledger.map((row) => row.tx_date.slice(0, 7)))).sort().reverse();
    return [{ value: ALL, label: 'All months' }, ...months.map((value) => ({ value, label: monthLabel(value) }))];
  }, [ledger]);

  const chat = whatsappLink(supplier?.whatsapp || supplier?.phone || '');
  const back = (
    <Link to="/dashboard/accounting?tab=suppliers" className="inline-flex min-h-[44px] items-center gap-1 text-[13px] text-black/50 hover:text-foreground md:min-h-[32px]">
      <ChevronLeft size={14} /> Suppliers
    </Link>
  );

  if (!loading && !error && !supplier) {
    return (
      <div className="media-scope">
        {back}
        <p className="mt-6 text-[15px] font-medium text-foreground">This supplier isn't here any more.</p>
      </div>
    );
  }

  return (
    <div className="media-scope">
      {back}
      {error && <LoadError message={`Couldn't load this supplier: ${error}`} onRetry={() => { setLoading(true); refresh(); }} />}

      {supplier && (
        <header className="mt-2 flex max-w-[1100px] flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><CategoryIcon category={supplier.category} size={22} /></span>
            <div className="min-w-0">
              <h1 className="break-words text-[22px] font-medium tracking-[-0.022em] text-foreground sm:text-[26px]">{supplier.name}</h1>
              <p className="text-[13.5px] text-black/50">
                {[CATEGORY_LABELS[supplier.category], supplier.contact_person, supplier.district].filter(Boolean).join(' · ')}
                {!supplier.is_active ? ' · Inactive' : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {supplier.phone && <a href={`tel:${supplier.phone}`} aria-label="Call" className="grid h-11 w-11 place-items-center rounded-[10px] border border-subtle text-black/55 hover:text-primary md:h-10 md:w-10"><PhoneIcon size={15} /></a>}
            {chat && <a href={chat} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="grid h-11 w-11 place-items-center rounded-[10px] border border-subtle text-[#15803D] md:h-10 md:w-10"><WhatsAppIcon size={15} /></a>}
            <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-10" onClick={() => setEditing(true)}>Edit</Button>
          </div>
        </header>
      )}

      <section aria-label="Totals" className="mt-5 grid max-w-[1100px] grid-cols-1 gap-3 md:grid-cols-3">
        {totals.length === 0 ? (
          <p className="rounded-xl border border-subtle bg-surface px-4 py-3 text-[13.5px] text-black/45 md:col-span-3">{loading ? 'Loading…' : 'Nothing on this sheet yet.'}</p>
        ) : totals.map((total) => (
          <div key={total.currency} className="rounded-xl border border-subtle bg-surface p-3.5">
            <p className="text-[12.5px] text-black/50">{total.currency}{filtered ? ' · in this view' : ''}</p>
            <p className={cn('mt-1 text-[22px] font-semibold tabular-nums', total.balance > 0 ? 'text-[#B91C1C]' : total.balance < 0 ? 'text-[#15803D]' : 'text-foreground')}>
              {formatMoney(Math.abs(total.balance), total.currency)}
            </p>
            <p className="text-[12.5px] text-black/50">{total.balance > 0 ? 'We owe' : total.balance < 0 ? 'Credit with them' : 'Settled'}</p>
            <p className="mt-1.5 text-[12.5px] tabular-nums text-black/55">Bills {formatMoney(total.bills, total.currency)} · Paid {formatMoney(total.paid, total.currency)}</p>
          </div>
        ))}
      </section>

      <div className="mt-4 flex max-w-[1100px] flex-wrap items-center gap-2">
        <div className="w-full sm:w-[190px]"><Select value={car} options={carOptions} size="lg" ariaLabel="Filter by car" onChange={setCar} /></div>
        <div className="w-full sm:w-[190px]"><Select value={month} options={monthOptions} size="lg" ariaLabel="Filter by month" onChange={setMonth} /></div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-10" disabled={visible.length === 0} onClick={() => supplier && downloadCsv(`${supplier.name.replace(/[^\w-]+/g, '-')}-${istanbulDate()}.csv`, ledgerCsv(visible))}>Export CSV</Button>
          <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-10" disabled={!supplier} onClick={() => setAdding('payment')}><Plus size={15} /> Add payment</Button>
          <Button size="lg" className="!h-11 px-3 md:!h-10" disabled={!supplier} onClick={() => setAdding('bill')}><Plus size={15} /> Add bill</Button>
        </div>
      </div>

      <div className="mt-4 max-w-[1100px]">
        {loading ? <div className="rounded-xl border border-subtle bg-surface"><SkeletonRows /></div>
          : visible.length === 0 ? (
            <p className="rounded-xl border border-subtle bg-surface px-4 py-10 text-center text-[13.5px] text-black/45">
              {ledger.length === 0 ? 'Add the first bill to start this sheet.' : 'No entries match these filters.'}
            </p>
          ) : wide ? (
            <div className="overflow-x-auto rounded-xl border border-subtle bg-surface">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead>
                  <tr className="border-b border-subtle text-[11.5px] text-black/45">
                    {['Date', 'Type', 'Details', 'Car'].map((label) => <th key={label} scope="col" className="px-3 py-2 text-start font-medium">{label}</th>)}
                    {['Bill', 'Payment', 'Balance'].map((label) => <th key={label} scope="col" className="px-3 py-2 text-end font-medium">{label}</th>)}
                    <th scope="col" className="px-3 py-2 text-start font-medium">Receipt</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id} className={cn('border-b border-subtle last:border-b-0', row.voided_at && 'opacity-55')}>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-black/60">{formatDate(row.tx_date)}</td>
                      <td className="px-3 py-2"><KindPill kind={row.kind} /></td>
                      <td className="max-w-[240px] px-3 py-2"><Details row={row} /></td>
                      <td className="px-3 py-2">{row.plate ? <LicensePlate plate={row.plate} /> : <span className="text-black/25">—</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-end tabular-nums text-foreground">{row.kind === 'bill' ? formatMoney(row.amount, row.currency) : ''}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-end tabular-nums text-foreground">{row.kind === 'payment' ? formatMoney(row.amount, row.currency) : ''}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-end font-semibold tabular-nums text-foreground">{row.running === null ? '—' : formatMoney(row.running, row.currency)}</td>
                      <td className="px-3 py-1.5"><ReceiptButton url={row.receipt_url} onOpen={setReceipt} /></td>
                      <td className="whitespace-nowrap px-3 py-2 text-end"><VoidAction row={row} onVoid={() => setVoiding(row)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {visible.map((row) => (
                <li key={row.id} className={cn('min-w-0 rounded-xl border border-subtle bg-surface p-3.5 text-[13.5px]', row.voided_at && 'opacity-60')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><KindPill kind={row.kind} /><span className="text-[12.5px] tabular-nums text-black/50">{formatDate(row.tx_date)}</span></span>
                    <span className="text-[16px] font-semibold tabular-nums text-foreground">{formatMoney(row.amount, row.currency)}</span>
                  </div>
                  <div className="mt-1.5"><Details row={row} /></div>
                  {row.plate && <div className="mt-1.5"><LicensePlate plate={row.plate} /></div>}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <ReceiptButton url={row.receipt_url} onOpen={setReceipt} />
                      <VoidAction row={row} onVoid={() => setVoiding(row)} />
                    </span>
                    <span className="text-[12.5px] tabular-nums text-black/55">Balance {row.running === null ? '—' : formatMoney(row.running, row.currency)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>

      {editing && supplier && (
        <SupplierFormSheet
          supplier={supplier}
          onClose={() => setEditing(false)}
          onSaved={(saved) => { setSupplier(saved); setEditing(false); toast.success('Supplier updated.'); }}
        />
      )}
      {adding && supplier && (
        <SupplierTxSheet
          supplier={supplier}
          kind={adding}
          onClose={() => setAdding(null)}
          onSaved={(message) => { setAdding(null); toast.success(message); refresh(); }}
        />
      )}
      {voiding && (
        <ReasonSheet
          title="Void this entry?"
          description={`${voiding.kind === 'bill' ? 'Bill' : 'Payment'} of ${formatMoney(voiding.amount, voiding.currency)}. It stays on the sheet, crossed out, and stops counting.`}
          label="Reason"
          confirmLabel="Void entry"
          onClose={() => setVoiding(null)}
          onConfirm={async (reason) => {
            await voidSupplierTx(voiding.id, reason);
            setVoiding(null);
            toast.success('Entry voided.');
            refresh();
          }}
        />
      )}
      {receipt && <Lightbox items={[{ url: receipt, label: 'Receipt' }]} onClose={() => setReceipt(null)} />}
      <MediaToaster />
    </div>
  );
};

