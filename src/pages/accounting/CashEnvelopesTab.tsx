import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check } from '../../components/media/MediaIcons';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button, Select, Spinner } from '../../components/media/MediaUI';
import { ComplianceTriangle } from '../../components/shared/ComplianceBits';
import { FilterTile, FilterTileRow, FilterTileSkeleton, type FilterTileTone } from '../../components/shared/FilterTile';
import { LoadError, SkeletonRows } from '../../components/shared/PageBits';
import { ReasonSheet } from '../../components/shared/ReasonSheet';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import { fetchCashAccounts, KIND_LABELS as ACCOUNT_KIND_LABELS, type AccountKind, type CashAccount } from '../../lib/cashAccounts';
import {
  accountFilter,
  adminReceiveEnvelopes,
  ageLabel,
  balancesOf,
  canComplete,
  canReverse,
  completeMovement,
  ENVELOPE_LABELS,
  fetchAccountBalances,
  fetchEnvelopes,
  fetchMovements,
  inEnvelopeFilter,
  inMovementFilter,
  isOverdue,
  KIND_LABELS,
  posPending,
  reverseMovement,
  withStaff,
  type AccountBalance,
  type CurrencyTotal,
  type Envelope,
  type EnvelopeStatus,
  type Movement,
  type MovementKind,
} from '../../lib/cashEnvelopes';
import { formatDate, istanbulDate } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import { formatMoney } from '../../lib/money';
import { getAvatarProfiles, type ProfileOption } from '../../lib/notifications';
import { LicensePlate } from '../bookings/ui';
import { WalletIcon } from '../customers/ui';
import { AccountsSection } from './AccountsSection';
import { ReceiveEnvelopeSheet, TransferSheet } from './EnvelopeSheets';

const TONES: Record<AccountKind, FilterTileTone> = { safe: 'teal', pos: 'violet', bank: 'green', gateway: 'green', custody: 'neutral', other: 'neutral' };
const STATUS_PILL: Record<EnvelopeStatus, string> = {
  with_employee: 'bg-[#F59E0B]/[0.16] text-[#92400E]',
  in_safe: 'bg-[#14B8A6]/15 text-[#115E59]',
  with_admin: 'bg-[#16A34A]/10 text-[#15803D]',
  cancelled: 'bg-black/[0.06] text-black/50',
};

const ALL = 'all';

/** The first currency is the big figure on a tile, and any others go below it. */
function tileFigures(totals: CurrencyTotal[], fallback: string) {
  const [first, ...rest] = totals;
  return {
    value: first ? formatMoney(first.total, first.currency) : formatMoney(0),
    sub: rest.length > 0 ? rest.map((row) => formatMoney(row.total, row.currency)).join(' · ') : fallback,
  };
}

const AccountChip: React.FC<{ id: number | null; names: Map<number, string>; empty: string }> = ({ id, names, empty }) => (
  <span className="inline-block max-w-[120px] truncate rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[12px] text-black/60" title={id ? names.get(id) : empty}>
    {id ? names.get(id) ?? '—' : empty}
  </span>
);

const Amount: React.FC<{ row: Movement }> = ({ row }) => (
  <span className="whitespace-nowrap text-end">
    <span className="block font-semibold tabular-nums text-foreground">{formatMoney(row.amount, row.currency)}</span>
    {row.currency !== 'TRY' && row.amount_try !== null && <span className="block text-[11.5px] tabular-nums text-black/45">{formatMoney(row.amount_try)}</span>}
  </span>
);

const EnvelopeStatusPill: React.FC<{ envelope: Envelope; now: number }> = ({ envelope, now }) => (
  <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium', isOverdue(envelope, now) ? 'bg-[#DC2626]/10 text-[#B91C1C]' : STATUS_PILL[envelope.status])}>
    {ENVELOPE_LABELS[envelope.status]}
  </span>
);

const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <section aria-label={title} className="mt-5 max-w-[1100px]">
    <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[15px] font-medium text-foreground">{title}</h2>
      {action}
    </header>
    {children}
  </section>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="rounded-xl border border-subtle bg-surface px-4 py-8 text-center text-[13.5px] text-black/45">{children}</p>
);

