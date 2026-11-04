import { supabase } from './supabase';
import { getUnreadCount, markAllRead, markRead } from './notifications';

jest.mock('./supabase', () => ({ supabase: { rpc: jest.fn() } }));

const rpc = supabase.rpc as jest.Mock;

beforeEach(() => rpc.mockReset());

describe('notification RPCs', () => {
  it('counts unread with my_unread_notifications_count', async () => {
    rpc.mockResolvedValue({ data: 4, error: null });
    await expect(getUnreadCount()).resolves.toBe(4);
    expect(rpc).toHaveBeenCalledWith('my_unread_notifications_count');
  });

  it('treats no count as zero', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(getUnreadCount()).resolves.toBe(0);
  });

  it('marks one and all through their RPCs', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await markRead('abc');
    await markAllRead();
    expect(rpc).toHaveBeenCalledWith('mark_notification_read', { p_notification_id: 'abc' });
    expect(rpc).toHaveBeenCalledWith('mark_all_notifications_read');
  });
});
