import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConfirmDialog, type ConfirmState } from '../../components/media/ConfirmDialog';
import { Check, ChevronDown, ChevronRight } from '../../components/media/MediaIcons';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button } from '../../components/media/MediaUI';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../../components/shared/FilterTile';
import MonthNav from '../../components/shared/MonthNav';
import { LoadError, SearchField, SkeletonRows } from '../../components/shared/PageBits';
import { ReasonSheet } from '../../components/shared/ReasonSheet';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { useCurrentProfile } from '../../hooks/useCurrentProfile';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import { useUrlSort } from '../../hooks/useUrlSort';
import { cn } from '../../lib/media/badgeColor';
import { formatMoney } from '../../lib/money';
import {
  bookingLabel,
  checkEvent,
  CLOSE_FILTERS,
  CLOSE_SORTS,
  closedOnLabel,
  closeMonth,
  closeSortFirstDirection,
  fetchMonthClosing,
  fetchMonthEvents,
  firstPlaceLabel,
  inCloseFilter,
  matchesCloseSearch,
  methodIcon,
  methodLabel,
  monthCloseCsv,
  monthClosePrintHtml,
  monthSummary,
  nowLabel,
  periodLabel,
  PLACE_LABELS,
  rowPlace,
  sortCloseRows,
  stampLabel,
  TRACKED_FROM,
  type CloseSort,
  type EventPayment,
  type MoneyPlace,
  type MonthClosing,
  type MonthEvent,
} from '../../lib/monthClose';
import { getAvatarProfiles, type ProfileOption } from '../../lib/notifications';
import { currentMonth, monthLabel, shiftMonth } from '../../lib/payroll';
import { LicensePlate } from '../bookings/ui';
import { SortHeader } from '../carTracking/ui';
import { WalletIcon } from '../customers/ui';

const PLACE_PILL: Record<MoneyPlace, string> = {
  in_safe: 'bg-[#14B8A6]/15 text-[#115E59]',
  with_employee: 'bg-[#F59E0B]/[0.16] text-[#92400E]',
  with_admin: 'bg-[#16A34A]/10 text-[#15803D]',
  pending_bank: 'bg-[#8B5CF6]/[0.12] text-[#5B21B6]',
  in_account: 'bg-primary/10 text-primary',
  cancelled: 'bg-black/[0.06] text-black/50',
  unknown: 'bg-[#DC2626]/10 text-[#B91C1C]',
};

const PlacePill: React.FC<{ place: MoneyPlace; title?: string }> = ({ place, title }) => (
  <span title={title} className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium', PLACE_PILL[place])}>{PLACE_LABELS[place]}</span>
);

const Remaining: React.FC<{ amount: number }> = ({ amount }) => {
  if (Math.abs(amount) < 0.005) return <span role="img" aria-label="Nothing remaining" className="inline-flex text-[#15803D]"><Check size={15} strokeWidth={3} /></span>;
  if (amount > 0) return <span className="font-semibold text-[#B91C1C]">{formatMoney(amount)}</span>;
  return <span title="Paid more than this row's rental, usually a balance from earlier in the booking" className="text-black/55">{formatMoney(amount)}</span>;
};

const LegacyChip: React.FC = () => (
  <span title="Recorded before destinations were tracked" className="inline-block rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[11.5px] font-medium text-black/50">Legacy</span>
);

const FirstPlace: React.FC<{ payment: EventPayment }> = ({ payment }) => (payment.legacy ? <LegacyChip /> : (
  <span className="inline-block max-w-[116px] truncate rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[12px] text-black/60" title={firstPlaceLabel(payment)}>
    {methodIcon(payment.method)} {payment.first_account ?? 'Unknown'}
  </span>
));

const PaymentRow: React.FC<{ payment: EventPayment }> = ({ payment }) => (
  <li className="grid grid-cols-[150px_150px_minmax(0,1fr)_auto] items-center gap-x-3 py-1.5 text-[12.5px]">
    <span className="font-semibold tabular-nums text-foreground">
      {formatMoney(payment.amount, payment.currency)}
      {payment.currency !== 'TRY' && <span className="ms-1 font-normal text-black/45">{formatMoney(payment.amount_try)}</span>}
    </span>
    <span className="text-black/55"><span className="capitalize">{payment.type}</span>{payment.method && ` · ${methodLabel(payment.method)}`}</span>
    <span className="flex min-w-0 items-center gap-1.5 text-black/60" title={firstPlaceLabel(payment)}>
      {payment.legacy && <LegacyChip />}
      <span className="truncate">{methodIcon(payment.method)} {firstPlaceLabel(payment)}</span>
    </span>
    <span className="flex items-center gap-1.5"><span aria-hidden="true" className="text-black/30">→</span><PlacePill place={payment.now} title={nowLabel(payment)} /></span>
  </li>
);

