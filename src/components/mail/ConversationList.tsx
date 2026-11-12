import React from 'react';
import { cn } from '../../lib/media/badgeColor';
import { shortAccountName, STATUS_CLASS, STATUS_LABEL, PRIORITY_CLASS } from '../../lib/mail';
import { listTime, participantsLabel, type Conversation } from '../../lib/mailThreads';
import { ArrowDown, ArrowUp, SearchX } from '../media/MediaIcons';
import { Skeleton } from '../media/MediaUI';
import { InboxIcon, PaperclipIcon, StarIcon } from './MailIcons';

/** Initials for the avatar: "Ahmed Kaya" → "AK", "info@x.com" → "I". */
export function initialsOf(name: string): string {
  const clean = name.replace(/^To:\s*/i, '').replace(/[<>"]/g, '').trim();
  if (!clean) return '?';
  if (clean.includes('@') && !clean.includes(' ')) return clean.charAt(0).toUpperCase();
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.charAt(0) ?? '') + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
}

/** A soft, stable tint per person, so the same sender always looks the same. */
export function avatarTint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 45% 92%)`;
}
export function avatarInk(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 35% 32%)`;
}

export const Avatar: React.FC<{ name: string; seed: string; size?: number }> = ({ name, seed, size = 36 }) => (
  <span
    aria-hidden="true"
    className="grid shrink-0 place-items-center rounded-full font-semibold"
    style={{ width: size, height: size, fontSize: size * 0.36, backgroundColor: avatarTint(seed), color: avatarInk(seed) }}
  >
    {initialsOf(name)}
  </span>
);

interface RowProps {
  conversation: Conversation;
  selected: boolean;
  onOpen: (c: Conversation) => void;
  onToggleStar: (c: Conversation) => void;
}

