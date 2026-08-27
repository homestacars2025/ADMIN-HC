import React, { useState } from 'react';
import { saveIdea } from '../../lib/media/actions';
import { IDEA_CATEGORIES, type MediaFormat, type MediaGoal, type MediaIdea } from '../../lib/media/types';
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

/** A Select cannot hold `""`, so "no choice" always travels as a sentinel. */
const NONE = '_none';

interface FormState {
  title: string;
  content: string;
  category: string;
  format_key: string;
  goal_key: string;
  note: string;
}

const IdeaForm: React.FC<{
  idea: MediaIdea | null;
  goals: MediaGoal[];
  formats: MediaFormat[];
  defaultCategory?: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ idea, goals, formats, defaultCategory, onClose, onSaved }) => {
  // Seeded once, on mount. The sheet remounts this form per opening (keyed by
  // target), so there is no effect syncing props into state and no stale draft.
  const [form, setForm] = useState<FormState>(() => ({
    title: idea?.title ?? '',
    content: idea?.content ?? '',
    category: idea?.category ?? defaultCategory ?? '',
    format_key: idea?.format_key ?? '',
    goal_key: idea?.goal_key ?? '',
    note: idea?.note ?? '',
  }));
  const [pending, setPending] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const categoryOptions: SelectOption[] = [
    { value: NONE, label: 'None', muted: true },
    ...IDEA_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
  ];

  const formatOptions: SelectOption[] = [
    { value: NONE, label: 'None', muted: true },
    ...formats.map((f) => ({ value: f.key, label: f.label })),
  ];

  const goalOptions: SelectOption[] = [
    { value: NONE, label: 'None', muted: true },
    ...goals.map((g) => ({ value: g.key, label: g.label, color: g.color })),
  ];

  async function submit() {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setPending(true);
    const result = await saveIdea({
      id: idea?.id,
      title: form.title,
      content: form.content || null,
      category: form.category || null,
      goal_key: form.goal_key || null,
      format_key: form.format_key || null,
      note: form.note || null,
    });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error ?? "Couldn't save the idea");
      return;
    }
    toast.success(idea ? 'Idea updated' : 'Idea added');
    onSaved();
    onClose();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{idea ? 'Edit idea' : 'New idea'}</SheetTitle>
        <SheetDescription>
          {idea
            ? 'Update the concept. Posted and Approved are set from the card.'
            : 'Capture the concept — you can turn it into a scheduled post later.'}
        </SheetDescription>
      </SheetHeader>

      <SheetBody>
        <Field
          label={
            <>
              Title
              <RequiredMark />
            </>
          }
        >
          <Input
            autoFocus
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Sunrise Bosphorus drive"
          />
        </Field>

        <Field label="Content">
          <Textarea
            rows={5}
            value={form.content}
            onChange={(e) => set('content', e.target.value)}
            placeholder="What is the piece about? This becomes the first draft of the caption."
            className="resize-none"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select
              size="lg"
              ariaLabel="Idea category"
              value={form.category || NONE}
              options={categoryOptions}
              onChange={(v) => set('category', v === NONE ? '' : v)}
              className={form.category ? 'text-[#0e0e10]' : 'text-black/35'}
            />
          </Field>
          <Field label="Format">
            <Select
              size="lg"
              ariaLabel="Idea format"
              value={form.format_key || NONE}
              options={formatOptions}
              onChange={(v) => set('format_key', v === NONE ? '' : v)}
              className={form.format_key ? 'text-[#0e0e10]' : 'text-black/35'}
            />
          </Field>
        </div>

        <Field label="Goal">
          <Select
            size="lg"
            ariaLabel="Idea goal"
            value={form.goal_key || NONE}
            options={goalOptions}
            onChange={(v) => set('goal_key', v === NONE ? '' : v)}
            className={form.goal_key ? 'text-[#0e0e10]' : 'text-black/35'}
          />
        </Field>

        <Field label="Note">
          <Textarea
            rows={3}
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="Internal reminder — props needed, location, who shoots it…"
            className="resize-none"
          />
        </Field>
      </SheetBody>

      <SheetFooter>
        <Button variant="outline" size="lg" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button size="lg" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : idea ? 'Save changes' : 'Add idea'}
        </Button>
      </SheetFooter>
    </>
  );
};

export const IdeaFormSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  idea: MediaIdea | null;
  goals: MediaGoal[];
  formats: MediaFormat[];
  defaultCategory?: string;
}> = ({ open, onClose, onSaved, idea, goals, formats, defaultCategory }) => (
  <Sheet open={open} onClose={onClose} ariaLabel={idea ? 'Edit idea' : 'New idea'}>
    {open && (
      <IdeaForm
        key={idea?.id ?? `new:${defaultCategory ?? ''}`}
        idea={idea}
        goals={goals}
        formats={formats}
        defaultCategory={defaultCategory}
        onClose={onClose}
        onSaved={onSaved}
      />
    )}
  </Sheet>
);
