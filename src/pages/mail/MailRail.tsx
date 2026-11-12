import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ArrowDown, Pencil, Plus, X } from '../../components/media/MediaIcons';
import { Select } from '../../components/media/MediaUI';
import { shortAccountName, type EmailAccount } from '../../lib/mail';
import type { MailFolder } from '../../lib/mailThreads';
import { cn } from '../../lib/media/badgeColor';
import {
  ArchiveIcon,
  BellIcon,
  BellOffIcon,
  InboxIcon,
  MailUnreadIcon,
  SendIcon,
  StarIcon,
  UsersIcon,
} from './mailIcons';

export const FOLDER_META: Record<MailFolder, { label: string; Icon: React.FC<{ size?: number; className?: string }> }> = {
  inbox: { label: 'All mail', Icon: InboxIcon },
  unread: { label: 'Unread', Icon: MailUnreadIcon },
  starred: { label: 'Starred', Icon: StarIcon },
  received: { label: 'Received', Icon: ArrowDown },
  sent: { label: 'Sent', Icon: SendIcon },
  archived: { label: 'Archived', Icon: ArchiveIcon },
};

const RAIL_FOLDERS: MailFolder[] = ['inbox', 'unread', 'starred', 'received', 'sent', 'archived'];

const ITEM = 'flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:min-h-[38px]';

export interface MailRailProps {
  folder: MailFolder;
  folderCounts: Partial<Record<MailFolder, number>>;
  accounts: EmailAccount[];
  accountId: string | null;
  unreadPerAccount: Record<string, number>;
  sourceOptions: Array<{ value: string; label: string }> | null;
  sourceId: string | null;
  canCompose: boolean;
  isAdmin: boolean;
  soundOn: boolean;
  onFolder: (folder: MailFolder) => void;
  onAccount: (accountId: string | null) => void;
  onSource: (sourceId: string | null) => void;
  onCompose: () => void;
  onNewMailbox: () => void;
  onManageAccess: () => void;
  onToggleSound: () => void;
}

