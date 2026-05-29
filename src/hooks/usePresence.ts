import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export const PRESENCE_CHANNEL = 'online-users';

export function usePresence() {
  const channelRef   = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userIdRef    = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const updateLastSeen = (uid: string) =>
      supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', uid);

    (async () => {
      // ── 1. Get the authenticated user ──────────────────────────────────────
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) {
        console.log('[usePresence] no user or cancelled early');
        return;
      }
      userIdRef.current = user.id;
      console.log('[usePresence] user loaded:', user.id);

      // ── 2. Fetch profile so we can include name/role in the payload ─────────
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('full_name, email, role')
        .eq('id', user.id)
        .single();

      if (profileErr) console.warn('[usePresence] profile fetch error:', profileErr.message);
      if (!profile || cancelled) {
        console.log('[usePresence] no profile or cancelled after profile fetch');
        return;
      }
      console.log('[usePresence] profile loaded:', profile);

      // ── 3. Create the presence channel ──────────────────────────────────────
      const channel = supabase.channel(PRESENCE_CHANNEL, {
        config: { presence: { key: user.id } },
      });
      channelRef.current = channel;

      const payload = {
        user_id:   user.id,
        full_name: profile.full_name ?? '',
        email:     profile.email     ?? user.email ?? '',
        role:      profile.role      ?? '',
        app:       'admin' as const,
        joined_at: new Date().toISOString(),
      };

      // ── 4. Subscribe — call track() ONLY after SUBSCRIBED ───────────────────
      channel.subscribe(async (status) => {
        console.log('[usePresence] channel status:', status);

        if (status === 'SUBSCRIBED') {
          const trackPayload = { ...payload, joined_at: new Date().toISOString() };
          console.log('[usePresence] tracking payload:', trackPayload);

          const trackResult = await channel.track(trackPayload);
          console.log('[usePresence] track result:', trackResult);

          await updateLastSeen(user.id);
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[usePresence] channel error/timeout — status:', status);
        }
      });

      // ── 5. Heartbeat: update last_seen_at every 60 s ─────────────────────────
      heartbeatRef.current = setInterval(() => {
        if (userIdRef.current) {
          console.log('[usePresence] heartbeat last_seen_at');
          updateLastSeen(userIdRef.current);
        }
      }, 60_000);
    })();

    // Best-effort last_seen_at on tab close
    const onUnload = () => {
      if (userIdRef.current) updateLastSeen(userIdRef.current);
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      cancelled = true;
      console.log('[usePresence] cleanup — untracking and removing channel');
      window.removeEventListener('beforeunload', onUnload);

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (userIdRef.current) updateLastSeen(userIdRef.current);
      if (channelRef.current) {
        channelRef.current.untrack().then(() => {
          supabase.removeChannel(channelRef.current!);
          channelRef.current = null;
          console.log('[usePresence] channel removed');
        });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
