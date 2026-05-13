import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type AuthStatus = 'loading' | 'allowed' | 'denied' | 'unauthenticated';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const Spinner: React.FC = () => (
  <div style={{
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--surface-secondary)',
  }}>
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

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const location = useLocation();

  // Re-check admin role on every route change. Never reads from localStorage —
  // always fetches fresh from Supabase so a downgraded session loses access
  // on the very next navigation.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session) {
        setStatus('unauthenticated');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (cancelled) return;

      if (profile?.role === 'admin') {
        setStatus('allowed');
      } else {
        console.warn(
          '[HomestaCars] Access denied for:', session.user.email,
          '— role:', profile?.role ?? 'missing'
        );
        await supabase.auth.signOut();
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
        setStatus('denied');
      }
    })();

    return () => { cancelled = true; };
  }, [location.pathname]);

  // Also catch session expiry / remote sign-out immediately
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setStatus('unauthenticated');
    });
    return () => subscription.unsubscribe();
  }, []);

  if (status === 'loading') return <Spinner />;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  if (status === 'denied') return <Navigate to="/login?error=access_denied" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
