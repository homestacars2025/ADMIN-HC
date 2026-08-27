import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/media/badgeColor';
import type { MediaFormat, MediaGoal, MediaIdea } from '../../lib/media/types';
import {
  ApprovedToggle,
  FormatBadge,
  GoalBadge,
  PostedToggle,
} from '../../components/media/MediaShared';
import {
  ArrowUpRight,
  Pencil,
  Sparkles,
  StickyNote,
  Trash2,
} from '../../components/media/MediaIcons';
import { Button, Spinner } from '../../components/media/MediaUI';

export const IdeaCard: React.FC<{
  idea: MediaIdea;
  goal?: MediaGoal;
  format?: MediaFormat;
  converting: boolean;
  flagPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onTogglePosted: () => void;
  onToggleApproved: () => void;
}> = ({
  idea,
  goal,
  format,
  converting,
  flagPending,
  onEdit,
  onDelete,
  onConvert,
  onTogglePosted,
  onToggleApproved,
}) => {
  const title = idea.title?.trim() || 'Untitled idea';

  return (
    <article
      className={cn(
        'group/idea relative flex flex-col gap-3.5 rounded-2xl border border-black/[0.07] bg-white p-5',
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-black/[0.1]',
        'hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.16)]',
      )}
    >
      {/* Title + row actions */}
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug tracking-[-0.012em] text-black/[0.88]">
          {title}
        </h3>
        <div className="-mt-0.5 -mr-1.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/idea:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            aria-label={`Edit ${title}`}
            className="text-black/35 hover:text-black/70"
          >
            <Pencil size={14} strokeWidth={1.75} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={`Delete ${title}`}
            className="text-black/30 hover:bg-[#d4183d]/10 hover:text-[#d4183d]"
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      {idea.content && (
        <p className="line-clamp-3 text-[13px] leading-relaxed text-black/50">{idea.content}</p>
      )}

      {(goal || idea.goal_key || format || idea.format_key) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <GoalBadge goal={goal} fallback={idea.goal_key} />
          <FormatBadge format={format} fallback={idea.format_key} />
        </div>
      )}

      {idea.note && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/[0.06] px-3 py-2.5 ring-1 ring-amber-500/[0.12]">
          <StickyNote size={13} strokeWidth={1.75} className="mt-px shrink-0 text-amber-600/80" />
          <p className="text-[12.5px] leading-relaxed text-amber-900/70">{idea.note}</p>
        </div>
      )}

      {/* Admin state — interactive here, unlike the staff build's read-only badges. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <PostedToggle
          posted={idea.posted}
          pending={flagPending}
          onToggle={onTogglePosted}
          ariaLabel={`Mark ${title} as posted`}
        />
        <ApprovedToggle
          approved={idea.is_approved}
          pending={flagPending}
          onToggle={onToggleApproved}
          ariaLabel={`Approve ${title}`}
        />
      </div>

      <div className="mt-auto border-t border-black/[0.05] pt-3.5">
        {idea.converted_post_id ? (
          <Link
            to={`/dashboard/media/calendar?post=${idea.converted_post_id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500/[0.08] px-3 text-[12.5px] font-semibold text-emerald-700 no-underline transition-colors duration-150 hover:bg-emerald-500/[0.14]"
          >
            Converted — open post
            <ArrowUpRight size={13} strokeWidth={2} />
          </Link>
        ) : (
          <Button size="lg" onClick={onConvert} disabled={converting} className="w-full" iconStart>
            {converting ? <Spinner size={14} /> : <Sparkles size={14} strokeWidth={1.75} />}
            {converting ? 'Converting…' : 'Convert to Post'}
          </Button>
        )}
      </div>
    </article>
  );
};
