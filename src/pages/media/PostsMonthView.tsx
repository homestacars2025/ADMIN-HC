import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { chipStyle, cn } from '../../lib/media/badgeColor';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeekMonday,
  formatDayMonthYear,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeekMonday,
  toISODate,
  WEEKDAY_LABELS,
} from '../../lib/media/dates';
import type { MediaGoal, MediaPost } from '../../lib/media/types';
import { Plus } from '../../components/media/MediaIcons';

/**
 * The month grid, Monday-first so the visual weeks line up with the ISO week
 * numbers Postgres computes.
 *
 * Drag & drop is hand-rolled on pointer events rather than dnd-kit: the same 5px
 * activation threshold keeps a chip both clickable (opens the detail panel) and
 * draggable (moves the post), and the overlay is a fixed-position copy with the
 * drop animation disabled — the optimistic update has already moved the chip.
 */

const DRAG_THRESHOLD = 5;

interface DragState {
  postId: string;
  /** Where the gesture began — the threshold is measured from here. */
  startX: number;
  startY: number;
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
  active: boolean;
}

const ChipBody: React.FC<{ post: MediaPost; goal?: MediaGoal }> = ({ post, goal }) => {
  const label = post.objective?.trim() || post.caption?.trim() || 'Untitled post';
  return (
    <div
      style={chipStyle(goal?.color)}
      className="rounded-md border-s-[3px] bg-clip-padding px-2 py-1.5 transition-transform duration-150 hover:-translate-y-px"
    >
      <p className="line-clamp-2 text-[11.5px] font-medium leading-tight">{label}</p>
      {(post.posted || goal) && (
        <div className="mt-1 flex items-center gap-1">
          {post.posted && (
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-700">
              Posted
            </span>
          )}
          {goal && <span className="truncate text-[10px] font-medium opacity-70">{goal.label}</span>}
        </div>
      )}
    </div>
  );
};

