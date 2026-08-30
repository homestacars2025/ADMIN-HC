import React, { useState } from 'react';
import { sendManualNotification, type NotificationTarget } from '../../lib/notifications';
import { RecipientPicker } from './RecipientPicker';
import {
  Button, CARD_STYLE, ErrorBanner, Field, inputStyle, MUTED, textareaStyle, Toast,
} from './ui';

export const SendNotificationTab: React.FC = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [targets, setTargets] = useState<NotificationTarget[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);

  React.useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(handle);
  }, [toast]);

  const canSend = title.trim() !== '' && targets.length > 0 && !sending;

  async function send() {
    setError(null);

    if (!title.trim()) {
      setError('A title is required.');
      return;
    }
    if (targets.length === 0) {
      setError('Pick at least one recipient — a role or a specific person.');
      return;
    }

    setSending(true);
    try {
      await sendManualNotification({
        title: title.trim(),
        body: body.trim() || null,
        targets,
        link: link.trim() || null,
      });
      setToast({ message: 'Notification sent', kind: 'success' });
      setTitle('');
      setBody('');
      setLink('');
      setTargets([]);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not send the notification';
      setError(message);
      setToast({ message, kind: 'error' });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {error && <ErrorBanner message={error} />}

      <div style={{ ...CARD_STYLE, padding: 24, maxWidth: 640 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field label="Title" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Office closed on Friday"
              style={inputStyle}
              maxLength={200}
            />
          </Field>

          <Field label="Message">
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Anything the recipients need to know."
              style={textareaStyle}
            />
          </Field>

          <Field
            label="Recipients"
            required
            hint="Pick whole roles, specific people, or both."
          >
            <RecipientPicker value={targets} onChange={setTargets} />
          </Field>

          <Field
            label="Link"
            hint="Optional internal path — where clicking the notification takes the reader. e.g. /dashboard/bookings"
          >
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="/dashboard/…"
              style={inputStyle}
            />
          </Field>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
            <Button kind="primary" onClick={send} disabled={!canSend}>
              {sending ? 'Sending…' : 'Send notification'}
            </Button>
            {targets.length === 0 && (
              <span style={{ fontSize: 12, color: MUTED }}>Pick at least one recipient.</span>
            )}
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} kind={toast.kind} />}
    </>
  );
};
