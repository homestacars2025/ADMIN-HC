import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/media/badgeColor';
import {
  absoluteTime,
  shortAccountName,
  STATUS_CLASS,
  STATUS_LABEL,
  type EmailBody,
  type InboxItem,
} from '../../lib/mail';
import { fileKind, formatBytes, listTime, type ReplyMode } from '../../lib/mailThreads';
import type { Source } from '../../lib/sources';
import { ArrowDown, ArrowUp, ChevronLeft, ExternalLink, Mail } from '../media/MediaIcons';
import { Button, Select, Skeleton } from '../media/MediaUI';
import { Avatar } from './ConversationList';
import {
  ArchiveIcon,
  FileIcon,
  ForwardIcon,
  LinkIcon,
  MailDotIcon,
  PaperclipIcon,
  ReplyAllIcon,
  ReplyIcon,
  StarIcon,
  TrashIcon,
  UnarchiveIcon,
} from './MailIcons';
import MessageBody from './MessageBody';

interface Props {
  /** Oldest first. Empty while nothing is selected. */
  messages: InboxItem[];
  bodies: Record<string, EmailBody>;
  loading: boolean;
  sources: Source[];
  /** Our own addresses: decides whether "Reply all" has anyone extra to reach. */
  ownAddresses: string[];
  onBack: () => void;
  onReply: (message: InboxItem, mode: ReplyMode) => void;
  onToggleStar: (message: InboxItem) => void;
  onArchive: () => void;
  onDelete: () => void;
  onMarkUnread: () => void;
  onLinkSource: (sourceId: string) => void;
}

function hasOthers(message: InboxItem, body: EmailBody | undefined, own: readonly string[]): boolean {
  const mine = new Set(own.map((a) => a.toLowerCase()));
  const everyone = [...message.toEmails, ...(body?.ccEmails ?? [])].filter((a) => !mine.has(a.toLowerCase()));
  return message.direction === 'inbound' ? everyone.length > 0 : everyone.length > 1;
}

const IconButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode; tone?: 'danger'; pressed?: boolean }> = ({ label, onClick, children, tone, pressed }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={pressed}
    onClick={onClick}
    className={cn(
      'grid h-9 w-9 place-items-center rounded-lg text-black/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
      tone === 'danger' ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-black/[0.05] hover:text-black/85',
    )}
  >
    {children}
  </button>
);

const AttachmentCards: React.FC<{ body: EmailBody }> = ({ body }) => (
  <div className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5">
    {body.attachments.map((a, i) => {
      const size = formatBytes(a.size);
      const card = (
        <>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/[0.09] text-brand-hover">
            <FileIcon size={17} />
          </span>
          <span className="min-w-0">
            <span className="block max-w-[200px] truncate text-[12.5px] font-medium text-foreground" title={a.name}>{a.name}</span>
            <span className="block text-[11px] text-black/45">
              {fileKind(a.name, a.type)}{size ? ` · ${size}` : ''}{a.url ? '' : ' · name only'}
            </span>
          </span>
          {a.url && <ExternalLink size={13} className="ml-1 shrink-0 text-black/35" />}
        </>
      );
      const cls = 'flex min-h-[52px] items-center gap-2.5 rounded-xl border border-black/[0.08] bg-white py-2 pl-2 pr-3';
      return a.url ? (
        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className={cn(cls, 'transition-colors hover:border-primary/30 hover:bg-primary/[0.03]')}>{card}</a>
      ) : (
        <div key={i} className={cls} title="Only the file name was stored with this message.">{card}</div>
      );
    })}
  </div>
);

