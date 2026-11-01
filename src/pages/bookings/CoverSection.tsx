import React from 'react';
import { Check, Minus, Pencil, Plus, ShieldCheck, Sparkles } from '../../components/media/MediaIcons';
import {
  ADDITIONAL_SERVICE_PRESETS,
  INSURANCE_DESCRIPTIONS,
  INSURANCE_PRESETS,
  MAX_SERVICE_QUANTITY,
  OTHER_PRESET,
  PRESET_LABELS,
  QUANTITY_SERVICES,
  SERVICE_DESCRIPTIONS,
  serviceQuantity,
  withServiceQuantity,
  type BookingFormData,
} from '../../lib/bookingForm';
import { cn } from '../../lib/media/badgeColor';
import { INPUT } from './ui';

const ILLUSTRATION_DIR = `${process.env.PUBLIC_URL}/illustrations/booking`;

const ILLUSTRATIONS: Record<string, string> = {
  'Korumasız': 'shield-none',
  'Kısmi Koruma': 'shield-partial',
  'Orta Koruma': 'shield-medium',
  'Tam Koruma': 'shield-full',
  'Çocuk Koltuğu': 'child-seat',
  'Yedek Sürücü': 'extra-driver',
  'Ek Kilometre': 'extra-km',
};

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40';