export const MailRail: React.FC<MailRailProps> = ({
  folder, folderCounts, accounts, accountId, unreadPerAccount, sourceOptions, sourceId,
  canCompose, isAdmin, soundOn,
  onFolder, onAccount, onSource, onCompose, onNewMailbox, onManageAccess, onToggleSound,
}) => {
  const totalUnread = Object.values(unreadPerAccount).reduce((sum, n) => sum + n, 0);
  return (
    <nav aria-label="Mail folders" className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4">
      {canCompose && (
        <button
          type="button"
          onClick={onCompose}
          className="flex h-12 items-center gap-2.5 self-start rounded-2xl bg-[var(--btn-primary-bg)] pe-5 ps-4 text-[14px] font-semibold text-white shadow-[0_2px_10px_rgb(110_164_231/0.35)] transition-colors hover:bg-[var(--btn-primary-hover)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40"
        >
          <Pencil size={16} /> Compose
        </button>
      )}

      <ul className="flex flex-col gap-0.5">
        {RAIL_FOLDERS.map((key) => {
          const { label, Icon } = FOLDER_META[key];
          const active = folder === key;
          const count = folderCounts[key] ?? 0;
          return (
            <li key={key}>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onFolder(key)}
                className={cn(ITEM, active ? 'bg-primary/[0.12] font-semibold text-brand-strong' : 'font-medium text-black/65 hover:bg-black/[0.04]')}
              >
                <Icon size={17} className={active ? 'text-brand-strong' : 'text-black/45'} />
                <span className="flex-1 truncate">{label}</span>
                {count > 0 && <span className={cn('text-[12px] tabular-nums', active ? 'font-semibold' : 'font-medium text-black/50')}>{count}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <div>
        <div className="mb-1.5 flex items-center justify-between px-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-black/40">Mailboxes</span>
          {isAdmin && (
            <button type="button" onClick={onNewMailbox} aria-label="New mailbox" title="New mailbox" className="grid h-8 w-8 place-items-center rounded-lg text-black/45 hover:bg-black/[0.05] hover:text-brand-strong">
              <Plus size={15} />
            </button>
          )}
        </div>
        <ul className="flex flex-col gap-0.5">
          {accounts.length > 1 && (
            <li>
              <button
                type="button"
                aria-current={accountId === null ? 'true' : undefined}
                onClick={() => onAccount(null)}
                className={cn(ITEM, accountId === null ? 'bg-black/[0.05] font-semibold text-foreground' : 'font-medium text-black/65 hover:bg-black/[0.04]')}
              >
                <span aria-hidden="true" className="flex h-[17px] w-[17px] items-center justify-center -space-x-1">
                  {accounts.slice(0, 3).map((a) => (
                    <span key={a.id} className="h-2 w-2 rounded-full ring-1 ring-white" style={{ backgroundColor: a.color ?? '#9aa5b1' }} />
                  ))}
                </span>
                <span className="flex-1 truncate">All mailboxes</span>
                {totalUnread > 0 && <span className="text-[12px] font-semibold tabular-nums text-brand-strong">{totalUnread}</span>}
              </button>
            </li>
          )}
          {accounts.map((account) => {
            const active = accountId === account.id;
            const unread = unreadPerAccount[account.id] ?? 0;
            return (
              <li key={account.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onAccount(account.id)}
                  title={account.emailAddress}
                  className={cn(ITEM, active ? 'font-semibold text-foreground' : 'font-medium text-black/65 hover:bg-black/[0.04]')}
                  style={active ? { backgroundColor: `${account.color ?? '#9aa5b1'}22` } : undefined}
                >
                  <span aria-hidden="true" className="grid h-[17px] w-[17px] place-items-center">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: account.color ?? '#9aa5b1' }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{account.label?.split(/\s[—-]\s/).pop() || shortAccountName(account)}</span>
                    <span className="block truncate text-[11px] font-normal text-black/40">{account.emailAddress}</span>
                  </span>
                  {unread > 0 && (
                    <span className="min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums text-white" style={{ backgroundColor: account.color ?? '#6ea4e7' }}>
                      {unread}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {accounts.length === 0 && (
            <li className="px-3 py-2 text-[12.5px] text-black/40">No mailboxes yet.</li>
          )}
        </ul>
      </div>

      {sourceOptions && sourceOptions.length > 1 && (
        <div className="px-1">
          <div className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-black/40">Source</div>
          <Select value={sourceId ?? ''} options={sourceOptions} onChange={(value) => onSource(value || null)} ariaLabel="Filter by source" size="lg" />
        </div>
      )}

      <div className="mt-auto flex flex-col gap-0.5 border-t border-black/[0.06] pt-3">
        {isAdmin && (
          <button type="button" onClick={onManageAccess} className={cn(ITEM, 'font-medium text-black/65 hover:bg-black/[0.04]')}>
            <UsersIcon size={17} className="text-black/45" />
            <span className="flex-1">Team access</span>
          </button>
        )}
        <button type="button" onClick={onToggleSound} aria-pressed={soundOn} className={cn(ITEM, 'font-medium text-black/65 hover:bg-black/[0.04]')}>
          {soundOn ? <BellIcon size={17} className="text-brand-strong" /> : <BellOffIcon size={17} className="text-black/45" />}
          <span className="flex-1">{soundOn ? 'Sound on new mail' : 'Sound off'}</span>
        </button>
      </div>
    </nav>
  );
};

/** The rail as a drawer from the start edge, where there's no room for it beside the list. */
export const RailDrawer: React.FC<{ open: boolean; onClose: () => void; children: React.ReactNode }> = ({ open, onClose, children }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="media-scope fixed inset-0 z-[9990] xl:hidden" role="dialog" aria-modal="true" aria-label="Mail folders">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute inset-y-0 start-0 flex w-[min(300px,86vw)] flex-col bg-white shadow-[0_10px_40px_rgb(0_0_0/0.18)]" style={{ animation: 'm-fade-in 150ms ease-out' }}>
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="text-[15px] font-semibold text-foreground">Mail</span>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-lg text-black/50 hover:bg-black/[0.05]"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
};
