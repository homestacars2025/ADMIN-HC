import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationCounts } from '../../hooks/useNotificationCounts';
import {
  cancelTask,
  completeTask,
  formatDateTime,
  getTasks,
  PRIORITY_STYLES,
  relativeTime,
  type TaskRow,
} from '../../lib/notifications';
import {
  BRAND, Button, CARD_STYLE, Chip, EmptyState, ErrorBanner, FAINT, Field, INK, LINE,
  Modal, MUTED, PAGE_STYLE, PageHeader, Tabs, textareaStyle, Toast,
} from './ui';

const PAGE_SIZE = 50;

type TabKey = 'active' | 'done';

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  claimed: { label: 'Claimed', color: BRAND, bg: 'rgba(75,166,234,0.10)' },
  done: { label: 'Done', color: '#059669', bg: 'rgba(5,150,105,0.10)' },
  cancelled: { label: 'Cancelled', color: '#6b7280', bg: '#f3f4f6' },
};

const AUTO_DIR: React.HTMLAttributes<HTMLElement> = { dir: 'auto' };

const TasksPage: React.FC = () => {
  const navigate = useNavigate();
  const { openTasks, refreshNow } = useNotificationCounts();

  const [tab, setTab] = useState<TabKey>('active');
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<TaskRow | null>(null);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(handle);
  }, [toast]);

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTasks(tab, PAGE_SIZE, 0);
      if (signal?.cancelled) return;
      setRows(data);
    } catch (e) {
      if (signal?.cancelled) return;
      setError(e instanceof Error ? e.message : 'Could not load tasks');
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => { signal.cancelled = true; };
  }, [load]);

  async function complete(task: TaskRow) {
    setBusyId(task.id);
    try {
      await completeTask(task.id, null);
      setRows((prev) => prev.filter((r) => r.id !== task.id));
      refreshNow();
      setToast({ message: 'Task completed', kind: 'success' });
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Could not complete the task', kind: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function confirmCancel() {
    if (!cancelling) return;
    if (!reason.trim()) {
      setToast({ message: 'Give a reason for cancelling', kind: 'error' });
      return;
    }

    const task = cancelling;
    setBusyId(task.id);
    try {
      await cancelTask(task.id, reason.trim());
      setRows((prev) => prev.filter((r) => r.id !== task.id));
      refreshNow();
      setToast({ message: 'Task cancelled', kind: 'success' });
      setCancelling(null);
      setReason('');
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Could not cancel the task', kind: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        eyebrow="Admin Tools"
        title="Tasks"
        subtitle="Work raised by reminder rules and by the team. As an admin you see every task, whoever it was raised for."
      />

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'active', label: 'Active', count: openTasks || undefined },
          { value: 'done', label: 'Completed' },
        ]}
      />

      {error && <ErrorBanner message={error} />}

      <div style={{ ...CARD_STYLE, overflow: 'hidden' }}>
        {loading && (
          <div style={{ padding: '48px 20px', textAlign: 'center', fontSize: 13, color: FAINT }}>
            Loading…
          </div>
        )}

        {!loading && rows.length === 0 && (
          <EmptyState
            title={tab === 'active' ? 'No open tasks' : 'Nothing completed yet'}
            description={
              tab === 'active'
                ? 'Reminder rules raise tasks automatically when they find something that needs doing.'
                : 'Completed tasks are kept here so you can look back at what was done.'
            }
          />
        )}

        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${LINE}`, background: '#fafbfc' }}>
                  {[
                    'Task',
                    'Priority',
                    'Status',
                    tab === 'active' ? 'Created' : 'Completed',
                    '',
                  ].map((h) => (
                    <th key={h} style={{
                      padding: '11px 16px', fontSize: 11, fontWeight: 700, color: FAINT,
                      letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((task) => {
                  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.normal;
                  const status = STATUS_STYLES[task.status] ?? STATUS_STYLES.open;
                  const busy = busyId === task.id;

                  return (
                    <tr key={task.id} style={{ borderBottom: '1px solid #f4f4f4', verticalAlign: 'top' }}>
                      <td style={{ padding: '14px 16px', maxWidth: 420 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, lineHeight: 1.45 }} {...AUTO_DIR}>
                          {task.title}
                        </div>
                        {task.description && (
                          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 1.6 }} {...AUTO_DIR}>
                            {task.description}
                          </div>
                        )}
                        {task.category && (
                          <div style={{ fontSize: 11, color: FAINT, marginTop: 5, fontFamily: 'ui-monospace, monospace' }}>
                            {task.category}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <Chip label={priority.label} color={priority.color} bg={priority.bg} />
                      </td>

                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <Chip label={status.label} color={status.color} bg={status.bg} />
                        {task.status === 'claimed' && task.claimed_by_name && (
                          <div style={{ fontSize: 11.5, color: FAINT, marginTop: 5 }} {...AUTO_DIR}>
                            by {task.claimed_by_name}
                          </div>
                        )}
                      </td>

                      <td style={{
                        padding: '14px 16px', fontSize: 12.5, color: MUTED,
                        whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                      }}>
                        {tab === 'active' ? (
                          <>
                            <div>{relativeTime(task.created_at)}</div>
                            {task.due_at && (
                              <div style={{ fontSize: 11.5, color: FAINT, marginTop: 3 }}>
                                due {formatDateTime(task.due_at)}
                              </div>
                            )}
                          </>
                        ) : (
                          formatDateTime(task.completed_at ?? null)
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {tab === 'active' && (
                          <div style={{ display: 'inline-flex', gap: 7 }}>
                            <Button
                              kind="primary"
                              small
                              onClick={() => complete(task)}
                              disabled={busy}
                            >
                              {busy ? 'Working…' : 'Complete'}
                            </Button>
                            <Button
                              kind="danger"
                              small
                              onClick={() => { setCancelling(task); setReason(''); }}
                              disabled={busy}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                        {task.entity_type === 'car' && task.entity_id && (
                          <div style={{ marginTop: tab === 'active' ? 7 : 0 }}>
                            <Button kind="ghost" small onClick={() => navigate('/dashboard/cars')}>
                              Open car
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length === PAGE_SIZE && (
          <div style={{
            padding: '12px 18px', background: '#fafbfc', fontSize: 12, color: FAINT,
          }}>
            Showing the first {PAGE_SIZE} tasks.
          </div>
        )}
      </div>

      {cancelling && (
        <Modal
          title="Cancel this task?"
          onClose={() => { setCancelling(null); setReason(''); }}
          footer={
            <>
              <Button onClick={() => { setCancelling(null); setReason(''); }} disabled={busyId !== null}>
                Keep it
              </Button>
              <Button
                kind="primary"
                onClick={confirmCancel}
                disabled={busyId !== null || !reason.trim()}
                style={{ background: '#dc2626' }}
              >
                {busyId ? 'Cancelling…' : 'Cancel task'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.6 }} {...AUTO_DIR}>
              <strong style={{ color: INK }}>{cancelling.title}</strong> will be closed without
              being done. Cancelling is admin-only and cannot be undone from here.
            </div>
            <Field label="Reason" required hint="Recorded on the task so the team can see why.">
              <textarea
                autoFocus
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Handled outside the system — insurance renewed by the office."
                style={textareaStyle}
                dir="auto"
              />
            </Field>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.message} kind={toast.kind} />}
    </div>
  );
};

export default TasksPage;
