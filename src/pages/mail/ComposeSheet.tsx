import React, { useMemo, useState } from 'react';
import {
  Button,
  Field,
  Input,
  Select,
  Sheet,
  SheetBody,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
} from '../../components/media/MediaUI';
import { sendEmail, shortAccountName, type EmailAccount } from '../../lib/mail';
import { type ComposeMode } from '../../lib/mailThreads';
import { htmlToText, sanitizeOutgoingHtml } from '../../lib/mailSanitize';
import { RichEditor } from './RichEditor';
import { SendIcon } from './mailIcons';

export interface ComposeDraft {
  /** Bumped for every new draft, so the editor starts fresh. */
  id: number;
  mode: ComposeMode;
  accountId: string | null;
  to: string;
  cc: string;
  subject: string;
  /** Quoted original or forwarded message, below where the user types. */
  initialHtml: string;
  threadKey: string | null;
  inReplyTo: string | null;
  sourceId: string | null;
  contactId: string | null;
}

const TITLES: Record<ComposeMode, string> = {
  new: 'New message',
  reply: 'Reply',
  replyAll: 'Reply all',
  forward: 'Forward',
};

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

const splitEmails = (value: string) => value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);

/** The address list a person typed, or which entry in it is wrong. */
function checkEmails(value: string, required: boolean): string | null {
  const list = splitEmails(value);
  if (required && list.length === 0) return 'Add at least one recipient.';
  const bad = list.find((email) => !EMAIL.test(email.replace(/^.*<([^>]+)>$/, '$1')));
  return bad ? `"${bad}" isn't a valid address.` : null;
}

export const ComposeSheet: React.FC<{
  draft: ComposeDraft | null;
  /** Only the mailboxes this person may send from. */
  sendableAccounts: EmailAccount[];
  onClose: () => void;
  onSent: (accountLabel: string) => void;
}> = ({ draft, sendableAccounts, onClose, onSent }) => {
  if (!draft) return null;
  return <ComposeForm key={draft.id} draft={draft} sendableAccounts={sendableAccounts} onClose={onClose} onSent={onSent} />;
};

const ComposeForm: React.FC<{
  draft: ComposeDraft;
  sendableAccounts: EmailAccount[];
  onClose: () => void;
  onSent: (accountLabel: string) => void;
}> = ({ draft, sendableAccounts, onClose, onSent }) => {
  const [accountId, setAccountId] = useState<string | null>(
    sendableAccounts.some((a) => a.id === draft.accountId)
      ? draft.accountId
      : (sendableAccounts.find((a) => a.isDefault) ?? sendableAccounts[0])?.id ?? null,
  );
  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc);
  const [showCc, setShowCc] = useState(Boolean(draft.cc));
  const [subject, setSubject] = useState(draft.subject);
  const [html, setHtml] = useState(draft.initialHtml);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const account = useMemo(() => sendableAccounts.find((a) => a.id === accountId) ?? null, [sendableAccounts, accountId]);
  // A reply stays in its conversation's mailbox, so the answer comes back to the same place.
  const lockedAccount = draft.mode === 'reply' || draft.mode === 'replyAll';

  const send = async () => {
    const problem = !account ? 'Pick the mailbox to send from.'
      : checkEmails(to, true) ?? checkEmails(cc, false)
      ?? (!subject.trim() ? 'Add a subject.' : null)
      ?? (!htmlToText(html) ? 'Write a message first.' : null);
    if (problem || !account) { setError(problem); return; }

    setSending(true);
    setError(null);
    try {
      await sendEmail({
        to: splitEmails(to).join(', '),
        cc: splitEmails(cc).join(', '),
        subject: subject.trim(),
        bodyHtml: sanitizeOutgoingHtml(html),
        threadKey: draft.threadKey,
        inReplyTo: draft.inReplyTo,
        sourceId: draft.sourceId,
        contactId: draft.contactId,
        accountId: account.id,
        accountSlug: account.slug,
      });
      onSent(account.emailAddress);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
      setSending(false);
    }
  };

  return (
    <Sheet open onClose={sending ? () => undefined : onClose} ariaLabel={TITLES[draft.mode]} maxWidthClass="sm:max-w-[680px]">
      <SheetHeader>
        <SheetTitle>{TITLES[draft.mode]}</SheetTitle>
      </SheetHeader>
      <SheetBody>
        <div className="flex min-h-full flex-col gap-3">
          {sendableAccounts.length === 0 ? (
            <p role="alert" className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800">You can read these mailboxes but not send from them.</p>
          ) : (
            <Field label="From">
              {lockedAccount && account ? (
                <div className="flex h-10 items-center gap-2 rounded-lg border border-input bg-black/[0.02] px-3 text-[13px] text-black/70">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: account.color ?? '#9aa5b1' }} />
                  {account.label ?? shortAccountName(account)} · {account.emailAddress}
                </div>
              ) : (
                <Select
                  value={accountId ?? ''}
                  options={sendableAccounts.map((a) => ({ value: a.id, label: `${a.label ?? shortAccountName(a)} — ${a.emailAddress}`, color: a.color }))}
                  onChange={(value) => setAccountId(value || null)}
                  ariaLabel="Send from which mailbox"
                  size="lg"
                />
              )}
            </Field>
          )}
          <Field label="To">
            <div className="flex gap-2">
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, other@example.com" className="!h-11 md:!h-10" autoFocus={draft.mode === 'new' || draft.mode === 'forward'} />
              {!showCc && (
                <button type="button" onClick={() => setShowCc(true)} className="h-11 shrink-0 rounded-lg px-3 text-[12.5px] font-medium text-brand-strong hover:bg-primary/10 md:h-10">Cc</button>
              )}
            </div>
          </Field>
          {showCc && (
            <Field label="Cc">
              <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" className="!h-11 md:!h-10" />
            </Field>
          )}
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="!h-11 md:!h-10" />
          </Field>
          <RichEditor
            initialHtml={draft.initialHtml}
            onChange={setHtml}
            placeholder="Write your message…"
            ariaLabel="Message"
            autoFocus={draft.mode === 'reply' || draft.mode === 'replyAll'}
          />
          {draft.mode === 'forward' && (
            <p className="text-[11.5px] text-black/40">Attachments aren't stored with received mail, so they can't be forwarded.</p>
          )}
          {error && <p role="alert" className="rounded-lg bg-[#d4183d]/[0.07] px-3 py-2 text-[12.5px] text-[#b3122f]">{error}</p>}
        </div>
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" size="lg" className="!h-11 md:!h-10" onClick={onClose} disabled={sending}>Discard</Button>
        <Button size="lg" className="!h-11 md:!h-10" onClick={() => void send()} disabled={sending || sendableAccounts.length === 0}>
          {sending ? <Spinner size={13} /> : <SendIcon size={14} />}
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </SheetFooter>
    </Sheet>
  );
};
