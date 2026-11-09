import React, { useCallback, useEffect, useState } from 'react';
import { Sheet, SheetBody, SheetFooter, SheetHeader, Button, Spinner, Switch } from '../../components/media/MediaUI';
import { cn } from '../../lib/media/badgeColor';
import {
  NOTE_TYPES,
  addNote,
  finishInterview,
  listActivities,
  markNoShow,
  moveStage,
  saveScore,
  setShortlisted,
  signedFileUrl,
  startInterview,
  updateApplicant,
  type Activity,
  type Applicant,
  type HrSlot,
  type Interview,
  type NoteType,
  type Opening,
} from '../../lib/recruitment/hr';
import { setConfirmation } from '../../lib/recruitment/interviews';
import {
  PRIORITIES,
  RECOMMENDATIONS,
  RECOMMENDATION_STAGE,
  RECRUITMENT_STAGES,
  answerToStrings,
  applicantFiles,
  formatDayLabel,
  formatTime,
  istanbulDay,
  optionLabel,
  pickLabel,
  readStage,
  weightedScore,
  type Priority,
  type Recommendation,
  type RecruitmentStage,
} from '../../lib/recruitment/model';
import { FILE_SLOT_LABELS, NOTE_TYPE_LABELS, PRIORITY_LABELS, RECOMMENDATION_LABELS, SOURCE_LABELS, STAGE_LABELS } from '../../lib/recruitment/labels';
import { INPUT } from '../bookings/ui';
import { AutoRejectedBadge, ConfirmationPicker, DuplicateBadge, LanguageChip, PriorityChip, ScorePicker, SourceChip, StageChip, StarRating } from './hrParts';

const SELECT = cn(INPUT, 'cursor-pointer');
const LOCALE = 'en-GB';

