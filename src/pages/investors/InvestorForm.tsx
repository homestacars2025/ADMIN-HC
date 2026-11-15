import React, { useEffect, useId, useMemo, useState } from 'react';
import { toast } from '../../components/media/MediaToast';
import { Button, Spinner } from '../../components/media/MediaUI';
import { IosSwitch } from '../cars/EditCarSheet';
import { INPUT } from '../bookings/ui';
import { investorName, type InvestorOverview } from '../../lib/investors';
import { supabase } from '../../lib/supabase';
import { PhoneInput, parsePhone } from './PhoneInput';

interface FormState {
  company_name: string;
  phone_dial: string;
  phone_number: string;
  whatsapp_dial: string;
  whatsapp_number: string;
  email: string;
  commission_rate: string;
  is_active: boolean;
}

function initialForm(investor: InvestorOverview): FormState {
  const phone = parsePhone(investor.phone);
  const whatsapp = parsePhone(investor.whatsapp);
  return {
    company_name: investor.companyName ?? '',
    phone_dial: phone.dial,
    phone_number: phone.number,
    whatsapp_dial: whatsapp.dial,
    whatsapp_number: whatsapp.number,
    email: investor.email ?? '',
    commission_rate: investor.commissionRate !== null ? String(investor.commissionRate) : '',
    is_active: investor.isActive,
  };
}

const Label: React.FC<{ htmlFor?: string; id?: string; children: React.ReactNode }> = ({ htmlFor, id, children }) => (
  <label htmlFor={htmlFor} id={id} className="mb-1.5 block text-[12.5px] font-medium text-black/65">{children}</label>
);

/**
 * The investor's details: the same fields and the same `investors` update the old
 * Edit Investor window had, laid out for the drawer's Info tab.
 */
export const InvestorForm: React.FC<{
  investor: InvestorOverview;
  onDirty: (dirty: boolean) => void;
  onSaved: () => void;
}> = ({ investor, onDirty, onSaved }) => {
  const [baseline, setBaseline] = useState(() => initialForm(investor));
  const [form, setForm] = useState(baseline);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { company: useId(), email: useId(), rate: useId(), status: useId(), phone: useId(), whatsapp: useId() };

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError(null);
    const rate = form.commission_rate.trim() !== '' ? parseFloat(form.commission_rate) : null;
    if (rate !== null && (Number.isNaN(rate) || rate < 0 || rate > 100)) {
      setError('Commission rate must be a number between 0 and 100.');
      return;
    }
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('That email address doesn’t look right.');
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase
      .from('investors')
      .update({
        company_name: form.company_name.trim() || null,
        phone: form.phone_number.trim() ? `${form.phone_dial}${form.phone_number.trim()}` : null,
        whatsapp: form.whatsapp_number.trim() ? `${form.whatsapp_dial}${form.whatsapp_number.trim()}` : null,
        email: email || null,
        commission_rate: rate,
        is_active: form.is_active,
      })
      .eq('id', investor.id);
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    setBaseline(form);
    toast.success(`${form.company_name.trim() || investorName(investor)} saved`);
    onSaved();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <section className="rounded-[20px] border border-subtle bg-surface p-4 sm:p-5">
        <h3 className="text-[14px] font-semibold text-foreground">Details</h3>
        <p className="mt-0.5 text-[12.5px] text-black/45">How this investor shows across the dashboard and how to reach them.</p>
        <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={ids.company}>Company name</Label>
            <input id={ids.company} className={INPUT} value={form.company_name} onChange={(event) => set('company_name', event.target.value)} placeholder="e.g. Acme Ventures" maxLength={120} />
          </div>
          <div>
            <Label id={ids.phone}>Phone</Label>
            <div role="group" aria-labelledby={ids.phone}>
              <PhoneInput dial={form.phone_dial} number={form.phone_number} onDialChange={(dial) => set('phone_dial', dial)} onNumberChange={(number) => set('phone_number', number)} placeholder="555 000 0000" />
            </div>
          </div>
          <div>
            <Label id={ids.whatsapp}>WhatsApp</Label>
            <div role="group" aria-labelledby={ids.whatsapp}>
              <PhoneInput dial={form.whatsapp_dial} number={form.whatsapp_number} onDialChange={(dial) => set('whatsapp_dial', dial)} onNumberChange={(number) => set('whatsapp_number', number)} placeholder="555 000 0000" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={ids.email}>Email</Label>
            <input id={ids.email} type="email" className={INPUT} value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="investor@example.com" maxLength={160} />
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-subtle bg-surface p-4 sm:p-5">
        <h3 className="text-[14px] font-semibold text-foreground">Terms</h3>
        <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={ids.rate}>Commission rate</Label>
            <div className="relative">
              <input id={ids.rate} type="number" inputMode="decimal" min="0" max="100" step="0.01" className={`${INPUT} pe-9`} value={form.commission_rate} onChange={(event) => set('commission_rate', event.target.value)} placeholder="0" />
              <span aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[14px] text-black/40">%</span>
            </div>
          </div>
          <div>
            <Label id={ids.status}>Status</Label>
            <div className="flex h-11 items-center gap-3 md:h-10">
              <IosSwitch checked={form.is_active} labelledBy={ids.status} onChange={(checked) => set('is_active', checked)} />
              <span className={form.is_active ? 'text-[13.5px] font-medium text-[#166534]' : 'text-[13.5px] text-black/50'}>{form.is_active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-[12px] bg-[#DC2626]/[0.06] px-3.5 py-2.5 text-[13px] text-[#B91C1C]">{error}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" className="!h-11 md:!h-10" disabled={!dirty || saving} onClick={() => { setForm(baseline); setError(null); }}>
          Reset
        </Button>
        <Button type="submit" size="lg" className="!h-11 px-5 md:!h-10" disabled={!dirty || saving}>
          {saving && <Spinner size={13} />}
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
};
