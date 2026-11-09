import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from '../../components/media/MediaIcons';
import { MediaToaster } from '../../components/media/MediaToast';
import { Button } from '../../components/media/MediaUI';
import { FilterTile, FilterTileRow, FilterTileSkeleton } from '../../components/shared/FilterTile';
import { Icon3D } from '../../components/shared/Icon3D';
import { LoadError, PageHeader } from '../../components/shared/PageBits';
import { useUrlFilter } from '../../hooks/useUrlFilter';
import { listOpenings, type Opening } from '../../lib/recruitment/hr';
import { OPENING_STATUSES } from '../../lib/recruitment/model';
import { HR_BASE, OpeningStatusChip, copyText, openingPath, publicOpeningUrl } from './hrParts';

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** The public link of a published opening, with a copy for the web and one for WhatsApp. */
export const PublicLink: React.FC<{ slug: string; compact?: boolean }> = ({ slug, compact }) => {
  const url = publicOpeningUrl(slug);
  return (
    <div className={compact ? 'flex flex-wrap items-center gap-1.5' : 'flex flex-col gap-2'}>
      <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-mono text-[12.5px] text-brand-strong hover:underline" onClick={(event) => event.stopPropagation()}>
        {url.replace('https://', '')}
      </a>
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" variant="outline" size="sm" className="!h-11 md:!h-8" onClick={(event) => { event.stopPropagation(); void copyText(url, 'Link copied'); }}>Copy link</Button>
        <Button type="button" variant="outline" size="sm" className="!h-11 md:!h-8" onClick={(event) => { event.stopPropagation(); void copyText(publicOpeningUrl(slug, 'whatsapp'), 'WhatsApp link copied'); }}>Copy WhatsApp link</Button>
      </div>
    </div>
  );
};

/** Recruitment: every opening with its applicants, the status tiles filtering them. */
const HrOpeningsPage: React.FC = () => {
  const { filter, toggle, clear } = useUrlFilter(OPENING_STATUSES);
  const [openings, setOpenings] = useState<Opening[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    listOpenings()
      .then((rows) => { if (active) setOpenings(rows); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [reload]);

  const list = useMemo(() => openings ?? [], [openings]);
  const count = (status: Opening['status']) => list.filter((opening) => opening.status === status).length;
  const applicants = list.reduce((sum, opening) => sum + opening.applicantCount, 0);
  const shown = filter === 'all' ? list : list.filter((opening) => opening.status === filter);
  const newButton = (
    <Link to={`${HR_BASE}/openings/new`} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[13.5px] font-medium text-white hover:bg-primary/90 md:h-9">
      <Plus size={15} /> New opening
    </Link>
  );

  return (
    <div className="media-scope mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <MediaToaster />
      <PageHeader eyebrow="HR" title="Recruitment" subtitle={openings ? `${plural(list.length, 'opening')} · ${plural(applicants, 'applicant')}` : 'Openings, applicants and interviews'} action={newButton} />

      {error && !openings ? (
        <LoadError message={`Couldn't load the openings: ${error}`} onRetry={() => setReload((value) => value + 1)} />
      ) : !openings ? (
        <>
          <FilterTileSkeleton count={4} />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-[188px] animate-pulse rounded-[20px] bg-black/[0.04]" />)}</div>
        </>
      ) : (
        <>
          <FilterTileRow label="Filter the openings">
            <FilterTile mono tone="blue" bareIcon icon={<Icon3D name="total" size={52} />} label="All openings" value={String(list.length)} sub={plural(applicants, 'applicant')} active={filter === 'all'} onClick={clear} />
            <FilterTile mono tone="green" bareIcon icon={<Icon3D name="confirmed" size={52} />} label="Published" value={String(count('published'))} sub="taking applications" active={filter === 'published'} onClick={() => toggle('published')} />
            <FilterTile mono tone="amber" bareIcon icon={<Icon3D name="pending" size={52} />} label="Drafts" value={String(count('draft'))} sub="not public yet" active={filter === 'draft'} onClick={() => toggle('draft')} />
            <FilterTile mono tone="slate" bareIcon icon={<Icon3D name="completed" size={52} />} label="Closed" value={String(count('closed'))} sub="no longer open" active={filter === 'closed'} onClick={() => toggle('closed')} />
          </FilterTileRow>

          {shown.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-14 text-center">
              <Icon3D name="total" size={72} />
              <p className="text-[15px] font-medium text-foreground">{list.length === 0 ? 'No openings yet' : 'No opening matches this filter'}</p>
              {list.length === 0 ? (
                <>
                  <p className="max-w-[340px] text-[13px] text-black/50">Create an opening to start taking applications.</p>
                  <div className="mt-2">{newButton}</div>
                </>
              ) : <Button variant="outline" size="lg" className="mt-2 !h-11 md:!h-9" onClick={clear}>Show all</Button>}
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((opening) => (
                <article key={opening.id} aria-label={opening.title} className="surface-depth flex min-w-0 flex-col gap-3 rounded-[20px] border border-subtle bg-surface p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 dir="auto" className="truncate text-[16px] font-semibold tracking-[-0.012em] text-foreground">{opening.title}</h2>
                      {opening.department && <p dir="auto" className="truncate text-[13px] text-black/50">{opening.department}</p>}
                    </div>
                    <OpeningStatusChip status={opening.status} />
                  </div>
                  <dl className="grid grid-cols-3 gap-2 rounded-[14px] bg-[#F6F8FB] p-3 text-center">
                    <div><dt className="text-[11.5px] text-black/45">Applicants</dt><dd className="font-mono text-[18px] font-semibold tabular-nums text-foreground">{opening.applicantCount}</dd></div>
                    <div><dt className="text-[11.5px] text-black/45">Shortlisted</dt><dd className="font-mono text-[18px] font-semibold tabular-nums text-foreground">{opening.shortlistedCount}</dd></div>
                    <div><dt className="text-[11.5px] text-black/45">Positions</dt><dd className="font-mono text-[18px] font-semibold tabular-nums text-foreground">{opening.positionsCount ?? '—'}</dd></div>
                  </dl>
                  {opening.status === 'published' && opening.publicSlug && <PublicLink slug={opening.publicSlug} />}
                  <p className="text-[12px] text-black/40">Created {new Date(opening.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <div className="mt-auto grid grid-cols-2 gap-2">
                    <Link to={`${openingPath(opening.id)}/edit`} className="inline-flex h-11 items-center justify-center rounded-[10px] border border-[#E5E7EB] bg-white text-[13.5px] font-medium text-foreground hover:bg-black/[0.03] md:h-10">Edit</Link>
                    <Link to={openingPath(opening.id)} className="inline-flex h-11 items-center justify-center rounded-[10px] bg-primary text-[13.5px] font-medium text-white hover:bg-primary/90 md:h-10">Open pipeline</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default HrOpeningsPage;
