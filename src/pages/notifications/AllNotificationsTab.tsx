import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationCounts } from '../../hooks/useNotificationCounts';
import { useMessageRenderer, useTranslation } from '../../lib/i18n';
import {
  CATEGORY_STYLES,
  getNotifications,
  markAllRead,
  markRead,
  relativeTime,
  resolveNotificationLink,
  type NotificationCategory,
  type NotificationRow,
} from '../../lib/notifications';
import {
  BRAND, Button, CARD_STYLE, Chip, EmptyState, ErrorBanner, FAINT, INK, LINE, MUTED,
} from './ui';

const PAGE_SIZE = 20;

const CATEGORY_FILTERS: Array<{ value: NotificationCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'event', label: 'Event' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'task', label: 'Task' },
  { value: 'manual', label: 'Manual' },
];

export const AllNotificationsTab: React.FC = () => {
  const navigate = useNavigate();
  const { unread, refreshNow } = useNotificationCounts();
  const renderMessage = useMessageRenderer();
  const { dir } = useTranslation();

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [category, setCategory] = useState<NotificationCategory | 'all'>('all');
  const [page, setPage] = useState(0);

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNotifications(PAGE_SIZE, page * PAGE_SIZE, onlyUnread);
      if (signal?.cancelled) return;
      setRows(data);
    } catch (e) {
      if (signal?.cancelled) return;
      setError(e instanceof Error ? e.message : 'Could not load notifications');
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, [page, onlyUnread]);

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => { signal.cancelled = true; };
  }, [load]);

  /*
   * `my_notifications` filters unread server-side but has no category argument,
   * so the category chips filter the fetched page client-side. That means a
   * category can show fewer than PAGE_SIZE rows on a page — the pager still
   * walks the underlying, unfiltered list, which is why "Next" is driven by the
   * fetched count rather than the filtered one.
   */
  const visible = category === 'all' ? rows : rows.filter((r) => r.category === category);
  const hasNext = rows.length === PAGE_SIZE;

  async function open(item: NotificationRow) {
    if (!item.is_read) {
      try {
        await markRead(item.id);
        setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, is_read: true } : r)));
        refreshNow();
      } catch {
        // The link is the point; the flag reconciles on the next load.
      }
    }
    const target = resolveNotificationLink(item.link);
    if (target) navigate(target);
  }

  async function handleMarkAll() {
    try {
      await markAllRead();
      setRows((prev) => prev.map((r) => ({ ...r, is_read: true })));
      refreshNow();
      if (onlyUnread) load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark all as read');
    }
  }

  function changeFilter(next: boolean) {
    setOnlyUnread(next);
    setPage(0);
  }

  return (
    <>
      {error && <ErrorBanner message={error} />}

      {/* Filters */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <div style={{
          display: 'inline-flex', gap: 3, padding: 3,
          background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10,
        }}>
          {[{ label: 'All', value: false }, { label: 'Unread', value: true }].map((opt) => {
            const active = onlyUnread === opt.value;
            return (
              <button
                key={opt.label}
                onClick={() => changeFilter(opt.value)}
                style={{
                  height: 30, padding: '0 13px', borderRadius: 8, border: 'none',
                  fontSize: 12.5, fontWeight: active ? 700 : 500, fontFamily: 'inherit',
                  cursor: 'pointer',
                  color: active ? BRAND : MUTED,
                  background: active ? 'rgba(75,166,234,0.10)' : 'transparent',
                }}
              >
                {opt.label}
                {opt.value && unread > 0 && (
                  <span style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>{unread}</span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATEGORY_FILTERS.map((f) => {
            const active = category === f.value;
            const style = f.value === 'all' ? null : CATEGORY_STYLES[f.value];
            return (
              <button
                key={f.value}
                onClick={() => setCategory(f.value)}
                style={{
                  height: 30, padding: '0 12px', borderRadius: 20,
                  border: `1px solid ${active ? (style?.color ?? BRAND) : '#e5e7eb'}`,
                  background: active ? (style?.bg ?? 'rgba(75,166,234,0.10)') : '#fff',
                  color: active ? (style?.color ?? BRAND) : MUTED,
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  fontFamily: 'inherit', cursor: 'pointer',
                  transition: 'all 140ms ease',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <Button kind="ghost" small onClick={handleMarkAll} disabled={unread === 0}>
            Mark all as read
          </Button>
        </div>
      </div>

      {/* List */}
      <div style={{ ...CARD_STYLE, overflow: 'hidden' }}>
        {loading && (
          <div style={{ padding: '48px 20px', textAlign: 'center', fontSize: 13, color: FAINT }}>
            Loading…
          </div>
        )}

        {!loading && visible.length === 0 && (
          <EmptyState
            title={onlyUnread || category !== 'all' ? 'Nothing matches those filters' : 'No notifications yet'}
            description={
              onlyUnread || category !== 'all'
                ? 'Try a different type, or switch back to All.'
                : 'Events, reminders and manual messages will appear here as they arrive.'
            }
            action={
              (onlyUnread || category !== 'all') ? (
                <Button small onClick={() => { setCategory('all'); changeFilter(false); }}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}

        {!loading && visible.map((item) => {
          const style = CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES.event;
          const target = resolveNotificationLink(item.link);
          return (
            <div
              key={item.id}
              onClick={() => open(item)}
              role={target ? 'button' : undefined}
              tabIndex={target ? 0 : undefined}
              onKeyDown={(e) => { if (target && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(item); } }}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 13,
                padding: '15px 18px', borderBottom: '1px solid #f4f4f4',
                background: item.is_read ? '#fff' : 'rgba(75,166,234,0.04)',
                cursor: target ? 'pointer' : 'default',
                transition: 'background 140ms ease',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#fafbfc'; }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background =
                  item.is_read ? '#fff' : 'rgba(75,166,234,0.04)';
              }}
            >
              {!item.is_read
                ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: BRAND, flexShrink: 0, marginTop: 8 }} />
                : <span style={{ width: 7, flexShrink: 0 }} />}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                  <Chip label={style.label} color={style.color} bg={style.bg} />
                  {item.event_key && (
                    <span style={{ fontSize: 11, color: FAINT, fontFamily: 'ui-monospace, monospace' }}>
                      {item.event_key}
                    </span>
                  )}
                </div>
                <div dir={dir} style={{
                  fontSize: 13.5, fontWeight: item.is_read ? 500 : 700,
                  color: INK, lineHeight: 1.45,
                  textAlign: dir === 'rtl' ? 'right' : 'left',
                }}>
                  {renderMessage(item.i18n_key, item.vars, item.title)}
                </div>
                {renderMessage(item.body_i18n_key, item.vars, item.body) && (
                  <div dir={dir} style={{
                    fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 1.6,
                    textAlign: dir === 'rtl' ? 'right' : 'left',
                  }}>
                    {renderMessage(item.body_i18n_key, item.vars, item.body)}
                  </div>
                )}
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                fontSize: 11.5, color: FAINT, whiteSpace: 'nowrap', marginTop: 2,
              }}>
                {relativeTime(item.created_at)}
                {target && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
          );
        })}

        {/* Pager */}
        {!loading && (page > 0 || hasNext) && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '12px 18px', background: '#fafbfc',
          }}>
            <span style={{ fontSize: 12, color: FAINT }}>
              Page {page + 1}
              {category !== 'all' && ` · showing ${visible.length} of ${rows.length} on this page`}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button small onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                Previous
              </Button>
              <Button small onClick={() => setPage((p) => p + 1)} disabled={!hasNext}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
