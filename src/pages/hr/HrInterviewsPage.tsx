import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button } from '../../components/media/MediaUI';
import { Icon3D } from '../../components/shared/Icon3D';
import { LoadError, PageHeader, SkeletonRows } from '../../components/shared/PageBits';
import { useCurrentProfile } from '../../hooks/useCurrentProfile';
import { listOpenings, startInterview, type Applicant, type Interview, type Opening } from '../../lib/recruitment/hr';
import { formatDayLabel, formatTime, istanbulDay } from '../../lib/recruitment/model';
import { bestScores } from '../../lib/recruitment/pipeline';
import { ApplicantDrawer, ScorecardSheet } from './ApplicantDrawer';
import { InterviewCalendar } from './InterviewCalendar';
import { loadOpening, type OpeningData } from './HrOpeningPage';
import { ConfirmationChip, StageChip } from './hrParts';

const LOCALE = 'en-GB';

/**
 * Interviews: pick an opening, then its shortlisted candidates in slot order with a
 * one-click live scorecard, the calendar (settings, slots, block or remove) and the
 * leaderboard. The same tables and rules as the opening's Interviews tab.
 */
const HrInterviewsPage: React.FC = () => {
  const { profile } = useCurrentProfile();
  const profileId = profile?.id ?? null;
  const [params, setParams] = useSearchParams();
  const [openings, setOpenings] = useState<Opening[] | null>(null);
  const [data, setData] = useState<OpeningData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [scoring, setScoring] = useState<{ applicant: Applicant; interview: Interview } | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listOpenings()
      .then((rows) => { if (active) setOpenings(rows); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);

  // Openings with someone to interview first, then published ones.
  const choices = useMemo(() => [...(openings ?? [])].filter((o) => o.status !== 'draft' || o.shortlistedCount > 0)
    .sort((a, b) => b.shortlistedCount - a.shortlistedCount || Number(b.status === 'published') - Number(a.status === 'published')), [openings]);
  const requested = params.get('opening');
  const openingId = choices.find((o) => o.id === requested)?.id ?? choices[0]?.id ?? null;

  useEffect(() => {
    if (!openingId) return undefined;
    let active = true;
    setError(null);
    loadOpening(openingId)
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [openingId, reload]);

  const refresh = useCallback((message?: string) => { if (message) toast.success(message); setReload((n) => n + 1); }, []);
  const onError = useCallback((message: string) => { toast.error(`Couldn't save: ${message}`); setReload((n) => n + 1); }, []);
  const setParam = (key: string, value: string | null) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: key !== 'applicant' });

  const current = data && data.opening?.id === openingId ? data : null;
  const opening = current?.opening ?? null;
  const applicants = useMemo(() => current?.applicants ?? [], [current]);
  const interviews = useMemo(() => current?.interviews ?? [], [current]);
  const slotOf = useMemo(() => new Map((current?.slots ?? []).filter((s) => s.status === 'booked' && s.applicantId).map((s) => [s.applicantId as string, s])), [current]);
  const scoreOf = useMemo(() => bestScores(opening, interviews), [opening, interviews]);
  const shortlist = useMemo(() => applicants.filter((a) => a.shortlisted)
    .sort((a, b) => (slotOf.get(a.id)?.startsAt ?? '9').localeCompare(slotOf.get(b.id)?.startsAt ?? '9') || a.fullName.localeCompare(b.fullName)), [applicants, slotOf]);
  const openApplicant = params.get('applicant') ? applicants.find((a) => a.id === params.get('applicant')) ?? null : null;

  const score = async (applicant: Applicant) => {
    const open = interviews.find((i) => i.applicantId === applicant.id && i.recommendation === null);
    if (open) { setScoring({ applicant, interview: open }); return; }
    setStarting(applicant.id);
    try {
      const id = await startInterview(applicant.id, profileId);
      setScoring({ applicant, interview: { id, applicantId: applicant.id, heldAt: new Date().toISOString(), interviewerProfileId: profileId, recommendation: null, overallNotes: null, createdAt: new Date().toISOString(), scores: [] } });
      setReload((n) => n + 1);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="media-scope mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <MediaToaster />
      <PageHeader
        eyebrow="HR"
        title="Interviews"
        subtitle={opening ? `${opening.title} · ${shortlist.length} shortlisted` : 'Score candidates live and keep the calendar'}
        action={choices.length > 0 ? (
          <select aria-label="Opening" className="h-11 max-w-[320px] rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[13.5px] text-foreground outline-none focus:border-[#6EA4E7] md:h-10" value={openingId ?? ''} onChange={(event) => setParam('opening', event.target.value)}>
            {choices.map((o) => <option key={o.id} value={o.id}>{o.title} · {o.shortlistedCount} shortlisted</option>)}
          </select>
        ) : undefined}
      />

      {error && !current ? (
        <LoadError message={`Couldn't load the interviews: ${error}`} onRetry={() => setReload((n) => n + 1)} />
      ) : openings && choices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-14 text-center">
          <Icon3D name="pending" size={72} />
          <p className="text-[15px] font-medium text-foreground">Nothing to interview yet</p>
          <p className="max-w-[360px] text-[13px] text-black/50">Publish an opening and shortlist applicants from its pipeline; they appear here.</p>
        </div>
      ) : !current || !opening ? (
        <div className="rounded-2xl border border-subtle bg-surface"><SkeletonRows count={6} /></div>
      ) : (
        <div className="flex flex-col gap-4">
          <section aria-label="Shortlisted" className="surface-depth rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
            <header className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-foreground">Shortlisted</h2>
              <span className="text-[12.5px] text-black/45">In slot order</span>
            </header>
            {shortlist.length === 0 ? <p className="text-[13px] text-black/50">No one shortlisted for this opening yet.</p> : (
              <ul className="flex flex-col divide-y divide-black/[0.05]">
                {shortlist.map((a) => {
                  const slot = slotOf.get(a.id);
                  const open = interviews.some((i) => i.applicantId === a.id && i.recommendation === null);
                  return (
                    <li key={a.id} className="flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                      <span className="w-[132px] shrink-0 font-mono text-[12.5px] tabular-nums text-black/60">{slot ? `${formatDayLabel(istanbulDay(slot.startsAt), LOCALE)} ${formatTime(slot.startsAt, LOCALE)}` : 'No slot yet'}</span>
                      <button type="button" className="min-w-0 flex-1 truncate text-start text-[14px] font-medium text-foreground hover:text-brand-strong" onClick={() => setParam('applicant', a.id)}><bdi dir="auto">{a.fullName}</bdi></button>
                      <ConfirmationChip status={a.confirmation} />
                      <StageChip stage={a.stage} />
                      <span className="w-14 text-end font-mono text-[13px] font-semibold tabular-nums text-foreground">{scoreOf.has(a.id) ? `${scoreOf.get(a.id)}` : '—'}</span>
                      <Button size="sm" className="!h-11 px-3 md:!h-8" disabled={starting === a.id} onClick={() => void score(a)}>{open ? 'Continue interview' : 'Start interview'}</Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <InterviewCalendar opening={opening} settings={current.settings} slots={current.slots} applicants={applicants} interviews={interviews} profileId={profileId}
            onChanged={refresh} onError={onError} onOpenApplicant={(applicantId) => setParam('applicant', applicantId)} />
        </div>
      )}

      {openApplicant && opening && !scoring && (
        <ApplicantDrawer
          key={openApplicant.id}
          applicant={openApplicant}
          opening={opening}
          interviews={interviews.filter((i) => i.applicantId === openApplicant.id)}
          slot={slotOf.get(openApplicant.id) ?? null}
          location={current?.settings?.location ?? null}
          profileId={profileId}
          onClose={() => setParam('applicant', null)}
          onChanged={refresh}
          onError={onError}
          onOpenApplicant={(applicantId) => setParam('applicant', applicantId)}
        />
      )}
      {scoring && opening && (
        <ScorecardSheet applicant={scoring.applicant} opening={opening} interview={scoring.interview} profileId={profileId}
          onClose={() => { setScoring(null); refresh(); }}
          onFinished={() => { setScoring(null); refresh('Interview saved'); }}
          onError={onError} />
      )}
    </div>
  );
};

export default HrInterviewsPage;
