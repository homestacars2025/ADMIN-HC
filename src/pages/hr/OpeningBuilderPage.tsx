import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, Trash2 } from '../../components/media/MediaIcons';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button, Spinner, Switch } from '../../components/media/MediaUI';
import { LoadError } from '../../components/shared/PageBits';
import { useCurrentProfile } from '../../hooks/useCurrentProfile';
import { cn } from '../../lib/media/badgeColor';
import { getOpening, openingProblem, saveOpening, setOpeningStatus, slugify, toOpeningDraft, type Opening, type OpeningDraft } from '../../lib/recruitment/hr';
import {
  CHOICE_TYPES,
  FILE_SLOTS,
  FORM_LANGS,
  QUESTION_TYPES,
  labelParts,
  nextKey,
  optionValue,
  pickLabel,
  type FieldOption,
  type FormField,
  type FormLang,
  type InterviewCriterion,
  type OpeningStatus,
  type QuestionType,
} from '../../lib/recruitment/model';
import { FILE_SLOT_LABELS, OPENING_PROBLEMS, OPENING_STATUS_LABELS, QUESTION_TYPE_LABELS } from '../../lib/recruitment/labels';
import { INPUT } from '../bookings/ui';
import { KnockoutRulesEditor } from './KnockoutRulesEditor';
import { HR_BASE, OpeningStatusChip, openingPath, BackLink } from './hrParts';
import { PublicLink } from './HrOpeningsPage';

