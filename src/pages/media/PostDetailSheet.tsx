import React, { useState } from 'react';
import { savePost } from '../../lib/media/actions';
import { formatFullDate, parseISODate } from '../../lib/media/dates';
import type { MediaFormat, MediaGoal, MediaPost } from '../../lib/media/types';
import { ExternalLink, Hash } from '../../components/media/MediaIcons';
import { PostedToggle } from '../../components/media/MediaShared';
import { toast } from '../../components/media/MediaToast';
import {
  Button,
  Field,
  Input,
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
  post_date: string;
  week_label: string;
  goal_key: string;
  format_key: string;
  objective: string;
  visual_script: string;
  caption: string;
  cta: string;
  media_link: string;
}

const PostForm: React.FC<{
  post: MediaPost | null;
  defaultDate?: string;
  goals: MediaGoal[];
  formats: MediaFormat[];
  postedPending: boolean;
  onTogglePosted: () => void;
  onClose: () => void;
  onSaved: () => void;
}> = ({ post, defaultDate, goals, formats, postedPending, onTogglePosted, onClose, onSaved }) => {
  const [form, setForm] = useState<FormState>(() => ({
    post_date: post?.post_date?.slice(0, 10) ?? defaultDate ?? '',
    week_label: post?.week_label ?? '',
    goal_key: post?.goal_key ?? '',
    format_key: post?.format_key ?? '',
    objective: post?.objective ?? '',
    visual_script: post?.visual_script ?? '',
    caption: post?.caption ?? '',
    cta: post?.cta ?? '',
    media_link: post?.media_link ?? '',
  }));
  const [pending, setPending] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const goalOptions: SelectOption[] = [
    { value: NONE, label: 'None', muted: true },
    ...goals.map((g) => ({ value: g.key, label: g.label, color: g.color })),
  ];
  const formatOptions: SelectOption[] = [
    { value: NONE, label: 'None', muted: true },
    ...formats.map((f) => ({ value: f.key, label: f.label })),
  ];

  async function submit() {
    setPending(true);
    const result = await savePost({
      id: post?.id,
      post_date: form.post_date || null,
      week_label: form.week_label || null,
      goal_key: form.goal_key || null,
      format_key: form.format_key || null,
      objective: form.objective || null,
      visual_script: form.visual_script || null,
      caption: form.caption || null,
      cta: form.cta || null,
      media_link: form.media_link || null,
    });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error ?? "Couldn't save the post");
      return;
    }
    toast.success(post ? 'Post updated' : 'Post created');
    onSaved();
    onClose();
  }

  return (
    <>
      <SheetHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SheetTitle>{post ? 'Post details' : 'New post'}</SheetTitle>
            <SheetDescription>
              {post?.post_date
                ? formatFullDate(parseISODate(post.post_date))
                : 'Schedule a piece of content on the calendar.'}
            </SheetDescription>
          </div>
          {post && (
            <div className="mr-8 flex shrink-0 flex-col items-end gap-1">
              <PostedToggle
                posted={post.posted}
                pending={postedPending}
                onToggle={onTogglePosted}
                ariaLabel="Mark this post as posted"
              />
              {typeof post.week_no === 'number' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-black/35">
                  <Hash size={10} strokeWidth={2} />
                  Week {post.week_no}
                </span>
              )}
            </div>
          )}
        </div>
      </SheetHeader>

      <SheetBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date">
            <Input
              type="date"
              value={form.post_date}
              onChange={(e) => set('post_date', e.target.value)}
              className="tabular-nums"
            />
          </Field>
          <Field label="Week label">
            <Input
              value={form.week_label}
              onChange={(e) => set('week_label', e.target.value)}
              placeholder="e.g. Launch week"
            />
          </Field>
        </div>

        {post && typeof post.week_no === 'number' && (
          <p className="-mt-2 text-[11.5px] text-black/35">
            Week number is calculated from the date by the database.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Goal">
            <Select
              size="lg"
              ariaLabel="Post goal"
              value={form.goal_key || NONE}
              options={goalOptions}
              onChange={(v) => set('goal_key', v === NONE ? '' : v)}
              className={form.goal_key ? 'text-[#0e0e10]' : 'text-black/35'}
            />
          </Field>
          <Field label="Format">
            <Select
              size="lg"
              ariaLabel="Post format"
              value={form.format_key || NONE}
              options={formatOptions}
              onChange={(v) => set('format_key', v === NONE ? '' : v)}
              className={form.format_key ? 'text-[#0e0e10]' : 'text-black/35'}
            />
          </Field>
        </div>

        <Field label="Objective">
          <Input
            value={form.objective}
            onChange={(e) => set('objective', e.target.value)}
            placeholder="What should this post achieve?"
          />
        </Field>

        <Field label="Text on visual / video script">
          <Textarea
            rows={4}
            value={form.visual_script}
            onChange={(e) => set('visual_script', e.target.value)}
            placeholder="On-screen copy, shot list, or voiceover script."
            className="resize-none"
          />
        </Field>

        <Field label="Caption">
          <Textarea
            rows={5}
            value={form.caption}
            onChange={(e) => set('caption', e.target.value)}
            placeholder="The caption as it will be published."
            className="resize-none"
          />
        </Field>

        <Field label="CTA">
          <Input
            value={form.cta}
            onChange={(e) => set('cta', e.target.value)}
            placeholder="e.g. Book now via the link in bio"
          />
        </Field>

        <Field label="Media link">
          <div className="flex items-center gap-2">
            <Input
              value={form.media_link}
              onChange={(e) => set('media_link', e.target.value)}
              placeholder="https://…"
            />
            {form.media_link && (
              <a
                href={form.media_link}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open media link in a new tab"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/[0.08] text-black/45 transition-colors hover:bg-black/[0.03] hover:text-black/70"
              >
                <ExternalLink size={14} strokeWidth={1.75} />
              </a>
            )}
          </div>
        </Field>

        {post?.source_idea_id && (
          <p className="rounded-xl bg-black/[0.025] px-3 py-2.5 text-[12px] text-black/45">
            Created from an idea in the Ideas board.
          </p>
        )}
      </SheetBody>

      <SheetFooter>
        <Button variant="outline" size="lg" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button size="lg" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : post ? 'Save changes' : 'Create post'}
        </Button>
      </SheetFooter>
    </>
  );
};

export const PostDetailSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  post: MediaPost | null;
  defaultDate?: string;
  goals: MediaGoal[];
  formats: MediaFormat[];
  postedPending: boolean;
  onTogglePosted: () => void;
}> = ({
  open,
  onClose,
  onSaved,
  post,
  defaultDate,
  goals,
  formats,
  postedPending,
  onTogglePosted,
}) => (
  <Sheet
    open={open}
    onClose={onClose}
    maxWidthClass="sm:max-w-[520px]"
    ariaLabel={post ? 'Post details' : 'New post'}
  >
    {open && (
      <PostForm
        key={post?.id ?? `new:${defaultDate ?? ''}`}
        post={post}
        defaultDate={defaultDate}
        goals={goals}
        formats={formats}
        postedPending={postedPending}
        onTogglePosted={onTogglePosted}
        onClose={onClose}
        onSaved={onSaved}
      />
    )}
  </Sheet>
);
