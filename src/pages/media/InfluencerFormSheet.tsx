import React, { useState } from 'react';
import { saveInfluencer } from '../../lib/media/actions';
import { TONE_DOTS } from '../../lib/media/badgeColor';
import { COUNTRIES, flagEmoji } from '../../lib/media/countries';
import {
  FINAL_DECISIONS,
  INFLUENCER_TYPES,
  MESSAGING_STATUSES,
  type MediaInfluencer,
} from '../../lib/media/types';
import { toast } from '../../components/media/MediaToast';
import {
  Button,
  Field,
  Input,
  RequiredMark,
  Select,
  Sheet,
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
  type SelectOption,
} from '../../components/media/MediaUI';

const NONE = '_none';

interface FormState {
  name: string;
  followers_count: string;
  url: string;
  email_contact: string;
  type: string;
  country: string;
  notes: string;
  messaging_status: string;
  final_decision: string;
}

const InfluencerForm: React.FC<{
  influencer: MediaInfluencer | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ influencer, onClose, onSaved }) => {
  const [form, setForm] = useState<FormState>(() => ({
    name: influencer?.name ?? '',
    followers_count: influencer?.followers_count ?? '',
    url: influencer?.url ?? '',
    email_contact: influencer?.email_contact ?? '',
    type: influencer?.type ?? '',
    country: influencer?.country ?? '',
    notes: influencer?.notes ?? '',
    messaging_status: influencer?.messaging_status ?? '',
    final_decision: influencer?.final_decision ?? '',
  }));
  const [pending, setPending] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const typeOptions: SelectOption[] = [
    { value: NONE, label: 'None', muted: true },
    ...INFLUENCER_TYPES.map((t) => ({
      value: t.value,
      label: t.label,
      dotClass: TONE_DOTS[t.tone],
    })),
  ];

  const countryOptions: SelectOption[] = [
    { value: NONE, label: 'Select country', muted: true },
    ...COUNTRIES.map((c) => ({ value: c.code, label: `${flagEmoji(c.code)} ${c.name}` })),
  ];

  const statusOptions: SelectOption[] = [
    { value: NONE, label: 'Not set', muted: true },
    ...MESSAGING_STATUSES.map((s) => ({
      value: s.value,
      label: s.label,
      dotClass: TONE_DOTS[s.tone],
    })),
  ];

  const decisionOptions: SelectOption[] = [
    { value: NONE, label: 'Not set', muted: true },
    ...FINAL_DECISIONS.map((d) => ({
      value: d.value,
      label: d.label,
      dotClass: TONE_DOTS[d.tone],
    })),
  ];

  async function submit() {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setPending(true);
    const result = await saveInfluencer({
      id: influencer?.id,
      name: form.name,
      followers_count: form.followers_count || null,
      url: form.url || null,
      email_contact: form.email_contact || null,
      type: form.type || null,
      country: form.country || null,
      notes: form.notes || null,
      messaging_status: form.messaging_status || null,
      final_decision: form.final_decision || null,
    });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error ?? "Couldn't save the influencer");
      return;
    }
    toast.success(influencer ? 'Influencer updated' : 'Influencer added');
    onSaved();
    onClose();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{influencer ? 'Edit influencer' : 'New influencer'}</SheetTitle>
        <SheetDescription>
          Creator contacts and where each one stands in the outreach pipeline.
        </SheetDescription>
      </SheetHeader>

      <SheetBody>
        <Field
          label={
            <>
              Name
              <RequiredMark />
            </>
          }
        >
          <Input
            autoFocus
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Creator or account name"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Followers">
            <Input
              value={form.followers_count}
              onChange={(e) => set('followers_count', e.target.value)}
              placeholder="e.g. 124K"
              className="tabular-nums"
            />
          </Field>
          <Field label="Type">
            <Select
              size="lg"
              ariaLabel="Influencer type"
              value={form.type || NONE}
              options={typeOptions}
              onChange={(v) => set('type', v === NONE ? '' : v)}
              className={form.type ? 'text-[#0e0e10]' : 'text-black/35'}
            />
          </Field>
        </div>

        <Field label="Country">
          <Select
            size="lg"
            ariaLabel="Influencer country"
            value={form.country || NONE}
            options={countryOptions}
            onChange={(v) => set('country', v === NONE ? '' : v)}
            className={form.country ? 'text-[#0e0e10]' : 'text-black/35'}
          />
        </Field>

        <Field label="Profile URL">
          <Input
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://instagram.com/…"
          />
        </Field>

        <Field label="Email / contact">
          <Input
            value={form.email_contact}
            onChange={(e) => set('email_contact', e.target.value)}
            placeholder="name@example.com or a WhatsApp number"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Messaging status">
            <Select
              size="lg"
              ariaLabel="Messaging status"
              value={form.messaging_status || NONE}
              options={statusOptions}
              onChange={(v) => set('messaging_status', v === NONE ? '' : v)}
              className={form.messaging_status ? 'text-[#0e0e10]' : 'text-black/35'}
            />
          </Field>
          <Field label="Final decision">
            <Select
              size="lg"
              ariaLabel="Final decision"
              value={form.final_decision || NONE}
              options={decisionOptions}
              onChange={(v) => set('final_decision', v === NONE ? '' : v)}
              className={form.final_decision ? 'text-[#0e0e10]' : 'text-black/35'}
            />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea
            rows={4}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Rates, audience fit, past collaborations…"
            className="resize-none"
          />
        </Field>
      </SheetBody>

      <SheetFooter>
        <Button variant="outline" size="lg" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button size="lg" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : influencer ? 'Save changes' : 'Add influencer'}
        </Button>
      </SheetFooter>
    </>
  );
};

export const InfluencerFormSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  influencer: MediaInfluencer | null;
}> = ({ open, onClose, onSaved, influencer }) => (
  <Sheet
    open={open}
    onClose={onClose}
    ariaLabel={influencer ? 'Edit influencer' : 'New influencer'}
  >
    {open && (
      <InfluencerForm
        key={influencer?.id ?? 'new'}
        influencer={influencer}
        onClose={onClose}
        onSaved={onSaved}
      />
    )}
  </Sheet>
);
