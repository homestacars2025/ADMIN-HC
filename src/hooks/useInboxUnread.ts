import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Several changes in a row (mark read, a reply, the webhook) settle into one count. */
const SETTLE_MS = 350;

/**
 * How many conversations have unread messages: the sidebar's Inbox badge. The same
 * rule as the Inbox page's "N unread" (`unread_count > 0`, not deleted), read with a
 * head-only count and read again whenever a conversation changes over realtime.
 * Read-only: it never touches messages, sending or the WhatsApp link.
 */
export function useInboxUnread(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      const { count: unread, error } = await supabase
        .from('chat_conversations')
        .select('id', { count: 'exact', head: true })
        .gt('unread_count', 0)
        .is('deleted_at', null);
      // A failed read keeps the last number: a badge is not worth an error.
      if (active && !error) setCount(unread ?? 0);
    };
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, SETTLE_MS);
    };

    void load();
    const channel = supabase
      .channel('sidebar-inbox-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, soon)
      .subscribe();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