export const CashEnvelopesTab: React.FC = () => {
  const wide = useMediaQuery('(min-width: 1280px)');
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [people, setPeople] = useState<Record<string, ProfileOption>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [receiving, setReceiving] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [reversing, setReversing] = useState<Movement | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountPick, setAccountPick] = useState(ALL);
  const [kindPick, setKindPick] = useState(ALL);
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');

  const filters = useMemo(() => ['staff', 'pos', ...accounts.map((account) => accountFilter(account.id))], [accounts]);
  const { filter, toggle, clear } = useUrlFilter(filters);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([fetchCashAccounts(), fetchAccountBalances(), fetchEnvelopes(), fetchMovements()])
      .then(async ([accountRows, balanceRows, envelopeRows, movementRows]) => {
        const ids = [...envelopeRows.map((row) => row.holder_profile_id), ...movementRows.map((row) => row.created_by)];
        const profiles = await getAvatarProfiles(Array.from(new Set(ids.filter((id): id is string => Boolean(id)))));
        if (cancelled) return;
        setAccounts(accountRows);
        setBalances(balanceRows);
        setEnvelopes(envelopeRows);
        setMovements(movementRows);
        setPeople(profiles);
        setNow(Date.now());
      })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const names = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  const staff = useMemo(() => withStaff(envelopes, now), [envelopes, now]);
  const pending = useMemo(() => posPending(movements), [movements]);

  const shownAccounts = useMemo(() => [...accounts].filter((account) => account.is_active).sort((a, b) => Number(a.is_final) - Number(b.is_final)), [accounts]);
  const visibleEnvelopes = useMemo(() => envelopes.filter((envelope) => inEnvelopeFilter(envelope, filter)), [envelopes, filter]);
  const visibleMovements = useMemo(() => movements.filter((row) => inMovementFilter(row, filter, {
    accountId: accountPick === ALL ? null : Number(accountPick),
    kind: kindPick === ALL ? null : kindPick as MovementKind,
    from: fromDay || null,
    to: toDay || null,
  }, istanbulDate)), [movements, filter, accountPick, kindPick, fromDay, toDay]);

  const pickedIds = Array.from(picked).filter((id) => envelopes.some((envelope) => envelope.id === id && envelope.status === 'in_safe'));

  const adminTake = async () => {
    setBusy(true);
    try {
      const count = await adminReceiveEnvelopes(pickedIds);
      setPicked(new Set());
      toast.success(count === 1 ? '1 envelope received.' : `${count} envelopes received.`);
      refresh();
    } catch (failure) {
      toast.error(`Couldn't receive them: ${failure instanceof Error ? failure.message : 'try again'}`);
    } finally {
      setBusy(false);
    }
  };

  const arrive = async (row: Movement) => {
    try {
      await completeMovement(row.id);
      toast.success('Marked as arrived at the bank.');
      refresh();
    } catch (failure) {
      toast.error(`Couldn't mark it: ${failure instanceof Error ? failure.message : 'try again'}`);
    }
  };

  const pick = (id: number, on: boolean) => setPicked((current) => {
    const next = new Set(current);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });

  const movementActions = (row: Movement) => (
    <span className="flex items-center justify-end gap-2 whitespace-nowrap">
      {canComplete(row) && <Button variant="outline" size="lg" className="!h-11 px-2.5 xl:!h-8" onClick={() => arrive(row)}>Arrived at bank</Button>}
      {canReverse(row, movements) && <button type="button" onClick={() => setReversing(row)} className="min-h-[44px] text-[12.5px] font-medium text-[#B91C1C] hover:underline xl:min-h-[32px]">Reverse</button>}
    </span>
  );

  const pickBox = (envelope: Envelope) => (envelope.status === 'in_safe' ? (
    <label className="-m-1.5 grid h-11 w-11 cursor-pointer place-items-center xl:h-8 xl:w-8">
      <input type="checkbox" checked={picked.has(envelope.id)} aria-label={`Select ${envelope.ref}`} onChange={(event) => pick(envelope.id, event.target.checked)} className="h-[18px] w-[18px] accent-[#4ba6ea]" />
    </label>
  ) : null);

  const staffFigures = tileFigures(staff.totals, staff.count === 1 ? '1 envelope' : `${staff.count} envelopes`);
  const posFigures = tileFigures(pending.totals, pending.next ? `next ${formatDate(pending.next)}` : 'nothing pending');

  return (
    <div className="media-scope">
      {error && <LoadError message={`Couldn't load cash and envelopes: ${error}`} onRetry={() => { setLoading(true); refresh(); }} />}

      {loading ? <FilterTileSkeleton count={8} /> : (
        <FilterTileRow label="Filter by account">
          <FilterTile tone="blue" icon={<WalletIcon size={15} />} label="All" value={String(envelopes.length)} sub={envelopes.length === 1 ? 'envelope' : 'envelopes'} active={filter === 'all'} onClick={clear} />
          {shownAccounts.map((account) => {
            const held = balancesOf(balances, account.id);
            const figures = tileFigures(held, account.is_final ? 'final account' : held.length === 0 ? 'empty' : ACCOUNT_KIND_LABELS[account.kind]);
            return (
              <FilterTile
                key={account.id}
                tone={account.is_final ? 'blue' : TONES[account.kind]}
                icon={<WalletIcon size={15} />}
                label={account.is_final ? `★ ${account.name}` : account.name}
                value={figures.value}
                sub={figures.sub}
                active={filter === accountFilter(account.id)}
                onClick={() => toggle(accountFilter(account.id))}
              />
            );
          })}
          <FilterTile
            tone={staff.overdue ? 'red' : 'amber'}
            bareIcon={staff.overdue}
            icon={staff.overdue ? <ComplianceTriangle tone="red" size={32} /> : <WalletIcon size={15} />}
            label="Envelopes with staff"
            value={staffFigures.value}
            sub={staff.totals.length > 1 ? staffFigures.sub : staff.count === 1 ? '1 envelope' : `${staff.count} envelopes`}
            active={filter === 'staff'}
            onClick={() => toggle('staff')}
          />
          <FilterTile tone="neutral" icon={<WalletIcon size={15} />} label="POS pending" value={posFigures.value} sub={posFigures.sub} active={filter === 'pos'} onClick={() => toggle('pos')} />
        </FilterTileRow>
      )}

      <div className="mt-4 flex max-w-[1100px] flex-wrap items-center gap-2">
        <Button size="lg" className="!h-11 px-4 md:!h-10" onClick={() => setReceiving(true)}>Receive envelope</Button>
        <Button variant="outline" size="lg" className="!h-11 px-4 md:!h-10" onClick={() => setTransferring(true)}>Transfer</Button>
        <a href="#cash-accounts" onClick={(event) => { event.preventDefault(); document.getElementById('cash-accounts')?.scrollIntoView({ behavior: 'smooth' }); }} className="inline-flex min-h-[44px] items-center px-2 text-[13px] font-medium text-primary hover:underline md:min-h-[40px]">Manage accounts</a>
      </div>

      <Section
        title="Envelopes"
        action={pickedIds.length > 0 && (
          <Button size="lg" className="!h-11 px-3 md:!h-9" disabled={busy} onClick={adminTake}>
            {busy ? <Spinner size={13} /> : <Check size={14} strokeWidth={2.5} />} Received by admin ({pickedIds.length})
          </Button>
        )}
      >
        {loading ? <div className="rounded-xl border border-subtle bg-surface"><SkeletonRows count={3} /></div>
          : visibleEnvelopes.length === 0 ? <Empty>{envelopes.length === 0 ? 'No envelopes yet. One is made each time cash is taken.' : 'No envelopes in this view.'}</Empty>
            : wide ? (
              <div className="overflow-x-auto rounded-xl border border-subtle bg-surface">
                <table className="w-full min-w-[900px] text-[13px]">
                  <thead>
                    <tr className="border-b border-subtle text-[11.5px] text-black/45">
                      <th scope="col" className="w-9"><span className="sr-only">Select</span></th>
                      {['Envelope', 'Staff', 'Customer', 'Car'].map((label) => <th key={label} scope="col" className="px-2 py-1.5 text-start font-medium">{label}</th>)}
                      <th scope="col" className="px-2 py-1.5 text-end font-medium">Amount</th>
                      <th scope="col" className="px-2 py-1.5 text-start font-medium">Age</th>
                      <th scope="col" className="px-2 py-1.5 text-start font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEnvelopes.map((envelope) => (
                      <tr key={envelope.id} className="border-b border-subtle last:border-b-0">
                        <td className="ps-2">{pickBox(envelope)}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono text-[12.5px] font-semibold text-foreground">{envelope.ref}</td>
                        <td className="px-2 py-2">
                          <span className="flex items-center gap-2">
                            <StaffAvatar profile={envelope.holder_profile_id ? people[envelope.holder_profile_id] : null} size={26} />
                            <span className="truncate text-black/60">{envelope.holder_profile_id ? people[envelope.holder_profile_id]?.full_name : '—'}</span>
                          </span>
                        </td>
                        <td className="max-w-[160px] truncate px-2 py-2 text-black/60">{envelope.customer ?? '—'}</td>
                        <td className="px-2 py-2">{envelope.plate ? <LicensePlate plate={envelope.plate} /> : <span className="text-black/25">—</span>}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-end font-semibold tabular-nums text-foreground">
                          {formatMoney(envelope.counted_amount ?? envelope.amount, envelope.currency)}
                          {!!envelope.difference && <span className="block text-[11.5px] font-medium text-[#B91C1C]" title={envelope.difference_note ?? undefined}>{envelope.difference > 0 ? '+' : ''}{formatMoney(envelope.difference, envelope.currency)}</span>}
                        </td>
                        <td className={cn('whitespace-nowrap px-2 py-2 tabular-nums', isOverdue(envelope, now) ? 'font-medium text-[#B91C1C]' : 'text-black/55')}>{ageLabel(envelope.created_at, now)}</td>
                        <td className="px-2 py-2"><EnvelopeStatusPill envelope={envelope} now={now} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {visibleEnvelopes.map((envelope) => (
                  <li key={envelope.id} className="min-w-0 rounded-xl border border-subtle bg-surface p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        {pickBox(envelope)}
                        <span className="truncate font-mono text-[13.5px] font-semibold text-foreground">{envelope.ref}</span>
                      </span>
                      <span className="shrink-0 text-[16px] font-semibold tabular-nums text-foreground">{formatMoney(envelope.counted_amount ?? envelope.amount, envelope.currency)}</span>
                    </div>
                    <p className="mt-1 truncate text-[13px] text-black/60">{[envelope.holder_profile_id ? people[envelope.holder_profile_id]?.full_name : null, envelope.customer].filter(Boolean).join(' · ') || '—'}</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      {envelope.plate ? <LicensePlate plate={envelope.plate} /> : <span />}
                      <span className="flex items-center gap-2 text-[12.5px] tabular-nums text-black/55">
                        {ageLabel(envelope.created_at, now)}
                        <EnvelopeStatusPill envelope={envelope} now={now} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
      </Section>

      <Section title="Movements">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="w-full sm:w-[190px]">
            <Select value={accountPick} options={[{ value: ALL, label: 'All accounts' }, ...accounts.map((account) => ({ value: String(account.id), label: account.name }))]} size="lg" ariaLabel="Filter by account" onChange={setAccountPick} />
          </div>
          <div className="w-full sm:w-[190px]">
            <Select value={kindPick} options={[{ value: ALL, label: 'All kinds' }, ...(Object.keys(KIND_LABELS) as MovementKind[]).map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))]} size="lg" ariaLabel="Filter by kind" onChange={setKindPick} />
          </div>
          <input type="date" aria-label="From date" value={fromDay} onChange={(event) => setFromDay(event.target.value)} className="h-11 min-w-0 flex-1 rounded-[10px] border border-[#E5E7EB] bg-white px-2 text-[13.5px] sm:w-[150px] sm:flex-none md:h-10" />
          <input type="date" aria-label="To date" value={toDay} onChange={(event) => setToDay(event.target.value)} className="h-11 min-w-0 flex-1 rounded-[10px] border border-[#E5E7EB] bg-white px-2 text-[13.5px] sm:w-[150px] sm:flex-none md:h-10" />
        </div>

        {loading ? <div className="rounded-xl border border-subtle bg-surface"><SkeletonRows count={3} /></div>
          : visibleMovements.length === 0 ? <Empty>{movements.length === 0 ? 'No movements yet.' : 'No movements in this view.'}</Empty>
            : wide ? (
              <div className="overflow-x-auto rounded-xl border border-subtle bg-surface">
                <table className="w-full min-w-[980px] text-[13px]">
                  <thead>
                    <tr className="border-b border-subtle text-[11.5px] text-black/45">
                      {['Ref', 'Date', 'Kind', 'From → to'].map((label) => <th key={label} scope="col" className="px-2 py-1.5 text-start font-medium">{label}</th>)}
                      <th scope="col" className="px-2 py-1.5 text-end font-medium">Amount</th>
                      <th scope="col" className="px-2 py-1.5 text-start font-medium">By</th>
                      <th scope="col" className="px-2 py-1.5 text-start font-medium">Note</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMovements.map((row) => (
                      <tr key={row.id} className="border-b border-subtle last:border-b-0">
                        <td className="whitespace-nowrap px-2 py-2 font-mono text-[12px] text-black/60">{row.ref}</td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums text-black/60">
                          {formatDate(istanbulDate(row.created_at))}
                          {row.status === 'pending' && row.expected_at && <span className="block text-[11.5px] text-[#92400E]">Due {formatDate(row.expected_at)}</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">{KIND_LABELS[row.kind]}</span></td>
                        <td className="px-2 py-2"><span className="flex items-center gap-1"><AccountChip id={row.from_account_id} names={names} empty="Customer" /><span className="text-black/30">→</span><AccountChip id={row.to_account_id} names={names} empty="Envelope" /></span></td>
                        <td className="px-2 py-2 text-end"><Amount row={row} /></td>
                        <td className="px-2 py-2" title={row.created_by ? people[row.created_by]?.full_name ?? undefined : undefined}><StaffAvatar profile={row.created_by ? people[row.created_by] : null} size={26} /></td>
                        <td className="max-w-[160px] truncate px-2 py-2 text-black/55" title={row.note ?? undefined}>{row.note ?? '—'}</td>
                        <td className="px-2 py-1">{movementActions(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {visibleMovements.map((row) => (
                  <li key={row.id} className="min-w-0 rounded-xl border border-subtle bg-surface p-3.5 text-[13px]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">{KIND_LABELS[row.kind]}</span>
                        <span className="mt-1 block truncate font-mono text-[12px] text-black/50">{row.ref} · {formatDate(istanbulDate(row.created_at))}</span>
                      </span>
                      <span className="shrink-0 text-[15px]"><Amount row={row} /></span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1"><AccountChip id={row.from_account_id} names={names} empty="Customer" /><span className="text-black/30">→</span><AccountChip id={row.to_account_id} names={names} empty="Envelope" /></div>
                    {row.note && <p className="mt-1.5 break-words text-[12.5px] text-black/55">{row.note}</p>}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <StaffAvatar profile={row.created_by ? people[row.created_by] : null} size={24} />
                      {movementActions(row)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
      </Section>

      {!loading && <AccountsSection accounts={accounts} balances={balances} onChange={setAccounts} />}

      {receiving && (
        <ReceiveEnvelopeSheet
          envelopes={envelopes}
          accounts={accounts}
          onClose={() => setReceiving(false)}
          onDone={(ref) => { setReceiving(false); toast.success(`${ref} received.`); refresh(); }}
        />
      )}
      {transferring && (
        <TransferSheet
          accounts={accounts}
          balances={balances}
          onClose={() => setTransferring(false)}
          onDone={(ref) => { setTransferring(false); toast.success(`Transferred: ${ref}.`); refresh(); }}
        />
      )}
      {reversing && (
        <ReasonSheet
          title="Reverse this movement?"
          description={`${reversing.ref}, ${formatMoney(reversing.amount, reversing.currency)}. This only moves the money back between the accounts. It doesn't change the customer's ledger or the envelope.`}
          label="Reason"
          confirmLabel="Reverse"
          onClose={() => setReversing(null)}
          onConfirm={async (reason) => {
            await reverseMovement(reversing.id, reason);
            setReversing(null);
            toast.success('Movement reversed.');
            refresh();
          }}
        />
      )}
      <MediaToaster />
    </div>
  );
};
