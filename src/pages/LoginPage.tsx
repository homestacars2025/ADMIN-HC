import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ACCESS_MESSAGES, checkAdminAccess, signInAsAdmin } from '../lib/adminAccess';
import { resetComplianceAlert } from '../lib/complianceStore';
import { endSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import BrandLogo from '../components/BrandLogo';
import { Button } from '../components/media/MediaUI';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  // Show access-denied message when redirected from ProtectedRoute
  useEffect(() => {
    const reason = searchParams.get('error');
    if (reason === 'access_denied') setError(ACCESS_MESSAGES.not_admin);
    if (reason === 'disabled') setError(ACCESS_MESSAGES.disabled);
  }, [searchParams]);

  // If already signed in, verify admin role before redirecting
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;

      const access = await checkAdminAccess(session.user.id);
      if (cancelled) return;

      if (access === 'allowed') navigate('/dashboard', { replace: true });
      // A lookup that didn't get through leaves the session alone.
      else if (access !== 'unreachable') await endSession();
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const failure = await signInAsAdmin(email, password);
    if (failure) {
      setError(failure);
      setLoading(false);
      return;
    }

    resetComplianceAlert();
    navigate('/dashboard', { replace: true });
  };

  const inputStyle = (field: 'email' | 'password'): React.CSSProperties => ({
    width: '100%',
    height: 48,
    padding: '0 14px',
    fontSize: 15,
    color: 'var(--text-primary)',
    background: '#fafafa',
    border: `1.5px solid ${focusedField === field ? 'var(--brand)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
    transition: 'border-color var(--transition), box-shadow var(--transition)',
    boxShadow: focusedField === field ? '0 0 0 3px rgba(75, 166, 234, 0.12)' : 'none',
    fontFamily: 'inherit',
  });

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--surface)',
    }}>
      {/* Left panel */}
      <div style={{
        flex: 1,
        display: 'none',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 56px',
        background: 'linear-gradient(145deg, #0f1117 0%, #1a2236 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
      className="login-panel"
      >
        {/* Background accent */}
        <div style={{
          position: 'absolute',
          top: -120,
          right: -120,
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(75,166,234,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          bottom: -80,
          left: -80,
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(75,166,234,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <BrandLogo variant="lockup" theme="dark" size={40} />

        {/* Middle content */}
        <div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(75,166,234,0.12)',
            border: '1px solid rgba(75,166,234,0.2)',
            borderRadius: 20,
            padding: '6px 14px',
            marginBottom: 28,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand)' }} />
            <span style={{ color: 'var(--brand)', fontSize: 13, fontWeight: 500 }}>Istanbul, Turkey</span>
          </div>
          <h2 style={{
            color: 'white',
            fontSize: 36,
            fontWeight: 500,
            lineHeight: 1.2,
            letterSpacing: '-0.8px',
            marginBottom: 16,
          }}>
            Manage your fleet<br />with precision.
          </h2>
          <p style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: 16,
            lineHeight: 1.6,
            maxWidth: 340,
          }}>
            Full operational control across Şişli and Kayaşehir branches — reservations, vehicles, and investor reports in one place.
          </p>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 32 }}>
          {[
            { label: 'Branches', value: '2' },
            { label: 'Founded', value: '2025' },
            { label: 'Fleet', value: 'Premium' },
          ].map(stat => (
            <div key={stat.label}>
              <div style={{ color: 'white', fontWeight: 600, fontSize: 20, letterSpacing: '-0.3px' }}>
                {stat.value}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        width: '100%',
        maxWidth: 480,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '48px 40px',
        background: 'var(--surface)',
        boxShadow: '-1px 0 0 var(--border)',
      }}>
        {/* Logo — centered above form, hidden on desktop (left panel handles it) */}
        <div
          style={{ display: 'flex', justifyContent: 'center', marginBottom: 48 }}
          className="login-mobile-logo"
        >
          <BrandLogo variant="lockup" orientation="column" theme="light" size={48} />
        </div>

        <div style={{ marginBottom: 36 }}>
          <h1 style={{
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: '-0.5px',
            marginBottom: 8,
            color: 'var(--text-primary)',
          }}>
            Admin sign in
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
            Access your HomestaCars dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-primary)',
                marginBottom: 6,
              }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                placeholder="admin@homestacars.com"
                style={inputStyle('email')}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-primary)',
                marginBottom: 6,
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                placeholder="••••••••"
                style={inputStyle('password')}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{
                background: 'var(--error-bg)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
                  <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5"/>
                  <path d="M8 5v3.5M8 11h.01" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: 14, color: 'var(--error)', lineHeight: 1.4 }}>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !email || !password}
              style={{ height: 48, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', marginTop: 4 }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 16,
                    height: 16,
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </div>
        </form>

        <p style={{
          color: 'var(--text-muted)',
          fontSize: 13,
          textAlign: 'center',
          marginTop: 36,
        }}>
          HomestaCars Admin · Istanbul
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 900px) {
          .login-panel { display: flex !important; }
          .login-mobile-logo { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
