import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useMessageRenderer } from '../../lib/i18n';
import { notificationArrived } from '../../lib/notificationEvents';
import { resolveNotificationLink, type NotificationRow } from '../../lib/notifications';
import { formatDue } from '../../lib/tasks';
import { X } from '../media/MediaIcons';
import { Button } from '../media/MediaUI';

const TOAST_MS = 7000;
const MAX_TOASTS = 3;

interface LiveToast {
  notification: NotificationRow;
  isTask: boolean;
}

function taskDue(notification: NotificationRow): string | null {
  const due = notification.vars?.due;
  if (typeof due !== 'string' || !due) return null;
  // Stored as "YYYY-MM-DD HH:MM" in Istanbul time.
  return formatDue(`${due.replace(' ', 'T')}:00+03:00`);
}

export const LiveToasts: React.FC = () => {
  const navigate = useNavigate();
  const renderMessage = useMessageRenderer();
  const [toasts, setToasts] = useState<LiveToast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.notification.id !== id));
  }, []);

  useEffect(() => notificationArrived.subscribe((notification) => {
    setToasts((current) => [
      { notification, isTask: notification.event_key === 'task.assigned' },
      ...current.filter((toast) => toast.notification.id !== notification.id),
    ].slice(0, MAX_TOASTS));
    timers.current.set(notification.id, setTimeout(() => dismiss(notification.id), TOAST_MS));
  }), [dismiss]);

  useEffect(() => {
    const active = timers.current;
    return () => { active.forEach(clearTimeout); };
  }, []);

  if (toasts.length === 0) return null;

  const open = ({ notification, isTask }: LiveToast) => {
    dismiss(notification.id);
    if (isTask && notification.entity_id) {
      navigate(`/dashboard/tasks?task=${notification.entity_id}`);
      return;
    }
    const target = resolveNotificationLink(notification.link);
    if (target) navigate(target);
  };

  return ReactDOM.createPortal(
    <div className="pointer-events-none fixed bottom-4 end-4 z-[10001] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => {
        const { notification, isTask } = toast;
        const title = isTask && typeof notification.vars?.title === 'string'
          ? notification.vars.title
          : renderMessage(notification.i18n_key, notification.vars, notification.title);
        const due = isTask ? taskDue(notification) : null;
        return (
          <div
            key={notification.id}
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-subtle bg-surface p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)] motion-safe:animate-[live-toast-in_220ms_ease-out]"
          >
            <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
            <div className="min-w-0 flex-1">
              {isTask && <div className="text-[11.5px] font-medium text-brand-strong">New task</div>}
              <div dir="auto" className="truncate text-[13.5px] font-medium text-foreground">{title}</div>
              {due && <div className="mt-0.5 text-[12px] text-black/50">Due {due}</div>}
              {isTask && (
                <Button onClick={() => open(toast)} className="mt-2 px-4">Open</Button>
              )}
              {!isTask && resolveNotificationLink(notification.link) && (
                <button type="button" onClick={() => open(toast)} className="mt-1 text-[12.5px] font-medium text-brand-strong hover:underline">
                  Open
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(notification.id)}
              aria-label="Dismiss"
              className="-m-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-black/30 hover:text-black/60"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
};