const SELECT = cn(INPUT, 'cursor-pointer');
const LANG_NAMES: Record<FormLang, string> = { ar: 'Arabic', en: 'English', tr: 'Turkish' };

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const RowTools: React.FC<{ index: number; count: number; label: string; onMove: (to: number) => void; onRemove: () => void }> = ({ index, count, label, onMove, onRemove }) => (
  <div className="flex shrink-0 items-end gap-1">
    <button type="button" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(index - 1)} className="grid h-11 w-11 place-items-center rounded-[10px] text-black/45 hover:bg-black/[0.05] disabled:opacity-30 md:h-10 md:w-9"><ArrowUp size={15} /></button>
    <button type="button" aria-label={`Move ${label} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)} className="grid h-11 w-11 place-items-center rounded-[10px] text-black/45 hover:bg-black/[0.05] disabled:opacity-30 md:h-10 md:w-9"><ArrowDown size={15} /></button>
    <button type="button" aria-label={`Remove ${label}`} onClick={onRemove} className="grid h-11 w-11 place-items-center rounded-[10px] text-black/40 hover:bg-[#DC2626]/[0.07] hover:text-[#B91C1C] md:h-10 md:w-9"><Trash2 size={15} /></button>
  </div>
);

const Section: React.FC<{ title: string; hint?: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, aside, children }) => (
  <section className="surface-depth rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
    <header className="mb-3.5 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
        {hint && <p className="mt-0.5 text-[12.5px] text-black/50">{hint}</p>}
      </div>
      {aside}
    </header>
    {children}
  </section>
);

const Label: React.FC<{ text: string; children: React.ReactNode; className?: string }> = ({ text, children, className }) => (
  <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
    <span className="text-[12.5px] font-medium text-black/65">{text}</span>
    {children}
  </label>
);

/** Options as lines of their values; a line that matches an option keeps its translations. */
function optionsFromLines(lines: string[], previous: FieldOption[]): FieldOption[] {
  return lines.map((line) => previous.find((option) => optionValue(option) === line.trim()) ?? line);
}

/**
 * Create or edit an opening: its basics, whether it's public and where, the application
 * form, the knock-out rules, the weighted scorecard and the read-aloud questions. Keys
 * are never reused, so answers already given stay with their question.
 */
const OpeningBuilderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useCurrentProfile();
  const [opening, setOpening] = useState<Opening | null>(null);
  const [draft, setDraft] = useState<OpeningDraft>(() => toOpeningDraft(null));
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [languages, setLanguages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    getOpening(id).then((found) => {
      if (!active) return;
      setLoading(false);
      if (!found) { setLoadError("This opening doesn't exist or was removed."); return; }
      setOpening(found);
      setDraft(toOpeningDraft(found));
      setSlug(found.publicSlug ?? slugify(found.title));
    }).catch((reason: unknown) => { if (active) { setLoading(false); setLoadError(reason instanceof Error ? reason.message : String(reason)); } });
    return () => { active = false; };
  }, [id]);

  const problem = openingProblem(draft);
  const set = <K extends keyof OpeningDraft>(key: K, value: OpeningDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const setField = (index: number, patch: Partial<FormField>) => set('formSchema', draft.formSchema.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  const setCriterion = (index: number, patch: Partial<InterviewCriterion>) => set('interviewCriteria', draft.interviewCriteria.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const weightTotal = draft.interviewCriteria.reduce((sum, c) => sum + (c.weight ?? 0), 0);
  const usedSlots = new Set(draft.formSchema.filter((field) => field.type === 'file').map((field) => field.key));

  const setLabel = (index: number, lang: FormLang, text: string) => {
    const field = draft.formSchema[index];
    const parts = labelParts(field.label);
    parts[lang] = text;
    const filled = FORM_LANGS.filter((code) => parts[code].trim() || code === 'en');
    // One language stays a plain string, as the form reads either.
    setField(index, { label: filled.length === 1 && filled[0] === 'en' ? parts.en : parts });
  };

  const setType = (index: number, type: QuestionType) => {
    const field = draft.formSchema[index];
    if (type === 'file' && field.type !== 'file') {
      const free = FILE_SLOTS.find((slot) => !usedSlots.has(slot));
      setField(index, { type, key: free ?? field.key, options: [] });
      return;
    }
    if (type !== 'file' && field.type === 'file') {
      setField(index, { type, key: nextKey(draft.formSchema.filter((item) => item.type !== 'file'), 'q') });
      return;
    }
    setField(index, { type });
  };

  const save = async () => {
    setShowErrors(true);
    if (problem) return;
    setSaving(true);
    try {
      const saved = await saveOpening(id ?? null, draft, profile?.id ?? null);
      toast.success(id ? 'Opening saved' : 'Opening created');
      if (!id) navigate(`${openingPath(saved)}/edit`, { replace: true });
    } catch (reason) {
      toast.error(`Couldn't save: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: OpeningStatus) => {
    if (!opening) return;
    const nextSlug = status === 'published' ? slugify(slug) || slugify(draft.title) : null;
    setStatusBusy(true);
    try {
      await setOpeningStatus(opening.id, status, nextSlug);
      setOpening({ ...opening, status, publicSlug: nextSlug ?? opening.publicSlug });
      toast.success(`Opening is now ${OPENING_STATUS_LABELS[status].toLowerCase()}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      toast.error(message === 'slug-taken' ? 'That link name is taken. Try another.' : `Couldn't save: ${message}`);
    } finally {
      setStatusBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => <div className="media-scope mx-auto max-w-[920px] px-4 py-6 pb-28 sm:px-6 lg:py-9"><MediaToaster />{children}</div>;
  if (loading) return shell(<div className="flex justify-center py-20" role="status" aria-label="Loading opening"><Spinner size={20} /></div>);
  if (loadError) return shell(<><BackLink to={HR_BASE}>All openings</BackLink><LoadError message={loadError} onRetry={() => window.location.reload()} /></>);

  return shell(
    <>
      <header className="mb-5">
        <BackLink to={id ? openingPath(id) : HR_BASE}>{id ? draft.title || 'Back to the pipeline' : 'All openings'}</BackLink>
        <h1 className="text-[22px] font-medium tracking-[-0.022em] text-foreground sm:text-[26px]">{id ? 'Edit opening' : 'New opening'}</h1>
      </header>

      <div className="flex flex-col gap-4">
        <Section title="Basics">
          <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <Label text="Title" className="sm:col-span-2">
              <input dir="auto" className={cn(INPUT, showErrors && problem === 'title' && '!border-[#DC2626]')} value={draft.title} onChange={(event) => set('title', event.target.value)} />
            </Label>
            <Label text="Department"><input dir="auto" className={INPUT} value={draft.department} onChange={(event) => set('department', event.target.value)} /></Label>
            <Label text="Positions"><input inputMode="numeric" className={cn(INPUT, 'tabular-nums', showErrors && problem === 'positions' && '!border-[#DC2626]')} value={draft.positionsCount} onChange={(event) => set('positionsCount', event.target.value)} /></Label>
            <Label text="Description" className="sm:col-span-2"><textarea dir="auto" rows={4} className={cn(INPUT, '!h-auto py-2.5')} value={draft.description} onChange={(event) => set('description', event.target.value)} /></Label>
          </div>
        </Section>

        {opening && (
          <Section title="Status and public link" aside={<OpeningStatusChip status={opening.status} />}>
            {opening.status === 'published' && opening.publicSlug ? (
              <PublicLink slug={opening.publicSlug} />
            ) : (
              <Label text="Public link name">
                <div className="flex items-center gap-1 rounded-[10px] border border-[#E5E7EB] bg-white ps-3 focus-within:border-[#6EA4E7]">
                  <span className="shrink-0 font-mono text-[12.5px] text-black/40">homestacars.com/careers/</span>
                  <input className="h-11 min-w-0 flex-1 bg-transparent pe-3 font-mono text-[13px] outline-none md:h-10" value={slug} onChange={(event) => setSlug(event.target.value)} />
                </div>
                <span className="text-[12px] text-black/45">Letters, numbers and dashes. It becomes the link when you publish.</span>
              </Label>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {opening.status !== 'published' && <Button disabled={statusBusy} size="lg" className="!h-11 px-4 md:!h-9" onClick={() => changeStatus('published')}>{opening.status === 'closed' ? 'Reopen' : 'Publish'}</Button>}
              {opening.status === 'published' && <Button variant="outline" disabled={statusBusy} size="lg" className="!h-11 px-4 md:!h-9" onClick={() => changeStatus('closed')}>Close opening</Button>}
            </div>
          </Section>
        )}

        <Section title="Application form" hint="What applicants answer, on top of name, age, phone, nationality and where they live. Each question keeps its key, so answers already given stay attached.">
          {draft.formSchema.length === 0 && <p className="mb-2 text-[12.5px] text-black/45">No questions yet.</p>}
          <ol className="flex flex-col gap-3">
            {draft.formSchema.map((field, index) => {
              const parts = labelParts(field.label);
              const open = languages.has(field.key) || Boolean(parts.ar || parts.tr);
              const missingLabel = showErrors && !pickLabel(field.label, 'en').trim();
              return (
                <li key={`${field.key}-${index}`} className="rounded-[14px] border border-subtle bg-white p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Label text={`Question · ${field.key}`} className="flex-1">
                      <input dir="auto" aria-label={`Question ${index + 1} in English`} className={cn(INPUT, missingLabel && '!border-[#DC2626]')} placeholder="In English" value={parts.en} onChange={(event) => setLabel(index, 'en', event.target.value)} />
                    </Label>
                    <Label text="Type" className="sm:w-48">
                      <select aria-label={`Question ${index + 1} type`} className={SELECT} value={field.type} onChange={(event) => setType(index, event.target.value as QuestionType)}>
                        {QUESTION_TYPES.map((type) => <option key={type} value={type} disabled={type === 'file' && field.type !== 'file' && usedSlots.size >= FILE_SLOTS.length}>{QUESTION_TYPE_LABELS[type]}</option>)}
                      </select>
                    </Label>
                    <RowTools index={index} count={draft.formSchema.length} label={`question ${index + 1}`} onMove={(to) => set('formSchema', move(draft.formSchema, index, to))} onRemove={() => set('formSchema', draft.formSchema.filter((_, i) => i !== index))} />
                  </div>
                  {open ? (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {(['ar', 'tr'] as const).map((lang) => (
                        <input key={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} aria-label={`Question ${index + 1} in ${LANG_NAMES[lang]}`} className={INPUT} placeholder={`In ${LANG_NAMES[lang]}`} value={parts[lang]} onChange={(event) => setLabel(index, lang, event.target.value)} />
                      ))}
                    </div>
                  ) : (
                    <button type="button" className="mt-1.5 min-h-[44px] text-[12.5px] font-medium text-brand-strong hover:underline md:min-h-0" onClick={() => setLanguages((current) => new Set(current).add(field.key))}>+ Arabic and Turkish</button>
                  )}
                  {field.type === 'file' && (
                    <Label text="Uploads" className="mt-2">
                      <select aria-label={`Question ${index + 1} file`} className={cn(SELECT, showErrors && problem === 'fileKey' && '!border-[#DC2626]')} value={field.key} onChange={(event) => setField(index, { key: event.target.value })}>
                        {FILE_SLOTS.map((slot) => <option key={slot} value={slot} disabled={slot !== field.key && usedSlots.has(slot)}>{FILE_SLOT_LABELS[slot]}</option>)}
                        {!(FILE_SLOTS as readonly string[]).includes(field.key) && <option value={field.key}>{field.key} (not a file slot)</option>}
                      </select>
                    </Label>
                  )}
                  {CHOICE_TYPES.includes(field.type) && (
                    <Label text="Options, one per line" className="mt-2">
                      <textarea dir="auto" rows={3} aria-label={`Question ${index + 1} options`} className={cn(INPUT, '!h-auto py-2', showErrors && field.options.filter((o) => optionValue(o).trim()).length < 2 && '!border-[#DC2626]')}
                        value={field.options.map(optionValue).join('\n')} onChange={(event) => setField(index, { options: optionsFromLines(event.target.value.split('\n'), field.options) })} />
                    </Label>
                  )}
                  <label className="mt-2.5 inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] text-black/70 md:min-h-0">
                    <Switch checked={field.required} onChange={(next) => setField(index, { required: next })} ariaLabel={`Question ${index + 1} required`} />
                    Required
                  </label>
                </li>
              );
            })}
          </ol>
          <Button type="button" variant="ghost" size="sm" className="mt-2 !h-11 text-brand-strong md:!h-8" onClick={() => set('formSchema', [...draft.formSchema, { key: nextKey(draft.formSchema.filter((field) => field.type !== 'file'), 'q'), type: 'short_text', label: '', required: false, options: [] }])}>
            <Plus size={14} /> Add question
          </Button>
        </Section>

        <Section title="Knock-out rules" hint="Checked on submit. An application that breaks one is marked Auto-rejected with your reason, for you to review and rescue if it's wrong. Yes/No answers compare as Yes or No.">
          <KnockoutRulesEditor rules={draft.knockoutRules} formSchema={draft.formSchema} showErrors={showErrors} onChange={(rules) => set('knockoutRules', rules)} />
        </Section>

        <Section
          title="Interview scorecard"
          hint="Each criterion is scored 1–5. Weights add up to 100, or leave them all empty to split evenly."
          aside={draft.interviewCriteria.some((c) => c.weight !== null) ? (
            <span className={cn('font-mono text-[12.5px] font-semibold tabular-nums', Math.round(weightTotal) === 100 ? 'text-[#047857]' : 'text-[#B45309]')}>Total {Math.round(weightTotal)} / 100</span>
          ) : undefined}
        >
          <ol className="flex flex-col gap-2">
            {draft.interviewCriteria.map((criterion, index) => (
              <li key={criterion.key} className="flex flex-col gap-2 rounded-[14px] border border-subtle bg-white p-3 sm:flex-row sm:items-end">
                <Label text="Criterion" className="flex-1"><input dir="auto" className={cn(INPUT, showErrors && !criterion.label.trim() && '!border-[#DC2626]')} value={criterion.label} onChange={(event) => setCriterion(index, { label: event.target.value })} /></Label>
                <Label text="Weight" className="sm:w-28">
                  <input inputMode="numeric" className={cn(INPUT, 'tabular-nums')} placeholder="—" value={criterion.weight ?? ''}
                    onChange={(event) => setCriterion(index, { weight: event.target.value.trim() === '' || Number.isNaN(Number(event.target.value)) ? null : Math.max(0, Number(event.target.value)) })} />
                </Label>
                <RowTools index={index} count={draft.interviewCriteria.length} label={`criterion ${index + 1}`} onMove={(to) => set('interviewCriteria', move(draft.interviewCriteria, index, to))} onRemove={() => set('interviewCriteria', draft.interviewCriteria.filter((_, i) => i !== index))} />
              </li>
            ))}
          </ol>
          <Button type="button" variant="ghost" size="sm" className="mt-2 !h-11 text-brand-strong md:!h-8" onClick={() => set('interviewCriteria', [...draft.interviewCriteria, { key: nextKey(draft.interviewCriteria, 'c'), label: '', weight: null }])}>
            <Plus size={14} /> Add criterion
          </Button>
        </Section>

        <Section title="Interview questions" hint="Read aloud during the interview; never scored.">
          <ol className="flex flex-col gap-2">
            {draft.interviewQuestions.map((question, index) => (
              // eslint-disable-next-line react/no-array-index-key -- plain strings, edited in place
              <li key={index} className="flex items-end gap-2">
                <input dir="auto" aria-label={`Interview question ${index + 1}`} className={cn(INPUT, 'min-w-0 flex-1')} value={question} onChange={(event) => set('interviewQuestions', draft.interviewQuestions.map((q, i) => (i === index ? event.target.value : q)))} />
                <RowTools index={index} count={draft.interviewQuestions.length} label={`interview question ${index + 1}`} onMove={(to) => set('interviewQuestions', move(draft.interviewQuestions, index, to))} onRemove={() => set('interviewQuestions', draft.interviewQuestions.filter((_, i) => i !== index))} />
              </li>
            ))}
          </ol>
          <Button type="button" variant="ghost" size="sm" className="mt-2 !h-11 text-brand-strong md:!h-8" onClick={() => set('interviewQuestions', [...draft.interviewQuestions, ''])}>
            <Plus size={14} /> Add question
          </Button>
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-subtle bg-surface/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:ps-[calc(var(--sidebar-w,240px)+40px)]">
        <div className="mx-auto flex max-w-[920px] items-center justify-between gap-3">
          {showErrors && problem ? <p role="alert" className="text-[13px] text-[#B91C1C]">{OPENING_PROBLEMS[problem]}</p> : <span />}
          <Button size="lg" className="!h-11 shrink-0 px-5 md:!h-10" disabled={saving} onClick={save}>{saving ? <><Spinner size={13} /> Saving…</> : id ? 'Save' : 'Create opening'}</Button>
        </div>
      </div>
    </>,
  );
};

export default OpeningBuilderPage;
