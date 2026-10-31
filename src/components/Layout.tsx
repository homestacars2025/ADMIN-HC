import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { TopBar } from './shell/TopBar';
import type { ShellContext } from './shell/shellContext';
import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useCurrency } from '../lib/CurrencyContext';
import { loadUserSettings } from '../lib/userSettings';
import { useInactivityTimeout } from '../hooks/useInactivityTimeout';
import { usePresence } from '../hooks/usePresence';
import { Button } from './media/MediaUI';

// ─── Inactivity Warning Modal ─────────────────────────────────────────────────

const InactivityWarning: React.FC<{ onStay: () => void }> = ({ onStay }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,17,23,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, animation: 'iaFadeIn 200ms ease',
    }}>
      <div style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 380,
        padding: '28px 28px 24px', textAlign: 'center',
        boxShadow: '0 24px 80px rgba(0,0,0,0.20)',
        animation: 'iaSlideUp 200ms ease',
      }}>
        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'rgba(251,191,36,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="#f59e0b" strokeWidth="1.8"/>
            <path d="M12 8v4.5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="15.5" r="0.75" fill="#f59e0b"/>
          </svg>
        </div>

        <div style={{ fontSize: 16, fontWeight: 600, color: '#0f1117', marginBottom: 8, letterSpacing: '-0.3px' }}>
          Still there?
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
          You will be logged out in <strong style={{ color: '#0f1117' }}>30 seconds</strong> due to inactivity.
        </div>

        <Button
          onClick={onStay} style={{ width: '100%', height: 44, fontSize: 14, fontFamily: 'inherit' }}
        >
          Stay logged in
        </Button>
      </div>

      <style>{`
        @keyframes iaFadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes iaSlideUp  { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>,
    document.body,
  );

// ─── Layout ───────────────────────────────────────────────────────────────────

const Layout: React.FC = () => {
  const { showWarning, stayLoggedIn } = useInactivityTimeout();
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

      {showWarning && <InactivityWarning onStay={stayLoggedIn} />}
    </div>
  );
};

export default Layout;
