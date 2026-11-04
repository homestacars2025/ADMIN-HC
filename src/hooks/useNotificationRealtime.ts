import { useEffect, useRef } from 'react';
import { refreshSoon, setCountsLive, useNotificationCounts } from './useNotificationCounts';
import { mayBeForMe, notificationActivity, notificationArrived, type RecipientRow } from '../lib/notificationEvents';
import { getNotifications } from '../lib/notifications';
import { playNotificationSound } from '../lib/notificationSound';
import { supabase } from '../lib/supabase';
import { loadUserSettings } from '../lib/userSettings';

const RECENT_NOTIFICATIONS = 5;
const SEEN_LIMIT = 200;

export function useNotificationRealtime(profileId: string | undefined, role: string | null | undefined) {
  const { refreshNow } = useNotificationCounts();
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!profileId) return undefined;

    const onInsert = async (row: RecipientRow) => {
      notificationActivity.emit();
      if (!mayBeForMe(row, profileId, role ?? null)) return;

      // A role notification writes one row per target, so each is handled once.
      if (seen.current.has(row.notification_id)) return;
      seen.current.add(row.notification_id);
      if (seen.current.size > SEEN_LIMIT) seen.current.clear();

      refreshNow();
      try {
        const recent = await getNotifications(RECENT_NOTIFICATIONS, 0, false);
        const notification = recent.find((item) => item.id === row.notification_id);
        if (!notification) return;
        notificationArrived.emit(notification);
        if (loadUserSettings(profileId).notificationSound) playNotificationSound();
      } catch {
        // The badge already updated; the bell will load it when it's opened.
      }
    };

    const channel = supabase
      .channel(`notification-recipients-${profileId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_recipients' },
        (payload) => { onInsert(payload.new as RecipientRow); },
      )
      .subscribe((status) => {
        setCountsLive(status === 'SUBSCRIBED');
      });

    // A new notification, or a read from another tab or device, moves the count.
    // Kept off the channel above, so a table missing from the realtime publication
    // can't take the badge's live updates down with it.
    const counts = supabase
      .channel(`notification-counts-${profileId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications_v2' }, refreshSoon)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_reads', filter: `profile_id=eq.${profileId}` },
        refreshSoon,
      )
      .subscribe();

    return () => {
      setCountsLive(false);
      supabase.removeChannel(channel);
      supabase.removeChannel(counts);
    };
  }, [profileId, role, refreshNow]);
}
