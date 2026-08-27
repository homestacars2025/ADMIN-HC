import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { deletePost, setPostPosted, updatePostField } from '../../lib/media/actions';
import { cn, dotStyle } from '../../lib/media/badgeColor';
import {
  addMonths,
  formatDayShortMonth,
  formatMonthName,
  formatMonthYear,
  isSameMonth,
  parseISODate,
  startOfMonth,
  toISODate,
} from '../../lib/media/dates';
import { getPosts } from '../../lib/media/queries';
import type { EditablePostField, MediaPost } from '../../lib/media/types';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  List,
  Plus,
} from '../../components/media/MediaIcons';
import {
  MediaEmptyState,
  MediaNav,
  PageHeader,
  useSlidingPill,
} from '../../components/media/MediaShared';
import { toast } from '../../components/media/MediaToast';
import { Button, Skeleton } from '../../components/media/MediaUI';
import { PostDetailSheet } from './PostDetailSheet';
import { PostsListView } from './PostsListView';
import { PostsMonthView } from './PostsMonthView';
import { useMediaLookups } from './MediaLayout';
import { useConfirm } from './useConfirm';

type ViewMode = 'list' | 'month';

const VIEWS: Array<{ value: ViewMode; label: string; Icon: typeof List }> = [
  { value: 'list', label: 'List', Icon: List },
  { value: 'month', label: 'Calendar', Icon: CalendarDays },
];

const CalendarSkeleton: React.FC = () => (
  <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-[68px] rounded-lg" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-[172px] rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
      <div className="grid grid-cols-7 border-b border-black/[0.06] bg-black/[0.015]">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="px-3 py-2.5">
            <Skeleton className="h-2.5 w-8" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 35 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[124px] flex-col gap-1.5 border-b border-r border-black/[0.05] p-2 [&:nth-child(7n)]:border-r-0"
          >
            <Skeleton className="h-[22px] w-[22px] rounded-full" />
            {i % 3 === 0 && <Skeleton className="h-9 w-full rounded-md" />}
            {i % 5 === 0 && <Skeleton className="h-9 w-full rounded-md" />}
          </div>
        ))}
      </div>
    </div>
  </div>
);

const MediaCalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPostId = searchParams.get('post');
  const { goals, formats } = useMediaLookups();

  const [posts, setPosts] = useState<MediaPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('month');
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState<string | undefined>(undefined);
  const [postedPendingId, setPostedPendingId] = useState<string | null>(null);
  const [arrivalHandled, setArrivalHandled] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    const rows = await getPosts();
    if (signal?.cancelled) return;
    setPosts(rows);
    setLoading(false);
    return rows;
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  /**
   * `?post=<id>` is how "Convert to Post" hands off: open that post's panel and
   * start the grid on its month. Runs once, after the first load resolves — the
   * post it names doesn't exist client-side until then.
   */
  useEffect(() => {
    if (loading || arrivalHandled) return;
    setArrivalHandled(true);
    if (!initialPostId) return;
    const target = posts.find((p) => p.id === initialPostId);
    if (!target) return;
    if (target.post_date) setMonth(startOfMonth(parseISODate(target.post_date)));
    setActivePostId(target.id);
    setSheetOpen(true);
  }, [loading, arrivalHandled, initialPostId, posts]);

  // The open panel is held by id, not by value, so it follows the post through a
  // reload instead of pinning a stale copy.
  const activePost = activePostId ? posts.find((p) => p.id === activePostId) ?? null : null;

  const monthPosts = useMemo(
    () => posts.filter((p) => p.post_date && isSameMonth(parseISODate(p.post_date), month)),
    [posts, month],
  );
  // Undated posts belong to no month at all, so they ride along in the List
  // view's "Unscheduled" group rather than becoming unreachable.
  const undatedPosts = useMemo(() => posts.filter((p) => !p.post_date), [posts]);
  const listPosts = useMemo(() => [...monthPosts, ...undatedPosts], [monthPosts, undatedPosts]);

  const activeGoals = useMemo(
    () => goals.filter((g) => monthPosts.some((p) => p.goal_key === g.key)),
    [goals, monthPosts],
  );

  const { trackRef, pillStyle } = useSlidingPill(view);

  /** Optimistic patch, snapshot rollback. Never shows what the DB refused. */
  const saveField = useCallback(
    async (postId: string, field: EditablePostField, value: string | null): Promise<boolean> => {
      const before = posts;
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, [field]: value } : p)));
      const result = await updatePostField(postId, field, value);
      if (!result.ok) {
        setPosts(before);
        toast.error(result.error ?? "Couldn't save that change");
        return false;
      }
      return true;
    },
    [posts],
  );

  const movePost = useCallback(
    async (postId: string, date: string) => {
      const ok = await saveField(postId, 'post_date', date);
      if (ok) toast.success(`Moved to ${formatDayShortMonth(parseISODate(date))}`);
    },
    [saveField],
  );

  const togglePosted = useCallback(
    async (post: MediaPost) => {
      const next = !post.posted;
      const before = posts;
      setPostedPendingId(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, posted: next } : p)));

      const result = await setPostPosted(post.id, next);
      setPostedPendingId(null);

      if (!result.ok) {
        setPosts(before);
        toast.error(result.error ?? "Couldn't update the post");
        return;
      }
      toast.success(next ? 'Marked as posted' : 'Marked as not posted');
    },
    [posts],
  );

  function openPost(post: MediaPost) {
    setActivePostId(post.id);
    setDraftDate(undefined);
    setSheetOpen(true);
  }

  function openCreate(date?: string) {
    setActivePostId(null);
    setDraftDate(date ?? toISODate(month));
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setActivePostId(null);
    setDraftDate(undefined);
    // Drop ?post= so a refresh doesn't reopen a panel the admin just closed.
    if (initialPostId) navigate('/dashboard/media/calendar', { replace: true });
  }

  const askDelete = useCallback(
    (post: MediaPost) => {
      const label = post.objective?.trim() || post.caption?.trim() || 'this post';
      confirm.ask({
        title: 'Delete this post?',
        description: `“${label}” will be removed from the calendar permanently. This cannot be undone.`,
        // The idea's back-link is cleared first, which also restores its
        // "Convert to Post" button — worth saying before the click, not after.
        consequence: post.source_idea_id
          ? 'This post came from an idea. The idea stays in the backlog and becomes convertible again.'
          : undefined,
        confirmLabel: 'Delete post',
        onConfirm: async () => {
          const result = await deletePost(post.id);
          if (!result.ok) {
            toast.error(result.error ?? "Couldn't delete the post");
            return;
          }
          setPosts((prev) => prev.filter((p) => p.id !== post.id));
          if (activePostId === post.id) closeSheet();
          toast.success('Post deleted');
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirm, activePostId],
  );

  const isCurrentMonth = isSameMonth(month, new Date());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Content Plan"
        title="Calendar"
        subtitle="Everything scheduled to go out — switch between the week-by-week list and the month grid."
      />
      <MediaNav />

      {loading ? (
        <CalendarSkeleton />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Toolbar */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-0.5 rounded-lg border border-black/[0.07] bg-white p-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous month"
                  onClick={() => setMonth((m) => addMonths(m, -1))}
                  className="text-black/45"
                >
                  <ChevronLeft size={15} strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next month"
                  onClick={() => setMonth((m) => addMonths(m, 1))}
                  className="text-black/45"
                >
                  <ChevronRight size={15} strokeWidth={1.75} />
                </Button>
              </div>

              <h2 className="text-[15px] font-semibold tracking-[-0.014em] text-black/85">
                {formatMonthYear(month)}
              </h2>

              {!isCurrentMonth && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-black/50"
                  onClick={() => setMonth(startOfMonth(new Date()))}
                >
                  Today
                </Button>
              )}

              <span className="rounded-full bg-black/[0.045] px-2 py-0.5 text-[11.5px] font-medium tabular-nums text-black/45">
                {monthPosts.length} {monthPosts.length === 1 ? 'post' : 'posts'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div
                ref={trackRef}
                role="group"
                aria-label="Calendar view"
                className="relative inline-flex items-center gap-0.5 rounded-lg border border-black/[0.07] bg-black/[0.02] p-0.5"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-0.5 h-[30px] rounded-[7px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.07)] ring-1 ring-black/[0.05]"
                  style={pillStyle}
                />
                {VIEWS.map(({ value, label, Icon }) => {
                  const active = view === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      data-pill-active={active ? 'true' : 'false'}
                      onClick={() => setView(value)}
                      className={cn(
                        'relative inline-flex h-[30px] items-center gap-1.5 rounded-[7px] px-3 text-[12.5px] transition-colors duration-150',
                        active
                          ? 'font-semibold text-black/85'
                          : 'font-medium text-black/45 hover:text-black/70',
                      )}
                    >
                      <Icon size={13} strokeWidth={active ? 2 : 1.6} className="relative" />
                      <span className="relative">{label}</span>
                    </button>
                  );
                })}
              </div>

              <Button size="lg" iconStart className="shrink-0" onClick={() => openCreate()}>
                <Plus size={15} strokeWidth={2} />
                New post
              </Button>
            </div>
          </div>

          {/* Goal legend — month view only, and only for goals actually in use. */}
          {view === 'month' && activeGoals.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {activeGoals.map((g) => (
                <span
                  key={g.key}
                  className="inline-flex items-center gap-1.5 text-[11.5px] text-black/45"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={dotStyle(g.color)}
                  />
                  {g.label}
                </span>
              ))}
            </div>
          )}

          {view === 'month' ? (
            <PostsMonthView
              month={month}
              posts={posts}
              goals={goals}
              onOpen={openPost}
              onCreateAt={(date) => openCreate(date)}
              onMovePost={movePost}
            />
          ) : listPosts.length === 0 ? (
            <MediaEmptyState
              Icon={CalendarPlus}
              title={`Nothing scheduled in ${formatMonthName(month)}`}
              description="Add a post for this month, or convert an approved idea from the Ideas board straight into the calendar."
              action={
                <Button size="lg" iconStart onClick={() => openCreate()}>
                  <Plus size={15} strokeWidth={2} />
                  Schedule a post
                </Button>
              }
            />
          ) : (
            <PostsListView
              posts={listPosts}
              goals={goals}
              formats={formats}
              postedPendingId={postedPendingId}
              onSaveField={saveField}
              onTogglePosted={togglePosted}
              onOpen={openPost}
              onDelete={askDelete}
            />
          )}
        </div>
      )}

      <PostDetailSheet
        open={sheetOpen}
        post={activePost}
        defaultDate={draftDate}
        goals={goals}
        formats={formats}
        postedPending={postedPendingId === activePost?.id}
        onTogglePosted={() => activePost && togglePosted(activePost)}
        onClose={closeSheet}
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

export default MediaCalendarPage;
