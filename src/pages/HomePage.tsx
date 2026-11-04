import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useShell } from '../components/shell/shellContext';
import StaffAvatar from '../components/shared/StaffAvatar';
import { useOnlineUsers } from '../hooks/usePresence';
import { readNotification, useNotificationCounts } from '../hooks/useNotificationCounts';
import { useComplianceCars } from '../lib/complianceStore';
import {
  fetchAdminHome,
  greetingFor,
  istanbulDateLabel,
  type AdminHomeData,
  type ScheduleItem,
} from '../lib/homeData';
import { useMessageRenderer } from '../lib/i18n';
import { cn } from '../lib/media/badgeColor';
import {
  getAvatarProfiles,
  getNotifications,
  relativeTime,
  resolveNotificationLink,
  type NotificationRow,
  type ProfileOption,
} from '../lib/notifications';
import { ComplianceHomeCard } from './cars/ComplianceAlert';
import { Dashboard } from './home/Dashboard';

const CARD = 'rounded-2xl border border-subtle bg-surface';
const LATEST_NOTIFICATIONS = 5;

const SectionHeader: React.FC<{ title: string; to?: string; action?: string }> = ({ title, to, action }) => (
  <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-subtle px-5">
    <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
    {to && <Link to={to} className="text-[12.5px] font-medium text-brand-strong hover:underline">{action}</Link>}
  </div>
);

const EmptyRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-5 py-10 text-center text-[13px] text-black/40">{children}</p>
);

const ScheduleRow: React.FC<{ item: ScheduleItem }> = ({ item }) => {
  const delivery = item.kind === 'delivery';
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-subtle px-5 py-3 last:border-b-0">
      <span className="w-12 shrink-0 font-mono text-[12.5px] tabular-nums text-black/55">{item.time ?? '—'}</span>
      <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-foreground">{item.plate}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-black/60">{item.customer}</span>
      <span
        className={cn(
          'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-medium',
          delivery ? 'bg-brand-strong/10 text-brand-strong' : 'bg-amber-500/10 text-amber-700',
        )}
      >
        {delivery ? 'Delivery' : 'Pickup'}
      </span>
      {item.done && <span className="shrink-0 text-[11.5px] font-medium text-emerald-700">Done</span>}
    </li>
  );
};

const SkeletonGrid: React.FC = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="h-[158px] animate-pulse rounded-2xl bg-black/[0.04]" />
    ))}
  </div>
);

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useShell();
  const { unread } = useNotificationCounts();
  const renderMessage = useMessageRenderer();
  const online = useOnlineUsers();

  const [data, setData] = useState<AdminHomeData | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [onlineProfiles, setOnlineProfiles] = useState<Record<string, ProfileOption>>({});
  const compliance = useComplianceCars();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([fetchAdminHome(), getNotifications(LATEST_NOTIFICATIONS, 0, false)])
      .then(([home, latest]) => {
        if (cancelled) return;
        setData(home);
        setNotifications(latest);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load today’s overview');
      });
    return () => { cancelled = true; };
  }, [reloadCount]);

  // One person can hold several tabs, and presence lists each of them.
  const onlineUsers = useMemo(
    () => Array.from(new Map(online.map((user) => [user.user_id, user])).values()),
    [online],
  );
  const onlineKey = onlineUsers.map((user) => user.user_id).sort().join(',');

  useEffect(() => {
    let cancelled = false;
    if (!onlineKey) return;
    getAvatarProfiles(onlineKey.split(',')).then((found) => {
      if (!cancelled) setOnlineProfiles(found);
    });
    return () => { cancelled = true; };
  }, [onlineKey]);

  const openNotification = (item: NotificationRow) => {
    if (!item.is_read) {
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
      // Opening it matters more than the read flag; a failure re-fetches the count.
      readNotification(item.id).catch(() => undefined);
    }
    const target = resolveNotificationLink(item.link);
    if (target) navigate(target);
  };

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <header className="mb-6">
        <p className="text-[12.5px] text-black/45">{istanbulDateLabel()}</p>
        <h1 className="mt-1 text-[22px] font-medium tracking-[-0.022em] text-foreground sm:text-[26px]">
          {greetingFor()}{firstName ? `, ${firstName}` : ''} 👋
        </h1>
        {data && (
          <p className="mt-1 text-[13.5px] text-black/50">
            {data.openTasks} open {data.openTasks === 1 ? 'task' : 'tasks'} · {unread} unread
          </p>
        )}
      </header>

      {compliance && compliance.length > 0 && <ComplianceHomeCard cars={compliance} />}

      <Dashboard compliant={compliance !== null && compliance.length === 0} />

      {error ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13.5px] text-red-700">
          <span className="min-w-0 flex-1">Couldn't load today's schedule: {error}</span>
          <button
            type="button"
            onClick={() => setReloadCount((n) => n + 1)}
            className="min-h-[44px] rounded-lg border border-subtle bg-surface px-4 font-medium text-foreground"
          >
            Try again
          </button>
        </div>
      ) : !data ? (
        <SkeletonGrid />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className={CARD}>
              <SectionHeader title="Today's schedule" to="/dashboard/operations" action="Operations" />
              {data.schedule.length === 0 ? (
                <EmptyRow>No deliveries or pickups today</EmptyRow>
              ) : (
                <ul>{data.schedule.map((item) => <ScheduleRow key={item.id} item={item} />)}</ul>
              )}
            </section>

            <div className="flex min-w-0 flex-col gap-4">
              <section className={CARD}>
                <SectionHeader title="Latest notifications" to="/dashboard/notifications" action="View all" />
                {notifications.length === 0 ? (
                  <EmptyRow>You’re all caught up</EmptyRow>
                ) : (
                  <ul>
                    {notifications.map((item) => (
                      <li key={item.id} className="border-b border-subtle last:border-b-0">
                        <button
                          type="button"
                          onClick={() => openNotification(item)}
                          className="flex min-h-[44px] w-full items-start gap-2.5 px-5 py-3 text-left transition-colors hover:bg-black/[0.02]"
                        >
                          <span
                            aria-hidden="true"
                            className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', item.is_read ? 'bg-transparent' : 'bg-brand-strong')}
                          />
                          <span className="min-w-0 flex-1">
                            <span dir="auto" className="block truncate text-[13px] text-foreground">
                              {renderMessage(item.i18n_key, item.vars, item.title)}
                            </span>
                            <span className="mt-0.5 block text-[11.5px] text-black/40">{relativeTime(item.created_at)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={CARD}>
                <SectionHeader title="Staff online now" to="/dashboard/online-users" action="View all" />
                {onlineUsers.length === 0 ? (
                  <EmptyRow>Nobody is online</EmptyRow>
                ) : (
                  <ul className="flex flex-col gap-2 p-4">
                    {onlineUsers.map((user) => (
                      <li key={user.user_id} className="flex min-w-0 items-center gap-2.5">
                        <StaffAvatar profile={onlineProfiles[user.user_id]} alt={user.full_name} size={32} />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{user.full_name || user.email}</span>
                        <span className="shrink-0 text-[11.5px] capitalize text-black/40">{user.app}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HomePage;
