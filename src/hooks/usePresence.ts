import { useEffect, useRef, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export const PRESENCE_CHANNEL = 'online-users';

export interface PresenceUser {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  app: 'admin' | 'team' | 'investor';
  joined_at: string;
  presence_ref?: string;
}

/*
 * `supabase.channel()` hands back the existing channel for a topic, so a second
 * subscriber would share this one and tear it down on unmount. The Layout owns
 * the channel; everything else reads who is online from this store.
 */
let onlineUsers: PresenceUser[] = [];
const listeners = new Set<() => void>();

function publishOnline(next: PresenceUser[]) {
  onlineUsers = next;
  listeners.forEach((listener) => listener());
}

function subscribeOnline(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOnlineUsers(): PresenceUser[] {
  return useSyncExternalStore(subscribeOnline, () => onlineUsers);
}

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
        return;
      }
      userIdRef.current = user.id;

      // ── 2. Fetch profile so we can include name/role in the payload ─────────
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email, role')
        .eq('id', user.id)
        .single();

      if (!profile || cancelled) return;

      // ── 3. Create the presence channel ──────────────────────────────────────
      const channel = supabase.channel(PRESENCE_CHANNEL, {
        config: { presence: { key: user.id } },
      });
      channelRef.current = channel;

      const readState = () => {
        publishOnline(Object.values(channel.presenceState<PresenceUser>()).flat());
      };
      channel
        .on('presence', { event: 'sync' }, readState)
        .on('presence', { event: 'join' }, readState)
        .on('presence', { event: 'leave' }, readState);

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

        if (status === 'SUBSCRIBED') {
          const trackPayload = { ...payload, joined_at: new Date().toISOString() };

          await channel.track(trackPayload);

          await updateLastSeen(user.id);
        }
      });

      // ── 5. Heartbeat: update last_seen_at every 60 s ─────────────────────────
      heartbeatRef.current = setInterval(() => {
        if (userIdRef.current) {
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
        });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
