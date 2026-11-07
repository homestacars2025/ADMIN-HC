import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, type ConfirmState } from '../../components/media/ConfirmDialog';
import { Check, Trash2 } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { toast } from '../../components/media/MediaToast';
import { CarIcon3D } from '../../components/shared/Icon3D';
import { SpecIcon3D } from '../../components/shared/SpecIcon3D';
import { cn } from '../../lib/media/badgeColor';
import type { ModelGroupRow, ModelGroupStats } from '../../lib/modelGroups';
import { displayName } from '../../lib/modelGroups';
import {
  CUSTOM_MODEL,
  DAMAGE_RECORDS,
  FUEL_TYPES,
  LEAD_STAGES,
  LEAD_TONES,
  LISTING_STATUSES,
  PLATFORMS,
  TRANSMISSIONS,
  changedFields,
  detectPlatform,
  emptyForm,
  fetchDistricts,
  formPayload,
  gapPercent,
  investmentCheck,
  parseAmount,
  platformLabel,
  toForm,
  validateForm,
  type GeoOption,
  type SourcingField,
  type SourcingForm,
  type SourcingRow,
} from '../../lib/sourcing';
import { supabase } from '../../lib/supabase';
import { BookingSheet, FOOTER_BUTTON, Field, FormCard, INPUT, Notice, PrimaryButton, Segmented } from '../bookings/ui';
import { ExternalLinkIcon, GapPill, InvestmentPanel, PlatformChip } from './SourcingParts';

const SELECT = cn(INPUT, 'cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%236b7280%27%20stroke-width=%272.2%27%3E%3Cpath%20d=%27M6%209l6%206%206-6%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pe-8');

const DAMAGE_LABELS: Record<string, string> = { 'No Damage': 'No damage', 'Damage Value': 'Damage amount', 'Heavy Damage': 'Heavy damage' };

const LinkGlyph: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

const PinGlyph: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.9" />
  </svg>
);

