import React, { useMemo, useState } from 'react';
import { Button, Select, Sheet, SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Spinner } from '../../components/media/MediaUI';
import type { CashAccount } from '../../lib/cashAccounts';
import { balancesOf, ENVELOPE_LABELS, findEnvelope, receiveEnvelope, transferMoney, type AccountBalance, type Envelope } from '../../lib/cashEnvelopes';
import { formatMoney, parseAmount, type Currency } from '../../lib/money';
import { CurrencyField } from '../bookings/PaymentFields';
import { Field, INPUT, LicensePlate, Notice } from '../bookings/ui';

const FOOTER = '!h-11 md:!h-10';

/** Zero is a real count for an empty envelope, which `parseAmount` refuses. */
const parseCount = (text: string): number | null => (/^0+([.,]0*)?$/.test(text.trim()) ? 0 : parseAmount(text));

export const ReceiveEnvelopeSheet: React.FC<{
  envelopes: Envelope[];
  accounts: CashAccount[];
  onClose: () => void;
  onDone: (ref: string) => void;
}> = ({ envelopes, accounts, onClose, onDone }) => {
  const [ref, setRef] = useState('');
  const [counted, setCounted] = useState<string | null>(null);
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const envelope = findEnvelope(envelopes, ref);
  const waiting = envelope?.status === 'with_employee';
  const destinations = useMemo(() => accounts.filter((account) => account.is_active && (account.kind === 'safe' || account.is_final)), [accounts]);

  const countedText = counted ?? (envelope ? String(envelope.amount) : '');
  const count = parseCount(countedText);
  const differs = envelope !== null && count !== null && Math.abs(count - envelope.amount) >= 0.005;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!envelope || !waiting) return;
    if (count === null) { setError('Enter the counted amount.'); return; }
    if (!accountId) { setError('Choose where it goes.'); return; }
    if (differs && !note.trim()) { setError('The count differs, so a note is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await receiveEnvelope(envelope.ref, count, Number(accountId), note.trim() || null);
      onDone(envelope.ref);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Try again.');
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} ariaLabel="Receive envelope" maxWidthClass="sm:max-w-[460px]">
      <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>Receive envelope</SheetTitle>
          <SheetDescription>Type or paste the number written on it.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <input
            autoFocus
            aria-label="Envelope number"
            value={ref}
            onChange={(event) => { setRef(event.target.value); setCounted(null); setError(null); }}
            placeholder="ENV-2611-0001"
            className="h-14 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-center font-mono text-[22px] font-semibold uppercase tracking-tight outline-none placeholder:font-normal placeholder:normal-case placeholder:text-black/25 focus:border-[#6EA4E7] focus:ring-[3px] focus:ring-[#6EA4E7]/25"
          />

          {ref.trim() && !envelope && <Notice tone="amber">No envelope has this number.</Notice>}
          {envelope && !waiting && <Notice tone="amber">{envelope.ref} is already {ENVELOPE_LABELS[envelope.status].toLowerCase()}.</Notice>}

          {envelope && waiting && (
            <>
              <div className="rounded-xl bg-black/[0.03] p-3 text-center">
                <p className="text-[24px] font-semibold tabular-nums text-foreground">{formatMoney(envelope.amount, envelope.currency)}</p>
                <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-[13px] text-black/55">
                  {envelope.plate && <LicensePlate plate={envelope.plate} />}
                  {envelope.customer}
                </p>
              </div>
              <Field label="Counted amount" required>
                <input className={`${INPUT} tabular-nums`} inputMode="decimal" value={countedText} onChange={(event) => setCounted(event.target.value)} />
              </Field>
              <Field label="Goes to" required>
                <Select
                  value={accountId}
                  options={[{ value: '', label: 'Choose a safe or the admin' }, ...destinations.map((account) => ({ value: String(account.id), label: account.name }))]}
                  placeholderMuted
                  size="lg"
                  ariaLabel="Goes to"
                  onChange={setAccountId}
                />
              </Field>
              {differs && count !== null && <Notice tone="amber">The count is {formatMoney(Math.abs(count - envelope.amount), envelope.currency)} {count < envelope.amount ? 'short' : 'over'}.</Notice>}
              <Field label={differs ? 'Note (required)' : 'Note'}>
                <input className={INPUT} value={note} onChange={(event) => setNote(event.target.value)} />
              </Field>
            </>
          )}
          {error && <Notice tone="red">{error}</Notice>}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" size="lg" className={FOOTER} disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="submit" size="lg" className={`${FOOTER} px-4`} disabled={saving || !waiting}>
            {saving && <Spinner size={13} />} Receive
          </Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
};

export const TransferSheet: React.FC<{
  accounts: CashAccount[];
  balances: AccountBalance[];
  onClose: () => void;
  onDone: (ref: string) => void;
}> = ({ accounts, balances, onClose, onDone }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = accounts.filter((account) => account.is_active).map((account) => ({ value: String(account.id), label: account.name }));
  const held = from ? balancesOf(balances, Number(from)).find((row) => row.currency === currency)?.total ?? 0 : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = parseAmount(amount);
    if (!from || !to) { setError('Choose both accounts.'); return; }
    if (from === to) { setError('Choose two different accounts.'); return; }
    if (value === null) { setError('Enter an amount above zero.'); return; }
    setSaving(true);
    setError(null);
    try {
      onDone(await transferMoney(Number(from), Number(to), value, currency, note.trim() || null));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Try again.');
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} ariaLabel="Transfer" maxWidthClass="sm:max-w-[460px]">
      <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>Transfer</SheetTitle>
          <SheetDescription>Move money between two accounts.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <Field label="From" required hint={held === null ? undefined : `Holds ${formatMoney(held, currency)}`}>
            <Select value={from} options={[{ value: '', label: 'Choose an account' }, ...options]} placeholderMuted size="lg" ariaLabel="From" onChange={setFrom} />
          </Field>
          <Field label="To" required>
            <Select value={to} options={[{ value: '', label: 'Choose an account' }, ...options]} placeholderMuted size="lg" ariaLabel="To" onChange={setTo} />
          </Field>
          <Field label="Currency"><CurrencyField value={currency} onChange={setCurrency} /></Field>
          <Field label="Amount" required>
            <input className={`${INPUT} tabular-nums`} inputMode="decimal" value={amount} placeholder="0" onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label="Note">
            <input className={INPUT} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          {error && <Notice tone="red">{error}</Notice>}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" size="lg" className={FOOTER} disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="submit" size="lg" className={`${FOOTER} px-4`} disabled={saving}>
            {saving && <Spinner size={13} />} Transfer
          </Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
};
