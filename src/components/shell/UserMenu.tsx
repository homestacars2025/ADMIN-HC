import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { CurrentProfile } from '../../hooks/useCurrentProfile';
import StaffAvatar from '../shared/StaffAvatar';

const ITEM_CLASS =
  'flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-[13.5px] text-foreground ' +
  'transition-colors hover:bg-black/[0.04] focus-visible:bg-black/[0.04] focus-visible:outline-none';

const CHIP_CLASS = 'inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium';

export const UserMenu: React.FC<{ profile: CurrentProfile | null }> = ({ profile }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const name = profile?.full_name?.trim() || profile?.email || 'Account';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-11 w-11 place-items-center rounded-full transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/40"
      >
        <StaffAvatar profile={profile} alt={name} size={36} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-[calc(100%+8px)] z-[1100] w-[272px] max-w-[calc(100vw-24px)] rounded-xl border border-subtle bg-surface p-2 shadow-[0_12px_36px_rgba(0,0,0,0.12)]"
        >
          <div className="flex items-center gap-3 border-b border-subtle px-3 pb-3 pt-2">
            <StaffAvatar profile={profile} alt="" size={44} />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium text-foreground">{name}</div>
              <div className="truncate text-[12px] text-black/45">{profile?.email}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className={`${CHIP_CLASS} bg-black/[0.05] capitalize text-black/60`}>
                  {profile?.department_label ?? profile?.role}
                </span>
                {profile?.is_department_head && (
                  <span className={`${CHIP_CLASS} bg-brand-strong/10 text-brand-strong`}>Head</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col pt-1.5">
            <Link role="menuitem" to="/dashboard/profile" onClick={() => setOpen(false)} className={ITEM_CLASS}>
              My profile
            </Link>
            <Link role="menuitem" to="/dashboard/settings" onClick={() => setOpen(false)} className={ITEM_CLASS}>
              Settings
            </Link>
            <button type="button" role="menuitem" onClick={signOut} className={`${ITEM_CLASS} text-red-600`}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
