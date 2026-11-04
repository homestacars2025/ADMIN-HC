import { act, renderHook, waitFor } from '@testing-library/react';
import { getOpenTasksCount, getUnreadCount, markAllRead, markRead } from '../lib/notifications';
import { readAllNotifications, readNotification, refreshSoon, useNotificationCounts } from './useNotificationCounts';

jest.mock('../lib/notifications', () => ({
  getUnreadCount: jest.fn(),
  getOpenTasksCount: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
}));

const unreadCount = getUnreadCount as jest.Mock;
const tasksCount = getOpenTasksCount as jest.Mock;
const markOne = markRead as jest.Mock;
const markAll = markAllRead as jest.Mock;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function mountWith(unread: number) {
  unreadCount.mockResolvedValue(unread);
  const hook = renderHook(() => useNotificationCounts());
  await waitFor(() => expect(hook.result.current.unread).toBe(unread));
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  tasksCount.mockResolvedValue(0);
});

describe('notification badge', () => {
  it('reads the count from my_unread_notifications_count', async () => {
    const hook = await mountWith(7);
    expect(unreadCount).toHaveBeenCalled();
    hook.unmount();
  });

  it('drops by one at once on a single read, then re-fetches', async () => {
    const hook = await mountWith(5);
    const write = deferred<void>();
    markOne.mockReturnValue(write.promise);
    unreadCount.mockResolvedValue(4);

    let done!: Promise<void>;
    act(() => { done = readNotification('n1'); });
    expect(hook.result.current.unread).toBe(4);
    expect(markOne).toHaveBeenCalledWith('n1');

    const calls = unreadCount.mock.calls.length;
    await act(async () => { write.resolve(); await done; });
    await waitFor(() => expect(unreadCount.mock.calls.length).toBe(calls + 1));
    hook.unmount();
  });

  it('goes to zero at once on mark all, before the write lands', async () => {
    const hook = await mountWith(12);
    const write = deferred<void>();
    markAll.mockReturnValue(write.promise);
    unreadCount.mockResolvedValue(0);

    let done!: Promise<void>;
    act(() => { done = readAllNotifications(); });
    expect(hook.result.current.unread).toBe(0);

    await act(async () => { write.resolve(); await done; });
    await waitFor(() => expect(hook.result.current.unread).toBe(0));
    hook.unmount();
  });

  it('ignores a count fetched before the read landed', async () => {
    const hook = await mountWith(3);
    const staleCount = deferred<number>();
    unreadCount.mockReturnValueOnce(staleCount.promise);
    act(() => { hook.result.current.refreshNow(); });

    markAll.mockResolvedValue(undefined);
    unreadCount.mockResolvedValue(0);
    await act(async () => { await readAllNotifications(); });

    // The poll that left before Mark all now answers with the old number.
    await act(async () => { staleCount.resolve(3); });
    await waitFor(() => expect(hook.result.current.unread).toBe(0));
    hook.unmount();
  });

  it('puts the real count back when the write fails', async () => {
    const hook = await mountWith(6);
    markAll.mockRejectedValue(new Error('offline'));

    let failure: unknown;
    await act(async () => { await readAllNotifications().catch((e) => { failure = e; }); });
    expect(failure).toBeInstanceOf(Error);
    await waitFor(() => expect(hook.result.current.unread).toBe(6));
    hook.unmount();
  });

  it('never goes below zero', async () => {
    const hook = await mountWith(0);
    markOne.mockResolvedValue(undefined);
    act(() => { readNotification('n2'); });
    expect(hook.result.current.unread).toBe(0);
    hook.unmount();
  });

  it('re-fetches once for a burst of realtime events', async () => {
    jest.useFakeTimers();
    try {
      const hook = renderHook(() => useNotificationCounts());
      await act(async () => { await Promise.resolve(); });
      const calls = unreadCount.mock.calls.length;
      act(() => { for (let i = 0; i < 40; i += 1) refreshSoon(); });
      expect(unreadCount.mock.calls.length).toBe(calls);
      await act(async () => { jest.advanceTimersByTime(300); });
      expect(unreadCount.mock.calls.length).toBe(calls + 1);
      hook.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
