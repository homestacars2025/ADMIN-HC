import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Mail } from '../../components/media/MediaIcons';
import {
  absoluteTime,
  shortAccountName,
  STATUS_CLASS,
  STATUS_LABEL,
  type EmailAccount,
  type EmailBody,
  type InboxItem,
} from '../../lib/mail';
import { attachmentKind, formatBytes, mailTime, type ComposeMode } from '../../lib/mailThreads';
import { cn } from '../../lib/media/badgeColor';
import { Select } from '../../components/media/MediaUI';
import { MailBody } from './MailBody';
import {
  ArchiveIcon,
  ChevronLeftIcon,
  FileIcon,
  ForwardIcon,
  InboxIcon,
  LinkIcon,
  MailUnreadIcon,
  ReplyAllIcon,
  ReplyIcon,
  StarIcon,
  TrashIcon,
} from './mailIcons';
import type { InboxThread } from './useMailbox';

const ICON_BUTTON = 'grid h-10 w-10 shrink-0 place-items-center rounded-lg text-black/55 transition-colors hover:bg-black/[0.05] hover:text-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40 md:h-9 md:w-9';

const initials = (value: string) => {
  const parts = value.replace(/[<>"]/g, '').trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
};

const Avatar: React.FC<{ item: InboxItem; account: EmailAccount | undefined }> = ({ item, account }) => {
  const outbound = item.direction === 'outbound';
  const label = outbound ? (account ? shortAccountName(account) : 'Me') : (item.fromName || item.fromEmail || '?');
  return (
    <span
      aria-hidden="true"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white"
      style={{ backgroundColor: outbound ? (account?.color ?? '#6ea4e7') : '#8b95a1' }}
    >
      {initials(label)}
    </span>
  );
};

const Attachments: React.FC<{ body: EmailBody }> = ({ body }) => {
  if (body.attachments.length === 0) return null;
  return (
    <div className="mt-3 border-t border-black/[0.05] pt-3">
      <div className="mb-2 text-[11.5px] font-medium text-black/45">
        {body.attachments.length} {body.attachments.length === 1 ? 'attachment' : 'attachments'}
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {body.attachments.map((attachment, index) => {
          const card = (
            <>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/[0.09] text-brand-strong">
                <FileIcon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-black/80" title={attachment.name}>{attachment.name}</span>
                <span className="block text-[11px] text-black/45">
                  {[attachmentKind(attachment), formatBytes(attachment.size)].filter(Boolean).join(' · ')}
                </span>
              </span>
            </>
          );
          return (
            <li key={`${attachment.name}-${index}`}>
              {attachment.url ? (
                <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[56px] items-center gap-2.5 rounded-xl border border-black/[0.08] bg-white p-2 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]">
                  {card}
                </a>
              ) : (
                <div className="flex min-h-[56px] items-center gap-2.5 rounded-xl border border-black/[0.08] bg-white p-2" title="The file itself isn't stored, only its details">
                  {card}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const MessageCard: React.FC<{
  item: InboxItem;
  body: EmailBody | undefined;
  account: EmailAccount | undefined;
  expanded: boolean;
  canSend: boolean;
  onToggle: () => void;
  onCompose: (mode: Exclude<ComposeMode, 'new'>, item: InboxItem) => void;
  onStar: (item: InboxItem) => void;
}> = ({ item, body, account, expanded, canSend, onToggle, onCompose, onStar }) => {
  const outbound = item.direction === 'outbound';
  const fromLabel = outbound
    ? `${account?.label ?? 'Us'}`
    : (item.fromName || item.fromEmail || 'Unknown');
  const fromEmail = outbound ? account?.emailAddress : item.fromEmail;
  const Arrow = outbound ? ArrowUp : ArrowDown;

  if (!expanded) {
    return (
      <li>
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.02] sm:px-6">
          <Avatar item={item} account={account} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span dir="auto" className={cn('truncate text-[13px]', item.isRead ? 'font-medium text-black/70' : 'font-semibold text-black/90')}>{fromLabel}</span>
              <span className="ms-auto shrink-0 text-[11.5px] tabular-nums text-black/40">{mailTime(item.emailDate)}</span>
            </span>
            <span dir="auto" className="block truncate text-[12.5px] text-black/45">{item.preview?.replace(/\s+/g, ' ').trim() || '—'}</span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className="px-4 py-4 sm:px-6">
      <div className="flex items-start gap-3">
        <Avatar item={item} account={account} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-label="Collapse message">
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                <span dir="auto" className="truncate text-[14px] font-semibold text-black/90">{fromLabel}</span>
                {fromEmail && <span className="truncate text-[12px] text-black/45">&lt;{fromEmail}&gt;</span>}
              </span>
            </button>
            <span className="flex shrink-0 items-center gap-1">
              <span className="me-1 hidden text-[11.5px] tabular-nums text-black/45 sm:inline">{absoluteTime(item.emailDate)}</span>
              <button type="button" onClick={() => onStar(item)} aria-label={item.isStarred ? 'Unstar message' : 'Star message'} aria-pressed={item.isStarred} className={cn(ICON_BUTTON, item.isStarred && 'text-amber-500 hover:text-amber-600')}>
                <StarIcon size={15} strokeWidth={item.isStarred ? 2.2 : 1.8} className={item.isStarred ? 'fill-amber-500' : ''} />
              </button>
              {canSend && (
                <button type="button" onClick={() => onCompose('reply', item)} aria-label="Reply to this message" className={ICON_BUTTON}>
                  <ReplyIcon size={15} />
                </button>
              )}
            </span>
          </div>

          <div className="text-[11.5px] tabular-nums text-black/45 sm:hidden">{absoluteTime(item.emailDate)}</div>
          <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[12px]">
            <dt className="text-black/40">To</dt>
            <dd className="truncate text-black/65">{item.toEmails.join(', ') || '—'}</dd>
            {body && body.ccEmails.length > 0 && (
              <>
                <dt className="text-black/40">Cc</dt>
                <dd className="truncate text-black/65">{body.ccEmails.join(', ')}</dd>
              </>
            )}
          </dl>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn('inline-flex h-[20px] items-center gap-1 rounded-full px-2 text-[10.5px] font-medium', outbound ? 'bg-emerald-500/10 text-emerald-700' : 'bg-[#d4183d]/[0.07] text-[#b3122f]')}>
              <Arrow size={11} strokeWidth={2.6} />
              {outbound ? 'Sent' : 'Received'}
            </span>
            {outbound && item.sendStatus !== 'sent' && (
              <span className={cn('inline-flex h-[20px] items-center rounded-full border px-2 text-[10.5px] font-medium', STATUS_CLASS[item.sendStatus])}>
                {STATUS_LABEL[item.sendStatus]}
              </span>
            )}
            {item.sourceName && (
              <span className="inline-flex h-[20px] items-center rounded-full bg-black/[0.04] px-2 text-[10.5px] font-medium text-black/55">{item.sourceName}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 sm:ps-12">
        {body ? (
          <>
            <MailBody html={body.bodyHtml} text={body.bodyText} blockRemote={!outbound} />
            <Attachments body={body} />
          </>
        ) : (
          <div className="space-y-2 py-2" aria-busy="true">
            <div className="h-3 w-11/12 animate-pulse rounded bg-black/[0.06]" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-black/[0.05]" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-black/[0.04]" />
          </div>
        )}
      </div>
    </li>
  );
};

export interface ThreadReaderProps {
  thread: InboxThread | null;
  bodies: Record<string, EmailBody>;
  accountsById: Map<string, EmailAccount>;
  canSend: boolean;
  canDelete: boolean;
  onBack: () => void;
  onArchive: (thread: InboxThread) => void;
  onDelete: (thread: InboxThread) => void;
  onMarkUnread: (thread: InboxThread) => void;
  onStarThread: (thread: InboxThread) => void;
  onStarMessage: (item: InboxItem) => void;
  onCompose: (mode: Exclude<ComposeMode, 'new'>, item: InboxItem) => void;
  /** Distribution sources, to file mail the matcher couldn't place. Omit to hide. */
  sourceOptions?: Array<{ value: string; label: string }>;
  onLinkSource?: (thread: InboxThread, sourceId: string) => void;
}

export const ThreadReader: React.FC<ThreadReaderProps> = ({
  thread, bodies, accountsById, canSend, canDelete,
  onBack, onArchive, onDelete, onMarkUnread, onStarThread, onStarMessage, onCompose,
  sourceOptions, onLinkSource,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const threadKey = thread?.key ?? null;
  const messageCount = thread?.messages.length ?? 0;

  // The latest message and anything unread start open, the rest folded — as Gmail does.
  useEffect(() => {
    if (!thread) return;
    setExpanded(new Set([thread.latest.id, ...thread.messages.filter((m) => !m.isRead).map((m) => m.id)]));
    // Only when the conversation or its length changes, not on every star or read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey, messageCount]);

  if (!thread) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/[0.08] text-brand-strong">
          <Mail size={24} strokeWidth={1.6} />
        </div>
        <div className="text-[14px] font-medium text-black/60">Select a conversation to read it</div>
        <div className="max-w-[280px] text-[12.5px] text-black/40">Replies are sent from the same mailbox the conversation is in.</div>
      </div>
    );
  }

  const account = thread.latest.accountId ? accountsById.get(thread.latest.accountId) : undefined;
  const last = thread.latest;
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-black/[0.06] bg-white/95 px-2 py-1.5 backdrop-blur sm:px-3">
        <button type="button" onClick={onBack} aria-label="Back to the list" className={cn(ICON_BUTTON, 'lg:hidden')}>
          <ChevronLeftIcon size={18} />
        </button>
        <button type="button" onClick={() => onArchive(thread)} aria-label={thread.archived ? 'Move to inbox' : 'Archive'} title={thread.archived ? 'Move to inbox' : 'Archive'} className={ICON_BUTTON}>
          {thread.archived ? <InboxIcon size={17} /> : <ArchiveIcon size={17} />}
        </button>
        {canDelete && (
          <button type="button" onClick={() => onDelete(thread)} aria-label="Delete conversation" title="Delete" className={cn(ICON_BUTTON, 'hover:bg-[#d4183d]/[0.07] hover:text-[#d4183d]')}>
            <TrashIcon size={17} />
          </button>
        )}
        <button type="button" onClick={() => onMarkUnread(thread)} aria-label="Mark as unread" title="Mark as unread" className={ICON_BUTTON}>
          <MailUnreadIcon size={17} />
        </button>
        <button type="button" onClick={() => onStarThread(thread)} aria-label={thread.starred ? 'Unstar conversation' : 'Star conversation'} aria-pressed={thread.starred} title="Star" className={cn(ICON_BUTTON, thread.starred && 'text-amber-500 hover:text-amber-600')}>
          <StarIcon size={17} strokeWidth={thread.starred ? 2.2 : 1.8} className={thread.starred ? 'fill-amber-500' : ''} />
        </button>
        {canSend && (
          <div className="ms-auto flex items-center gap-1">
            <button type="button" onClick={() => onCompose('reply', last)} aria-label="Reply" title="Reply" className={ICON_BUTTON}><ReplyIcon size={17} /></button>
            <button type="button" onClick={() => onCompose('replyAll', last)} aria-label="Reply all" title="Reply all" className={ICON_BUTTON}><ReplyAllIcon size={17} /></button>
            <button type="button" onClick={() => onCompose('forward', last)} aria-label="Forward" title="Forward" className={ICON_BUTTON}><ForwardIcon size={17} /></button>
          </div>
        )}
        {!canSend && (
          <span className="ms-auto rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-medium text-black/50">Read only</span>
        )}
      </div>

      <div className="px-4 pb-2 pt-5 sm:px-6">
        <h2 dir="auto" className="text-[18px] font-semibold leading-snug tracking-[-0.015em] text-foreground sm:text-[20px]">
          {thread.subject || '(no subject)'}
        </h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-black/45">
          {account && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.035] px-2 py-0.5 font-medium text-black/60">
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: account.color ?? '#9aa5b1' }} />
              {account.emailAddress}
            </span>
          )}
          <span>{thread.messages.length} {thread.messages.length === 1 ? 'message' : 'messages'}</span>
        </div>
        {sourceOptions && onLinkSource && thread.sourceIds.length === 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/[0.08] px-3 py-2">
            <LinkIcon size={14} className="text-amber-700" />
            <span className="text-[12.5px] text-amber-800">Not linked to a source.</span>
            <div className="ms-auto w-full sm:w-[220px]">
              <Select
                value=""
                options={[{ value: '', label: 'Link to a source…' }, ...sourceOptions]}
                onChange={(value) => { if (value) onLinkSource(thread, value); }}
                ariaLabel="Link this conversation to a source"
                size="lg"
              />
            </div>
          </div>
        )}
      </div>

      <ol className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
        {thread.messages.map((item) => (
          <MessageCard
            key={item.id}
            item={item}
            body={bodies[item.id]}
            account={item.accountId ? accountsById.get(item.accountId) : undefined}
            expanded={expanded.has(item.id)}
            canSend={canSend}
            onToggle={() => toggle(item.id)}
            onCompose={onCompose}
            onStar={onStarMessage}
          />
        ))}
      </ol>

      {canSend && (
        <div className="flex flex-wrap gap-2 px-4 py-5 sm:px-6 sm:ps-[72px]">
          <button type="button" onClick={() => onCompose('reply', last)} className="inline-flex h-11 items-center gap-2 rounded-full border border-black/[0.12] px-4 text-[13px] font-medium text-black/75 transition-colors hover:bg-black/[0.03] md:h-10"><ReplyIcon size={15} /> Reply</button>
          <button type="button" onClick={() => onCompose('replyAll', last)} className="inline-flex h-11 items-center gap-2 rounded-full border border-black/[0.12] px-4 text-[13px] font-medium text-black/75 transition-colors hover:bg-black/[0.03] md:h-10"><ReplyAllIcon size={15} /> Reply all</button>
          <button type="button" onClick={() => onCompose('forward', last)} className="inline-flex h-11 items-center gap-2 rounded-full border border-black/[0.12] px-4 text-[13px] font-medium text-black/75 transition-colors hover:bg-black/[0.03] md:h-10"><ForwardIcon size={15} /> Forward</button>
        </div>
      )}
    </div>
  );
};