/** Add or edit a listing: the link first, then the car, its condition, where it is and the price. */
export const SourcingSheet: React.FC<{
  row: SourcingRow | null;
  groups: ModelGroupRow[];
  cities: GeoOption[];
  stats: Map<number, ModelGroupStats>;
  today: string;
  monthLabel: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ row, groups, cities, stats, today, monthLabel, onClose, onSaved }) => {
  const baseline = useMemo(() => (row ? toForm(row) : emptyForm(today)), [row, today]);
  const [form, setForm] = useState<SourcingForm>(baseline);
  const [districts, setDistricts] = useState<GeoOption[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [deleting, setDeleting] = useState(false);
  const currentYear = Number(today.slice(0, 4));

  useEffect(() => {
    let active = true;
    if (!form.city_id) { setDistricts([]); return undefined; }
    fetchDistricts(Number(form.city_id)).then((rows) => { if (active) setDistricts(rows); }).catch(() => { if (active) setDistricts([]); });
    return () => { active = false; };
  }, [form.city_id]);

  const changed = changedFields(form, baseline);
  const changedSet = new Set(changed);
  const dirty = changed.length > 0;
  const errors = validateForm(form, currentYear);
  const shown = showErrors ? errors : {};
  const isNew = row === null;
  const detected = form.listing_url.trim() ? detectPlatform(form.listing_url) : null;
  const asking = parseAmount(form.asking_price);
  const target = parseAmount(form.target_price);
  const groupId = form.model_group_id && form.model_group_id !== CUSTOM_MODEL ? Number(form.model_group_id) : null;
  const check = groupId !== null ? investmentCheck(asking !== null && !Number.isNaN(asking) ? asking : null, stats.get(groupId)) : null;

  const set = (key: SourcingField, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const setUrl = (value: string) => setForm((current) => {
    const next = { ...current, listing_url: value };
    const found = value.trim() ? detectPlatform(value) : null;
    if (found) { next.source_platform = found.platform; next.source_platform_custom = found.custom ?? ''; }
    return next;
  });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || saving) return;
    setShowErrors(true);
    setSaveError(null);
    if (Object.keys(errors).length > 0) {
      window.requestAnimationFrame(() => document.querySelector('[data-field-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    setSaving(true);
    try {
      const payload = formPayload(form);
      if (isNew) {
        const { data } = await supabase.auth.getUser();
        const { error } = await supabase.from('sourcing').insert({ ...payload, added_by: data.user?.id ?? null });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('sourcing').update(payload).eq('id', row.id);
        if (error) throw new Error(error.message);
      }
      toast.success(isNew ? 'Listing added' : 'Listing saved');
      onSaved();
      onClose();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      const friendly = message.includes('sourcing_lead_status_check')
        ? `The database doesn't accept the "${LEAD_TONES[form.lead_status as keyof typeof LEAD_TONES]?.label ?? form.lead_status}" stage yet. Apply supabase/migrations/20261107_sourcing_pipeline_lead_statuses.sql.`
        : message;
      setSaveError(friendly);
      toast.error(friendly);
    } finally {
      setSaving(false);
    }
  };

  const askDelete = () => setConfirm({
    title: 'Delete this listing?',
    description: 'It leaves the pipeline and the table. This cannot be undone.',
    confirmLabel: 'Delete',
    onConfirm: async () => {
      if (!row) return;
      const { error } = await supabase.from('sourcing').delete().eq('id', row.id);
      if (error) throw new Error(error.message);
    },
  });

  const runDelete = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      await confirm.onConfirm();
      toast.success('Listing deleted');
      setConfirm(null);
      onSaved();
      onClose();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDeleting(false);
    }
  };

  const gap = gapPercent(asking !== null && !Number.isNaN(asking) ? asking : null, target !== null && !Number.isNaN(target) ? target : null);

  return (
    <>
      <BookingSheet
        label={isNew ? 'Add listing' : 'Edit listing'}
        title={isNew ? 'Add listing' : `${row.group ? displayName({ name: row.group.name, brand: row.group.brand, model: row.group.model }) : row.model_group_custom ?? 'Listing'} ${row.model_year}`}
        badge={!isNew ? <PlatformChip row={row} className="!shadow-none ring-1 ring-black/[0.06]" /> : undefined}
        subtitle={isNew ? 'Paste the link first: the platform fills itself in' : row.listing_url ? (
          <a href={row.listing_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-strong hover:underline">Open the listing <ExternalLinkIcon size={12} /></a>
        ) : undefined}
        wide
        paused={confirm !== null}
        dirty={dirty}
        saving={saving}
        onClose={onClose}
        onSubmit={submit}
        footer={(requestClose) => (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-start">
              {!isNew && (
                <Button type="button" variant="ghost" size="lg" className="!h-11 px-3 text-[#B91C1C] hover:bg-[#DC2626]/[0.07] md:!h-10" onClick={askDelete} disabled={saving}>
                  <Trash2 size={14} /> Delete
                </Button>
              )}
              {dirty ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F59E0B]/[0.14] px-2.5 py-1 text-[12.5px] font-medium text-[#B45309]">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                  {changed.length} unsaved {changed.length === 1 ? 'change' : 'changes'}
                </span>
              ) : !isNew && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF3] px-2.5 py-1 text-[12.5px] font-medium text-[#067647]"><Check size={13} strokeWidth={3} /> All saved</span>
              )}
            </div>
            <div className="ms-auto flex flex-1 justify-end gap-2 sm:flex-none">
              <Button type="button" variant="outline" size="lg" className={cn(FOOTER_BUTTON, 'flex-1 px-4 sm:flex-none')} disabled={saving} onClick={requestClose}>{dirty ? 'Cancel' : 'Close'}</Button>
              <PrimaryButton saving={saving} disabled={!dirty}>{saving ? 'Saving…' : isNew ? 'Add listing' : 'Save'}</PrimaryButton>
            </div>
          </div>
        )}
      >
        {saveError && <Notice tone="red">{saveError}</Notice>}

        <FormCard icon={<LinkGlyph />} title="Listing">
          <Field label="Listing link" span changed={changedSet.has('listing_url')} error={shown.listing_url} hint={detected ? <span className="inline-flex items-center gap-1.5">Found <PlatformChip row={{ source_platform: detected.platform, source_platform_custom: detected.custom }} className="!shadow-none ring-1 ring-black/[0.06]" /></span> : 'Paste it from Sahibinden, Arabam, Letgo or anywhere else.'}>
            <input aria-label="Listing link" className={INPUT} type="url" inputMode="url" value={form.listing_url} placeholder="https://www.sahibinden.com/ilan/…" onChange={(event) => setUrl(event.target.value)} />
          </Field>
          <Field label="Platform" required span changed={changedSet.has('source_platform')} error={shown.source_platform}>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Platform">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  aria-pressed={form.source_platform === platform}
                  onClick={() => set('source_platform', platform)}
                  className={cn('h-11 rounded-full border px-3.5 text-[13px] font-medium transition-colors md:h-9', form.source_platform === platform ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.12] text-brand-strong' : 'border-subtle bg-white text-black/60 hover:bg-black/[0.03]')}
                >
                  {platform === 'Other' ? 'Other' : platformLabel({ source_platform: platform, source_platform_custom: null })}
                </button>
              ))}
            </div>
          </Field>
          {form.source_platform === 'Other' && (
            <Field label="Platform name" required span changed={changedSet.has('source_platform_custom')} error={shown.source_platform_custom}>
              <input aria-label="Platform name" className={INPUT} value={form.source_platform_custom} placeholder="e.g. otoplus.com" onChange={(event) => set('source_platform_custom', event.target.value)} />
            </Field>
          )}
          <Field label="Listed on" changed={changedSet.has('listed_on')}>
            <input aria-label="Listed on" className={INPUT} type="date" max={today} value={form.listed_on} onChange={(event) => set('listed_on', event.target.value)} />
          </Field>
          <Field label="Listing" changed={changedSet.has('listing_status')}>
            <Segmented ariaLabel="Listing status" value={form.listing_status as typeof LISTING_STATUSES[number]} onChange={(value) => set('listing_status', value)} options={LISTING_STATUSES.map((value) => ({ value, label: value === 'Active' ? 'Still listed' : 'Sold' }))} />
          </Field>
        </FormCard>

        <FormCard icon={<CarIcon3D name="info" size={26} />} title="Car">
          <Field label="Model group" required span changed={changedSet.has('model_group_id')} error={shown.model_group_id}>
            <select aria-label="Model group" className={SELECT} value={form.model_group_id} onChange={(event) => set('model_group_id', event.target.value)}>
              <option value="">Pick a model group…</option>
              {groups.map((group) => <option key={group.id} value={String(group.id)}>{displayName(group)}</option>)}
              <option value={CUSTOM_MODEL}>Another model (type it)</option>
            </select>
          </Field>
          {form.model_group_id === CUSTOM_MODEL && (
            <Field label="Model" required span changed={changedSet.has('model_group_custom')} error={shown.model_group_custom} hint="Not one we run yet, so there's no investment check.">
              <input aria-label="Model" className={INPUT} value={form.model_group_custom} placeholder="e.g. Peugeot 2008" onChange={(event) => set('model_group_custom', event.target.value)} />
            </Field>
          )}
          <Field label="Model year" required changed={changedSet.has('model_year')} error={shown.model_year}>
            <input aria-label="Model year" className={cn(INPUT, 'tabular-nums')} inputMode="numeric" value={form.model_year} placeholder={String(currentYear - 1)} onChange={(event) => set('model_year', event.target.value)} />
          </Field>
          <Field label="Mileage (km)" required changed={changedSet.has('mileage_km')} error={shown.mileage_km}>
            <input aria-label="Mileage (km)" className={cn(INPUT, 'tabular-nums')} inputMode="numeric" value={form.mileage_km} placeholder="45000" onChange={(event) => set('mileage_km', event.target.value)} />
          </Field>
          <Field label="Transmission" changed={changedSet.has('transmission')}>
            <Segmented ariaLabel="Transmission" value={form.transmission as typeof TRANSMISSIONS[number]} onChange={(value) => set('transmission', value)} options={TRANSMISSIONS.map((value) => ({ value, label: value }))} />
          </Field>
          <Field label="Fuel" changed={changedSet.has('fuel_type')}>
            <select aria-label="Fuel" className={SELECT} value={form.fuel_type} onChange={(event) => set('fuel_type', event.target.value)}>
              {FUEL_TYPES.map((fuel) => <option key={fuel}>{fuel}</option>)}
            </select>
          </Field>
          <Field label="Trim / package" span changed={changedSet.has('trim_package')}>
            <input aria-label="Trim / package" className={INPUT} value={form.trim_package} placeholder="e.g. Touch, Icon, Elite" onChange={(event) => set('trim_package', event.target.value)} />
          </Field>
        </FormCard>

        <FormCard icon={<SpecIcon3D name="transmission" size={24} />} title="Condition">
          <Field label="Damage record" span changed={changedSet.has('damage_record')}>
            <Segmented ariaLabel="Damage record" value={form.damage_record as typeof DAMAGE_RECORDS[number]} onChange={(value) => set('damage_record', value)} options={DAMAGE_RECORDS.map((value) => ({ value, label: DAMAGE_LABELS[value] }))} />
          </Field>
          {form.damage_record === 'Damage Value' && (
            <Field label="Damage amount (₺)" changed={changedSet.has('damage_value')} error={shown.damage_value}>
              <input aria-label="Damage amount (₺)" className={cn(INPUT, 'tabular-nums')} inputMode="decimal" value={form.damage_value} placeholder="12500" onChange={(event) => set('damage_value', event.target.value)} />
            </Field>
          )}
          <Field label="Painted parts" changed={changedSet.has('paint_sections_count')} error={shown.paint_sections_count}>
            <input aria-label="Painted parts" className={cn(INPUT, 'tabular-nums')} inputMode="numeric" value={form.paint_sections_count} placeholder="0" onChange={(event) => set('paint_sections_count', event.target.value)} />
          </Field>
        </FormCard>

        <FormCard icon={<PinGlyph />} title="Location">
          <Field label="City" changed={changedSet.has('city_id')}>
            <select aria-label="City" className={SELECT} value={form.city_id} onChange={(event) => setForm((current) => ({ ...current, city_id: event.target.value, district_id: '' }))}>
              <option value="">Pick a city…</option>
              {cities.map((city) => <option key={city.id} value={String(city.id)}>{city.name}</option>)}
            </select>
          </Field>
          <Field label="District" changed={changedSet.has('district_id')}>
            <select aria-label="District" className={SELECT} value={form.district_id} disabled={!form.city_id} onChange={(event) => set('district_id', event.target.value)}>
              <option value="">{form.city_id ? 'Pick a district…' : 'Pick the city first'}</option>
              {districts.map((district) => <option key={district.id} value={String(district.id)}>{district.name}</option>)}
            </select>
          </Field>
        </FormCard>

        <FormCard icon={<CarIcon3D name="key" size={26} />} title="Price and lead">
          <Field label="Asking price (₺)" required changed={changedSet.has('asking_price')} error={shown.asking_price}>
            <input aria-label="Asking price (₺)" className={cn(INPUT, 'tabular-nums')} inputMode="decimal" value={form.asking_price} placeholder="1250000" onChange={(event) => set('asking_price', event.target.value)} />
          </Field>
          <Field
            label="Our target (₺)"
            changed={changedSet.has('target_price')}
            error={shown.target_price}
            hint={gap !== null ? <span className="inline-flex items-center gap-1.5"><GapPill asking={asking} target={target} /> {gap <= 0 ? 'at or under target' : 'above target'}</span> : undefined}
          >
            <input aria-label="Our target (₺)" className={cn(INPUT, 'tabular-nums')} inputMode="decimal" value={form.target_price} placeholder="1150000" onChange={(event) => set('target_price', event.target.value)} />
          </Field>
          <Field label="Lead stage" span changed={changedSet.has('lead_status')}>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lead stage">
              {LEAD_STAGES.map((stage) => {
                const tone = LEAD_TONES[stage];
                const on = form.lead_status === stage;
                return (
                  <button
                    key={stage}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('lead_status', stage)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors md:h-9"
                    style={on ? { background: tone.soft, color: tone.ink, borderColor: tone.chip } : { background: '#fff', color: 'rgba(0,0,0,0.6)', borderColor: 'rgba(0,0,0,0.08)' }}
                  >
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: tone.chip }} />
                    {tone.label}
                  </button>
                );
              })}
            </div>
          </Field>
        </FormCard>

        <InvestmentPanel check={check} asking={asking !== null && !Number.isNaN(asking) ? asking : null} monthLabel={monthLabel} />

        <FormCard icon={<CarIcon3D name="documents" size={26} />} title="Notes">
          <Field label="Notes" span changed={changedSet.has('notes')}>
            <textarea aria-label="Notes" className={cn(INPUT, '!h-auto min-h-[96px] py-2.5')} value={form.notes} placeholder="Seller, calls, what to check on viewing…" onChange={(event) => set('notes', event.target.value)} />
          </Field>
        </FormCard>

      </BookingSheet>

      <ConfirmDialog state={confirm} pending={deleting} onCancel={() => setConfirm(null)} onConfirm={() => { void runDelete(); }} />
    </>
  );
};
