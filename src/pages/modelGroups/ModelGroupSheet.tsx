import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Trash2 } from '../../components/media/MediaIcons';
import { Button, Spinner, Switch } from '../../components/media/MediaUI';
import { toast } from '../../components/media/MediaToast';
import { CarIcon3D } from '../../components/shared/Icon3D';
import { SpecIcon3D } from '../../components/shared/SpecIcon3D';
import { formatLira } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import {
  CATEGORIES,
  EMPTY_FORM,
  FUELS,
  TRANSMISSIONS,
  changedFields,
  discounted,
  formPayload,
  imageProblem,
  listPriceTry,
  parseNumber,
  saveTierChanges,
  tierChangeCount,
  tierChanges,
  tierDraftChangeCount,
  toForm,
  toTierDrafts,
  uploadGroupImage,
  validateForm,
  validateTiers,
  type FormField,
  type ModelGroupForm,
  type ModelGroupRow,
  type PricingTier,
  type TierDraft,
} from '../../lib/modelGroups';
import { supabase } from '../../lib/supabase';
import { BookingSheet, FOOTER_BUTTON, Field, FormCard, INPUT, Notice, PrimaryButton, Segmented } from '../bookings/ui';
import { GroupImage } from './ModelGroupCard';

const SELECT = cn(INPUT, 'cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%236b7280%27%20stroke-width=%272.2%27%3E%3Cpath%20d=%27M6%209l6%206%206-6%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pe-8');

const PriceTag: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9-9-9Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" />
  </svg>
);

const Rules: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

let newTierKey = 0;

