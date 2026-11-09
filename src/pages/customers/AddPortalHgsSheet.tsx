import React, { useEffect, useMemo, useState } from 'react';
import { Spinner } from '../../components/media/MediaUI';
import { useCurrency } from '../../lib/CurrencyContext';
import { formatDate } from '../../lib/customers';
import type { WalletCard } from '../../lib/customerWallet';
import {
  bookingRange,
  defaultRate,
  fetchPortalPreview,
  postPortalTransits,
  previewTotals,
  routeLabel,
  suggestedFrom,
  type PortalPreviewResult,
} from '../../lib/hgsPortalPosting';
import { cn } from '../../lib/media/badgeColor';
import { formatInCurrency } from '../../lib/money';
import { BookingSheet, FOOTER_BUTTON, Field, INPUT, LicensePlate, Notice, PrimaryButton } from '../bookings/ui';
import { Button } from '../../components/media/MediaUI';

/** The database sends Istanbul wall time, "YYYY-MM-DDTHH:mm", with no zone. */
const dayOnly = (local: string) => local.slice(0, 10).split('-').reverse().join('.');
const stamp = (local: string) => `${dayOnly(local)} ${local.slice(11, 16)}`.trim();
/** Istanbul is UTC+3 all year. */
const localToMs = (local: string) => Date.parse(`${local.length === 16 ? `${local}:00` : local}+03:00`);
const lira = (amount: number) => formatInCurrency(amount, 'TRY');
const usd = (amount: number) => formatInCurrency(amount, 'USD');

/** Three days without a fresh portal file and the banner asks for one first. */
const STALE_DAYS = 3;

/**
 * Charges the booking's customer the portal transits of its car on the days it was
 * theirs. Read first, write only on Confirm; the database refuses anything already
 * posted or outside the booking, so a second click finds nothing new.
 */