/** wa.me wants digits only, with the country code; a Turkish 05… number gets 90. */
export const whatsappLink = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits.startsWith('0') ? `90${digits.slice(1)}` : digits}`;
};

const Block: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, aside, children }) => (
  <section className="rounded-2xl border border-subtle bg-surface p-4">
    <header className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
      {aside}
    </header>
    {children}
  </section>
);

const FileGlyph: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
);

// ─── Live scorecard ───────────────────────────────────────────────────────────

/** Scores save as they're pressed; finishing closes the interview, and a recommendation moves the stage. */
export const ScorecardSheet: React.FC<{
  applicant: Applicant;
  opening: Opening;
  interview: Interview;
  profileId: string | null;
  onClose: () => void;
  onFinished: () => void;
  onError: (message: string) => void;
}> = ({ applicant, opening, interview, profileId, onClose, onFinished, onError }) => {
  const [scores, setScores] = useState(() => new Map(interview.scores.map((s) => [s.criterion, { score: s.score, note: s.note ?? '' }])));
  const [notes, setNotes] = useState(interview.overallNotes ?? '');
  const [recommendation, setRecommendation] = useState<Recommendation | null>(interview.recommendation);
  const [busy, setBusy] = useState(false);
  const total = weightedScore(opening.interviewCriteria, Array.from(scores, ([criterion, value]) => ({ criterion, score: value.score })));

  const put = async (criterion: string, score: number | null, note: string) => {
    setScores((current) => new Map(current).set(criterion, { score, note }));
    try { await saveScore(interview.id, criterion, score, note); } catch (reason) { onError(reason instanceof Error ? reason.message : String(reason)); }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await finishInterview(interview.id, applicant.id, recommendation, notes, profileId);
      onFinished();
    } catch (reason) {
      setBusy(false);
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <Sheet open onClose={busy ? () => undefined : onClose} ariaLabel={`Interview: ${applicant.fullName}`} maxWidthClass="sm:max-w-[600px]">
      <SheetHeader className="pe-14">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-semibold text-foreground"><bdi dir="auto">Interview: {applicant.fullName}</bdi></h2>
            <p className="mt-0.5 text-[12.5px] text-black/50">Each score saves as you go</p>
          </div>
          {total && <span className="shrink-0 rounded-full bg-[#6EA4E7]/[0.14] px-3 py-1 font-mono text-[14px] font-semibold tabular-nums text-brand-strong">{total.total} / 100</span>}
        </div>
      </SheetHeader>
      <SheetBody>
        {opening.interviewQuestions.length > 0 && (
          <Block title="Ask">
            <ol className="list-decimal space-y-1.5 ps-5 text-[13.5px] text-foreground">{opening.interviewQuestions.map((q) => <li key={q} dir="auto">{q}</li>)}</ol>
          </Block>
        )}
        <Block title="Score">
          {opening.interviewCriteria.length === 0 ? <p className="text-[13px] text-black/50">This opening has no scorecard. Add criteria in Edit opening.</p> : (
            <ul className="flex flex-col divide-y divide-black/[0.05]">
              {opening.interviewCriteria.map((c) => {
                const entry = scores.get(c.key) ?? { score: null, note: '' };
                return (
                  <li key={c.key} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong dir="auto" className="text-[13.5px] font-medium text-foreground">{c.label}{c.weight !== null && <small className="ms-1.5 font-mono text-black/40">{c.weight}%</small>}</strong>
                      <ScorePicker value={entry.score} label={c.label} onChange={(score) => put(c.key, score, entry.note)} />
                    </div>
                    <input dir="auto" className={cn(INPUT, 'mt-2')} placeholder="Note" aria-label={`Note · ${c.label}`} defaultValue={entry.note}
                      onBlur={(event) => { if (event.target.value !== entry.note) void put(c.key, entry.score, event.target.value); }} />
                  </li>
                );
              })}
            </ul>
          )}
        </Block>
        <Block title="Overall">
          <textarea dir="auto" rows={4} className={cn(INPUT, '!h-auto py-2.5')} aria-label="Overall notes" placeholder="Overall notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          <div className="mt-3">
            <span className="text-[12.5px] font-medium text-black/65">Recommendation</span>
            <div role="group" aria-label="Recommendation" className="mt-1.5 inline-flex flex-wrap rounded-[10px] bg-black/[0.05] p-0.5">
              <button type="button" aria-pressed={recommendation === null} onClick={() => setRecommendation(null)} className={cn('h-11 rounded-lg px-3 text-[13px] font-medium md:h-9', recommendation === null ? 'bg-surface text-foreground shadow-sm' : 'text-black/50')}>Decide later</button>
              {RECOMMENDATIONS.map((r) => (
                <button key={r} type="button" aria-pressed={recommendation === r} onClick={() => setRecommendation(r)} className={cn('h-11 rounded-lg px-3 text-[13px] font-medium md:h-9', recommendation === r ? 'bg-surface text-foreground shadow-sm' : 'text-black/50')}>{RECOMMENDATION_LABELS[r]}</button>
              ))}
            </div>
            {recommendation && <p className="mt-1.5 text-[12px] text-black/50">Finishing moves {applicant.fullName} to {STAGE_LABELS[RECOMMENDATION_STAGE[recommendation]]}.</p>}
          </div>
        </Block>
      </SheetBody>
      <SheetFooter>
        <Button variant="outline" size="lg" className="!h-11 md:!h-10" disabled={busy} onClick={onClose}>Close</Button>
        <Button size="lg" className="!h-11 px-4 md:!h-10" disabled={busy} onClick={finish}>{busy ? <><Spinner size={13} /> Saving…</> : 'Finish interview'}</Button>
      </SheetFooter>
    </Sheet>
  );
};

// ─── Drawer ───────────────────────────────────────────────────────────────────

export const ApplicantDrawer: React.FC<{
  applicant: Applicant;
  opening: Opening;
  interviews: Interview[];
  slot: HrSlot | null;
  location: string | null;
  profileId: string | null;
  onClose: () => void;
  /** After a write, so the page reads the applicant again. */
  onChanged: (message?: string) => void;
  onError: (message: string) => void;
  /** Opens another applicant, for "Possible duplicate". */
  onOpenApplicant: (id: string) => void;
}> = ({ applicant, opening, interviews, slot, location, profileId, onClose, onChanged, onError, onOpenApplicant }) => {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [noteType, setNoteType] = useState<NoteType>('note');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [scoring, setScoring] = useState<Interview | null>(null);

  const loadActivities = useCallback(() => {
    let active = true;
    listActivities(applicant.id).then((rows) => { if (active) setActivities(rows); }).catch(() => { if (active) setActivities([]); });
    return () => { active = false; };
  }, [applicant.id]);
  useEffect(() => loadActivities(), [loadActivities, applicant]);

  const run = async (work: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    try {
      await work();
      onChanged(message);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  /** A tab opened before the await, so the browser doesn't block it; then pointed at a ten-minute link. */
  const openFile = async (path: string) => {
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const url = await signedFileUrl(path);
    if (!url) { tab?.close(); onError('That file is missing or has moved.'); return; }
    if (tab) tab.location.href = url; else window.open(url, '_blank', 'noopener');
  };

  const openInterview = interviews.find((i) => i.recommendation === null) ?? null;
  const start = async () => {
    setBusy(true);
    try {
      const id = await startInterview(applicant.id, profileId);
      setScoring(openInterview && openInterview.id === id ? openInterview : { id, applicantId: applicant.id, heldAt: new Date().toISOString(), interviewerProfileId: profileId, recommendation: null, overallNotes: null, createdAt: new Date().toISOString(), scores: [] });
      onChanged();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const files = applicantFiles(applicant.attachments, applicant.cvPath);
  const schemaKeys = new Set(opening.formSchema.map((field) => field.key));
  const extraAnswers = Object.keys(applicant.answers).filter((key) => !schemaKeys.has(key) && answerToStrings(applicant.answers[key]).length > 0);
  const answerLines = (key: string, value: unknown) => {
    const field = opening.formSchema.find((item) => item.key === key);
    return answerToStrings(value).map((line) => {
      if (line === 'true') return 'Yes';
      if (line === 'false') return 'No';
      const option = field?.options.find((o) => (typeof o === 'string' ? o : o.value) === line);
      return option ? optionLabel(option, 'en') : line;
    });
  };

  const activityText = (activity: Activity): string => {
    const kind = activity.meta.kind;
    if (kind === 'stage') {
      const text = `${STAGE_LABELS[readStage(activity.meta.from)]} → ${STAGE_LABELS[readStage(activity.meta.to)]}`;
      return activity.auto ? `${text} · automatic` : text;
    }
    if (kind === 'shortlisted') return 'Shortlisted for an interview';
    if (kind === 'unshortlisted') return 'Removed from the shortlist';
    if (kind === 'interview_started') return 'Interview started';
    return activity.body ?? '';
  };

  const applied = new Date(applicant.createdAt).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <>
      <Sheet open onClose={scoring ? () => undefined : onClose} ariaLabel={applicant.fullName} maxWidthClass="sm:max-w-[640px]">
        <SheetHeader className="pe-14">
          <h2 dir="auto" className="truncate text-[17px] font-semibold tracking-[-0.014em] text-foreground">{applicant.fullName}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StageChip stage={applicant.stage} />
            <PriorityChip priority={applicant.priority} />
            {applicant.knockoutFailed && <AutoRejectedBadge reasons={applicant.knockoutReasons} />}
            {applicant.duplicateOf && <DuplicateBadge onOpen={() => onOpenApplicant(applicant.duplicateOf as string)} />}
            <SourceChip source={applicant.source} />
            <LanguageChip language={applicant.language} />
            <span className="text-[12.5px] text-black/45">Applied {applied}</span>
          </div>
        </SheetHeader>

        <SheetBody>
          {applicant.knockoutFailed && (
            <div role="note" className="rounded-[12px] border border-[#F43F5E]/25 bg-[#FFF1F2] px-3 py-2.5 text-[13px] text-[#9F1239]">
              <strong className="font-semibold">Auto-rejected on submit.</strong>{applicant.knockoutReasons.length ? ` ${applicant.knockoutReasons.join(' · ')}.` : ''} Move them to another stage to rescue them.
            </div>
          )}

          <Block title="Decision">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-black/65">Stage</span>
                <select aria-label="Stage" className={SELECT} value={applicant.stage} disabled={busy} onChange={(event) => run(() => moveStage(applicant.id, event.target.value as RecruitmentStage, profileId))}>
                  {RECRUITMENT_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-black/65">Priority</span>
                <select aria-label="Priority" className={SELECT} value={applicant.priority} disabled={busy} onChange={(event) => run(() => updateApplicant(applicant.id, { priority: event.target.value as Priority }))}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-black/65">Rating</span>
                <StarRating value={applicant.rating} label="Rating" disabled={busy} onChange={(rating) => run(() => updateApplicant(applicant.id, { rating }))} />
              </div>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2 self-end text-[13.5px] text-foreground">
                <Switch checked={applicant.shortlisted} disabled={busy} onChange={(next) => run(() => setShortlisted(applicant.id, next, profileId))} ariaLabel="Shortlist for an interview" />
                Shortlist for an interview
              </label>
            </div>
            {applicant.shortlisted && (
              <div className="mt-4 border-t border-black/[0.06] pt-4">
                <span className="text-[12.5px] font-medium text-black/65">Attendance</span>
                <div className="mt-1.5"><ConfirmationPicker value={applicant.confirmation} disabled={busy} label="Attendance" onChange={(status) => run(() => setConfirmation(applicant.id, status))} /></div>
                <p className="mt-2 text-[13px] text-black/60">
                  Interview slot: {slot ? <span className="font-medium text-foreground">{formatDayLabel(istanbulDay(slot.startsAt), LOCALE)} · <span className="font-mono">{formatTime(slot.startsAt, LOCALE)}</span>{location ? ` · ${location}` : ''}</span> : 'No slot yet'}
                </p>
                {applicant.stage !== 'no_show' && (
                  <Button variant="outline" size="sm" className="mt-2 !h-11 md:!h-8" disabled={busy} onClick={() => run(() => markNoShow(applicant.id, profileId), 'Marked as no-show; their slot is open again')}>Mark no-show</Button>
                )}
              </div>
            )}
            {(applicant.stage === 'rejected' || applicant.stage === 'on_hold') && (
              <label className="mt-3 flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-black/65">Reason</span>
                <input dir="auto" className={INPUT} defaultValue={applicant.lostReason ?? ''} onBlur={(event) => { if (event.target.value !== (applicant.lostReason ?? '')) void run(() => updateApplicant(applicant.id, { lostReason: event.target.value })); }} />
              </label>
            )}
          </Block>

          <Block title="Contact">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 text-[13.5px] sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-[12px] text-black/45">Phone</dt>
                <dd>{applicant.phone ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <bdi dir="ltr" className="font-mono">{applicant.phone}</bdi>
                    <a className="inline-flex h-11 items-center rounded-[10px] border border-[#E5E7EB] px-3 text-[12.5px] font-medium text-foreground hover:bg-black/[0.03] md:h-8" href={`tel:${applicant.phone.replace(/\s/g, '')}`}>Call</a>
                    <a className="inline-flex h-11 items-center rounded-[10px] border border-[#25D366]/40 bg-[#25D366]/[0.08] px-3 text-[12.5px] font-medium text-[#15803D] hover:bg-[#25D366]/[0.14] md:h-8" href={whatsappLink(applicant.phone)} target="_blank" rel="noreferrer">WhatsApp</a>
                  </span>
                ) : '—'}</dd>
              </div>
              <div><dt className="text-[12px] text-black/45">Email</dt><dd className="truncate">{applicant.email ? <a className="text-brand-strong hover:underline" dir="ltr" href={`mailto:${applicant.email}`}>{applicant.email}</a> : '—'}</dd></div>
              <div><dt className="text-[12px] text-black/45">Age</dt><dd className="font-mono">{applicant.age ?? '—'}</dd></div>
              <div><dt className="text-[12px] text-black/45">Nationality</dt><dd dir="auto">{applicant.nationality ?? '—'}</dd></div>
              <div><dt className="text-[12px] text-black/45">Lives in</dt><dd dir="auto">{[applicant.residenceDistrict, applicant.residenceCity].filter(Boolean).join(', ') || '—'}</dd></div>
              <div><dt className="text-[12px] text-black/45">Source</dt><dd>{applicant.source ? SOURCE_LABELS[applicant.source] ?? applicant.source : '—'}</dd></div>
            </dl>
          </Block>

          <Block title="CV and files">
            {files.length === 0 ? <p className="text-[13px] text-black/50">No files</p> : (
              <ul className="flex flex-col divide-y divide-black/[0.05]">
                {files.map((file) => (
                  <li key={file.path} className="flex min-h-[48px] items-center gap-2.5 py-1.5 text-[13.5px]">
                    <span className="text-black/40"><FileGlyph /></span>
                    <span dir="auto" className="min-w-0 flex-1 truncate text-foreground">{file.slot ? FILE_SLOT_LABELS[file.slot] : FILE_SLOT_LABELS[file.name] ?? file.name}</span>
                    <Button variant="outline" size="sm" className="!h-11 md:!h-8" onClick={() => void openFile(file.path)}>Open</Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11.5px] text-black/40">Files open through a link that works for ten minutes.</p>
          </Block>

          <Block title="Answers">
            <dl className="flex flex-col gap-3">
              {opening.formSchema.filter((field) => field.type !== 'file').map((field) => {
                const lines = answerLines(field.key, applicant.answers[field.key]);
                return (
                  <div key={field.key}>
                    <dt dir="auto" className="text-[12.5px] text-black/50">{pickLabel(field.label, 'en') || field.key}</dt>
                    <dd dir="auto" className="text-[13.5px] text-foreground">{lines.length ? lines.map((line) => <span key={line} className="block">{line}</span>) : <span className="text-black/35">No answer</span>}</dd>
                  </div>
                );
              })}
              {extraAnswers.map((key) => (
                <div key={key}>
                  <dt className="font-mono text-[12px] text-black/45">{key}</dt>
                  <dd dir="auto" className="text-[13.5px] text-foreground">{answerLines(key, applicant.answers[key]).map((line) => <span key={line} className="block">{line}</span>)}</dd>
                </div>
              ))}
              {opening.formSchema.length === 0 && extraAnswers.length === 0 && <p className="text-[13px] text-black/50">No answers beyond the basics.</p>}
            </dl>
          </Block>

          <Block title="Interviews" aside={
            <Button size="sm" className="!h-11 px-3 md:!h-8" disabled={busy} onClick={openInterview ? () => setScoring(openInterview) : start}>
              {openInterview ? 'Continue interview' : 'Start interview'}
            </Button>
          }>
            {interviews.length === 0 ? <p className="text-[13px] text-black/50">No interview yet</p> : (
              <ul className="flex flex-col divide-y divide-black/[0.05]">
                {interviews.map((interview) => {
                  const score = weightedScore(opening.interviewCriteria, interview.scores);
                  return (
                    <li key={interview.id} className="flex min-h-[48px] flex-wrap items-center gap-2 py-1.5 text-[13px]">
                      <span className="text-black/55">{new Date(interview.heldAt ?? interview.createdAt).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}</span>
                      {score ? <strong className="font-mono font-semibold tabular-nums text-foreground">{score.total} / 100</strong> : <span className="text-black/35">—</span>}
                      {score && score.scoredCount < score.criteriaCount && <small className="text-[#B45309]">{score.scoredCount} of {score.criteriaCount} criteria scored</small>}
                      <span className="ms-auto">{interview.recommendation
                        ? <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[12px] font-medium text-black/65">{RECOMMENDATION_LABELS[interview.recommendation]}</span>
                        : <button type="button" className="min-h-[44px] text-[12.5px] font-medium text-brand-strong hover:underline md:min-h-0" onClick={() => setScoring(interview)}>Continue</button>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Block>

          <Block title="Notes">
            <textarea dir="auto" rows={3} className={cn(INPUT, '!h-auto py-2.5')} placeholder="Private to HR" aria-label="Notes" defaultValue={applicant.notes ?? ''}
              onBlur={(event) => { if (event.target.value !== (applicant.notes ?? '')) void run(() => updateApplicant(applicant.id, { notes: event.target.value }), 'Notes saved'); }} />
          </Block>

          <Block title="Activity">
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (!note.trim()) return; const body = note; setNote(''); void run(async () => { await addNote(applicant.id, noteType, body, profileId); loadActivities(); }); }}>
              <select aria-label="Kind" className={cn(SELECT, 'sm:w-36')} value={noteType} onChange={(event) => setNoteType(event.target.value as NoteType)}>
                {NOTE_TYPES.map((type) => <option key={type} value={type}>{NOTE_TYPE_LABELS[type]}</option>)}
              </select>
              <input dir="auto" className={cn(INPUT, 'min-w-0 flex-1')} placeholder="Add a note…" aria-label="Add a note" value={note} onChange={(event) => setNote(event.target.value)} />
              <Button type="submit" size="lg" className="!h-11 px-4 md:!h-10" disabled={busy || !note.trim()}>Add</Button>
            </form>
            {activities === null ? <div className="mt-3 h-16 animate-pulse rounded-[12px] bg-black/[0.04]" /> : activities.length === 0 ? <p className="mt-3 text-[13px] text-black/50">Nothing yet</p> : (
              <ol className="mt-3 flex flex-col gap-2">
                {activities.map((activity) => (
                  <li key={activity.id} className="flex items-start gap-2 text-[13px]">
                    <span className="shrink-0 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11.5px] font-medium text-black/60">{NOTE_TYPE_LABELS[activity.type] ?? activity.type}</span>
                    <span dir="auto" className="min-w-0 flex-1 text-foreground">{activityText(activity)}</span>
                    <time className="shrink-0 font-mono text-[11.5px] text-black/40">{new Date(activity.createdAt).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</time>
                  </li>
                ))}
              </ol>
            )}
          </Block>
        </SheetBody>
      </Sheet>

      {scoring && (
        <ScorecardSheet applicant={applicant} opening={opening} interview={scoring} profileId={profileId}
          onClose={() => { setScoring(null); onChanged(); }}
          onFinished={() => { setScoring(null); onChanged('Interview saved'); }}
          onError={onError} />
      )}
    </>
  );
};

export default ApplicantDrawer;
