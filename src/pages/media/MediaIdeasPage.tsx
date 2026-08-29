import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { convertIdeaToPost, deleteIdea, setIdeaFlag } from '../../lib/media/actions';
import { cn } from '../../lib/media/badgeColor';
import { accentFor, COLOR_BY_KEYS, useColorBy } from '../../lib/media/colorBy';
import { getIdeas } from '../../lib/media/queries';
import { IDEA_CATEGORIES, type MediaIdea } from '../../lib/media/types';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import { Lightbulb, Plus, SearchX } from '../../components/media/MediaIcons';
import {
  ColorByToggle,
  MediaEmptyState,
  MediaNav,
  PageHeader,
  SearchInput,
  useSlidingPill,
} from '../../components/media/MediaShared';
import { toast } from '../../components/media/MediaToast';
import { Button, Skeleton } from '../../components/media/MediaUI';
import { IdeaFormSheet } from './IdeaFormSheet';
import { IdeaCard } from './IdeaCard';
import { useMediaLookups } from './MediaLayout';
import { useConfirm } from './useConfirm';

const ALL = '__all__';

/** The admin-only approval lane. Staff never see this control. */
type StateFilter = 'all' | 'pending' | 'approved' | 'posted';

const STATE_FILTERS: Array<{ value: StateFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'posted', label: 'Posted' },
];

function matchesState(idea: MediaIdea, filter: StateFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'pending') return !idea.is_approved;
  if (filter === 'approved') return idea.is_approved;
  return idea.posted;
}

const IdeasSkeleton: React.FC = () => (
  <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
      <Skeleton className="h-9 w-28 shrink-0 rounded-lg" />
    </div>
    <div className="flex items-center gap-1">
      {[64, 78, 84, 80, 72, 62, 82].map((w, i) => (
        <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />
      ))}
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3.5 rounded-2xl border border-black/[0.07] bg-white p-5"
        >
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex gap-1.5">
            <Skeleton className="h-[22px] w-20 rounded-full" />
            <Skeleton className="h-[22px] w-16 rounded-full" />
          </div>
          <Skeleton className="mt-1 h-9 w-full rounded-lg" />
        </div>
      ))}
    </div>
  </div>
);

