import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { EnvelopeReceiptSheet } from './shell/EnvelopeReceiptSheet';
import { TopBar } from './shell/TopBar';
import type { ShellContext } from './shell/shellContext';
import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useCurrency } from '../lib/CurrencyContext';
import { loadUserSettings } from '../lib/userSettings';
import { usePresence } from '../hooks/usePresence';
import { ComplianceSignInAlert } from '../pages/cars/ComplianceAlert';
import { SessionGuard } from './shell/SessionGuard';

// ─── Layout ───────────────────────────────────────────────────────────────────

const Layout: React.FC = () => {
  usePresence(); // broadcast this admin's presence to the shared "online-users" channel

  const location = useLocation();
  const { setCurrency } = useCurrency();
  const { profile, reload } = useCurrentProfile();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; }
    catch { return false; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bellRequest, setBellRequest] = useState(0);

  useEffect(() => {
    try { localStorage.setItem('sidebar_collapsed', String(collapsed)); }
    catch {
      // Blocked storage: the sidebar simply won't be remembered.
    }
  }, [collapsed]);

  // A person's saved choices apply as soon as we know who they are.
  const userId = profile?.id;
  useEffect(() => {
    if (!userId) return;
    const settings = loadUserSettings(userId);
    if (settings.startCollapsed) setCollapsed(true);
    if (settings.currency) setCurrency(settings.currency);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const openNotifications = useCallback(() => setBellRequest((n) => n + 1), []);
  const shell = useMemo<ShellContext>(
    () => ({ profile, reloadProfile: reload, openNotifications }),
    [profile, reload, openNotifications],
  );

  return (
    <div
      className="flex h-screen supports-[height:100dvh]:h-[100dvh]"
      style={{ background: 'var(--surface)' }}
    >
      <Sidebar collapsed={collapsed && !isMobile} isMobile={isMobile} drawerOpen={drawerOpen} />

      {isMobile && drawerOpen && (
        <div
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15,17,23,0.35)' }}
        />
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar
          profile={profile}
          isMobile={isMobile}
          collapsed={collapsed}
          bellRequest={bellRequest}
          onToggleSidebar={() => (isMobile ? setDrawerOpen((open) => !open) : setCollapsed((c) => !c))}
        />
        <main style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <Outlet context={shell} />
        </main>
      </div>

      <ComplianceSignInAlert />
      <EnvelopeReceiptSheet />
      <SessionGuard />
    </div>
  );
};

export default Layout;
