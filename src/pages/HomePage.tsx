import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useShell } from '../components/shell/shellContext';
import StaffAvatar from '../components/shared/StaffAvatar';
import { useOnlineUsers } from '../hooks/usePresence';
import { useNotificationCounts } from '../hooks/useNotificationCounts';
import { useComplianceCars } from '../lib/complianceStore';
import { useCurrency } from '../lib/CurrencyContext';
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
  markRead,
  relativeTime,
  resolveNotificationLink,
  type NotificationRow,
  type ProfileOption,
} from '../lib/notifications';
import { ComplianceHomeCard } from './cars/ComplianceAlert';

const CARD = 'rounded-2xl border border-subtle bg-surface';
const LATEST_NOTIFICATIONS = 5;

type IconName = 'out' | 'in' | 'key' | 'car' | 'alert' | 'shield' | 'wallet' | 'bell';

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  out: <path d="M5 12h14M13 6l6 6-6 6" />,
  in: <path d="M19 12H5M11 6l-6 6 6 6" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l3 3" /></>,
  car: <><path d="M5 17H3v-4l2-6h14l2 6v4h-2" /><path d="M3 13h18" /><circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" /></>,
  alert: <><path d="M12 3l9 16H3l9-16z" /><path d="M12 10v4M12 17v.5" /></>,
  shield: <><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h2M3 10h18" /></>,
  bell: <><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>,
};

const Icon: React.FC<{ name: IconName; size?: number }> = ({ name, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICON_PATHS[name]}
  </svg>
);

const ArrowIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);

interface StatCard {
  title: string;
  value: string;
  subline: string;
  color: string;
  icon: IconName;
  to?: string;
  onOpen?: () => void;
  money?: boolean;
}

const ARROW_CLASS =
  'grid h-11 w-11 place-items-center rounded-full border border-subtle text-black/55 transition-colors ' +
  'hover:border-brand-strong hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/40 md:h-9 md:w-9';

const StatTile: React.FC<{ card: StatCard }> = ({ card }) => (
  <article className={cn(CARD, 'relative flex min-w-0 flex-col p-5')}>
    <div className="flex items-center gap-2 pe-12">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: card.color }} />
      <h2 className="truncate text-[13px] font-medium text-black/60">{card.title}</h2>
    </div>
    <span
      aria-hidden="true"
      className="absolute end-4 top-4 grid h-10 w-10 place-items-center rounded-full"
      style={{ background: `${card.color}14`, color: card.color }}
    >
      <Icon name={card.icon} />
    </span>
    <div className={cn('mt-4 truncate text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground', card.money && 'font-mono tabular-nums')}>
      {card.value}
    </div>
    <div className="mt-3 flex items-center justify-between gap-2">
      <p className="min-w-0 truncate text-[12.5px] text-black/45">{card.subline}</p>
      {card.to ? (
        <Link to={card.to} aria-label={`Open ${card.title}`} className={ARROW_CLASS}><ArrowIcon /></Link>
      ) : (
        <button type="button" onClick={card.onOpen} aria-label={`Open ${card.title}`} className={ARROW_CLASS}><ArrowIcon /></button>
      )}
    </div>
  </article>
);

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
  const { profile, openNotifications } = useShell();
  const { unread, refreshNow } = useNotificationCounts();
  const { fmt } = useCurrency();
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

  const openNotification = async (item: NotificationRow) => {
    if (!item.is_read) {
      try {
        await markRead(item.id);
        setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
        refreshNow();
      } catch {
        // Opening it matters more than the read flag; the next poll reconciles.
      }
    }
    const target = resolveNotificationLink(item.link);
    if (target) navigate(target);
  };

  const cards = useMemo<StatCard[]>(() => {
    if (!data) return [];
    return [
      {
        title: "Today's deliveries", value: String(data.deliveries), subline: `${data.deliveriesDone} done`,
        color: '#3A74C2', icon: 'out', to: '/dashboard/operations',
      },
      {
        title: "Today's pickups", value: String(data.pickups), subline: `${data.pickupsDone} done`,
        color: '#d97706', icon: 'in', to: '/dashboard/operations',
      },
      {
        title: 'Active rentals now', value: String(data.activeRentals), subline: 'Cars out with customers',
        color: '#16a34a', icon: 'key', to: '/dashboard/bookings/active',
      },
      {
        title: 'Cars available today', value: String(data.carsAvailable), subline: `of ${data.carsTotal} cars`,
        color: '#0891b2', icon: 'car', to: '/dashboard/cars',
      },
      {
        title: 'Open car issues', value: String(data.openIssues), subline: data.openIssues ? 'Need attention' : 'All clear',
        color: '#dc2626', icon: 'alert', to: '/dashboard/car-issues',
      },
      {
        title: 'Pending KABIS', value: String(data.pendingKabis), subline: data.pendingKabis ? 'Waiting for entry' : 'All entered',
        color: '#7c3aed', icon: 'shield', to: '/dashboard/kabis',
      },
      {
        title: 'Staff custody total',
        value: `${data.staffCustody < 0 ? '-' : ''}${fmt(Math.abs(data.staffCustody))}`,
        subline: `${data.staffWithCustody} staff holding custody`,
        color: '#0f766e', icon: 'wallet', to: '/dashboard/accounting?tab=expenses', money: true,
      },
      {
        title: 'Unread notifications', value: String(unread), subline: unread ? 'Open the bell to read' : 'You’re all caught up',
        color: '#db2777', icon: 'bell', onOpen: openNotifications,
      },
    ];
  }, [data, unread, fmt, openNotifications]);

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

      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13px] text-red-700">
          <span className="min-w-0 flex-1">Couldn't load today's overview: {error}</span>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => <StatTile key={card.title} card={card} />)}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
