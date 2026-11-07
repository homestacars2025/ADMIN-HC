import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import { checkAdminAccess } from '../lib/adminAccess';
import { endSession } from '../lib/session';
import { supabase } from '../lib/supabase';

type AuthStatus = 'loading' | 'allowed' | 'denied' | 'disabled' | 'unauthenticated' | 'unreachable';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const RETRY_MS = 10_000;

const Spinner: React.FC = () => (
  <div role="status" aria-label="Loading" style={{
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    background: 'var(--surface)',
  }}>
    <BrandLogo variant="icon" size={72} />
    <div style={{
      width: 32,
      height: 32,
      border: '3px solid var(--border)',
      borderTopColor: 'var(--brand)',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

/** Opening the app with no connection: nothing to keep yet, so wait for one instead of going to the login. */
const Unreachable: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center" style={{ background: 'var(--surface)' }}>
    <p className="text-[15px] font-medium text-foreground">Reconnecting…</p>
    <p className="max-w-[320px] text-[13px] text-black/50">We can't reach the server right now. You're still signed in, and this page tries again on its own.</p>
    <button type="button" onClick={onRetry} className="mt-1 min-h-[44px] rounded-lg px-4 text-[13.5px] font-medium text-primary hover:bg-primary/10">Try again</button>
  </div>
);

/**
 * Re-checks the admin role on every route change, straight from the database, so
 * a downgraded or disabled account loses access on the next navigation. A check
 * that can't get through changes nothing: the page stays, and the session keeper
 * deals with the connection and with an ended session.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const statusRef = useRef(status);
  statusRef.current = status;
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    // Already in: a failed check keeps the page. Not in yet: wait for the connection.
    const unreachable = () => { if (!cancelled && statusRef.current !== 'allowed') setStatus('unreachable'); };

    (async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) { unreachable(); return; }
      if (!session) {
        // Signed in until now: the keeper opens the login over the page instead.
        if (statusRef.current !== 'allowed') setStatus('unauthenticated');
        return;
      }

      const access = await checkAdminAccess(session.user.id);
      if (cancelled) return;
      if (access === 'unreachable') { unreachable(); return; }
      if (access === 'allowed') { setStatus('allowed'); return; }

      await endSession();
      try { localStorage.clear(); sessionStorage.clear(); } catch {
        // Blocked storage has nothing to clear.
      }
      if (!cancelled) setStatus(access === 'disabled' ? 'disabled' : 'denied');
    })();

    return () => { cancelled = true; };
  }, [location.pathname, attempt]);

  useEffect(() => {
    if (status !== 'unreachable') return;
    const timer = setInterval(() => setAttempt((value) => value + 1), RETRY_MS);
    const retry = () => setAttempt((value) => value + 1);
    window.addEventListener('online', retry);
    return () => { clearInterval(timer); window.removeEventListener('online', retry); };
  }, [status]);

  if (status === 'loading') return <Spinner />;
  if (status === 'unreachable') return <Unreachable onRetry={() => setAttempt((value) => value + 1)} />;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  if (status === 'denied') return <Navigate to="/login?error=access_denied" replace />;
  if (status === 'disabled') return <Navigate to="/login?error=disabled" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
