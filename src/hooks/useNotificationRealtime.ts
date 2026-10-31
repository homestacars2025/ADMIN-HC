import { useEffect, useRef } from 'react';
import { setCountsLive, useNotificationCounts } from './useNotificationCounts';
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

    return () => {
      setCountsLive(false);
      supabase.removeChannel(channel);
    };
  }, [profileId, role, refreshNow]);
}
