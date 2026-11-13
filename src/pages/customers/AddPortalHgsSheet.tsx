import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import { Button, Spinner } from '../../components/media/MediaUI';
import { formatDate } from '../../lib/customers';
import type { WalletCard } from '../../lib/customerWallet';
import {
  applyCustomerHgs,
  fetchPortalFreshness,
  outsideTotals,
  previewCustomerHgs,
  previewTotals,
  suggestedFrom,
  type PortalFreshness,
  type PortalTransit,
} from '../../lib/hgsPortalPosting';
import { cn } from '../../lib/media/badgeColor';
import { formatInCurrency } from '../../lib/money';
import { BookingSheet, FOOTER_BUTTON, Field, INPUT, LicensePlate, Notice, PrimaryButton } from '../bookings/ui';

/** Lira only: HGS is charged and stored in TL, and this sheet never shows another currency. */
const lira = (amount: number) => formatInCurrency(amount, 'TRY');
const dotted = (day: string) => day.slice(0, 10).split('-').reverse().join('.');
const stamp = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

/** Three days without a fresh portal file and the banner asks for one first. */
const STALE_DAYS = 3;
/** A date being typed reads once it settles, not on every keystroke. */
const PREVIEW_DELAY_MS = 300;
const transitsWord = (count: number) => (count === 1 ? 'transit' : 'transits');

/**
 * Charges the booking's customer its car's portal transits from "From" to "To", in lira.
 * Both dates are free and only To before From is refused. Each row says if it is outside
 * the booking or on another booking's days, and charging rows outside the booking asks
 * first. It reads with `preview_customer_hgs` and writes only on confirm, with
 * `apply_customer_hgs` on the same dates, which marks each transit so a second run finds nothing.
 */
