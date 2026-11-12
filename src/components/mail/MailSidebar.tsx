import React from 'react';
import { cn } from '../../lib/media/badgeColor';
import { shortAccountName, type EmailAccount, type InboxFilter } from '../../lib/mail';
import { Plus } from '../media/MediaIcons';
import { Select } from '../media/MediaUI';
import {
  ArchiveIcon,
  BellIcon,
  BellOffIcon,
  ComposeIcon,
  InboxIcon,
  LayersIcon,
  MailDotIcon,
  ReceivedIcon,
  SendIcon,
  StarIcon,
} from './MailIcons';

export const FOLDERS: Array<{ key: InboxFilter; label: string; Icon: React.FC<{ size?: number; className?: string }> }> = [
  { key: 'all', label: 'All mail', Icon: InboxIcon },
  { key: 'unread', label: 'Unread', Icon: MailDotIcon },
  { key: 'starred', label: 'Starred', Icon: StarIcon },
  { key: 'inbound', label: 'Received', Icon: ReceivedIcon },
  { key: 'outbound', label: 'Sent', Icon: SendIcon },
  { key: 'archived', label: 'Archived', Icon: ArchiveIcon },
];

interface Props {
  accounts: EmailAccount[];
  boxId: string | null;
  folder: InboxFilter;
  unreadPerAccount: Record<string, number>;
  /** Unread across the selected mailbox (or all of them). */
  unreadInBox: number;
  canCreateMailbox: boolean;
  soundOn: boolean;
  onSelectBox: (id: string | null) => void;
  onSelectFolder: (folder: InboxFilter) => void;
  onCompose: () => void;
  onNewMailbox: () => void;
  onToggleSound: () => void;
}

const Count: React.FC<{ n: number; strong?: boolean }> = ({ n, strong }) =>
  n > 0 ? (
    <span
      className={cn(
        'ml-auto min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums leading-[18px]',
        strong ? 'bg-primary text-white' : 'text-black/45',
      )}
    >
      {n > 999 ? '999+' : n}
    </span>
  ) : null;

