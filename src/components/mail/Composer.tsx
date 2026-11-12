import React, { useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/media/badgeColor';
import { sendEmail, shortAccountName, type EmailAccount } from '../../lib/mail';
import { invalidAddress, splitAddresses, type ReplyMode } from '../../lib/mailThreads';
import { isBlankHtml, sanitizeOutgoingHtml } from '../../lib/sanitizeEmail';
import { AlertTriangle } from '../media/MediaIcons';
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
} from '../media/MediaUI';
import { MoreIcon, SendIcon } from './MailIcons';
import RichTextEditor, { type RichTextEditorHandle } from './RichTextEditor';

export type ComposeMode = 'new' | ReplyMode;

/** Everything the composer opens with. The page builds it; the composer owns it after that. */
export interface ComposeDraft {
  mode: ComposeMode;
  to: string[];
  cc: string[];
  subject: string;
  /** The mailbox it leaves from. Fixed for replies so the answer comes back to the same inbox. */
  accountId: string | null;
  /** Sanitized original, appended under the new text. */
  quotedHtml: string | null;
  threadKey: string | null;
  inReplyTo: string | null;
  sourceId: string | null;
  contactId: string | null;
  /** Shown on a forward whose original had files: only their names are stored. */
  droppedAttachments: number;
}

export const NEW_DRAFT: ComposeDraft = {
  mode: 'new', to: [], cc: [], subject: '', accountId: null, quotedHtml: null,
  threadKey: null, inReplyTo: null, sourceId: null, contactId: null, droppedAttachments: 0,
};

const TITLES: Record<ComposeMode, string> = {
  new: 'New message',
  reply: 'Reply',
  replyAll: 'Reply all',
  forward: 'Forward',
};

interface Props {
  draft: ComposeDraft;
  accounts: EmailAccount[];
  onClose: () => void;
  onSent: (message: string) => void;
}

/**
 * Mounted fresh for every draft (the page keys it), so its state never leaks
 * from one message into the next.
 */