/** Add or edit a model group: basic info, specs, pricing, rules and the photo, saved together. */
export const ModelGroupSheet: React.FC<{
  group: ModelGroupRow | null;
  tiers: PricingTier[];
  usdRate: number | null;
  onClose: () => void;
  /** After any write, so the page reloads what changed. */
  onSaved: () => void;
}> = ({ group, tiers, usdRate, onClose, onSaved }) => {
  const [savedGroup, setSavedGroup] = useState<ModelGroupRow | null>(group);
  const [baseline, setBaseline] = useState<ModelGroupForm>(() => (group ? toForm(group) : EMPTY_FORM));
  const [form, setForm] = useState<ModelGroupForm>(baseline);
  const [tierBase] = useState<PricingTier[]>(tiers);
  const [drafts, setDrafts] = useState<TierDraft[]>(() => toTierDrafts(tiers));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const nameTouched = useRef(Boolean(group && group.name.trim() !== [group.brand, group.model].filter(Boolean).join(' ').trim()));
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!imageFile) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const changed = changedFields(form, baseline);
  const tierCount = tierDraftChangeCount(tierBase, drafts);
  const imageChanged = imageFile !== null || imageRemoved;
  const unsaved = changed.length + tierCount + (imageChanged ? 1 : 0);
  const dirty = unsaved > 0;
  const errors = validateForm(form);
  const tierErrors = validateTiers(drafts);
  const visibleErrors = showErrors ? errors : {};
  const visibleTierErrors = showErrors ? tierErrors : {};
  const isNew = savedGroup === null;
  const listTry = listPriceTry(parseNumber(form.price) ?? null, usdRate);
  const currentImage = imageRemoved ? null : preview ?? savedGroup?.image_url ?? null;
  const changedSet = useMemo(() => new Set(changed), [changed]);

  const set = (key: FormField, value: string) => setForm((current) => {
    const next = { ...current, [key]: value };
    if ((key === 'brand' || key === 'model') && !nameTouched.current) next.name = `${next.brand} ${next.model}`.replace(/\s+/g, ' ').trim();
    return next;
  });

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    const problem = imageProblem(file);
    setImageError(problem);
    if (problem) return;
    setImageFile(file);
    setImageRemoved(false);
  };

  const editTier = (key: string, patch: Partial<TierDraft>) => setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  const addTier = () => setDrafts((current) => {
    const last = current.reduce((max, draft) => Math.max(max, parseNumber(draft.max_days) ?? 0), 0);
    newTierKey += 1;
    return [...current, { key: `new-${newTierKey}`, id: null, min_days: String(last + 1), max_days: String(last + 30), discount_percent: '', is_active: true }];
  });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || saving) return;
    setShowErrors(true);
    setSaveError(null);
    if (Object.keys(errors).length > 0 || Object.keys(tierErrors).length > 0) {
      window.requestAnimationFrame(() => document.querySelector('[data-field-error="true"], [data-tier-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    setSaving(true);
    let wroteGroup = false;
    try {
      let groupRow = savedGroup;
      if (changed.length > 0 || imageChanged || isNew) {
        let imageUrl = savedGroup?.image_url ?? null;
        if (imageFile) imageUrl = await uploadGroupImage(form.name || `${form.brand} ${form.model}`, imageFile);
        else if (imageRemoved) imageUrl = null;
        const payload = { ...formPayload(form), image_url: imageUrl };
        const result = isNew
          ? await supabase.from('model_group').insert(payload).select('id').single()
          : await supabase.from('model_group').update(payload).eq('id', (savedGroup as ModelGroupRow).id).select('id').single();
        if (result.error) throw new Error(result.error.message);
        groupRow = { ...(payload as Omit<ModelGroupRow, 'id'>), id: Number((result.data as { id: number }).id) };
        wroteGroup = true;
        setSavedGroup(groupRow);
        setBaseline(form);
        setImageFile(null);
        setImageRemoved(false);
      }
      const changes = tierChanges(tierBase, drafts);
      if (tierChangeCount(changes) > 0) {
        try {
          await saveTierChanges(changes);
        } catch (reason) {
          throw new Error(`${wroteGroup ? 'The model group was saved, but the pricing tiers weren\'t' : 'The pricing tiers weren\'t saved'}: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
      toast.success(isNew ? `${formPayload(form).name} added` : 'Changes saved');
      onSaved();
      onClose();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setSaveError(message);
      toast.error(message);
      if (wroteGroup) onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BookingSheet
      label={isNew ? 'New model group' : 'Edit model group'}
      title={isNew ? 'New model group' : form.name || 'Edit model group'}
      subtitle={isNew ? 'Specs, prices and rules for a new group' : savedGroup?.category ?? undefined}
      wide
      dirty={dirty}
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
      footer={(requestClose) => (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {dirty ? (
            <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#F59E0B]/[0.14] px-2.5 py-1 text-[12.5px] font-medium text-[#B45309] sm:w-auto sm:justify-start">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
              {unsaved} unsaved {unsaved === 1 ? 'change' : 'changes'}
            </span>
          ) : (
            <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#ECFDF3] px-2.5 py-1 text-[12.5px] font-medium text-[#067647] sm:w-auto sm:justify-start">
              <Check size={13} strokeWidth={3} /> {isNew ? 'Nothing entered yet' : 'All saved'}
            </span>
          )}
          <div className="ms-auto flex flex-1 justify-end gap-2 sm:flex-none">
            <Button type="button" variant="outline" size="lg" className={cn(FOOTER_BUTTON, 'flex-1 px-4 sm:flex-none')} disabled={saving} onClick={requestClose}>
              {dirty ? 'Cancel' : 'Close'}
            </Button>
            <PrimaryButton saving={saving} disabled={!dirty}>{saving ? 'Saving…' : isNew ? 'Add model group' : 'Save'}</PrimaryButton>
          </div>
        </div>
      )}
    >
      {saveError && <Notice tone="red">{saveError}</Notice>}

      <FormCard icon={<CarIcon3D name="info" size={26} />} title="Basic info">
        <Field label="Brand" required changed={changedSet.has('brand')} error={visibleErrors.brand}>
          <input className={INPUT} aria-label="Brand" value={form.brand} placeholder="e.g. Renault" onChange={(event) => set('brand', event.target.value)} />
        </Field>
        <Field label="Model" required changed={changedSet.has('model')} error={visibleErrors.model}>
          <input className={INPUT} aria-label="Model" value={form.model} placeholder="e.g. Clio" onChange={(event) => set('model', event.target.value)} />
        </Field>
        <Field label="Name" required span changed={changedSet.has('name')} error={visibleErrors.name} hint={nameTouched.current ? undefined : 'Follows the brand and model until you change it.'}>
          <input className={INPUT} aria-label="Name" value={form.name} placeholder="Renault Clio" onChange={(event) => { nameTouched.current = true; set('name', event.target.value); }} />
        </Field>
        <Field label="Category" span changed={changedSet.has('category')}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={form.category === category}
                onClick={() => set('category', category)}
                className={cn(
                  'h-11 rounded-full border px-3.5 text-[13px] font-medium transition-colors md:h-9',
                  form.category === category ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.12] text-brand-strong' : 'border-subtle bg-white text-black/60 hover:bg-black/[0.03]',
                )}
              >
                {category}
              </button>
            ))}
          </div>
        </Field>
      </FormCard>

      <FormCard icon={<SpecIcon3D name="transmission" size={24} />} title="Specs">
        <Field label="Transmission" changed={changedSet.has('transmission')}>
          <Segmented ariaLabel="Transmission" value={form.transmission as typeof TRANSMISSIONS[number]} onChange={(value) => set('transmission', value)} options={TRANSMISSIONS.map((value) => ({ value, label: value }))} />
        </Field>
        <Field label="Fuel" changed={changedSet.has('fuel')}>
          <select aria-label="Fuel" className={SELECT} value={form.fuel} onChange={(event) => set('fuel', event.target.value)}>
            {FUELS.map((fuel) => <option key={fuel}>{fuel}</option>)}
            {!(FUELS as readonly string[]).includes(form.fuel) && <option>{form.fuel}</option>}
          </select>
        </Field>
        <Field label="Seats" changed={changedSet.has('seats')} error={visibleErrors.seats}>
          <input className={INPUT} inputMode="numeric" aria-label="Seats" value={form.seats} placeholder="5" onChange={(event) => set('seats', event.target.value)} />
        </Field>
        <Field label="Luggage (bags)" changed={changedSet.has('luggage')} error={visibleErrors.luggage}>
          <input className={INPUT} inputMode="numeric" aria-label="Luggage (bags)" value={form.luggage} placeholder="2" onChange={(event) => set('luggage', event.target.value)} />
        </Field>
      </FormCard>

      <FormCard icon={<PriceTag />} title="Pricing">
        <Field
          label="Base daily price (USD)"
          required
          span
          changed={changedSet.has('price')}
          error={visibleErrors.price}
          hint={listTry !== null ? <>≈ <span className="font-semibold tabular-nums text-foreground">{formatLira(listTry)}</span> a day at today's rate. The website sells in USD.</> : 'The website sells in USD.'}
        >
          <div className="relative">
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[14px] text-black/40">$</span>
            <input className={cn(INPUT, 'ps-7 tabular-nums')} inputMode="decimal" aria-label="Base daily price (USD)" value={form.price} placeholder="45" onChange={(event) => set('price', event.target.value)} />
          </div>
        </Field>
        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[12.5px] font-medium text-black/65">Long-rental discounts</div>
            <Button type="button" variant="ghost" size="sm" className="!h-11 text-brand-strong md:!h-8" onClick={addTier}><Plus size={14} /> Add tier</Button>
          </div>
          <Notice tone="blue">These tiers apply to every model group, not only this one.</Notice>
          <div className="mt-2 overflow-x-auto rounded-[12px] border border-subtle bg-white">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="text-start text-[11.5px] text-black/45">
                  <th className="px-3 py-2 text-start font-medium">From day</th>
                  <th className="px-3 py-2 text-start font-medium">To day</th>
                  <th className="px-3 py-2 text-start font-medium">Discount</th>
                  <th className="px-3 py-2 text-end font-medium" title="This group's price per day with the discount">Per day</th>
                  <th className="px-3 py-2 text-center font-medium">On</th>
                  <th className="w-12 px-2 py-2"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {drafts.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-[12.5px] text-black/45">No tiers: every rental pays the base price.</td></tr>
                )}
                {drafts.map((draft) => {
                  const pct = parseNumber(draft.discount_percent);
                  const tierError = visibleTierErrors[draft.key];
                  return (
                    <React.Fragment key={draft.key}>
                      <tr className="border-t border-black/[0.05]" data-tier-error={tierError ? 'true' : undefined}>
                        <td className="px-2 py-1.5"><input aria-label="From day" className={cn(INPUT, '!h-10 w-20 tabular-nums')} inputMode="numeric" value={draft.min_days} onChange={(event) => editTier(draft.key, { min_days: event.target.value })} /></td>
                        <td className="px-2 py-1.5"><input aria-label="To day" className={cn(INPUT, '!h-10 w-20 tabular-nums')} inputMode="numeric" value={draft.max_days} onChange={(event) => editTier(draft.key, { max_days: event.target.value })} /></td>
                        <td className="px-2 py-1.5">
                          <div className="relative w-24">
                            <input aria-label="Discount percent" className={cn(INPUT, '!h-10 pe-7 tabular-nums')} inputMode="decimal" value={draft.discount_percent} placeholder="0" onChange={(event) => editTier(draft.key, { discount_percent: event.target.value })} />
                            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-black/40">%</span>
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-end font-medium tabular-nums text-foreground">
                          {listTry !== null && pct !== null && !Number.isNaN(pct) ? formatLira(discounted(listTry, pct)) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-center"><Switch checked={draft.is_active} onChange={(next) => editTier(draft.key, { is_active: next })} ariaLabel={`Tier ${draft.min_days}–${draft.max_days} days on`} /></td>
                        <td className="px-2 py-1.5 text-center">
                          <button type="button" aria-label={`Remove tier ${draft.min_days}–${draft.max_days} days`} onClick={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))} className="grid h-11 w-11 place-items-center rounded-[10px] text-black/40 hover:bg-[#DC2626]/[0.07] hover:text-[#B91C1C] md:h-9 md:w-9">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                      {tierError && <tr><td colSpan={6} className="px-3 pb-2 text-[12px] text-[#B91C1C]" role="alert">{tierError}</td></tr>}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </FormCard>

      <FormCard icon={<Rules />} title="Rules">
        <Field label="Deposit (₺)" changed={changedSet.has('deposit')} error={visibleErrors.deposit}>
          <div className="relative">
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[14px] text-black/40">₺</span>
            <input className={cn(INPUT, 'ps-7 tabular-nums')} inputMode="decimal" aria-label="Deposit (₺)" value={form.deposit} placeholder="8000" onChange={(event) => set('deposit', event.target.value)} />
          </div>
        </Field>
        <Field label="Minimum age" changed={changedSet.has('min_age')} error={visibleErrors.min_age}>
          <input className={INPUT} inputMode="numeric" aria-label="Minimum age" value={form.min_age} placeholder="21" onChange={(event) => set('min_age', event.target.value)} />
        </Field>
        <Field label="Daily km limit" changed={changedSet.has('daily_km')} error={visibleErrors.daily_km} hint="Empty means unlimited.">
          <input className={INPUT} inputMode="numeric" aria-label="Daily km limit" value={form.daily_km} placeholder="300" onChange={(event) => set('daily_km', event.target.value)} />
        </Field>
        <Field label="Monthly km limit" changed={changedSet.has('monthly_km')} error={visibleErrors.monthly_km} hint="Empty means unlimited.">
          <input className={INPUT} inputMode="numeric" aria-label="Monthly km limit" value={form.monthly_km} placeholder="6000" onChange={(event) => set('monthly_km', event.target.value)} />
        </Field>
      </FormCard>

      <FormCard
        icon={<CarIcon3D name="photos" size={26} />}
        title="Image"
        action={currentImage ? (
          <Button type="button" variant="ghost" size="sm" className="!h-11 text-[#B91C1C] md:!h-8" onClick={() => { setImageFile(null); setImageRemoved(true); setImageError(null); }}>
            <Trash2 size={14} /> Remove
          </Button>
        ) : undefined}
      >
        <div className="sm:col-span-2">
          <div
            role="button"
            tabIndex={0}
            aria-label={currentImage ? 'Replace the image' : 'Upload an image'}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.current?.click(); } }}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); pickImage(event.dataTransfer.files?.[0]); }}
            className={cn(
              'group/drop relative cursor-pointer rounded-[16px] border-2 border-dashed p-2 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40',
              dragging ? 'border-[#6EA4E7] bg-[#6EA4E7]/[0.06]' : 'border-black/[0.10] hover:border-[#6EA4E7]/60',
            )}
          >
            {currentImage ? (
              <GroupImage src={currentImage} alt="Model group image">
                <span className="absolute inset-x-0 bottom-0 flex justify-center pb-3 opacity-0 transition-opacity group-hover/drop:opacity-100 group-focus-visible/drop:opacity-100">
                  <span className="rounded-full bg-[#0F1117]/75 px-3 py-1.5 text-[12.5px] font-medium text-white">Drop or click to replace</span>
                </span>
              </GroupImage>
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-[12px] bg-[linear-gradient(160deg,#F7F9FC_0%,#EEF3F9_100%)] text-center">
                <CarIcon3D name="photos" size={64} />
                <p className="text-[14px] font-medium text-foreground">{dragging ? 'Drop the photo here' : 'Drag a photo here, or click to choose'}</p>
                <p className="text-[12px] text-black/45">JPG, PNG or WebP, up to 5 MB · a side view on white works best</p>
              </div>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { pickImage(event.target.files?.[0]); event.target.value = ''; }} />
          {imageError && <p role="alert" className="mt-1.5 text-[12px] text-[#B91C1C]">{imageError}</p>}
          {imageFile && <p className="mt-1.5 text-[12px] text-black/50">New photo: {imageFile.name}. It uploads to the model-group bucket when you save.</p>}
          {imageRemoved && <p className="mt-1.5 text-[12px] text-black/50">The photo will be removed when you save.</p>}
        </div>
      </FormCard>

      {saving && <div className="sr-only" role="status"><Spinner size={12} /> Saving</div>}
    </BookingSheet>
  );
};