function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const Money: React.FC<{ value: number; className?: string }> = ({ value, className }) => (
  <td className={cn('whitespace-nowrap px-2 py-2 text-end tabular-nums', className)}>{formatMoney(value)}</td>
);

const HEADERS: Array<{ key: CloseSort; label: string; end?: boolean }> = [
  { key: 'booking', label: 'Booking' },
  { key: 'type', label: 'Type' },
  { key: 'customer', label: 'Customer' },
  { key: 'plate', label: 'Plate' },
  { key: 'rental', label: 'Rental', end: true },
  { key: 'paid', label: 'Paid', end: true },
  { key: 'deposit', label: 'Deposit', end: true },
  { key: 'remaining', label: 'Remaining', end: true },
  { key: 'first', label: 'Where it went first' },
  { key: 'now', label: 'Where it is now' },
];

const CHECKED_CELL = 'sticky end-0 bg-surface shadow-[-1px_0_0_rgba(0,0,0,0.05)]';

export const MonthlyCloseTab: React.FC = () => {
  const { profile } = useCurrentProfile();
  const isAdmin = profile?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const requested = params.get('month');
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : currentMonth().slice(0, 7);
  const oldMonth = month < TRACKED_FROM;

  const [rows, setRows] = useState<MonthEvent[]>([]);
  const [closing, setClosing] = useState<MonthClosing | null>(null);
  const [people, setPeople] = useState<Record<string, ProfileOption>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [ticking, setTicking] = useState<Set<number>>(new Set());
  const [closingSheet, setClosingSheet] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { filter, toggle, clear } = useUrlFilter(CLOSE_FILTERS);
  const sort = useUrlSort<CloseSort>(CLOSE_SORTS, { key: 'created', direction: 'asc' }, closeSortFirstDirection);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setOpen(new Set());
    setRows([]);
    setClosing(null);
    setLoading(true);
    Promise.all([fetchMonthEvents(month), fetchMonthClosing(month)])
      .then(async ([live, closed]) => {
        const events = closed?.rows ?? live;
        const ids = [...events.map((row) => row.checked_by), closed?.closed_by];
        const profiles = await getAvatarProfiles(Array.from(new Set(ids.filter((id): id is string => Boolean(id)))));
        if (cancelled) return;
        setRows(events);
        setClosing(closed);
        setPeople(profiles);
      })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month, reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  const moveMonth = (by: number) => {
    const next = new URLSearchParams(params);
    next.set('month', shiftMonth(`${month}-01`, by).slice(0, 7));
    setParams(next);
  };

  const summary = useMemo(() => monthSummary(rows), [rows]);
  const visible = useMemo(() => sortCloseRows(
    rows.filter((row) => inCloseFilter(row, filter) && matchesCloseSearch(row, query)),
    sort.key,
    sort.direction,
  ), [rows, filter, query, sort.key, sort.direction]);
  const totals = useMemo(() => monthSummary(visible), [visible]);

  const name = useCallback((id: string | null) => (id ? people[id]?.full_name ?? (id === profile?.id ? profile.full_name : null) ?? '' : ''), [people, profile]);
  const closed = Boolean(closing);
  const closerName = closing ? (name(closing.closed_by).split(' ')[0] || 'an admin') : '';
  const status = closing ? `Closed by ${closerName} on ${closedOnLabel(closing.closed_at)}` : 'Open';
  const canTick = isAdmin && !closed;

  const tick = async (row: MonthEvent) => {
    if (ticking.has(row.event_id)) return;
    const checked = !row.checked_at;
    const patch = (values: Pick<MonthEvent, 'checked_by' | 'checked_at'>) => setRows((current) => current.map((item) => (item.event_id === row.event_id ? { ...item, ...values } : item)));
    const flag = (on: boolean) => setTicking((current) => {
      const next = new Set(current);
      if (on) next.add(row.event_id);
      else next.delete(row.event_id);
      return next;
    });
    flag(true);
    patch(checked ? { checked_by: profile?.id ?? null, checked_at: new Date().toISOString() } : { checked_by: null, checked_at: null });
    try {
      await checkEvent(row.event_id, checked);
    } catch (failure) {
      patch({ checked_by: row.checked_by, checked_at: row.checked_at });
      toast.error(`Couldn't save the tick: ${failure instanceof Error ? failure.message : 'try again'}`);
      // Most likely someone closed the month in another window.
      refresh();
    } finally {
      flag(false);
    }
  };

  const expand = (id: number) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const exportCsv = () => downloadCsv(`monthly-close-${month}.csv`, monthCloseCsv(sortCloseRows(rows, sort.key, sort.direction), name));

  const print = () => {
    const page = window.open('', '_blank', 'width=1100,height=780');
    if (!page) { toast.error('Your browser blocked the print window. Allow pop-ups and try again.'); return; }
    page.document.write(monthClosePrintHtml(sortCloseRows(rows, sort.key, sort.direction), `Monthly close · ${monthLabel(`${month}-01`)}`, status, name));
    page.document.close();
    page.focus();
    page.print();
  };

  const askReopen = () => setConfirm({
    title: `Reopen ${monthLabel(`${month}-01`)}?`,
    description: 'Rows can be ticked and unticked again until the month is closed again.',
    confirmLabel: 'Reopen',
    pendingLabel: 'Reopening…',
    onConfirm: async () => {
      await closeMonth(month, false, null);
      toast.success('Month reopened.');
      refresh();
    },
  });

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirming(true);
    try {
      await confirm.onConfirm();
      setConfirm(null);
    } catch (failure) {
      toast.error(`Couldn't reopen it: ${failure instanceof Error ? failure.message : 'try again'}`);
    } finally {
      setConfirming(false);
    }
  };

  const showFigures = !error;

  return (
    <div className="media-scope">
      <div className="mb-4 flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <MonthNav label={monthLabel(`${month}-01`)} justify="flex-start" onPrev={() => moveMonth(-1)} onNext={() => moveMonth(1)} />
          {showFigures && !loading && (
            <span title={closing?.note ?? undefined} className={cn('rounded-full px-2.5 py-1 text-[12.5px] font-medium', closed ? 'bg-[#16A34A]/10 text-[#15803D]' : 'bg-primary/10 text-primary')}>{status}</span>
          )}
        </div>
        {showFigures && !loading && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-10" disabled={rows.length === 0} onClick={exportCsv}>Export CSV</Button>
            <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-10" disabled={rows.length === 0} onClick={print}>Print</Button>
            {isAdmin && (closed
              ? <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-10" onClick={askReopen}>Reopen</Button>
              : (
                <>
                  {summary.left > 0 && <span className="text-[12.5px] text-black/50">{summary.left} left to check</span>}
                  <Button size="lg" className="!h-11 px-4 md:!h-10" disabled={rows.length === 0 || summary.left > 0} onClick={() => setClosingSheet(true)}>Close month</Button>
                </>
              ))}
          </div>
        )}
      </div>

      {closing?.note && <p className="mb-3 max-w-[1100px] break-words text-[13px] text-black/55">Note: {closing.note}</p>}
      {oldMonth && !error && <p className="mb-3 max-w-[1100px] text-[13px] text-black/55">Old month — payments with unknown destination are counted as received by the admin. Review remaining amounts before closing.</p>}
      {error && <LoadError message={`Couldn't load the monthly close: ${error}`} onRetry={refresh} />}

      {showFigures && (loading ? <FilterTileSkeleton count={7} columns={7} /> : (
        <FilterTileRow label="Filter the month" columns={7}>
          <FilterTile tone="blue" icon={<WalletIcon size={15} />} label="All" value={String(summary.total)} sub={summary.total === 1 ? 'row' : 'rows'} active={filter === 'all'} onClick={clear} />
          <FilterTile
            tone="teal"
            icon={<WalletIcon size={15} />}
            label="Revenue"
            value={formatMoney(summary.revenue)}
            sub={<><span className="block truncate">new {formatMoney(summary.newRevenue)}</span><span className="block truncate">extensions {formatMoney(summary.extensionRevenue)}</span></>}
            active={filter === 'revenue'}
            onClick={() => toggle('revenue')}
          />
          <FilterTile tone="green" icon={<WalletIcon size={15} />} label="Collected" value={formatMoney(summary.collected)} sub={`${rows.filter((row) => inCloseFilter(row, 'collected')).length} of ${summary.total} rows`} active={filter === 'collected'} onClick={() => toggle('collected')} />
          <FilterTile tone="red" icon={<WalletIcon size={15} />} label="Outstanding" value={formatMoney(summary.outstanding)} sub={`${rows.filter((row) => inCloseFilter(row, 'outstanding')).length} of ${summary.total} rows`} active={filter === 'outstanding'} onClick={() => toggle('outstanding')} />
          <FilterTile tone="violet" icon={<WalletIcon size={15} />} label="Deposits received" value={formatMoney(summary.deposits)} sub="not revenue" active={filter === 'deposits'} onClick={() => toggle('deposits')} />
          <FilterTile tone="amber" icon={<WalletIcon size={15} />} label="Not yet with admin" value={formatMoney(summary.notWithAdmin)} sub={summary.notWithAdminCount === 1 ? '1 payment' : `${summary.notWithAdminCount} payments`} active={filter === 'not_with_admin'} onClick={() => toggle('not_with_admin')} />
          <FilterTile tone="neutral" icon={<Check size={15} strokeWidth={2.5} />} label="Checked" value={`${summary.checked} / ${summary.total}`} sub={summary.left > 0 ? `show ${summary.left} left` : 'all checked'} active={filter === 'unchecked'} onClick={() => toggle('unchecked')} />
        </FilterTileRow>
      ))}

      {showFigures && (
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Search booking, customer or plate" className="mt-4 max-w-[420px]" />
          <div className="mt-3">
            {loading ? <div className="rounded-xl border border-subtle bg-surface"><SkeletonRows count={5} /></div>
              : visible.length === 0 ? (
                <p className="rounded-xl border border-subtle bg-surface px-4 py-8 text-center text-[13.5px] text-black/45">
                  {rows.length === 0 ? 'No bookings or extensions were created this month.' : filter === 'unchecked' && !query ? 'Every row is checked.' : 'No rows in this view.'}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-subtle bg-surface">
                  <table className="w-full min-w-[1100px] text-[12.5px]">
                    <thead>
                      <tr className="border-b border-subtle">
                        {HEADERS.map((column) => <SortHeader key={column.key} columns={[column]} sort={sort} end={column.end} />)}
                        <th scope="col" aria-sort={sort.key === 'checked' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('whitespace-nowrap px-2 py-1.5 text-start text-[11.5px] font-medium', CHECKED_CELL)}>
                          <button type="button" onClick={() => sort.sortBy('checked')} className={cn('inline-flex min-h-[28px] items-center gap-1', sort.key === 'checked' ? 'font-semibold text-primary' : 'text-black/45 hover:text-foreground')}>Checked</button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => {
                        const place = rowPlace(row);
                        const first = row.payments[0];
                        const more = row.payments.length - 1;
                        const expanded = open.has(row.event_id);
                        const who = row.checked_by ? people[row.checked_by] ?? (row.checked_by === profile?.id ? profile : null) : null;
                        return (
                          <React.Fragment key={row.event_id}>
                            <tr className={cn('border-b border-subtle', expanded && 'bg-black/[0.015]')}>
                              <td className="px-2 py-2">
                                <span className="flex flex-wrap items-center gap-1">
                                  <span className="whitespace-nowrap font-mono text-[12px] font-semibold text-foreground">{bookingLabel(row)}</span>
                                  {row.kind === 'extension' && <span className="whitespace-nowrap rounded-full bg-[#8B5CF6]/[0.12] px-1.5 py-0.5 text-[11.5px] font-medium text-[#5B21B6]">Ext #{row.event_no}</span>}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <span className="block font-medium text-foreground">{row.kind === 'new' ? 'New' : 'Extension'}</span>
                                <span className="block whitespace-nowrap text-[11.5px] text-black/50">{periodLabel(row)}</span>
                              </td>
                              <td className="max-w-[120px] px-2 py-2 text-black/70"><span className="line-clamp-2 break-words">{row.customer_name || '—'}</span></td>
                              <td className="px-2 py-2">{row.plate ? <LicensePlate plate={row.plate} /> : <span className="text-black/25">—</span>}</td>
                              <Money value={row.rental_amount} className="font-medium text-foreground" />
                              <Money value={row.paid} className="text-black/70" />
                              <Money value={row.deposit} className="text-black/70" />
                              <td className="whitespace-nowrap px-2 py-2 text-end tabular-nums">
                                {row.rental_amount === 0 && row.remaining === 0
                                  ? <span title="This booking has no rental line in the ledger" className="text-[12px] text-black/40">No rental</span>
                                  : <Remaining amount={row.remaining} />}
                              </td>
                              <td className="px-2 py-2">
                                {first ? (
                                  <span className="flex items-center gap-1">
                                    <FirstPlace payment={first} />
                                    {more > 0 && (
                                      <button type="button" aria-expanded={expanded} aria-label={`${more} more ${more === 1 ? 'payment' : 'payments'} on ${bookingLabel(row)}`} onClick={() => expand(row.event_id)} className="inline-flex min-h-[44px] items-center gap-0.5 whitespace-nowrap px-1 text-[12px] font-semibold text-primary hover:underline xl:min-h-[28px]">
                                        +{more}{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                      </button>
                                    )}
                                  </span>
                                ) : <span className="text-black/25">—</span>}
                                {first?.ref && <span className="mt-0.5 block whitespace-nowrap font-mono text-[11.5px] text-black/50">{first.ref}</span>}
                              </td>
                              <td className="px-2 py-2">{place ? <PlacePill place={place} title={first ? nowLabel(first) : undefined} /> : <span className="text-black/25">—</span>}</td>
                              <td className={cn('px-2 py-1', CHECKED_CELL)}>
                                <span className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    aria-pressed={Boolean(row.checked_at)}
                                    aria-label={`Checked ${bookingLabel(row)}${row.kind === 'extension' ? ` extension ${row.event_no}` : ''}`}
                                    disabled={!canTick}
                                    onClick={() => tick(row)}
                                    className="-my-1 grid h-11 w-11 shrink-0 place-items-center disabled:cursor-not-allowed xl:h-8 xl:w-8"
                                  >
                                    <span className={cn('grid h-[20px] w-[20px] place-items-center rounded-md border-[1.5px] transition-colors', row.checked_at ? 'border-[#16A34A] bg-[#16A34A] text-white' : 'border-black/20 bg-white', !canTick && 'opacity-60')}>
                                      {row.checked_at && <Check size={13} strokeWidth={3} />}
                                    </span>
                                  </button>
                                  {row.checked_at && (
                                    <span className="flex flex-col items-start gap-0.5 whitespace-nowrap text-[11px] leading-none tabular-nums text-black/50" title={name(row.checked_by)}>
                                      <StaffAvatar profile={who} size={20} />
                                      {stampLabel(row.checked_at)}
                                    </span>
                                  )}
                                </span>
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="border-b border-subtle bg-black/[0.015]">
                                <td colSpan={11} className="px-3 py-1">
                                  <ul className="max-w-[720px] divide-y divide-black/[0.05]">
                                    {row.payments.map((payment, index) => <PaymentRow key={`${payment.date}-${index}`} payment={payment} />)}
                                  </ul>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold text-foreground">
                        <td colSpan={4} className="px-2 py-2.5">Total ({totals.total} {totals.total === 1 ? 'row' : 'rows'})</td>
                        <Money value={totals.revenue} />
                        <Money value={totals.collected} />
                        <Money value={totals.deposits} />
                        <td className="whitespace-nowrap px-2 py-2.5 text-end tabular-nums"><Remaining amount={totals.outstanding} /></td>
                        <td colSpan={2} />
                        <td className={cn('whitespace-nowrap px-2 py-2.5 tabular-nums text-black/55', CHECKED_CELL)}>{totals.checked} / {totals.total}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
          </div>
        </>
      )}

      {closingSheet && (
        <ReasonSheet
          title={`Close ${monthLabel(`${month}-01`)}?`}
          description={`All ${summary.total} rows are checked. Closing locks the ticks until someone reopens the month.${month === currentMonth().slice(0, 7) ? " This month isn't over yet, so anything created later needs a reopen to be ticked." : ''}`}
          label="Note (optional)"
          confirmLabel="Close month"
          optional
          onClose={() => setClosingSheet(false)}
          onConfirm={async (note) => {
            await closeMonth(month, true, note || null);
            setClosingSheet(false);
            toast.success('Month closed.');
            refresh();
          }}
        />
      )}
      <ConfirmDialog state={confirm} pending={confirming} onCancel={() => setConfirm(null)} onConfirm={runConfirm} />
      <MediaToaster />
    </div>
  );
};