const MediaIdeasPage: React.FC = () => {
  const navigate = useNavigate();
  const { goals, formats } = useMediaLookups();

  const [ideas, setIdeas] = useState<MediaIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>(ALL);
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MediaIdea | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [flagPendingId, setFlagPendingId] = useState<string | null>(null);
  const [colorBy, setColorBy] = useColorBy(COLOR_BY_KEYS.ideas);
  const confirm = useConfirm();

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    const rows = await getIdeas();
    if (signal?.cancelled) return;
    setIdeas(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const goalMap = useMemo(() => new Map(goals.map((g) => [g.key, g])), [goals]);
  const formatMap = useMemo(() => new Map(formats.map((f) => [f.key, f])), [formats]);

  /**
   * The known categories plus every other non-empty value already in the data —
   * a category typed by hand, or left over from an import, must never make its
   * ideas reachable only through search.
   */
  const categories = useMemo(() => {
    const known = IDEA_CATEGORIES.map((c) => c.value);
    const extra = ideas
      .map((i) => i.category)
      .filter((c): c is string => typeof c === 'string' && c.length > 0 && !known.includes(c));
    return [...known, ...Array.from(new Set(extra))];
  }, [ideas]);

  const categoryLabel = useCallback(
    (value: string) => IDEA_CATEGORIES.find((c) => c.value === value)?.label ?? value,
    [],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const idea of ideas) {
      if (!idea.category) continue;
      counts.set(idea.category, (counts.get(idea.category) ?? 0) + 1);
    }
    return counts;
  }, [ideas]);

  const stateCounts = useMemo(
    () => ({
      all: ideas.length,
      pending: ideas.filter((i) => !i.is_approved).length,
      approved: ideas.filter((i) => i.is_approved).length,
      posted: ideas.filter((i) => i.posted).length,
    }),
    [ideas],
  );

  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      ideas.filter((idea) => {
        if (category !== ALL && idea.category !== category) return false;
        if (!matchesState(idea, stateFilter)) return false;
        if (!q) return true;
        return (
          (idea.title ?? '').toLowerCase().includes(q) ||
          (idea.content ?? '').toLowerCase().includes(q) ||
          (idea.note ?? '').toLowerCase().includes(q)
        );
      }),
    [ideas, category, stateFilter, q],
  );

  const { trackRef, pillStyle } = useSlidingPill(category);
  const filtered = category !== ALL || stateFilter !== 'all' || Boolean(search.trim());

  function clearFilters() {
    setSearch('');
    setCategory(ALL);
    setStateFilter('all');
  }

  /**
   * Optimistic flag write. `posted` and `is_approved` are the two columns the
   * database trigger reserves for admins, so the failure path here is a real one
   * (a role downgraded mid-session) and the row must snap back when it fires.
   */
  const toggleFlag = useCallback(
    async (idea: MediaIdea, field: 'posted' | 'is_approved') => {
      const next = !idea[field];
      const before = ideas;
      setFlagPendingId(idea.id);
      setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, [field]: next } : i)));

      const result = await setIdeaFlag(idea.id, field, next);
      setFlagPendingId(null);

      if (!result.ok) {
        setIdeas(before);
        toast.error(result.error ?? "Couldn't update the idea");
        return;
      }
      toast.success(
        field === 'posted'
          ? next
            ? 'Marked as posted'
            : 'Marked as not posted'
          : next
            ? 'Idea approved'
            : 'Approval removed',
      );
    },
    [ideas],
  );

  const handleConvert = useCallback(
    async (idea: MediaIdea) => {
      setConvertingId(idea.id);
      const result = await convertIdeaToPost(idea.id);
      setConvertingId(null);

      if (!result.ok) {
        toast.error(result.error ?? "Couldn't convert this idea");
        return;
      }
      if (result.warning) toast.warning(result.warning);
      else toast.success('Post created from idea');
      navigate(`/dashboard/media/calendar?post=${result.postId}`);
    },
    [navigate],
  );

  const askDelete = useCallback(
    (idea: MediaIdea) => {
      const title = idea.title?.trim() || 'this idea';
      confirm.ask({
        title: 'Delete this idea?',
        description: `“${title}” will be removed permanently. This cannot be undone.`,
        // Deleting a converted idea would otherwise trip the FK from the post
        // that references it, so the post is released rather than removed.
        consequence: idea.converted_post_id
          ? 'This idea was converted into a scheduled post. The post stays on the calendar — it just stops showing that it came from an idea.'
          : undefined,
        confirmLabel: 'Delete idea',
        onConfirm: async () => {
          const result = await deleteIdea(idea.id);
          if (!result.ok) {
            toast.error(result.error ?? "Couldn't delete the idea");
            return;
          }
          setIdeas((prev) => prev.filter((i) => i.id !== idea.id));
          toast.success('Idea deleted');
        },
      });
    },
    [confirm],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Content Ideas"
        title="Ideas"
        subtitle="The backlog of concepts — capture them here, then convert the good ones into scheduled posts."
      />
      <MediaNav />

      {loading ? (
        <IdeasSkeleton />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Controls */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search ideas…"
              ariaLabel="Search ideas"
            />
            <Button
              size="lg"
              iconStart
              className="shrink-0"
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            >
              <Plus size={15} strokeWidth={2} />
              New idea
            </Button>
          </div>

          {/* Approval lane — the admin's read on the backlog. */}
          <div
            role="group"
            aria-label="Approval state"
            className="inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-black/[0.07] bg-black/[0.02] p-0.5"
          >
            {STATE_FILTERS.map((f) => {
              const active = stateFilter === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStateFilter(f.value)}
                  className={cn(
                    'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[7px] px-3 text-[12.5px] transition-colors duration-150',
                    active
                      ? 'bg-white font-semibold text-black/85 shadow-[0_1px_2px_rgb(0_0_0/0.07)] ring-1 ring-black/[0.05]'
                      : 'font-medium text-black/45 hover:text-black/70',
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                      active ? 'bg-black/[0.06] text-black/60' : 'bg-black/[0.05] text-black/40',
                    )}
                  >
                    {stateCounts[f.value]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Category tabs — the brand pill slides between them — beside the
              colour-source toggle. */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            ref={trackRef}
            role="tablist"
            aria-label="Idea categories"
            className="relative -mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 pb-1"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 h-8 rounded-full bg-[#6ea4e7]"
              style={pillStyle}
            />
            {[ALL, ...categories].map((value) => {
              const active = category === value;
              const count = value === ALL ? ideas.length : categoryCounts.get(value) ?? 0;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-pill-active={active ? 'true' : 'false'}
                  onClick={() => setCategory(value)}
                  className={cn(
                    'relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors duration-150',
                    active
                      ? 'font-semibold text-white'
                      : 'font-medium text-black/55 hover:bg-black/[0.04] hover:text-black/80',
                  )}
                >
                  <span className="relative">{value === ALL ? 'All' : categoryLabel(value)}</span>
                  <span
                    className={cn(
                      'relative rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                      active ? 'bg-white/20 text-white' : 'bg-black/[0.05] text-black/45',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

            <ColorByToggle
              value={colorBy}
              onChange={setColorBy}
              scope="ideas"
              className="shrink-0"
            />
          </div>

          {/* Grid / empty states */}
          {visible.length === 0 ? (
            filtered ? (
              <MediaEmptyState
                Icon={SearchX}
                title="Nothing matches that filter"
                description="No ideas in this category match your search. Try a different category or clear the filters."
                action={
                  <Button variant="outline" size="lg" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <MediaEmptyState
                Icon={Lightbulb}
                title="No ideas yet"
                description="This is the backlog for everything you might shoot or design. Capture the first concept and turn it into a scheduled post when it's ready."
                action={
                  <Button
                    size="lg"
                    iconStart
                    onClick={() => {
                      setEditing(null);
                      setSheetOpen(true);
                    }}
                  >
                    <Plus size={15} strokeWidth={2} />
                    Add the first idea
                  </Button>
                }
              />
            )
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  goal={idea.goal_key ? goalMap.get(idea.goal_key) : undefined}
                  format={idea.format_key ? formatMap.get(idea.format_key) : undefined}
                  accent={accentFor(colorBy, idea, goalMap, formatMap)}
                  colorBy={colorBy}
                  converting={convertingId === idea.id}
                  flagPending={flagPendingId === idea.id}
                  onEdit={() => {
                    setEditing(idea);
                    setSheetOpen(true);
                  }}
                  onDelete={() => askDelete(idea)}
                  onConvert={() => handleConvert(idea)}
                  onTogglePosted={() => toggleFlag(idea, 'posted')}
                  onToggleApproved={() => toggleFlag(idea, 'is_approved')}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <IdeaFormSheet
        open={sheetOpen}
        idea={editing}
        goals={goals}
        formats={formats}
        defaultCategory={category !== ALL ? category : undefined}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
        onSaved={() => load()}
      />

      <ConfirmDialog
        state={confirm.state}
        pending={confirm.pending}
        onCancel={confirm.cancel}
        onConfirm={confirm.confirm}
      />
    </div>
  );
};

export default MediaIdeasPage;