/** The 3D image of an option. "Other" has none, so it gets a line icon in a tinted circle. */
const Illustration: React.FC<{ preset: string }> = ({ preset }) => {
  const name = ILLUSTRATIONS[preset];
  if (!name) {
    return (
      <span className="grid h-16 w-16 shrink-0 place-items-center">
        <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-[#6EA4E7]/[0.14] text-brand-strong">
          <Pencil size={20} />
        </span>
      </span>
    );
  }
  const base = `${ILLUSTRATION_DIR}/${name}`;
  return (
    <img
      src={`${base}.webp`}
      srcSet={`${base}.webp 160w, ${base}@2x.webp 320w`}
      sizes="64px"
      width={64}
      height={64}
      alt=""
      draggable={false}
      className="h-16 w-16 shrink-0 object-contain"
    />
  );
};

const OptionText: React.FC<{ title: string; description?: string }> = ({ title, description }) => (
  <>
    <span className="block text-[14px] font-semibold tracking-[-0.01em] text-foreground">{title}</span>
    {description && <span className="mt-0.5 block text-[12.5px] leading-snug text-black/55">{description}</span>}
  </>
);

const optionCard = (selected: boolean) => cn(
  'surface-depth rounded-2xl border-2 transition-colors',
  selected ? 'border-[#6EA4E7] bg-[#F1F6FD]' : 'border-[#EDEEF2] bg-white',
);

const Radio: React.FC<{ selected: boolean }> = ({ selected }) => (
  <span className={cn(
    'grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 text-white transition-colors',
    selected ? 'border-[#6EA4E7] bg-[#6EA4E7]' : 'border-black/20 bg-white',
  )}>
    {selected && <Check size={13} strokeWidth={3} />}
  </span>
);

const ToggleSwitch: React.FC<{ checked: boolean; label: string; onChange: () => void }> = ({ checked, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={cn('grid h-11 w-14 place-items-center rounded-full', FOCUS_RING)}
  >
    <span className={cn('flex h-7 w-12 items-center rounded-full p-0.5 transition-colors', checked ? 'bg-[#6EA4E7]' : 'bg-black/[0.14]')}>
      <span className={cn('h-6 w-6 rounded-full bg-white shadow-sm transition-[margin] duration-150', checked && 'ms-5')} />
    </span>
  </button>
);

const StepButton: React.FC<{ label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }> = ({ label, disabled, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'grid h-11 w-11 place-items-center rounded-full border border-[#E1E3E8] bg-white text-foreground transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:text-black/25 disabled:hover:bg-white md:h-9 md:w-9',
      FOCUS_RING,
    )}
  >
    {children}
  </button>
);

const QuantityStepper: React.FC<{ title: string; value: number; onChange: (value: number) => void }> = ({ title, value, onChange }) => (
  <div role="group" aria-label={`${title} quantity`} className="flex items-center">
    <StepButton label={`Remove one: ${title}`} disabled={value === 0} onClick={() => onChange(value - 1)}>
      <Minus size={15} strokeWidth={2.25} />
    </StepButton>
    <span aria-live="polite" className="w-7 text-center text-[15px] font-semibold tabular-nums text-foreground">{value}</span>
    <StepButton label={`Add one: ${title}`} disabled={value >= MAX_SERVICE_QUANTITY} onClick={() => onChange(value + 1)}>
      <Plus size={15} strokeWidth={2.25} />
    </StepButton>
  </div>
);

const Heading: React.FC<{ icon: React.ReactNode; title: string; changed?: boolean }> = ({ icon, title, changed }) => (
  <div className="mb-2.5 flex items-center gap-2.5">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#6EA4E7]/[0.14] text-brand-strong">{icon}</span>
    <h3 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
    {changed && <span title="Changed" aria-label="Changed" className="h-1.5 w-1.5 rounded-full bg-[#6EA4E7]" />}
  </div>
);

const CustomField: React.FC<{ label: string; placeholder: string; value: string; onChange: (value: string) => void }> = ({ label, placeholder, value, onChange }) => (
  <div className="px-3 pb-3">
    <input
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={INPUT}
    />
  </div>
);

/** Every option is a full-width card, so the image, the words and the control all have room. */
export const CoverSection: React.FC<{
  form: BookingFormData;
  setForm: React.Dispatch<React.SetStateAction<BookingFormData>>;
  insuranceChanged: boolean;
  extrasChanged: boolean;
}> = ({ form, setForm, insuranceChanged, extrasChanged }) => {
  const toggleInsurance = (preset: string) => setForm((current) => {
    const next = current.insurance_type_select === preset ? '' : preset;
    return { ...current, insurance_type_select: next, insurance_type_custom: next === OTHER_PRESET ? current.insurance_type_custom : '' };
  });

  const toggleService = (service: string) => setForm((current) => {
    const on = current.additional_services_selected.includes(service);
    return {
      ...withServiceQuantity(current, service, on ? 0 : 1),
      additional_services_custom: on && service === OTHER_PRESET ? '' : current.additional_services_custom,
    };
  });

  return (
    <>
      <section>
        <Heading icon={<ShieldCheck size={15} />} title="Insurance" changed={insuranceChanged} />
        <div role="radiogroup" aria-label="Insurance" className="grid grid-cols-1 gap-2.5">
          {[...INSURANCE_PRESETS, OTHER_PRESET].map((preset) => {
            const selected = form.insurance_type_select === preset;
            return (
              <div key={preset} className={optionCard(selected)}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => toggleInsurance(preset)}
                  className={cn('flex w-full items-center gap-3 rounded-[14px] p-3 text-start', FOCUS_RING)}
                >
                  <Illustration preset={preset} />
                  <span className="min-w-0 flex-1">
                    <OptionText title={PRESET_LABELS[preset]} description={INSURANCE_DESCRIPTIONS[preset]} />
                  </span>
                  <Radio selected={selected} />
                </button>
                {selected && preset === OTHER_PRESET && (
                  <CustomField
                    label="Insurance name"
                    placeholder="Enter insurance"
                    value={form.insurance_type_custom}
                    onChange={(value) => setForm((current) => ({ ...current, insurance_type_custom: value }))}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-2">
        <Heading icon={<Sparkles size={15} />} title="Extras" changed={extrasChanged} />
        <div role="group" aria-label="Extras" className="grid grid-cols-1 gap-2.5">
          {[...ADDITIONAL_SERVICE_PRESETS, OTHER_PRESET].map((service) => {
            const title = PRESET_LABELS[service];
            const quantity = serviceQuantity(form, service);
            return (
              <div key={service} className={optionCard(quantity > 0)}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                  <Illustration preset={service} />
                  <div className="min-w-0 flex-[1_1_110px]">
                    <OptionText title={title} description={SERVICE_DESCRIPTIONS[service]} />
                  </div>
                  <div className="ms-auto shrink-0">
                    {QUANTITY_SERVICES.includes(service)
                      ? <QuantityStepper title={title} value={quantity} onChange={(value) => setForm((current) => withServiceQuantity(current, service, value))} />
                      : <ToggleSwitch checked={quantity > 0} label={title} onChange={() => toggleService(service)} />}
                  </div>
                </div>
                {quantity > 0 && service === OTHER_PRESET && (
                  <CustomField
                    label="Other extra"
                    placeholder="Enter custom service"
                    value={form.additional_services_custom}
                    onChange={(value) => setForm((current) => ({ ...current, additional_services_custom: value }))}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
};