export const PostsMonthView: React.FC<{
  month: Date;
  posts: MediaPost[];
  goals: MediaGoal[];
  onOpen: (post: MediaPost) => void;
  onCreateAt: (date: string) => void;
  onMovePost: (postId: string, date: string) => void;
}> = ({ month, posts, goals, onOpen, onCreateAt, onMovePost }) => {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [overDate, setOverDate] = useState<string | null>(null);
  const suppressClick = useRef(false);
  // The pointer handlers read and write the live gesture here. Keeping it in a
  // ref (rather than deriving it from `drag`) means the move/up listeners are
  // registered once per gesture instead of re-registered on every pointermove,
  // and the drop side effect never runs inside a state updater.
  const dragRef = useRef<DragState | null>(null);
  const postsRef = useRef(posts);
  postsRef.current = posts;

  const days = useMemo(
    () =>
      eachDayOfInterval(
        startOfWeekMonday(startOfMonth(month)),
        endOfWeekMonday(endOfMonth(month)),
      ),
    [month],
  );

  // Bucketed once per posts change; the key is always canonical yyyy-MM-dd.
  const byDate = useMemo(() => {
    const map = new Map<string, MediaPost[]>();
    for (const post of posts) {
      if (!post.post_date) continue;
      const key = post.post_date.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(post);
      else map.set(key, [post]);
    }
    return map;
  }, [posts]);

  const goalMap = useMemo(() => new Map(goals.map((g) => [g.key, g])), [goals]);
  const today = new Date();

  /** Which day cell sits under the pointer right now. */
  const dateUnderPointer = useCallback((x: number, y: number): string | null => {
    const element = document.elementFromPoint(x, y);
    const cell = element?.closest<HTMLElement>('[data-day-cell]');
    return cell?.dataset.dayCell ?? null;
  }, []);

  const gestureId = drag?.postId ?? null;

  useEffect(() => {
    if (!gestureId) return;

    function onMove(event: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      // Below the threshold the gesture is still a click; above it, a drag.
      const active = current.active || Math.hypot(dx, dy) > DRAG_THRESHOLD;
      const next = { ...current, pointerX: event.clientX, pointerY: event.clientY, active };
      dragRef.current = next;
      setDrag(next);
      if (active) setOverDate(dateUnderPointer(event.clientX, event.clientY));
    }

    function onUp(event: PointerEvent) {
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setOverDate(null);
      if (!current?.active) return;

      suppressClick.current = true;
      const target = dateUnderPointer(event.clientX, event.clientY);
      const post = postsRef.current.find((p) => p.id === current.postId);
      // Bail when it landed on the day it already sits on.
      if (target && post && post.post_date?.slice(0, 10) !== target) {
        onMovePost(current.postId, target);
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [gestureId, onMovePost, dateUnderPointer]);

  const draggingPost = drag?.active ? posts.find((p) => p.id === drag.postId) : undefined;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
        <div className="grid grid-cols-7 border-b border-black/[0.06] bg-black/[0.015]">
          {WEEKDAY_LABELS.map((d) => (
            <div
              key={d}
              className="px-1 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-black/40 sm:px-3 sm:text-left"
            >
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d[0]}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const date = toISODate(day);
            const inMonth = isSameMonth(day, month);
            const isToday = isSameDay(day, today);
            const dayPosts = byDate.get(date) ?? [];
            const isOver = drag?.active && overDate === date;

            return (
              <div
                key={date}
                data-day-cell={date}
                className={cn(
                  'group/day relative flex min-h-[92px] flex-col gap-1.5 border-b border-r border-black/[0.05] p-1.5 transition-colors duration-150 sm:min-h-[124px] sm:p-2',
                  '[&:nth-child(7n)]:border-r-0',
                  !inMonth && 'bg-black/[0.012]',
                  isOver && 'bg-[#6ea4e7]/[0.06] ring-1 ring-inset ring-[#6ea4e7]/30',
                )}
              >
                <div className="relative z-[2] flex items-center justify-between">
                  <span
                    className={cn(
                      'inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[12px] font-semibold tabular-nums transition-colors',
                      isToday
                        ? 'bg-[#6ea4e7] text-white'
                        : inMonth
                          ? 'text-black/65'
                          : 'text-black/25',
                    )}
                  >
                    {day.getDate()}
                  </span>
                  <button
                    type="button"
                    aria-label={`Add a post on ${formatDayMonthYear(day)}`}
                    onClick={() => onCreateAt(date)}
                    className="rounded-md p-0.5 text-black/25 opacity-0 transition-all duration-150 hover:bg-black/[0.06] hover:text-black/60 focus-visible:opacity-100 group-hover/day:opacity-100"
                  >
                    <Plus size={13} strokeWidth={2} />
                  </button>
                </div>

                {/* An empty day is one big click target. */}
                {dayPosts.length === 0 && (
                  <button
                    type="button"
                    aria-label={`Add a post on ${formatDayMonthYear(day)}`}
                    onClick={() => onCreateAt(date)}
                    className="absolute inset-0 top-8 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6ea4e7]/40"
                  />
                )}

                <div className="flex flex-col gap-1">
                  {dayPosts.map((post) => {
                    const isDragging = drag?.active && drag.postId === post.id;
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          const rect = event.currentTarget.getBoundingClientRect();
                          const next = {
                            postId: post.id,
                            startX: event.clientX,
                            startY: event.clientY,
                            pointerX: event.clientX,
                            pointerY: event.clientY,
                            offsetX: event.clientX - rect.left,
                            offsetY: event.clientY - rect.top,
                            active: false,
                          };
                          dragRef.current = next;
                          setDrag(next);
                        }}
                        onClick={() => {
                          // A completed drag must not also read as a click.
                          if (suppressClick.current) {
                            suppressClick.current = false;
                            return;
                          }
                          onOpen(post);
                        }}
                        className={cn(
                          'relative z-[1] block w-full touch-none text-left focus-visible:outline-none',
                          'focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40 focus-visible:ring-offset-1',
                          'rounded-md',
                          isDragging && 'opacity-30',
                        )}
                      >
                        <ChipBody
                          post={post}
                          goal={post.goal_key ? goalMap.get(post.goal_key) : undefined}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drag overlay — a rotated copy that follows the pointer. */}
      {drag?.active &&
        draggingPost &&
        ReactDOM.createPortal(
          <div
            className="pointer-events-none fixed z-[10004] w-[168px] rotate-2"
            style={{
              left: drag.pointerX - drag.offsetX,
              top: drag.pointerY - drag.offsetY,
              filter: 'drop-shadow(0 10px 28px rgb(0 0 0 / 0.35))',
            }}
          >
            <ChipBody
              post={draggingPost}
              goal={draggingPost.goal_key ? goalMap.get(draggingPost.goal_key) : undefined}
            />
          </div>,
          document.body,
        )}
    </>
  );
};