const Row: React.FC<RowProps> = React.memo(({ conversation: c, selected, onOpen, onToggleStar }) => {
  const latest = c.latest;
  const unread = c.unreadCount > 0;
  const who = participantsLabel(c);
  // The avatar is the other party, not the label: "Elena, me (3)" is Elena.
  const other = c.messages.slice().reverse().find((m) => m.direction === 'inbound') ?? latest;
  const avatarName = other.direction === 'inbound'
    ? (other.fromName || other.fromEmail || '?')
    : (other.toEmails[0] ?? '?');
  const seed = (other.direction === 'inbound' ? other.fromEmail : other.toEmails[0]) ?? avatarName;
  const out = latest.direction === 'outbound';
  const showStatus = out && latest.sendStatus !== 'sent';

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onOpen(c)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(c); } }}
        className={cn(
          'group relative flex cursor-pointer gap-3 px-3 py-3 outline-none transition-colors sm:px-4',
          'focus-visible:bg-primary/[0.05] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30',
          selected ? 'bg-primary/[0.07]' : 'hover:bg-black/[0.025]',
        )}
      >
        {/* Account colour as a quiet edge; unread as a dot over it. */}
        <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ backgroundColor: latest.accountColor ?? 'transparent', opacity: selected ? 1 : 0.55 }} />

        <div className="relative pt-0.5">
          <Avatar name={avatarName} seed={seed} />
          {unread && <span aria-label="Unread" className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-primary" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {out
              ? <ArrowUp size={12} strokeWidth={2.6} className="shrink-0 text-emerald-600" />
              : <ArrowDown size={12} strokeWidth={2.6} className="shrink-0 text-rose-500" />}
            <span className="sr-only">{out ? 'Sent' : 'Received'}</span>
            <span dir="auto" className={cn('min-w-0 flex-1 truncate text-[13.5px] tracking-[-0.01em]', unread ? 'font-semibold text-foreground' : 'font-medium text-black/70')}>
              {who}
            </span>
            {c.hasAttachments && (
              <>
                <PaperclipIcon size={13} className="shrink-0 text-black/40" />
                <span className="sr-only">Has attachments</span>
              </>
            )}
            <time
              dateTime={latest.emailDate ?? undefined}
              className={cn('shrink-0 text-[11.5px] tabular-nums', unread ? 'font-semibold text-brand-hover' : 'text-black/40')}
            >
              {listTime(latest.emailDate)}
            </time>
          </div>

          <div className="mt-0.5 flex items-center gap-2">
            <span dir="auto" className={cn('min-w-0 flex-1 truncate text-[13px]', unread ? 'font-semibold text-black/85' : 'text-black/70')}>
              {c.subject || '(no subject)'}
            </span>
            <button
              type="button"
              aria-label={c.starred ? 'Unstar conversation' : 'Star conversation'}
              aria-pressed={c.starred}
              onClick={(e) => { e.stopPropagation(); onToggleStar(c); }}
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-md transition-[color,opacity] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
                c.starred ? 'text-amber-500' : 'text-black/25 opacity-100 hover:text-black/55 lg:opacity-0 lg:group-hover:opacity-100',
              )}
            >
              <StarIcon size={15} strokeWidth={c.starred ? 2.2 : 1.8} className={c.starred ? 'fill-amber-400' : ''} />
            </button>
          </div>

          <p dir="auto" className="line-clamp-1 text-[12.5px] leading-relaxed text-black/45">
            {latest.preview?.replace(/\s+/g, ' ').trim() || '—'}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {(latest.accountSlug || latest.accountEmail) && (
              <span className="inline-flex h-[20px] items-center gap-1 rounded-full border border-black/[0.08] bg-white px-2 text-[10.5px] font-medium text-black/55" title={latest.accountEmail ?? undefined}>
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: latest.accountColor ?? '#9aa5b1' }} />
                {shortAccountName({ slug: latest.accountSlug, emailAddress: latest.accountEmail ?? '' })}
              </span>
            )}
            {latest.sourceName && (
              <span className={cn('inline-flex h-[20px] items-center rounded-full border px-2 text-[10.5px] font-medium', latest.sourcePriority ? PRIORITY_CLASS[latest.sourcePriority] : 'border-black/10 bg-black/[0.03] text-black/55')}>
                {latest.sourceName}
              </span>
            )}
            {showStatus && (
              <span className={cn('inline-flex h-[20px] items-center rounded-full border px-2 text-[10.5px] font-medium', STATUS_CLASS[latest.sendStatus])}>
                {STATUS_LABEL[latest.sendStatus]}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
});
Row.displayName = 'ConversationRow';

interface Props {
  conversations: Conversation[];
  loading: boolean;
  selectedKey: string | null;
  searching: boolean;
  emptyHint: string;
  onOpen: (c: Conversation) => void;
  onToggleStar: (c: Conversation) => void;
}

const ConversationList: React.FC<Props> = ({ conversations, loading, selectedKey, searching, emptyHint, onOpen, onToggleStar }) => {
  if (loading) {
    return (
      <ul aria-busy="true" aria-label="Loading mail" className="divide-y divide-black/[0.04]">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="flex gap-3 px-4 py-3.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex justify-between gap-6"><Skeleton className="h-3.5 w-2/5 rounded" /><Skeleton className="h-3 w-10 rounded" /></div>
              <Skeleton className="h-3 w-4/5 rounded" />
              <Skeleton className="h-3 w-3/5 rounded" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (conversations.length === 0) {
    const Icon = searching ? SearchX : InboxIcon;
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-20 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/[0.08] text-brand-hover">
          <Icon size={24} />
        </span>
        <div className="text-[14px] font-semibold text-black/70">{searching ? 'No matches' : 'All clear'}</div>
        <p className="max-w-[260px] text-[12.5px] leading-relaxed text-black/45">{searching ? 'Nothing matches that search here. Try another word or folder.' : emptyHint}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-black/[0.04]">
      {conversations.map((c) => (
        <Row key={c.key} conversation={c} selected={c.key === selectedKey} onOpen={onOpen} onToggleStar={onToggleStar} />
      ))}
    </ul>
  );
};

export default ConversationList;