const Composer: React.FC<Props> = ({ draft, accounts, onClose, onSent }) => {
  const [to, setTo] = useState(draft.to.join(', '));
  const [cc, setCc] = useState(draft.cc.join(', '));
  const [showCc, setShowCc] = useState(draft.cc.length > 0);
  const [subject, setSubject] = useState(draft.subject);
  const [accountId, setAccountId] = useState<string | null>(
    draft.accountId ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? null,
  );
  const [showQuote, setShowQuote] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editor = useRef<RichTextEditorHandle>(null);

  const isReply = draft.mode === 'reply' || draft.mode === 'replyAll';
  const account = useMemo(() => accounts.find((a) => a.id === accountId) ?? null, [accounts, accountId]);

  const submit = async () => {
    setError(null);
    const toList = splitAddresses(to);
    const ccList = splitAddresses(cc);
    const body = editor.current?.getHtml() ?? '';

    if (toList.length === 0) { setError('Add at least one recipient.'); return; }
    const bad = invalidAddress([...toList, ...ccList]);
    if (bad) { setError(`"${bad}" is not an email address.`); return; }
    if (!subject.trim()) { setError('Add a subject.'); return; }
    if (isBlankHtml(body) && !draft.quotedHtml) { setError('Write a message first.'); return; }

    const html = sanitizeOutgoingHtml(
      `<div dir="auto">${body}</div>${draft.quotedHtml ?? ''}`,
    );

    setSending(true);
    try {
      await sendEmail({
        to: toList.join(', '),
        cc: ccList.join(', '),
        subject: subject.trim(),
        bodyHtml: html,
        threadKey: draft.threadKey,
        inReplyTo: draft.inReplyTo,
        sourceId: draft.sourceId,
        contactId: draft.contactId,
        accountId: account?.id ?? null,
        accountSlug: account?.slug ?? null,
      });
      onSent(account ? `Sent from ${account.emailAddress}.` : 'Message sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
      setSending(false);
    }
  };

  return (
    <Sheet open onClose={sending ? () => {} : onClose} ariaLabel={TITLES[draft.mode]} maxWidthClass="sm:max-w-[680px]" blocking={sending}>
      <SheetHeader>
        <SheetTitle>{TITLES[draft.mode]}</SheetTitle>
      </SheetHeader>
      <SheetBody>
        <div className="flex min-h-full flex-col gap-3">
          {accounts.length > 0 && (
            <Field label="From">
              {isReply || accounts.length === 1 ? (
                <div className="flex h-9 items-center gap-2 rounded-lg border border-black/[0.08] bg-black/[0.02] px-3 text-[13px] text-black/70" title={isReply ? 'A reply leaves from the mailbox the conversation lives in.' : undefined}>
                  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: account?.color ?? '#9aa5b1' }} />
                  <span className="font-medium text-foreground">{account ? shortAccountName(account) : '—'}</span>
                  <span className="truncate text-black/45">{account?.emailAddress}</span>
                </div>
              ) : (
                <Select
                  value={accountId ?? ''}
                  options={accounts.map((a) => ({ value: a.id, label: `${shortAccountName(a)} — ${a.emailAddress}`, color: a.color }))}
                  onChange={(v) => setAccountId(v || null)}
                  ariaLabel="Send from which mailbox"
                  size="lg"
                />
              )}
            </Field>
          )}

          <Field
            label={(
              <span className="flex w-full items-center justify-between">
                To
                {!showCc && (
                  <button type="button" onClick={() => setShowCc(true)} className="text-[12px] font-medium text-brand-hover hover:underline">
                    Add Cc
                  </button>
                )}
              </span>
            )}
          >
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com, other@example.com"
              aria-label="To"
              autoFocus={draft.mode === 'new' || draft.mode === 'forward'}
              inputMode="email"
              className="h-9 text-[13.5px]"
            />
          </Field>
          {showCc && (
            <Field label="Cc">
              <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" aria-label="Cc" inputMode="email" className="h-9 text-[13.5px]" />
            </Field>
          )}
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" className="h-9 text-[13.5px]" dir="auto" />
          </Field>

          <RichTextEditor
            ref={editor}
            ariaLabel="Message"
            placeholder={isReply ? 'Write your reply…' : 'Write your message…'}
            onSubmit={() => void submit()}
            className="min-h-[260px] flex-1"
          />

          {draft.quotedHtml && (
            <div className="rounded-xl border border-black/[0.06] bg-black/[0.015]">
              <button
                type="button"
                onClick={() => setShowQuote((v) => !v)}
                aria-expanded={showQuote}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-black/50 hover:text-black/75"
              >
                <span className="grid h-5 w-7 place-items-center rounded-md bg-black/[0.06]"><MoreIcon size={14} strokeWidth={2.4} /></span>
                {draft.mode === 'forward' ? 'Forwarded message included' : 'Original message quoted below'}
                <span className="ml-auto text-black/35">{showQuote ? 'Hide' : 'Show'}</span>
              </button>
              {showQuote && (
                <div
                  className="max-h-[240px] overflow-y-auto border-t border-black/[0.05] px-3 py-2 text-[12.5px] leading-relaxed text-black/60 [&_blockquote]:border-l-2 [&_blockquote]:border-black/10 [&_blockquote]:pl-2 [&_img]:max-w-full"
                  // Already sanitized by the page with the outgoing rules.
                  dangerouslySetInnerHTML={{ __html: draft.quotedHtml }}
                />
              )}
            </div>
          )}

          {draft.droppedAttachments > 0 && (
            <p className="text-[12px] text-black/45">
              {draft.droppedAttachments === 1 ? 'The original attachment is' : `The ${draft.droppedAttachments} original attachments are`} not
              forwarded: only file names are stored, not the files.
            </p>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/[0.05] px-3 py-2 text-[12.5px] text-destructive">
              <AlertTriangle size={14} className="mt-px shrink-0" />
              {error}
            </div>
          )}
        </div>
      </SheetBody>
      <SheetFooter>
        <span className="mr-auto hidden text-[11.5px] text-black/35 sm:inline">⌘ Enter to send</span>
        <Button variant="outline" size="lg" onClick={onClose} disabled={sending}>Discard</Button>
        <Button variant="default" size="lg" onClick={() => void submit()} disabled={sending} className={cn('min-w-[96px]')}>
          {sending ? <Spinner size={13} /> : <SendIcon size={14} />}
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </SheetFooter>
    </Sheet>
  );
};

export default Composer;
