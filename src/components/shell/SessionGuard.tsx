import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { signInAsAdmin } from '../../lib/adminAccess';
import { endSession, ensureFreshSession, useSessionHealth } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { Button, Spinner } from '../media/MediaUI';

/**
 * What the admin sees of the session keeper: a small banner while a refresh is
 * retried, and the login over the page when the session really ended. Neither
 * moves away from the page, so whatever was being typed is still there after.
 */

const INPUT = 'mt-1.5 h-11 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] font-normal outline-none focus:border-[#6EA4E7] focus:ring-[3px] focus:ring-[#6EA4E7]/25';

const ReconnectingBanner: React.FC<{ gaveUp: boolean }> = ({ gaveUp }) => ReactDOM.createPortal(
  <div className="pointer-events-none fixed inset-x-0 top-3 z-[10005] flex justify-center px-4">
    <div role="status" aria-live="polite" className="media-scope pointer-events-auto flex min-h-[40px] items-center gap-2.5 rounded-full bg-[#1a2942] px-4 py-2 text-[13px] font-medium text-white shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)]">
      {gaveUp ? (
        <>
          <span>Can't reach the server. Your work is still here.</span>
          <button type="button" onClick={() => { void ensureFreshSession(); }} className="-my-1 min-h-[32px] rounded-full bg-white/15 px-3 text-[12.5px] hover:bg-white/25">Try again</button>
        </>
      ) : (
        <><Spinner size={13} /> Reconnecting…</>
      )}
    </div>
  </div>,
  document.body,
);

const SignInAgain: React.FC<{ email: string | null; userId: string | null }> = ({ email: lastEmail, userId }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState(lastEmail ?? '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const failure = await signInAsAdmin(email.trim(), password);
    if (failure) {
      setError(failure);
      setSaving(false);
      return;
    }
    // Someone else signing in here: the page belongs to the last account, so start it fresh.
    const { data } = await supabase.auth.getSession();
    if (userId && data.session?.user.id !== userId) window.location.reload();
  };

  const logOut = async () => {
    await endSession();
    navigate('/login', { replace: true });
  };

  return ReactDOM.createPortal(
    <div className="media-scope fixed inset-0 z-[10006] flex items-end justify-center p-3 sm:items-center sm:p-5">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Sign in again"
        onSubmit={submit}
        className="relative w-full max-w-[400px] rounded-2xl bg-white p-5 shadow-[0_24px_64px_-16px_rgb(0_0_0/0.3)] sm:p-6"
      >
        <p className="text-[16px] font-semibold tracking-[-0.014em] text-black/85">Sign in again</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-black/55">
          Your session ended. Sign in to carry on: this page stays as it is, and anything you were saving goes through after.
        </p>
        <label className="mt-4 block text-[13px] font-medium text-foreground">
          Email
          <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className={INPUT} />
        </label>
        <label className="mt-3 block text-[13px] font-medium text-foreground">
          Password
          <input type="password" autoComplete="current-password" required autoFocus value={password} onChange={(event) => setPassword(event.target.value)} className={INPUT} />
        </label>
        {error && <p role="alert" className="mt-3 text-[13px] text-[#B91C1C]">{error}</p>}
        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" onClick={logOut} disabled={saving} className="min-h-[44px] px-1 text-[13px] font-medium text-black/50 hover:text-black/75">Log out</button>
          <Button type="submit" size="lg" className="!h-11 px-5" disabled={saving}>
            {saving && <Spinner size={13} />} Sign in
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

export const SessionGuard: React.FC = () => {
  const { reconnecting, gaveUp, expired, email, userId } = useSessionHealth();
  if (expired) return <SignInAgain email={email} userId={userId} />;
  return reconnecting ? <ReconnectingBanner gaveUp={gaveUp} /> : null;
};
