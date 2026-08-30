import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useNotificationCounts } from '../hooks/useNotificationCounts';
import {
  CATEGORY_STYLES,
  getNotifications,
  markAllRead,
  markRead,
  relativeTime,
  type NotificationRow,
} from '../lib/notifications';

/**
 * The notification bell, mounted in the sidebar.
 *
 * The dashboard has no header bar, so the bell lives beside the logo (expanded)
 * or under it (collapsed) rather than inventing global chrome above every page.
 */

const PANEL_WIDTH = 380;

const CategoryDot: React.FC<{ category: NotificationRow['category'] }> = ({ category }) => {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.event;
  return (
    <span
      title={style.label}
      style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: style.bg, color: style.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 800, letterSpacing: '0.02em',
      }}
    >
      {style.label.charAt(0)}
    </span>
  );
};

const NotificationBell: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const navigate = useNavigate();
  const { unread, refreshNow } = useNotificationCounts();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getNotifications(10, 0, false));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  // Position the panel against the trigger, clamped to the viewport.
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 12);
    setAnchor({ top: rect.bottom + 8, left: Math.max(12, left) });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  async function openItem(item: NotificationRow) {
    setOpen(false);
    if (!item.is_read) {
      try {
        await markRead(item.id);
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
        refreshNow();
      } catch {
        // Navigation still matters more than the read flag; the next poll or
        // the notifications page will reconcile it.
      }
    }
    if (item.link) navigate(item.link);
  }

  async function handleMarkAll() {
    try {
      await markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      refreshNow();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark all as read');
    }
  }

  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        title={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        style={{
          position: 'relative',
          width: 32, height: 32, borderRadius: 8,
          border: '1px solid #e5e7eb',
          background: open ? 'rgba(75,166,234,0.08)' : '#fff',
          color: open ? '#4ba6ea' : '#6b7280',
          cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 140ms ease',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          />
          <path d="M13.7 21a2 2 0 01-3.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>

        {unread > 0 && (
          <span
            style={{
              position: 'absolute', top: -5, right: -5,
              minWidth: 17, height: 17, padding: '0 4px',
              borderRadius: 9, background: '#ef4444', color: '#fff',
              fontSize: 10, fontWeight: 800, lineHeight: '17px',
              textAlign: 'center', border: '2px solid #fff',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && anchor && ReactDOM.createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'fixed', top: anchor.top, left: anchor.left, zIndex: 3000,
            width: PANEL_WIDTH, maxWidth: 'calc(100vw - 24px)',
            background: '#fff', borderRadius: 14, border: '1px solid #ebebeb',
            boxShadow: '0 16px 48px rgba(0,0,0,0.16)',
            overflow: 'hidden', animation: 'nbFade 140ms ease',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, padding: '13px 16px', borderBottom: '1px solid #f1f1f1',
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f1117' }}>
              Notifications
              {unread > 0 && (
                <span style={{ marginLeft: 7, fontSize: 11, fontWeight: 700, color: '#ef4444' }}>
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, color: '#4ba6ea',
                  padding: 0, fontFamily: 'inherit',
                }}
              >
                Mark all as read
              </button>
            )}
          </div>

          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '26px 16px', textAlign: 'center', fontSize: 12.5, color: '#9ca3af' }}>
                Loading…
              </div>
            )}

            {!loading && error && (
              <div style={{ padding: '20px 16px', fontSize: 12.5, color: '#ef4444', lineHeight: 1.6 }}>
                {error}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div style={{ padding: '30px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>You are all caught up</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                  New notifications will show up here.
                </div>
              </div>
            )}

            {!loading && !error && items.map((item) => (
              <button
                key={item.id}
                onClick={() => openItem(item)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 11, width: '100%',
                  padding: '12px 16px', border: 'none', textAlign: 'left',
                  borderBottom: '1px solid #f6f6f6',
                  background: item.is_read ? '#fff' : 'rgba(75,166,234,0.045)',
                  cursor: item.link ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#fafbfc'; }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    item.is_read ? '#fff' : 'rgba(75,166,234,0.045)';
                }}
              >
                <CategoryDot category={item.category} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.8, fontWeight: item.is_read ? 500 : 700,
                    color: '#0f1117', lineHeight: 1.4,
                  }}>
                    {item.title}
                  </div>
                  {item.body && (
                    <div style={{
                      fontSize: 12, color: '#6b7280', marginTop: 2, lineHeight: 1.5,
                      display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {item.body}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    {relativeTime(item.created_at)}
                  </div>
                </div>

                {!item.is_read && (
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', background: '#4ba6ea',
                    flexShrink: 0, marginTop: 6,
                  }} />
                )}
              </button>
            ))}
          </div>

          <button
            onClick={() => { setOpen(false); navigate('/dashboard/notifications'); }}
            style={{
              display: 'block', width: '100%', padding: '12px 16px',
              border: 'none', borderTop: '1px solid #f1f1f1', background: '#fafbfc',
              fontSize: 12.5, fontWeight: 700, color: '#4ba6ea',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            View all notifications
          </button>

          <style>{`@keyframes nbFade { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>,
        document.body,
      )}
    </>
  );
};

export default NotificationBell;