const MessageCard: React.FC<{
  message: InboxItem;
  body: EmailBody | undefined;
  expanded: boolean;
  bodyLoading: boolean;
  canReplyAll: boolean;
  /** The newest message relies on the thread's own action bar instead. */
  showActions: boolean;
  onToggle: () => void;
  onReply: (mode: ReplyMode) => void;
  onToggleStar: () => void;
}> = ({ message: m, body, expanded, bodyLoading, canReplyAll, showActions, onToggle, onReply, onToggleStar }) => {
  const out = m.direction === 'outbound';
  const name = out
    ? (m.accountEmail ? shortAccountName({ slug: m.accountSlug, emailAddress: m.accountEmail }) : 'Us')
    : (m.fromName || m.fromEmail || 'Unknown');
  const address = out ? m.accountEmail : m.fromEmail;
  const seed = (out ? m.accountEmail : m.fromEmail) ?? name;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        className="flex w-full items-center gap-3 rounded-xl border border-black/[0.06] bg-white px-4 py-3 text-left transition-colors hover:bg-black/[0.015] sm:px-5"
      >
        <Avatar name={name} seed={seed} size={30} />
        <span className={cn('w-[30%] shrink-0 truncate text-[13px]', !m.isRead && !out ? 'font-semibold text-foreground' : 'font-medium text-black/70')}>{name}</span>
        <span dir="auto" className="min-w-0 flex-1 truncate text-[12.5px] text-black/45">{m.preview?.replace(/\s+/g, ' ') || '—'}</span>
        {m.hasAttachments && <PaperclipIcon size={13} className="shrink-0 text-black/35" />}
        <span className="shrink-0 text-[11.5px] tabular-nums text-black/40">{listTime(m.emailDate)}</span>
      </button>
    );
  }

  const cc = body?.ccEmails ?? [];

  return (
    <article className="overflow-hidden rounded-xl border border-black/[0.08] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
      <header className="flex items-start gap-3 px-4 pb-2 pt-4 sm:px-5">
        <button type="button" onClick={onToggle} aria-expanded aria-label="Collapse message" className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35">
          <Avatar name={name} seed={seed} size={38} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">{name}</span>
            {address && <span className="truncate text-[12.5px] text-black/45">&lt;{address}&gt;</span>}
          </div>
          <dl className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-2 text-[12px] leading-[1.55] text-black/50">
            <dt className="text-black/35">to</dt>
            <dd className="min-w-0 break-words">{m.toEmails.join(', ') || '—'}</dd>
            {cc.length > 0 && (<><dt className="text-black/35">cc</dt><dd className="min-w-0 break-words">{cc.join(', ')}</dd></>)}
            <dt className="text-black/35">date</dt>
            <dd><time dateTime={m.emailDate ?? undefined}>{absoluteTime(m.emailDate)}</time></dd>
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center">
            <span className="mr-1 hidden text-[11.5px] tabular-nums text-black/40 sm:inline">{listTime(m.emailDate)}</span>
            <IconButton label={m.isStarred ? 'Unstar' : 'Star'} onClick={onToggleStar} pressed={m.isStarred}>
              <StarIcon size={16} strokeWidth={m.isStarred ? 2.2 : 1.8} className={m.isStarred ? 'fill-amber-400 text-amber-500' : ''} />
            </IconButton>
            <IconButton label="Reply" onClick={() => onReply('reply')}><ReplyIcon size={16} /></IconButton>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            <span
              className={cn(
                'inline-flex h-[20px] items-center gap-1 rounded-full border px-2 text-[10.5px] font-medium',
                out ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700' : 'border-rose-500/20 bg-rose-500/[0.07] text-rose-700',
              )}
            >
              {out ? <ArrowUp size={11} strokeWidth={2.6} /> : <ArrowDown size={11} strokeWidth={2.6} />}
              {out ? 'Sent' : 'Received'}
            </span>
            {out && m.sendStatus !== 'sent' && (
              <span className={cn('inline-flex h-[20px] items-center rounded-full border px-2 text-[10.5px] font-medium', STATUS_CLASS[m.sendStatus])}>
                {STATUS_LABEL[m.sendStatus]}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="px-4 pb-3 sm:px-5 sm:pl-[70px]">
        {bodyLoading && !body ? (
          <div className="flex flex-col gap-2 py-2" aria-busy="true" aria-label="Loading message">
            <Skeleton className="h-3 w-11/12 rounded" />
            <Skeleton className="h-3 w-4/5 rounded" />
            <Skeleton className="h-3 w-3/5 rounded" />
          </div>
        ) : (
          <MessageBody html={body?.bodyHtml ?? null} text={body?.bodyText ?? m.preview} />
        )}
      </div>

      {body && body.attachments.length > 0 && (
        <div className="sm:pl-[54px]">
          <div className="flex items-center gap-1.5 px-4 pb-2 text-[11.5px] font-medium text-black/45 sm:px-5">
            <PaperclipIcon size={13} />
            {body.attachments.length} attachment{body.attachments.length > 1 ? 's' : ''}
          </div>
          <AttachmentCards body={body} />
        </div>
      )}

      {showActions && (
        <footer className="flex flex-wrap gap-2 border-t border-black/[0.05] px-4 py-2.5 sm:px-5 sm:pl-[70px]">
          <Button variant="outline" size="sm" onClick={() => onReply('reply')}><ReplyIcon size={14} />Reply</Button>
          {canReplyAll && <Button variant="outline" size="sm" onClick={() => onReply('replyAll')}><ReplyAllIcon size={14} />Reply all</Button>}
          <Button variant="outline" size="sm" onClick={() => onReply('forward')}><ForwardIcon size={14} />Forward</Button>
        </footer>
      )}
    </article>
  );
};

const ConversationReader: React.FC<Props> = ({
  messages, bodies, loading, sources, ownAddresses,
  onBack, onReply, onToggleStar, onArchive, onDelete, onMarkUnread, onLinkSource,
}) => {
  // Gmail's rule: the newest message and anything unread start open.
  const conversationId = messages[0]?.id ?? null;
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set<string>();
    messages.forEach((m, i) => {
      if (i === messages.length - 1 || (m.direction === 'inbound' && !m.isRead)) next.add(m.id);
    });
    setOpen(next);
    // Only when a different conversation opens, not on every star or read flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/[0.08] text-brand-hover">
          <Mail size={28} strokeWidth={1.5} />
        </span>
        <div className="text-[15px] font-semibold text-black/70">Select a conversation</div>
        <p className="max-w-[280px] text-[12.5px] leading-relaxed text-black/45">The whole thread opens here, oldest first, with the newest message expanded.</p>
      </div>
    );
  }

  const latest = messages[messages.length - 1];
  const subject = messages.find((m) => m.subject)?.subject || '(no subject)';
  const archived = messages.every((m) => m.isArchived);
  const linked = messages.find((m) => m.sourceId) ?? null;
  const account = latest;

  // Long threads fold their middle, like Gmail, until asked.
  const [first, ...rest] = messages;
  const middle = rest.slice(0, -1);
  const foldMiddle = middle.length > 2 && middle.every((m) => !open.has(m.id));

  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const card = (m: InboxItem) => (
    <MessageCard
      key={m.id}
      message={m}
      body={bodies[m.id]}
      expanded={open.has(m.id)}
      bodyLoading={loading}
      canReplyAll={hasOthers(m, bodies[m.id], ownAddresses)}
      showActions={m.id !== messages[messages.length - 1].id}
      onToggle={() => toggle(m.id)}
      onReply={(mode) => onReply(m, mode)}
      onToggleStar={() => onToggleStar(m)}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-black/[0.06] bg-white/80 px-2 py-1.5 backdrop-blur sm:px-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the list"
          className="grid h-9 w-9 place-items-center rounded-lg text-black/55 hover:bg-black/[0.05] lg:hidden"
        >
          <ChevronLeft size={18} />
        </button>
        <IconButton label={archived ? 'Move to inbox' : 'Archive'} onClick={onArchive}>
          {archived ? <UnarchiveIcon size={17} /> : <ArchiveIcon size={17} />}
        </IconButton>
        <IconButton label="Delete" onClick={onDelete} tone="danger"><TrashIcon size={17} /></IconButton>
        <IconButton label="Mark as unread" onClick={onMarkUnread}><MailDotIcon size={17} /></IconButton>
        <span className="ml-auto pr-2 text-[11.5px] tabular-nums text-black/40">
          {messages.length} message{messages.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafbfc]">
        <div className="mx-auto flex max-w-[860px] flex-col gap-2.5 px-3 py-5 sm:px-6">
          <div className="mb-2 px-1">
            <h2 dir="auto" className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[22px]">{subject}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {(account.accountSlug || account.accountEmail) && (
                <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-2.5 text-[11px] font-medium text-black/60" title={account.accountEmail ?? undefined}>
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: account.accountColor ?? '#9aa5b1' }} />
                  {shortAccountName({ slug: account.accountSlug, emailAddress: account.accountEmail ?? '' })}
                  <span className="text-black/35">{account.accountEmail}</span>
                </span>
              )}
              {linked?.sourceName && (
                <span className="inline-flex h-[22px] items-center rounded-full border border-black/[0.08] bg-white px-2.5 text-[11px] font-medium text-black/60">
                  {linked.sourceName}
                </span>
              )}
              {archived && <span className="inline-flex h-[22px] items-center rounded-full bg-black/[0.05] px-2.5 text-[11px] font-medium text-black/50">Archived</span>}
            </div>
          </div>

          {!linked && sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
              <LinkIcon size={14} className="text-amber-700" />
              <span className="text-[12.5px] text-amber-800">Not linked to a source.</span>
              <div className="ml-auto w-[220px]">
                <Select
                  value=""
                  options={[{ value: '', label: 'Link to a source…' }, ...sources.map((s) => ({ value: s.id, label: s.name }))]}
                  onChange={(v) => v && onLinkSource(v)}
                  ariaLabel="Link this conversation to a source"
                  size="sm"
                />
              </div>
            </div>
          )}

          {card(first)}
          {foldMiddle ? (
            <button
              type="button"
              onClick={() => setOpen((prev) => new Set([...Array.from(prev), ...middle.map((m) => m.id)]))}
              className="relative my-1 flex items-center justify-center"
            >
              <span aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-black/10" />
              <span className="relative rounded-full border border-black/[0.08] bg-white px-3 py-1 text-[12px] font-medium text-black/55 hover:text-brand-hover">
                {middle.length} older messages
              </span>
            </button>
          ) : middle.map(card)}
          {rest.length > 0 && card(rest[rest.length - 1])}

          <div className="mt-2 flex flex-wrap gap-2 px-1 pb-6">
            <Button variant="default" size="lg" onClick={() => onReply(latest, 'reply')}><ReplyIcon size={15} />Reply</Button>
            {hasOthers(latest, bodies[latest.id], ownAddresses) && (
              <Button variant="outline" size="lg" onClick={() => onReply(latest, 'replyAll')}><ReplyAllIcon size={15} />Reply all</Button>
            )}
            <Button variant="outline" size="lg" onClick={() => onReply(latest, 'forward')}><ForwardIcon size={15} />Forward</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationReader;
