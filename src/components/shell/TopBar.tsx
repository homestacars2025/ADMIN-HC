import React, { useEffect, useRef, useState } from 'react';
import { useNotificationCounts } from '../../hooks/useNotificationCounts';
import { useNotificationRealtime } from '../../hooks/useNotificationRealtime';
import type { CurrentProfile } from '../../hooks/useCurrentProfile';
import { playNotificationSound } from '../../lib/notificationSound';
import { loadUserSettings } from '../../lib/userSettings';
import { Search } from '../media/MediaIcons';
import NotificationBell from '../NotificationBell';
import { CommandPalette } from './CommandPalette';
import { CurrencySwitcher } from './CurrencySwitcher';
import { LiveToasts } from './LiveToasts';
import { UserMenu } from './UserMenu';

const ICON_BUTTON =
  'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-black/55 transition-colors ' +
  'hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/40';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

interface TopBarProps {
  profile: CurrentProfile | null;
  isMobile: boolean;
  collapsed: boolean;
  bellRequest: number;
  onToggleSidebar: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ profile, isMobile, collapsed, bellRequest, onToggleSidebar }) => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { unread, live } = useNotificationCounts();
  const lastUnread = useRef<number | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const userId = profile?.id;
  useNotificationRealtime(userId, profile?.role);

  // Realtime chimes for itself. This covers the polling fallback, and only a rise
  // from a known count chimes, so loading the page stays silent.
  useEffect(() => {
    const previous = lastUnread.current;
    lastUnread.current = unread;
    if (!live && previous !== null && unread > previous && userId && loadUserSettings(userId).notificationSound) {
      playNotificationSound();
    }
  }, [unread, userId, live]);

  const toggleLabel = isMobile ? 'Open menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <header
      className="flex shrink-0 items-center gap-2 border-b border-subtle bg-surface px-2 sm:px-4"
      style={{ height: 'var(--topbar-h)' }}
    >
      <button type="button" onClick={onToggleSidebar} aria-label={toggleLabel} title={toggleLabel} className={ICON_BUTTON}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {isMobile ? (
            <path d="M4 7h16M4 12h16M4 17h16" />
          ) : (
            <>
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M9 4v16" />
            </>
          )}
        </svg>
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label="Search"
        className="hidden h-10 w-[260px] items-center gap-2 rounded-xl border border-subtle px-3 text-[13px] text-black/45 transition-colors hover:bg-black/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/40 md:flex"
      >
        <Search size={15} className="shrink-0" />
        <span className="flex-1 truncate text-left">Search</span>
        <kbd className="rounded-md border border-subtle px-1.5 py-0.5 text-[11px]">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search" className={`${ICON_BUTTON} md:hidden`}>
        <Search size={19} />
      </button>

      <CurrencySwitcher userId={userId} />
      <NotificationBell openRequest={bellRequest} />
      <UserMenu profile={profile} />

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      <LiveToasts />
    </header>
  );
};
