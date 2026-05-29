import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export const PRESENCE_CHANNEL = 'online-users';

export function usePresence() {
  const channelRef  = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userIdRef   = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const updateLastSeen = (userId: string) =>
      supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', userId);

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;

      userIdRef.current = user.id;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email, role')
        .eq('id', user.id)
        .single();

      if (!profile || !active) return;

      const payload = {
        user_id:    user.id,
        full_name:  profile.full_name  ?? '',
        email:      profile.email      ?? user.email ?? '',
        role:       profile.role       ?? '',
        app:        'admin' as const,
        joined_at:  new Date().toISOString(),
      };

      const channel = supabase.channel(PRESENCE_CHANNEL, {
        config: { presence: { key: user.id } },
      });
      channelRef.current = channel;

      channel.subscribe(async (status) => {
        // Re-track on every SUBSCRIBED event — handles initial connect + reconnects
        if (status === 'SUBSCRIBED') {
          await channel.track({ ...payload, joined_at: new Date().toISOString() });
          await updateLastSeen(user.id);
        }
      });

      // Heartbeat: keep last_seen_at fresh every 60 s
      heartbeatRef.current = setInterval(() => {
        if (userIdRef.current) updateLastSeen(userIdRef.current);
      }, 60_000);
    };

    setup();

    // Final flush on tab close (best-effort; async doesn't guarantee completion)
    const onUnload = () => {
      if (userIdRef.current) updateLastSeen(userIdRef.current);
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      active = false;
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