export const AddPortalHgsSheet: React.FC<{
  card: WalletCard;
  onClose: () => void;
  onPosted: (message: string) => void;
}> = ({ card, onClose, onPosted }) => {
  const { rates } = useCurrency();
  const todaysRate = Number(rates.find((row) => row.currency === 'USD')?.rate_to_try) || null;
  const booking = { startDate: card.startDate, endDate: card.endDate };
  const typedHgs = useMemo(() => card.lines.filter((line) => line.kind === 'hgs' && !line.hgs?.pass), [card.lines]);
  const [from, setFrom] = useState(() => suggestedFrom(booking, typedHgs));
  const [to, setTo] = useState(card.endDate);
  const [rateText, setRateText] = useState(() => {
    const rate = defaultRate(card.lines.map((line) => line.exchange_rate_at_entry ?? null), todaysRate);
    return rate ? String(rate) : '';
  });
  /** Once the rate is typed, nothing replaces it. */
  const [rateTouched, setRateTouched] = useState(false);
  const [preview, setPreview] = useState<PortalPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const range = bookingRange(booking, from, to);
  const rate = Number(rateText.replace(',', '.'));
  const rateOk = Number.isFinite(rate) && rate > 0;

  // Today's rate can arrive after the sheet opens.
  useEffect(() => {
    if (!rateTouched && !rateText && todaysRate) setRateText(String(todaysRate));
  }, [todaysRate, rateText, rateTouched]);

  useEffect(() => {
    let active = true;
    setPreview(null);
    setError(null);
    fetchPortalPreview(card.id, range.from, range.to)
      .then((result) => {
        if (!active) return;
        setPreview(result);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [card.id, range.from, range.to]);

  // The booking's own newest rate, as the database reads it, beats today's until one is typed.
  const rateHint = preview?.rateHint ?? null;
  useEffect(() => {
    if (!rateTouched && rateHint) setRateText(String(rateHint));
  }, [rateHint, rateTouched]);

  const totals = previewTotals(preview?.transits ?? [], rateOk ? rate : null);
  const stale = preview?.lastUpload ? (Date.now() - localToMs(preview.lastUpload)) / 86_400_000 > STALE_DAYS : false;
  const nothing = preview !== null && preview.transits.length === 0;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!preview || nothing || !rateOk || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await postPortalTransits(card.id, range.from, range.to, rate);
      const extra = result.posted > preview.transits.length ? ` (${result.posted - preview.transits.length} arrived after the preview)` : '';
      onPosted(result.posted > 0
        ? `${result.posted} HGS ${result.posted === 1 ? 'pass' : 'passes'} added · ${lira(result.totalTl)}${extra}`
        : 'Nothing new to add: these passes were already charged.');
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BookingSheet
      label="Add HGS from portal"
      title="Add HGS from portal"
      badge={<LicensePlate plate={card.plate} className="[&>span:last-child]:text-[13px]" />}
      subtitle={<span className="font-mono">{card.bookingNumber}</span>}
      narrow
      dirty={false}
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
      footer={(requestClose) => (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="w-full text-center text-[12.5px] text-black/55 sm:w-auto sm:text-start">
            {preview && !nothing ? <><span className="font-semibold tabular-nums text-foreground">{totals.count}</span> new · <span className="font-mono font-semibold text-foreground">{lira(totals.tl)}</span>{totals.usd !== null && <> · <span className="font-mono">{usd(totals.usd)}</span></>}</> : ' '}
          </span>
          <div className="ms-auto flex flex-1 justify-end gap-2 sm:flex-none">
            <Button type="button" variant="outline" size="lg" className={cn(FOOTER_BUTTON, 'flex-1 px-4 sm:flex-none')} disabled={saving} onClick={requestClose}>Cancel</Button>
            <PrimaryButton saving={saving} disabled={!preview || nothing || !rateOk}>
              {saving ? 'Adding…' : nothing ? 'Nothing to add' : `Add ${totals.count} ${totals.count === 1 ? 'pass' : 'passes'}`}
            </PrimaryButton>
          </div>
        </div>
      )}
    >
      {preview && (
        <Notice tone={stale ? 'amber' : 'blue'}>
          {preview.lastUpload ? (
            <>Bu aracın ({card.plate ?? '—'}) HGS verisi en son <strong>{stamp(preview.lastUpload)}</strong> yüklendi. Kayıttaki son geçiş: <strong>{preview.lastTransit ? dayOnly(preview.lastTransit) : '—'}</strong>.</>
          ) : (
            <>Bu araç ({card.plate ?? '—'}) için henüz HGS portal verisi yüklenmedi.</>
          )}
          {stale && <span className="mt-1 block">The file is over {STALE_DAYS} days old: upload a fresh one first if the car has driven since.</span>}
        </Notice>
      )}

      {preview && preview.investorCount > 0 && (
        <Notice tone="blue">
          {preview.investorCount} {preview.investorCount === 1 ? 'pass' : 'passes'} in these days ({lira(preview.investorTotal)}) are already on the investor's sheet and aren't charged here.
        </Notice>
      )}

      {typedHgs.length > 0 && (
        <Notice tone="amber">
          This booking already has HGS typed by hand: {typedHgs.map((line) => `${line.description?.trim() || 'HGS'} (${lira(line.amount)})`).join(', ')}. Start after the days it covers.
        </Notice>
      )}

      <section className="surface-depth rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-3">
          <Field label="From" hint={`Booking starts ${formatDate(card.startDate)}`}>
            <input aria-label="From" type="date" className={INPUT} min={card.startDate} max={card.endDate} value={range.from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="To" hint={`Booking ends ${formatDate(card.endDate)}`}>
            <input aria-label="To" type="date" className={INPUT} min={card.startDate} max={card.endDate} value={range.to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Field label="USD rate" required error={rateText && !rateOk ? 'Enter the rate.' : null} hint="TL stays stored; USD is for display.">
            <input aria-label="USD rate" inputMode="decimal" className={cn(INPUT, 'tabular-nums')} value={rateText} placeholder="49,50" onChange={(event) => { setRateTouched(true); setRateText(event.target.value); }} />
          </Field>
        </div>
      </section>

      {error && <Notice tone="red">{error}</Notice>}

      {!preview && !error ? (
        <div className="flex items-center justify-center py-12" role="status" aria-label="Loading transits"><Spinner size={20} /></div>
      ) : preview && nothing ? (
        <p className="rounded-2xl border border-subtle bg-surface px-4 py-8 text-center text-[13.5px] text-black/55">
          No new portal transits for this car from {formatDate(range.from)} to {formatDate(range.to)}.
        </p>
      ) : preview && (
        <section aria-label="Transits to add" className="overflow-hidden rounded-2xl border border-subtle bg-surface">
          <ul className="max-h-[46vh] divide-y divide-black/[0.05] overflow-y-auto">
            {preview.transits.map((transit) => (
              <li key={transit.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="w-[112px] shrink-0 font-mono tabular-nums text-black/60">{dayOnly(transit.at)} {transit.at.slice(11, 16)}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{routeLabel(transit)}</span>
                {transit.roadType === 'private' && <span className="shrink-0 rounded-full bg-[#F1EBFD] px-1.5 text-[11px] font-medium text-[#5B21B6]">Private</span>}
                <span className="shrink-0 font-mono font-medium tabular-nums text-[#B91C1C]">{lira(transit.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-subtle bg-[#F8F9FB] px-4 py-2.5 text-[13px]">
            <span className="text-black/55">{totals.count} {totals.count === 1 ? 'pass' : 'passes'}</span>
            <span className="font-mono font-semibold tabular-nums text-foreground">{lira(totals.tl)}{totals.usd !== null && <span className="ms-2 font-normal text-black/50">{usd(totals.usd)}</span>}</span>
          </div>
        </section>
      )}
    </BookingSheet>
  );
};
