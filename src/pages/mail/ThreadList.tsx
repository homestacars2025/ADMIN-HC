import React from 'react';
import { ArrowDown, ArrowUp, SearchX } from '../../components/media/MediaIcons';
import { shortAccountName, type EmailAccount, type InboxItem } from '../../lib/mail';
import { mailTime } from '../../lib/mailThreads';
import { cn } from '../../lib/media/badgeColor';
import { PaperclipIcon, StarIcon } from './mailIcons';
import type { InboxThread } from './useMailbox';

const firstName = (value: string) => value.split(/[\s@]/)[0] || value;

/** Who the conversation is with, Gmail style: "Ali, me (3)". */
export function threadPeople(thread: InboxThread, meLabel = 'me'): string {
  const names: string[] = [];
  const add = (name: string) => { if (name && !names.includes(name)) names.push(name); };
  thread.messages.forEach((m) => {
    if (m.direction === 'inbound') add(m.fromName?.trim() || m.fromEmail || 'Unknown');
    else add(meLabel);
  });
  if (!thread.hasInbound) {
    const to = thread.latest.toEmails[0];
    return to ? `To: ${to}` : meLabel;
  }
  const label = names.length > 2 ? names.map(firstName).join(', ') : names.join(', ');
  return label;
}

export function counterparty(item: InboxItem): string {
  if (item.direction === 'outbound') return item.toEmails.join(', ') || 'Unknown';
  return item.fromName || item.fromEmail || 'Unknown';
}

const AccountChip: React.FC<{ account: EmailAccount | undefined }> = ({ account }) => {
  if (!account) return null;
  return (
    <span className="inline-flex h-[18px] max-w-[110px] items-center gap-1 rounded-full bg-black/[0.035] px-1.5 text-[10.5px] font-medium text-black/55" title={account.emailAddress}>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: account.color ?? '#9aa5b1' }} />
      <span className="truncate">{shortAccountName(account)}</span>
    </span>
  );
};

const Row: React.FC<{
  thread: InboxThread;
  active: boolean;
  account: EmailAccount | undefined;
  showAccount: boolean;
  onOpen: () => void;
  onStar: () => void;
}> = ({ thread, active, account, showAccount, onOpen, onStar }) => {
  const unread = thread.unread > 0;
  const latest = thread.latest;
  const outbound = latest.direction === 'outbound';
  const Arrow = outbound ? ArrowUp : ArrowDown;
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full gap-3 py-3 pe-4 ps-11 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
          active ? 'bg-primary/[0.08]' : unread ? 'bg-white hover:bg-black/[0.025]' : 'bg-[#FBFBFC] hover:bg-black/[0.025]',
        )}
      >
        <span aria-hidden="true" className={cn('absolute start-[18px] top-[19px] h-2 w-2 rounded-full', unread ? 'bg-primary' : 'bg-transparent')} />
        {unread && <span className="sr-only">Unread. </span>}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span dir="auto" className={cn('min-w-0 flex-1 truncate text-[13.5px] tracking-[-0.01em]', unread ? 'font-semibold text-black/90' : 'font-medium text-black/65')}>
              {threadPeople(thread)}
              {thread.messages.length > 1 && <span className="ms-1 text-[12px] font-normal text-black/40">{thread.messages.length}</span>}
            </span>
            <span className={cn('shrink-0 text-[11.5px] tabular-nums', unread ? 'font-semibold text-brand-strong' : 'text-black/40')}>
              {mailTime(latest.emailDate)}
            </span>
          </span>
          <span dir="auto" className={cn('mt-0.5 block truncate text-[13px]', unread ? 'font-medium text-black/85' : 'text-black/65')}>
            {thread.subject || '(no subject)'}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <Arrow size={12} strokeWidth={2.6} className={cn('shrink-0', outbound ? 'text-emerald-600' : 'text-[#d4183d]')} />
            <span className="sr-only">{outbound ? 'Sent.' : 'Received.'}</span>
            <span dir="auto" className="min-w-0 flex-1 truncate text-[12.5px] text-black/45">{latest.preview?.replace(/\s+/g, ' ').trim() || '—'}</span>
            {thread.hasAttachments && <PaperclipIcon size={13} className="shrink-0 text-black/40" />}
            {showAccount && <AccountChip account={account} />}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onStar}
        aria-label={thread.starred ? 'Unstar conversation' : 'Star conversation'}
        aria-pressed={thread.starred}
        className={cn(
          'absolute start-1 top-[34px] grid h-9 w-9 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          thread.starred ? 'text-amber-500' : 'text-black/20 hover:text-black/50 group-hover:text-black/35',
        )}
      >
        <StarIcon size={15} strokeWidth={thread.starred ? 2.2 : 1.8} className={thread.starred ? 'fill-amber-500' : ''} />
      </button>
    </li>
  );
};

export const ThreadListSkeleton: React.FC = () => (
  <ul aria-busy="true" aria-label="Loading mail" className="divide-y divide-black/[0.05]">
    {Array.from({ length: 8 }, (_, i) => (
      <li key={i} className="flex gap-3 px-4 py-3.5">
        <span className="mt-1.5 h-2 w-2 rounded-full bg-black/[0.06]" />
        <span className="flex-1 space-y-2">
          <span className="flex justify-between gap-3"><span className="h-3 w-1/3 animate-pulse rounded bg-black/[0.07]" /><span className="h-3 w-10 animate-pulse rounded bg-black/[0.05]" /></span>
          <span className="block h-3 w-3/4 animate-pulse rounded bg-black/[0.06]" />
          <span className="block h-3 w-5/6 animate-pulse rounded bg-black/[0.04]" />
        </span>
      </li>
    ))}
  </ul>
);

export const ThreadList: React.FC<{
  threads: InboxThread[];
  selectedKey: string | null;
  accountsById: Map<string, EmailAccount>;
  showAccount: boolean;
  emptyTitle: string;
  emptyHint: string;
  onOpen: (thread: InboxThread) => void;
  onStar: (thread: InboxThread) => void;
}> = ({ threads, selectedKey, accountsById, showAccount, emptyTitle, emptyHint, onOpen, onStar }) => {
  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/[0.08] text-brand-strong">
          <SearchX size={20} strokeWidth={1.7} />
        </div>
        <div className="mt-1 text-[14px] font-medium text-black/70">{emptyTitle}</div>
        <div className="max-w-[260px] text-[12.5px] leading-relaxed text-black/45">{emptyHint}</div>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-black/[0.05]">
      {threads.map((thread) => (
        <Row
          key={thread.key}
          thread={thread}
          active={thread.key === selectedKey}
          account={thread.latest.accountId ? accountsById.get(thread.latest.accountId) : undefined}
          showAccount={showAccount}
          onOpen={() => onOpen(thread)}
          onStar={() => onStar(thread)}
        />
      ))}
    </ul>
  );
};