export const AddPortalHgsSheet: React.FC<{
  card: WalletCard;
  onClose: () => void;
  onPosted: (message: string) => void;
}> = ({ card, onClose, onPosted }) => {
  const booking = { startDate: card.startDate, endDate: card.endDate };
  const typedHgs = useMemo(() => card.lines.filter((line) => line.kind === 'hgs' && !line.hgs?.pass), [card.lines]);
  const suggestion = suggestedFrom(booking, typedHgs);
  const [from, setFrom] = useState(card.startDate);
  const [to, setTo] = useState(card.endDate);
  const [transits, setTransits] = useState<PortalTransit[] | null>(null);
  const [freshness, setFreshness] = useState<PortalFreshness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [askOutside, setAskOutside] = useState(false);
  const firstRead = useRef(true);
  const backwards = from !== '' && to !== '' && from > to;

  useEffect(() => {
    let active = true;
    fetchPortalFreshness(card.carId).then((result) => { if (active) setFreshness(result); }).catch(() => { if (active) setFreshness({ lastUpload: null, lastTransit: null }); });
    return () => { active = false; };
  }, [card.carId]);

  useEffect(() => {
    let active = true;
    setTransits(null);
    setError(null);
    if (backwards) {
      setTransits([]);
      return () => { active = false; };
    }
    const delay = firstRead.current ? 0 : PREVIEW_DELAY_MS;
    firstRead.current = false;
    const timer = window.setTimeout(() => {
      previewCustomerHgs(card.id, from, to)
        .then((rows) => { if (active) setTransits(rows); })
        .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    }, delay);
    return () => { active = false; window.clearTimeout(timer); };
  }, [card.id, from, to, backwards]);

  const totals = previewTotals(transits ?? []);
  const outside = outsideTotals(transits ?? []);
  const onOtherBooking = (transits ?? []).filter((transit) => transit.otherBooking).length;
  const nothing = transits !== null && transits.length === 0;
  const stale = freshness?.lastUpload ? (Date.now() - Date.parse(freshness.lastUpload)) / 86_400_000 > STALE_DAYS : false;

  const apply = async () => {
    if (!transits || nothing || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await applyCustomerHgs(card.id, from, to);
      onPosted(result.count > 0
        ? `${result.count} HGS ${result.count === 1 ? 'transit' : 'transits'} added · ${lira(result.total)}`
        : 'No new transits to add: they were already charged.');
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setSaving(false);
      setAskOutside(false);
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!transits || nothing || saving) return;
    if (outside.count > 0) setAskOutside(true);
    else void apply();
  };

  return (
    <BookingSheet
      label="Add HGS from portal"
      title="Add HGS from portal"
      badge={<><LicensePlate plate={card.plate} className="[&>span:last-child]:text-[13px]" /><span className="font-mono text-[13px] font-medium text-black/55">{card.bookingNumber}</span></>}
      narrow
      dirty={false}
      paused={askOutside}
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
      footer={(requestClose) => (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="w-full text-center text-[12.5px] text-black/55 sm:w-auto sm:text-start">
            {transits && !nothing ? <><span className="font-semibold tabular-nums text-foreground">{totals.count}</span> new · <span className="font-mono font-semibold text-foreground">{lira(totals.total)}</span></> : ' '}
          </span>
          <div className="ms-auto flex flex-1 justify-end gap-2 sm:flex-none">
            <Button type="button" variant="outline" size="lg" className={cn(FOOTER_BUTTON, 'flex-1 px-4 sm:flex-none')} disabled={saving} onClick={requestClose}>Cancel</Button>
            <PrimaryButton saving={saving} disabled={!transits || nothing}>
              {saving ? 'Adding…' : nothing || !transits ? 'Add transits' : `Add ${totals.count} ${totals.count === 1 ? 'transit' : 'transits'} (${lira(totals.total)})`}
            </PrimaryButton>
          </div>
        </div>
      )}
    >
      {freshness && (
        <Notice tone={stale || !freshness.lastUpload ? 'amber' : 'blue'}>
          {freshness.lastUpload ? (
            <>Bu aracın HGS verisi en son <strong>{stamp.format(Date.parse(freshness.lastUpload))}</strong> yüklendi · kayıttaki son geçiş <strong>{freshness.lastTransit ? dotted(freshness.lastTransit) : '—'}</strong>.</>
          ) : (
            <>Bu araç için henüz HGS portal verisi yüklenmedi.</>
          )}
          {stale && <span className="mt-1 block">The file is over {STALE_DAYS} days old: upload a fresh one first if the car has driven since.</span>}
        </Notice>
      )}

      {typedHgs.length > 0 && (
        <Notice tone="amber">
          <span>This booking already has HGS typed by hand: {typedHgs.map((line) => `${line.description?.trim() || 'HGS'} (${lira(line.amount)})`).join(', ')}.</span>
          {suggestion !== from && (
            <span className="mt-1.5 flex flex-wrap items-center gap-2">
              Start after it:
              <button type="button" className="inline-flex h-11 items-center rounded-full bg-white px-3 text-[12.5px] font-semibold text-[#92400E] ring-1 ring-[#F59E0B]/40 hover:bg-[#FEF3C7] md:h-7" onClick={() => setFrom(suggestion)}>
                From {dotted(suggestion)}
              </button>
            </span>
          )}
        </Notice>
      )}

      <section className="surface-depth rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <Field label="From" hint={`Booking starts ${formatDate(card.startDate)}`}>
            <input aria-label="From" type="date" className={INPUT} value={from} onChange={(event) => setFrom(event.target.value || card.startDate)} />
          </Field>
          <Field label="To" hint={`The booking's last day ${formatDate(card.endDate)}`}>
            <input aria-label="To" type="date" className={INPUT} value={to} onChange={(event) => setTo(event.target.value || card.endDate)} />
          </Field>
        </div>
        <p className="mt-3 text-[12px] text-black/50">Any range works. Transits outside this booking are marked and asked about before they're charged; ones already added are skipped.</p>
      </section>

      {error && <Notice tone="red">{error}</Notice>}

      {!transits && !error ? (
        <div className="flex items-center justify-center py-12" role="status" aria-label="Loading transits"><Spinner size={20} /></div>
      ) : nothing ? (
        <p className="rounded-2xl border border-subtle bg-surface px-4 py-8 text-center text-[13.5px] text-black/55">{backwards ? 'From is after To.' : 'No new transits to add.'}</p>
      ) : transits && (
        <section aria-label="Transits to add" className="overflow-hidden rounded-2xl border border-subtle bg-surface">
          <p className="flex flex-wrap items-center gap-x-1.5 border-b border-subtle bg-[#F8F9FB] px-4 py-2.5 text-[13px] text-black/55">
            <span><span className="font-semibold tabular-nums text-foreground">{totals.count}</span> {transitsWord(totals.count)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-semibold tabular-nums text-foreground">{lira(totals.total)}</span>
            <span aria-hidden="true">·</span>
            <span className={outside.count > 0 ? 'font-medium text-[#92400E]' : undefined}><span className="tabular-nums">{outside.count}</span> outside this booking</span>
          </p>
          <ul className="max-h-[46vh] divide-y divide-black/[0.05] overflow-y-auto">
            {transits.map((transit) => (
              <li key={transit.id} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                <span className="w-[84px] shrink-0 font-mono tabular-nums text-black/60">{dotted(transit.day)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground">{transit.note.replace(/^\d{2}-\d{2}-\d{4}\s*/, '')}</span>
                  {(transit.outsideBooking || transit.otherBooking || transit.roadType === 'private') && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {transit.outsideBooking && <span className="rounded-full bg-[#FEF3C7] px-2 py-px text-[11px] font-medium text-[#92400E]">Outside this booking</span>}
                      {transit.otherBooking && <span className="rounded-full bg-[#FEE2E2] px-2 py-px text-[11px] font-medium text-[#B91C1C]">On <span className="font-mono">{transit.otherBooking}</span>'s dates</span>}
                      {transit.roadType === 'private' && <span className="rounded-full bg-[#F1EBFD] px-2 py-px text-[11px] font-medium text-[#5B21B6]">Private</span>}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono font-medium tabular-nums text-[#B91C1C]">{lira(transit.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        state={askOutside ? {
          title: 'Charge transits outside this booking?',
          description: `${outside.count} of the ${totals.count} ${transitsWord(totals.count)} (${lira(outside.total)}) ${outside.count === 1 ? 'is' : 'are'} outside this booking's dates.`,
          consequence: onOtherBooking > 0 ? `${onOtherBooking} ${onOtherBooking === 1 ? 'falls' : 'fall'} on another booking's dates.` : undefined,
          confirmLabel: `Add ${totals.count} ${transitsWord(totals.count)} (${lira(totals.total)})`,
          pendingLabel: 'Adding…',
          onConfirm: apply,
        } : null}
        pending={saving}
        onCancel={() => setAskOutside(false)}
        onConfirm={() => { void apply(); }}
      />
    </BookingSheet>
  );
};