/** Mailboxes and folders: the left column on wide screens. */
export const MailSidebar: React.FC<Props> = ({
  accounts, boxId, folder, unreadPerAccount, unreadInBox, canCreateMailbox, soundOn,
  onSelectBox, onSelectFolder, onCompose, onNewMailbox, onToggleSound,
}) => {
  const total = Object.values(unreadPerAccount).reduce((s, n) => s + n, 0);
  const item = 'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] tracking-[-0.006em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35';

  return (
    <nav aria-label="Mail folders" className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-3 py-4">
      <button
        type="button"
        onClick={onCompose}
        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] px-4 text-[13.5px] font-semibold text-white shadow-[0_1px_2px_rgb(0_0_0/0.08)] transition-colors hover:bg-[var(--btn-primary-hover)] active:translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
      >
        <ComposeIcon size={16} />
        New message
      </button>

      <div className="flex flex-col gap-0.5">
        {FOLDERS.map(({ key, label, Icon }) => {
          const active = folder === key;
          return (
            <button
              key={key}
              type="button"
              aria-current={active ? 'page' : undefined}
              aria-label={(key === 'all' || key === 'unread') && unreadInBox > 0 ? `${label}, ${unreadInBox} unread` : label}
              onClick={() => onSelectFolder(key)}
              className={cn(item, active ? 'bg-primary/[0.1] font-semibold text-foreground' : 'font-medium text-black/60 hover:bg-black/[0.035] hover:text-black/85')}
            >
              <Icon size={16} className={active ? 'text-brand-hover' : 'text-black/40'} />
              {label}
              {(key === 'all' || key === 'unread') && <Count n={unreadInBox} strong={key === 'unread' || active} />}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between px-2.5 pb-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-black/35">Mailboxes</span>
          {canCreateMailbox && (
            <button
              type="button"
              onClick={onNewMailbox}
              title="New mailbox"
              aria-label="New mailbox"
              className="grid h-6 w-6 place-items-center rounded-md text-black/40 transition-colors hover:bg-black/[0.05] hover:text-black/75"
            >
              <Plus size={14} strokeWidth={2.2} />
            </button>
          )}
        </div>
        <button
          type="button"
          aria-current={boxId === null ? 'true' : undefined}
          aria-label={total > 0 ? `All mailboxes, ${total} unread` : 'All mailboxes'}
          onClick={() => onSelectBox(null)}
          className={cn(item, boxId === null ? 'bg-black/[0.05] font-semibold text-foreground' : 'font-medium text-black/60 hover:bg-black/[0.035] hover:text-black/85')}
        >
          <LayersIcon size={15} className="text-black/40" />
          All mailboxes
          <Count n={total} />
        </button>
        {accounts.map((a) => {
          const active = boxId === a.id;
          return (
            <button
              key={a.id}
              type="button"
              title={a.emailAddress}
              aria-current={active ? 'true' : undefined}
              aria-label={`${shortAccountName(a)}, ${a.emailAddress}${(unreadPerAccount[a.id] ?? 0) > 0 ? `, ${unreadPerAccount[a.id]} unread` : ''}`}
              onClick={() => onSelectBox(a.id)}
              className={cn(item, 'h-auto min-h-9 py-1.5', active ? 'bg-black/[0.05] text-foreground' : 'text-black/60 hover:bg-black/[0.035] hover:text-black/85')}
            >
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: a.color ?? '#9aa5b1' }} />
              <span className="min-w-0 flex-1 text-left">
                <span className={cn('block truncate', active ? 'font-semibold' : 'font-medium')}>{shortAccountName(a)}</span>
                <span className="block truncate text-[11px] font-normal text-black/40">{a.emailAddress}</span>
              </span>
              <Count n={unreadPerAccount[a.id] ?? 0} />
            </button>
          );
        })}
        {canCreateMailbox && (
          <button
            type="button"
            onClick={onNewMailbox}
            className={cn(item, 'mt-1 border border-dashed border-black/[0.12] font-medium text-black/50 hover:border-primary/40 hover:bg-primary/[0.04] hover:text-brand-hover')}
          >
            <Plus size={15} />
            New mailbox
          </button>
        )}
      </div>

      <div className="mt-auto pt-2">
        <button
          type="button"
          role="switch"
          aria-checked={soundOn}
          onClick={onToggleSound}
          className={cn(item, 'font-medium text-black/50 hover:bg-black/[0.035] hover:text-black/80')}
        >
          {soundOn ? <BellIcon size={15} /> : <BellOffIcon size={15} />}
          Sound for new mail
          <span className={cn('ml-auto text-[11px] font-semibold', soundOn ? 'text-brand-hover' : 'text-black/35')}>{soundOn ? 'On' : 'Off'}</span>
        </button>
      </div>
    </nav>
  );
};

/**
 * The same choices for screens without the left column: mailbox chips that
 * scroll sideways and a folder dropdown.
 */
export const MailToolbarCompact: React.FC<Props> = ({
  accounts, boxId, folder, unreadPerAccount, unreadInBox, canCreateMailbox,
  onSelectBox, onSelectFolder, onNewMailbox,
}) => {
  const total = Object.values(unreadPerAccount).reduce((s, n) => s + n, 0);
  return (
    <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2 sm:px-4">
      <div role="tablist" aria-label="Mailbox" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {[null, ...accounts].map((a) => {
          const id = a?.id ?? null;
          const active = boxId === id;
          const n = a ? unreadPerAccount[a.id] ?? 0 : total;
          return (
            <button
              key={id ?? 'all'}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${a ? shortAccountName(a) : 'All mailboxes'}${n > 0 ? `, ${n} unread` : ''}`}
              onClick={() => onSelectBox(id)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors',
                active ? 'border-black/[0.1] bg-white font-semibold text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'border-transparent font-medium text-black/55 hover:bg-black/[0.04]',
              )}
            >
              {a && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: a.color ?? '#9aa5b1' }} />}
              {a ? shortAccountName(a) : 'All'}
              {n > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-white">{n}</span>}
            </button>
          );
        })}
        {canCreateMailbox && (
          <button
            type="button"
            onClick={onNewMailbox}
            aria-label="New mailbox"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-black/[0.15] text-black/45 hover:text-brand-hover"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className="w-[136px] shrink-0">
        <Select
          value={folder}
          options={FOLDERS.map((f) => ({
            value: f.key,
            label: (f.key === 'all' || f.key === 'unread') && unreadInBox > 0 ? `${f.label} (${unreadInBox})` : f.label,
          }))}
          onChange={(v) => onSelectFolder(v as InboxFilter)}
          ariaLabel="Folder"
          size="lg"
        />
      </div>
    </div>
  );
};
