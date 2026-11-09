import React from 'react';
import { Link } from 'react-router-dom';
import { toast } from '../../components/media/MediaToast';
import { cn } from '../../lib/media/badgeColor';
import {
  CONFIRMATION_TONES,
  PRIORITY_TONES,
  SETTABLE_CONFIRMATIONS,
  STAGE_TONES,
  type InterviewConfirmation,
  type OpeningStatus,
  type Priority,
  type RecruitmentStage,
} from '../../lib/recruitment/model';
import {
  CONFIRMATION_LABELS,
  LANGUAGE_LABELS,
  OPENING_STATUS_LABELS,
  OPENING_STATUS_TONES,
  PRIORITY_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
} from '../../lib/recruitment/labels';

export const HR_BASE = '/dashboard/hr';
export const HR_INTERVIEWS = `${HR_BASE}/interviews`;
export const openingPath = (id: string) => `${HR_BASE}/openings/${id}`;

/** The public careers page for an opening; `?src=whatsapp` tells a WhatsApp click apart. */
export const publicOpeningUrl = (slug: string, source?: 'whatsapp') => `https://homestacars.com/careers/${slug}${source ? `?src=${source}` : ''}`;

export async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Couldn't copy. Select the link and copy it by hand.");
  }
}

const CHIP = 'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium';

const Chip: React.FC<{ bg: string; ink: string; dot?: string; title?: string; className?: string; children: React.ReactNode }> = ({ bg, ink, dot, title, className, children }) => (
  <span title={title} className={cn(CHIP, className)} style={{ background: bg, color: ink }}>
    {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
    {children}
  </span>
);

export const StageChip: React.FC<{ stage: RecruitmentStage }> = ({ stage }) => (
  <Chip bg={STAGE_TONES[stage].bg} ink={STAGE_TONES[stage].ink} dot={STAGE_TONES[stage].rail}>{STAGE_LABELS[stage]}</Chip>
);

export const ConfirmationChip: React.FC<{ status: InterviewConfirmation }> = ({ status }) => (
  <Chip bg={CONFIRMATION_TONES[status].bg} ink={CONFIRMATION_TONES[status].ink} dot={CONFIRMATION_TONES[status].dot}>{CONFIRMATION_LABELS[status]}</Chip>
);

export const PriorityChip: React.FC<{ priority: Priority }> = ({ priority }) => (
  <Chip bg={PRIORITY_TONES[priority].bg} ink={PRIORITY_TONES[priority].ink}>{PRIORITY_LABELS[priority]}</Chip>
);

export const OpeningStatusChip: React.FC<{ status: OpeningStatus }> = ({ status }) => (
  <Chip bg={OPENING_STATUS_TONES[status].bg} ink={OPENING_STATUS_TONES[status].ink} dot={OPENING_STATUS_TONES[status].dot}>{OPENING_STATUS_LABELS[status]}</Chip>
);

export const SourceChip: React.FC<{ source: string | null }> = ({ source }) => (
  source ? <Chip bg="#F1F5F9" ink="#475569">{SOURCE_LABELS[source] ?? source}</Chip> : null
);

export const LanguageChip: React.FC<{ language: string | null }> = ({ language }) => (
  language ? <Chip bg="#EEF2FF" ink="#4338CA" title={LANGUAGE_LABELS[language] ?? language}>{language.toUpperCase()}</Chip> : null
);

/** Failed a knock-out rule on submit; the reasons are the tooltip. */
export const AutoRejectedBadge: React.FC<{ reasons: string[] }> = ({ reasons }) => (
  <Chip bg="#FFF1F2" ink="#BE123C" dot="#F43F5E" title={reasons.length ? `Auto-rejected: ${reasons.join(' · ')}` : 'Auto-rejected by a knock-out rule'}>Auto-rejected</Chip>
);

/** The same phone applied to this opening before. */
export const DuplicateBadge: React.FC<{ onOpen?: () => void }> = ({ onOpen }) => {
  const inner = <Chip bg="#FFF7ED" ink="#C2410C" dot="#F97316" title="The same phone number applied to this opening before">Possible duplicate</Chip>;
  if (!onOpen) return inner;
  return (
    <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} className="rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#F97316]/40" aria-label="Possible duplicate: open the earlier application">
      {inner}
    </button>
  );
};

/** Coming / Not coming / No response, as pressed buttons; `pending` presses none. */
export const ConfirmationPicker: React.FC<{ value: InterviewConfirmation; onChange: (next: InterviewConfirmation) => void; disabled?: boolean; label: string }> = ({ value, onChange, disabled, label }) => (
  <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
    {SETTABLE_CONFIRMATIONS.map((status) => {
      const tone = CONFIRMATION_TONES[status];
      const on = value === status;
      return (
        <button
          key={status}
          type="button"
          aria-pressed={on}
          disabled={disabled}
          onClick={() => onChange(status)}
          className="inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-50 md:h-9"
          style={on ? { background: tone.bg, color: tone.ink, borderColor: tone.dot } : { background: '#fff', color: 'rgba(0,0,0,0.6)', borderColor: 'rgba(0,0,0,0.08)' }}
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
          {CONFIRMATION_LABELS[status]}
        </button>
      );
    })}
  </div>
);

const Star: React.FC<{ on: boolean }> = ({ on }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill={on ? '#F5B301' : 'none'} stroke={on ? '#F5B301' : '#CBD5E1'} strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

/** 1 to 5 stars; pressing the current star clears it. */
export const StarRating: React.FC<{ value: number | null; onChange?: (next: number | null) => void; label: string; disabled?: boolean }> = ({ value, onChange, label, disabled }) => {
  if (!onChange) return <span role="img" aria-label={value ? `${value} of 5` : label} className="inline-flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} on={(value ?? 0) >= n} />)}</span>;
  return (
    <span role="group" aria-label={label} className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={disabled} aria-pressed={value === n} aria-label={value === n ? 'Clear rating' : `${n} of 5`} onClick={() => onChange(value === n ? null : n)} className="grid h-11 w-9 place-items-center md:h-8 md:w-7">
          <Star on={(value ?? 0) >= n} />
        </button>
      ))}
    </span>
  );
};

/** A 1–5 score for one criterion, as pressed buttons; pressing the current one clears it. */
export const ScorePicker: React.FC<{ value: number | null; onChange: (next: number | null) => void; label: string; disabled?: boolean }> = ({ value, onChange, label, disabled }) => (
  <span role="group" aria-label={label} className="inline-flex gap-1">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        aria-pressed={value === n}
        disabled={disabled}
        onClick={() => onChange(value === n ? null : n)}
        className={cn('grid h-11 w-11 place-items-center rounded-[10px] border font-mono text-[14px] font-semibold tabular-nums transition-colors md:h-9 md:w-9', value === n ? 'border-[#6EA4E7] bg-[#6EA4E7] text-white' : 'border-[#E5E7EB] bg-white text-black/60 hover:border-[#6EA4E7]/60')}
      >
        {n}
      </button>
    ))}
  </span>
);

export const BackLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className="mb-1 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-black/50 hover:text-foreground md:min-h-0">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    {children}
  </Link>
);
