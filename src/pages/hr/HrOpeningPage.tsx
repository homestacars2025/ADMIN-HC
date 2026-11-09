import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../../components/shared/FilterTile';
import { Icon3D } from '../../components/shared/Icon3D';
import { ComplianceTriangle } from '../../components/shared/ComplianceBits';
import { LoadError, SearchField, SkeletonRows } from '../../components/shared/PageBits';
import { useCurrentProfile } from '../../hooks/useCurrentProfile';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import { cn } from '../../lib/media/badgeColor';
import {
  getInterviewSettings,
  getOpening,
  listApplicants,
  listInterviews,
  listSlots,
  moveStage,
  type Applicant,
  type HrSlot,
  type Interview,
  type InterviewSettings,
  type Opening,
} from '../../lib/recruitment/hr';
import { CLOSED_STAGES, RECRUITMENT_STAGES, STAGE_TONES, type RecruitmentStage } from '../../lib/recruitment/model';
import { STAGE_LABELS } from '../../lib/recruitment/labels';
import { TILE_FILTERS, bestScores, matchesSearch, matchesTile, tileCounts } from '../../lib/recruitment/pipeline';
import { Segmented } from '../bookings/ui';
import { ApplicantDrawer } from './ApplicantDrawer';
import { InterviewCalendar } from './InterviewCalendar';
import { PublicLink } from './HrOpeningsPage';
import { AutoRejectedBadge, BackLink, ConfirmationChip, DuplicateBadge, HR_BASE, LanguageChip, OpeningStatusChip, PriorityChip, SourceChip, StageChip, openingPath } from './hrParts';

const SELECT = 'h-11 rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[13.5px] text-foreground outline-none focus:border-[#6EA4E7] focus:ring-[3px] focus:ring-[#6EA4E7]/25 md:h-10';

export interface OpeningData {
  opening: Opening | null;
  applicants: Applicant[];
  interviews: Interview[];
  slots: HrSlot[];
  settings: InterviewSettings | null;
}

/** An opening with its applicants, slots and settings side by side; the interviews need the applicants first. */
export async function loadOpening(id: string): Promise<OpeningData> {
  const [opening, applicants, slots, settings] = await Promise.all([getOpening(id), listApplicants(id), listSlots(id), getInterviewSettings(id)]);
  const interviews = await listInterviews(applicants.map((a) => a.id));
  return { opening, applicants, interviews, slots, settings };
}

/**
 * One opening: its applicants as a board by stage or a table, filtered by the tiles, a
 * stage dropdown and search; the applicant drawer; and the interview calendar.
 */
const HrOpeningPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { profile } = useCurrentProfile();
  const profileId = profile?.id ?? null;
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'interviews' ? 'interviews' : 'pipeline';
  const view = params.get('view') === 'table' ? 'table' : 'board';
  const openId = params.get('applicant');
  const { filter, toggle, clear } = useUrlFilter(TILE_FILTERS);
  const [stage, setStage] = useState<RecruitmentStage | 'all'>('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<OpeningData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<RecruitmentStage | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    loadOpening(id)
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [id, reload]);

  const refresh = useCallback((message?: string) => { if (message) toast.success(message); setReload((n) => n + 1); }, []);
  const onError = useCallback((message: string) => { toast.error(`Couldn't save: ${message}`); setReload((n) => n + 1); }, []);

  const setParam = (key: string, value: string | null) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: key !== 'applicant' });

  const opening = data?.opening ?? null;
  const list = useMemo(() => data?.applicants ?? [], [data]);
  const interviews = useMemo(() => data?.interviews ?? [], [data]);
  const scoreOf = useMemo(() => bestScores(opening, interviews), [opening, interviews]);
  const slotOf = useMemo(() => new Map((data?.slots ?? []).filter((s) => s.status === 'booked' && s.applicantId).map((s) => [s.applicantId as string, s])), [data]);
  const shown = useMemo(() => list.filter((a) => matchesTile(a, filter) && (stage === 'all' || a.stage === stage) && matchesSearch(a, search)), [list, filter, stage, search]);
  const counts = useMemo(() => tileCounts(list), [list]);

  /** Moves the card at once and saves in the background; a failure reloads the truth. */
  const move = async (applicant: Applicant, target: RecruitmentStage) => {
    if (applicant.stage === target) return;
    setData((current) => current && { ...current, applicants: current.applicants.map((a) => (a.id === applicant.id ? { ...a, stage: target } : a)) });
    try {
      await moveStage(applicant.id, target, profileId);
      refresh(`${applicant.fullName} → ${STAGE_LABELS[target]}`);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const shell = (children: React.ReactNode) => <div className="media-scope mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9"><MediaToaster />{children}</div>;
  if (error && !data) return shell(<><BackLink to={HR_BASE}>All openings</BackLink><LoadError message={`Couldn't load this opening: ${error}`} onRetry={() => setReload((n) => n + 1)} /></>);
  if (data && !opening) return shell(<><BackLink to={HR_BASE}>All openings</BackLink><p className="rounded-2xl border border-subtle bg-surface px-4 py-10 text-center text-[14px] text-black/55">This opening doesn't exist or was removed.</p></>);

  const openApplicant = openId ? list.find((a) => a.id === openId) ?? null : null;
  const facts = (a: Applicant) => [a.age !== null ? `${a.age} yrs` : null, a.nationality, a.residenceDistrict].filter((v): v is string => !!v);

  const card = (a: Applicant) => (
    <div
      key={a.id}
      role="button"
      tabIndex={0}
      aria-label={a.fullName}
      draggable
      onDragStart={(event) => { event.dataTransfer.setData('text/plain', a.id); event.dataTransfer.effectAllowed = 'move'; setDragging(a.id); }}
      onDragEnd={() => { setDragging(null); setOver(null); }}
      onClick={() => setParam('applicant', a.id)}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setParam('applicant', a.id); } }}
      className={cn(
        'surface-depth flex cursor-pointer flex-col gap-1.5 rounded-[14px] border border-subtle bg-surface p-3 text-start outline-none transition-[box-shadow,opacity] hover:shadow-[0_10px_24px_-12px_rgba(15,23,42,0.22)] focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40',
        CLOSED_STAGES.includes(a.stage) && 'opacity-60',
        dragging === a.id && 'opacity-40',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <strong dir="auto" className="min-w-0 truncate text-[13.5px] font-semibold text-foreground">{a.fullName}</strong>
        {scoreOf.has(a.id) && <span className="shrink-0 rounded-full bg-[#6EA4E7]/[0.14] px-1.5 font-mono text-[11.5px] font-semibold tabular-nums text-brand-strong">{scoreOf.get(a.id)}</span>}
      </span>
      {facts(a).length > 0 && <span className="truncate text-[12px] text-black/50">{facts(a).join(' · ')}</span>}
      <span className="flex flex-wrap gap-1">
        {a.knockoutFailed && <AutoRejectedBadge reasons={a.knockoutReasons} />}
        {a.duplicateOf && <DuplicateBadge onOpen={() => setParam('applicant', a.duplicateOf)} />}
        {a.shortlisted && <ConfirmationChip status={a.confirmation} />}
        {a.priority !== 'medium' && <PriorityChip priority={a.priority} />}
        <SourceChip source={a.source} />
        <LanguageChip language={a.language} />
      </span>
    </div>
  );

  return shell(
    <>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <BackLink to={HR_BASE}>All openings</BackLink>
          <h1 dir="auto" className="flex flex-wrap items-center gap-2 text-[22px] font-medium tracking-[-0.022em] text-foreground sm:text-[26px]">{opening?.title ?? '…'} {opening && <OpeningStatusChip status={opening.status} />}</h1>
          {opening?.department && <p dir="auto" className="mt-1 text-[13.5px] text-black/50">{opening.department}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          {opening && <Link to={`${openingPath(opening.id)}/edit`} className="inline-flex h-11 items-center rounded-[10px] border border-[#E5E7EB] bg-white px-4 text-[13.5px] font-medium text-foreground hover:bg-black/[0.03] md:h-9">Edit opening</Link>}
          {opening?.status === 'published' && opening.publicSlug && <PublicLink slug={opening.publicSlug} compact />}
        </div>
      </header>

      <div className="mb-4">
        <Segmented ariaLabel="Section" value={tab} onChange={(next) => setParam('tab', next === 'pipeline' ? null : next)} options={[{ value: 'pipeline', label: 'Pipeline' }, { value: 'interviews', label: 'Interviews' }]} />
      </div>

      {!data ? (
        <>
          <FilterTileSkeleton count={6} columns={6} />
          <div className="mt-4 rounded-2xl border border-subtle bg-surface"><SkeletonRows count={6} /></div>
        </>
      ) : tab === 'interviews' && opening ? (
        <InterviewCalendar opening={opening} settings={data.settings} slots={data.slots} applicants={list} interviews={interviews} profileId={profileId}
          onChanged={refresh} onError={onError} onOpenApplicant={(applicantId) => setParam('applicant', applicantId)} />
      ) : (
        <>
          <FilterTileRow columns={6} label="Filter by stage">
            <FilterTile mono tone="blue" bareIcon icon={<Icon3D name="total" size={52} />} label="All applicants" value={String(counts.all)} sub="this opening" active={filter === 'all'} onClick={clear} />
            <FilterTile mono tone="slate" bareIcon icon={<Icon3D name="pending" size={52} />} label="New" value={String(counts.new)} sub="not looked at" active={filter === 'new'} onClick={() => toggle('new')} />
            <FilterTile mono tone="violet" bareIcon icon={<Icon3D name="confirmed" size={52} />} label="Shortlisted" value={String(counts.shortlisted)} sub="for an interview" active={filter === 'shortlisted'} onClick={() => toggle('shortlisted')} />
            <FilterTile mono tone="teal" bareIcon icon={<Icon3D name="completed" size={52} />} label="Interviewed" value={String(counts.interviewed)} sub="scored" active={filter === 'interviewed'} onClick={() => toggle('interviewed')} />
            <FilterTile mono tone="green" bareIcon icon={<Icon3D name="confirmed" size={52} />} label="Hired" value={String(counts.hired)} sub="joined" active={filter === 'hired'} onClick={() => toggle('hired')} />
            <FilterTile mono tone="red" bareIcon icon={<ComplianceTriangle tone="red" size={32} />} label="Auto-rejected" value={String(counts.auto_rejected)} sub="review and rescue" active={filter === 'auto_rejected'} onClick={() => toggle('auto_rejected')} />
          </FilterTileRow>

          <div className="mb-4 mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField value={search} onChange={setSearch} placeholder="Search name, nationality, district or phone" className="w-full sm:w-[340px]" />
            <select aria-label="Stage" className={SELECT} value={stage} onChange={(event) => setStage(event.target.value as RecruitmentStage | 'all')}>
              <option value="all">Every stage</option>
              {RECRUITMENT_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
            <div className="sm:ms-auto">
              <Segmented ariaLabel="View" value={view} onChange={(next) => setParam('view', next === 'board' ? null : next)} options={[{ value: 'board', label: 'Board' }, { value: 'table', label: 'Table' }]} />
            </div>
          </div>

          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-14 text-center">
              <Icon3D name="total" size={72} />
              <p className="text-[15px] font-medium text-foreground">No applicants yet</p>
              <p className="max-w-[360px] text-[13px] text-black/50">Applications to this opening land here.{opening?.status !== 'published' ? ' Publish it to share the link.' : ''}</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-10 text-center">
              <p className="text-[15px] font-medium text-foreground">No applicant matches</p>
              <button type="button" className="min-h-[44px] text-[13px] font-semibold text-brand-strong hover:underline" onClick={() => { clear(); setStage('all'); setSearch(''); }}>Show all</button>
            </div>
          ) : view === 'board' ? (
            <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
              <div className="grid min-w-max auto-cols-[236px] grid-flow-col gap-3">
                {RECRUITMENT_STAGES.filter((s) => stage === 'all' || s === stage).map((column) => {
                  const cards = shown.filter((a) => a.stage === column);
                  return (
                    <section
                      key={column}
                      aria-label={`${STAGE_LABELS[column]}, ${cards.length}`}
                      onDragOver={(event) => { if (dragging) { event.preventDefault(); if (over !== column) setOver(column); } }}
                      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); }}
                      onDrop={(event) => { event.preventDefault(); const moved = list.find((a) => a.id === event.dataTransfer.getData('text/plain')); setDragging(null); setOver(null); if (moved) void move(moved, column); }}
                      className="flex min-h-[200px] flex-col rounded-[18px] border-t-[3px] p-2 transition-colors"
                      style={{ borderTopColor: STAGE_TONES[column].rail, background: over === column ? STAGE_TONES[column].bg : '#F6F7F9' }}
                    >
                      <header className="flex items-center justify-between gap-2 px-1 pb-2 pt-1"><StageChip stage={column} /><span className="font-mono text-[12px] text-black/40">{cards.length}</span></header>
                      <div className="flex flex-1 flex-col gap-2">
                        {cards.map(card)}
                        {cards.length === 0 && <div className="flex flex-1 items-center justify-center rounded-[12px] border border-dashed border-black/[0.08] py-6 text-[12px] text-black/30">Drag here</div>}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-subtle bg-surface">
              <div className="max-h-[calc(100dvh-220px)] overflow-auto">
                <table className="w-full min-w-[920px] border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr>
                      {['Name', 'Age', 'Nationality', 'District', 'Stage', 'Flags', 'Score', 'Applied'].map((col) => (
                        <th key={col} scope="col" className="sticky top-0 z-10 bg-[#F8F9FB] px-3 py-2.5 text-start text-[11.5px] font-medium text-black/50 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((a, index) => (
                      <tr key={a.id} onClick={() => setParam('applicant', a.id)} className={cn('cursor-pointer hover:bg-[#6EA4E7]/[0.06]', index % 2 === 1 && 'bg-[#FAFBFC]', CLOSED_STAGES.includes(a.stage) && 'opacity-60')}>
                        <td className="px-3 py-2.5"><button type="button" className="text-start font-medium text-foreground hover:text-brand-strong" onClick={(event) => { event.stopPropagation(); setParam('applicant', a.id); }}><bdi dir="auto">{a.fullName}</bdi></button></td>
                        <td className="px-3 py-2.5 font-mono tabular-nums">{a.age ?? '—'}</td>
                        <td className="px-3 py-2.5" dir="auto">{a.nationality ?? '—'}</td>
                        <td className="px-3 py-2.5" dir="auto">{a.residenceDistrict ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <select aria-label={`Stage for ${a.fullName}`} className="h-11 rounded-full border-0 px-2 text-[12px] font-medium md:h-7" style={{ background: STAGE_TONES[a.stage].bg, color: STAGE_TONES[a.stage].ink }} value={a.stage} onClick={(event) => event.stopPropagation()} onChange={(event) => void move(a, event.target.value as RecruitmentStage)}>
                            {RECRUITMENT_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="flex flex-wrap gap-1">
                            {a.knockoutFailed && <AutoRejectedBadge reasons={a.knockoutReasons} />}
                            {a.duplicateOf && <DuplicateBadge onOpen={() => setParam('applicant', a.duplicateOf)} />}
                            <SourceChip source={a.source} />
                            <LanguageChip language={a.language} />
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums">{scoreOf.has(a.id) ? `${scoreOf.get(a.id)}/100` : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-black/60">{new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {openApplicant && opening && (
        <ApplicantDrawer
          key={openApplicant.id}
          applicant={openApplicant}
          opening={opening}
          interviews={interviews.filter((i) => i.applicantId === openApplicant.id)}
          slot={slotOf.get(openApplicant.id) ?? null}
          location={data?.settings?.location ?? null}
          profileId={profileId}
          onClose={() => setParam('applicant', null)}
          onChanged={refresh}
          onError={onError}
          onOpenApplicant={(applicantId) => setParam('applicant', applicantId)}
        />
      )}
    </>,
  );
};

export default HrOpeningPage;
