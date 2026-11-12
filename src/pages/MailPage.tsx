import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../lib/media/tokens.css';
import { AlertTriangle, Search, X } from '../components/media/MediaIcons';
import { MediaToaster, toast } from '../components/media/MediaToast';
import { Button } from '../components/media/MediaUI';
import { listAccounts, searchMessageIds, type EmailAccount, type InboxItem } from '../lib/mail';
import {
  forwardBlock,
  forwardSubject,
  inFolder,
  isMailFolder,
  MAIL_FOLDERS,
  matchesThreadSearch,
  quoteForReply,
  replyRecipients,
  replySubject,
  type ComposeMode,
  type MailFolder,
} from '../lib/mailThreads';
import { absoluteTime } from '../lib/mail';
import { sanitizeEmailHtml } from '../lib/mailSanitize';
import { listSources, type Source } from '../lib/sources';
import { cn } from '../lib/media/badgeColor';
import { ComposeSheet, type ComposeDraft } from './mail/ComposeSheet';
import { FOLDER_META, MailRail, RailDrawer } from './mail/MailRail';
import { MailboxAccessSheet, NewMailboxSheet } from './mail/MailboxSheets';
import { MenuIcon } from './mail/mailIcons';
import { ThreadList, ThreadListSkeleton } from './mail/ThreadList';
import { ThreadReader } from './mail/ThreadReader';
import { useMailbox, type InboxThread } from './mail/useMailbox';

/**
 * The company mail client: folders and mailboxes on the left, conversations in
 * the middle, the open conversation on the right — the Gmail and Apple Mail
 * shape. Below xl the folders move into a drawer; below lg the list and the
 * reader take turns.
 *
 * Admin only (the route is), so every mailbox is visible and every action is
 * allowed here. The Team dashboard has its own Inbox, limited by
 * email_account_access.
 */

const SOUND_KEY = 'hc:mail-sound';

/** A short two-note chime, made on the spot — no audio file to ship. */
function playChime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    setTimeout(() => { void ctx.close(); }, 1000);
  } catch {
    // Sound is a nicety; a browser that blocks it changes nothing else.
  }
}

const EMPTY_TEXT: Record<MailFolder, { title: string; hint: string }> = {
  inbox: { title: 'No mail here yet', hint: 'New mail appears the moment it arrives — no refresh needed.' },
  unread: { title: "You're all caught up", hint: 'Nothing unread in this mailbox.' },
  starred: { title: 'Nothing starred', hint: 'Star a conversation to keep it close at hand.' },
  received: { title: 'Nothing received', hint: 'Mail sent to this mailbox shows here.' },
  sent: { title: 'Nothing sent yet', hint: 'Messages you send show here.' },
  archived: { title: 'Nothing archived', hint: 'Archive a conversation to clear it from All mail without deleting it.' },
};

let draftSeq = 0;

const MailPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const folder: MailFolder = isMailFolder(params.get('folder')) ? (params.get('folder') as MailFolder) : 'inbox';
  const boxParam = params.get('box');
  const sourceId = params.get('source');

  const [accounts, setAccounts] = useState<EmailAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [search, setSearch] = useState('');
  const [bodyMatches, setBodyMatches] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<ComposeDraft | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [newMailboxOpen, setNewMailboxOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<InboxThread | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(SOUND_KEY) === 'on');
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const loadAccounts = useCallback(async () => {
    try {
      const rows = await listAccounts();
      setAccounts(rows);
      setAccountsError(null);
      return rows;
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'Could not load mailboxes.');
      setAccounts((current) => current ?? []);
      return null;
    }
  }, []);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);
  useEffect(() => {
    let active = true;
    listSources().then((rows) => { if (active) setSources(rows); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const accountsById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);
  const accountId = boxParam && accountsById.has(boxParam) ? boxParam : null;

  const update = useCallback((changes: Record<string, string | null>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
      return next;
    }, { replace: true });
  }, [setParams]);

  const openThreadRef = useRef<(key: string) => void>(() => undefined);

  const onNewMail = useCallback((arrived: InboxItem[]) => {
    const first = arrived[0];
    const from = first.fromName || first.fromEmail || 'someone';
    const text = arrived.length === 1
      ? `New mail from ${from}${first.subject ? ` — ${first.subject}` : ''}`
      : `${arrived.length} new messages`;
    toast.success(text, { label: 'Open', onClick: () => openThreadRef.current(first.id) });
    if (soundRef.current) playChime();
  }, []);

  const mail = useMailbox(null, { ready: accounts !== null, onNewMail });

  // ── What's shown ──────────────────────────────────────────────────────────
  const scoped = useMemo(() => mail.threads.filter((t) => (
    (!accountId || t.accountIds.includes(accountId)) && (!sourceId || t.sourceIds.includes(sourceId))
  )), [mail.threads, accountId, sourceId]);

  const folderCounts = useMemo(() => {
    const counts: Partial<Record<MailFolder, number>> = {};
    counts.unread = scoped.filter((t) => inFolder(t, 'unread')).length;
    counts.inbox = counts.unread;
    return counts;
  }, [scoped]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 3) { setBodyMatches(new Set()); return undefined; }
    let active = true;
    const timer = setTimeout(() => {
      searchMessageIds(q, null).then((ids) => { if (active) setBodyMatches(ids); }).catch(() => undefined);
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);

  const visible = useMemo(() => scoped.filter((t) => inFolder(t, folder) && (
    matchesThreadSearch(t, search) || t.messages.some((m) => bodyMatches.has(m.id))
  )), [scoped, folder, search, bodyMatches]);

  const selected = useMemo(() => mail.threads.find((t) => t.key === selectedKey) ?? null, [mail.threads, selectedKey]);

  // ── Opening ───────────────────────────────────────────────────────────────
  const { loadBodies, markThreadRead } = mail;
  const openThread = useCallback((thread: InboxThread) => {
    setSelectedKey(thread.key);
    loadBodies(thread).catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not open the conversation.'));
    if (thread.unread > 0) markThreadRead(thread).catch(() => undefined);
  }, [loadBodies, markThreadRead]);

  openThreadRef.current = (messageId: string) => {
    const thread = mail.threads.find((t) => t.messages.some((m) => m.id === messageId));
    if (thread) openThread(thread);
  };

  // A thread that grew (a new reply) keeps its bodies complete.
  useEffect(() => {
    if (selected) loadBodies(selected).catch(() => undefined);
  }, [selected, loadBodies]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const fail = (err: unknown, fallback: string) => toast.error(err instanceof Error ? err.message : fallback);

  const archive = (thread: InboxThread) => {
    const next = !thread.archived;
    mail.setThreadArchived(thread, next)
      .then(() => toast.success(next ? 'Conversation archived' : 'Moved back to All mail', { label: 'Undo', onClick: () => { mail.setThreadArchived(thread, !next).catch(() => undefined); } }))
      .catch((err) => fail(err, 'Could not archive.'));
    if (next && folder !== 'archived' && folder !== 'starred' && folder !== 'sent') setSelectedKey(null);
  };

  const markUnread = (thread: InboxThread) => {
    mail.markThreadUnread(thread).catch((err) => fail(err, 'Could not mark as unread.'));
    setSelectedKey(null);
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await mail.deleteThread(confirmDelete);
      if (selectedKey === confirmDelete.key) setSelectedKey(null);
      toast.success('Conversation deleted');
      setConfirmDelete(null);
    } catch (err) {
      fail(err, 'Could not delete.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Compose ───────────────────────────────────────────────────────────────
  const ownAddresses = useMemo(() => (accounts ?? []).map((a) => a.emailAddress), [accounts]);

  const startCompose = useCallback((mode: ComposeMode, item?: InboxItem, preset?: Partial<ComposeDraft>) => {
    draftSeq += 1;
    if (mode === 'new' || !item) {
      setDraft({
        id: draftSeq, mode: 'new', accountId: accountId ?? null, to: '', cc: '', subject: '', initialHtml: '',
        threadKey: null, inReplyTo: null, sourceId: sourceId ?? null, contactId: null, ...preset,
      });
      return;
    }
    const body = mail.bodies[item.id];
    const source = {
      fromName: item.direction === 'outbound' ? (accountsById.get(item.accountId ?? '')?.label ?? null) : item.fromName,
      fromEmail: item.direction === 'outbound' ? (accountsById.get(item.accountId ?? '')?.emailAddress ?? null) : item.fromEmail,
      toEmails: item.toEmails,
      ccEmails: body?.ccEmails ?? [],
      subject: item.subject,
      dateLabel: absoluteTime(item.emailDate),
      html: body?.bodyHtml ? sanitizeEmailHtml(body.bodyHtml) : null,
      text: body?.bodyText ?? item.preview,
    };
    if (mode === 'forward') {
      setDraft({
        id: draftSeq, mode, accountId: item.accountId, to: '', cc: '', subject: forwardSubject(item.subject),
        initialHtml: forwardBlock(source), threadKey: null, inReplyTo: null, sourceId: item.sourceId, contactId: null,
      });
      return;
    }
    const recipients = replyRecipients({ direction: item.direction, fromEmail: item.fromEmail, toEmails: item.toEmails, ccEmails: body?.ccEmails ?? [] }, ownAddresses, mode);
    setDraft({
      id: draftSeq, mode, accountId: item.accountId,
      to: recipients.to.join(', '), cc: recipients.cc.join(', '),
      subject: replySubject(item.subject),
      initialHtml: quoteForReply(source),
      threadKey: item.threadKey ?? item.id, inReplyTo: body?.messageId ?? item.messageId,
      sourceId: item.sourceId, contactId: item.contactId,
    });
  }, [mail.bodies, accountsById, ownAddresses, accountId, sourceId]);

  // Sources hands an address over as ?to=…&subject=…&account=<slug>.
  useEffect(() => {
    if (!accounts) return;
    const to = params.get('to');
    if (!to) return;
    const slug = params.get('account');
    const matched = slug ? accounts.find((a) => a.slug === slug) : undefined;
    startCompose('new', undefined, { to, subject: params.get('subject') ?? '', accountId: matched?.id ?? null });
    update({ to: null, subject: null, account: null });
  }, [accounts, params, startCompose, update]);

  // ── Layout ────────────────────────────────────────────────────────────────
  const sourceOptions = useMemo(() => [{ value: '', label: 'All sources' }, ...sources.map((s) => ({ value: s.id, label: s.name }))], [sources]);

  const rail = (
    <MailRail
      folder={folder}
      folderCounts={folderCounts}
      accounts={accounts ?? []}
      accountId={accountId}
      unreadPerAccount={mail.unreadPerAccount}
      sourceOptions={sourceOptions}
      sourceId={sourceId}
      canCompose={(accounts ?? []).length > 0}
      isAdmin
      soundOn={soundOn}
      onFolder={(next) => { update({ folder: next === 'inbox' ? null : next }); setSelectedKey(null); setRailOpen(false); }}
      onAccount={(next) => { update({ box: next }); setSelectedKey(null); setRailOpen(false); }}
      onSource={(next) => { update({ source: next }); setSelectedKey(null); }}
      onCompose={() => { setRailOpen(false); startCompose('new'); }}
      onNewMailbox={() => { setRailOpen(false); setNewMailboxOpen(true); }}
      onManageAccess={() => { setRailOpen(false); setAccessOpen(true); }}
      onToggleSound={() => {
        const next = !soundOn;
        localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
        setSoundOn(next);
        if (next) playChime();
      }}
    />
  );

  const currentAccount = accountId ? accountsById.get(accountId) : undefined;
  const heading = currentAccount
    ? (currentAccount.label?.split(/\s[—-]\s/).pop() || currentAccount.emailAddress)
    : FOLDER_META[folder].label;
  const error = accountsError ?? mail.error;

  return (
    <div className="media-scope flex h-full min-h-0 flex-col bg-white">
      <MediaToaster />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] xl:grid-cols-[236px_minmax(320px,380px)_minmax(0,1fr)]">
        {/* ── Folders and mailboxes ───────────────────────────────────── */}
        <aside className="hidden min-h-0 border-e border-black/[0.06] bg-[#FAFBFC] xl:block">{rail}</aside>
        <RailDrawer open={railOpen} onClose={() => setRailOpen(false)}>{rail}</RailDrawer>

        {/* ── Conversations ───────────────────────────────────────────── */}
        <section aria-label="Conversations" className={cn('min-h-0 flex-col border-black/[0.06] lg:flex lg:border-e', selected ? 'hidden' : 'flex')}>
          <header className="border-b border-black/[0.06] px-3 pb-3 pt-3 sm:px-4">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setRailOpen(true)} aria-label="Folders and mailboxes" className="grid h-10 w-10 place-items-center rounded-lg text-black/55 hover:bg-black/[0.05] xl:hidden">
                <MenuIcon size={18} />
              </button>
              <div className="min-w-0 flex-1 px-1">
                <h1 className="truncate text-[17px] font-semibold tracking-[-0.015em] text-foreground sm:text-[18px]">{heading}</h1>
                <p className="truncate text-[11.5px] text-black/45">
                  {currentAccount ? `${FOLDER_META[folder].label} · ${currentAccount.emailAddress}` : `${visible.length} ${visible.length === 1 ? 'conversation' : 'conversations'}`}
                </p>
              </div>
              {(accounts ?? []).length > 0 && (
                <Button size="lg" className="!h-10 xl:hidden" onClick={() => startCompose('new')}>Compose</Button>
              )}
            </div>
            <div className="relative mt-2.5">
              <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-black/35" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subject, people, text, source…"
                aria-label="Search mail"
                className="h-11 w-full rounded-xl border border-transparent bg-black/[0.045] pe-10 ps-9 text-[13.5px] outline-none transition-colors placeholder:text-black/40 focus:border-primary focus:bg-white focus:ring-[3px] focus:ring-primary/20 md:h-10"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute end-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-black/40 hover:bg-black/[0.05] md:h-8 md:w-8">
                  <X size={14} />
                </button>
              )}
            </div>
            {/* Folders stay one tap away where the rail is a drawer. */}
            <div className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 xl:hidden" role="group" aria-label="Folder">
              {MAIL_FOLDERS.map((key) => {
                const active = key === folder;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => { update({ folder: key === 'inbox' ? null : key }); setSelectedKey(null); }}
                    className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors', active ? 'bg-primary/[0.12] font-semibold text-brand-strong' : 'font-medium text-black/55 hover:bg-black/[0.04]')}
                  >
                    {FOLDER_META[key].label}
                    {key === 'unread' && (folderCounts.unread ?? 0) > 0 && <span className="text-[11px] tabular-nums">{folderCounts.unread}</span>}
                  </button>
                );
              })}
            </div>
          </header>

          {error && (
            <div role="alert" className="mx-3 mt-3 flex items-start gap-2 rounded-xl border border-[#d4183d]/20 bg-[#d4183d]/[0.05] p-3 sm:mx-4">
              <AlertTriangle size={15} className="mt-px shrink-0 text-[#d4183d]" />
              <span className="flex-1 text-[12.5px] text-[#b3122f]">{error}</span>
              <button type="button" onClick={() => { void loadAccounts(); void mail.reload(); }} className="h-8 rounded-lg px-2.5 text-[12.5px] font-medium text-[#b3122f] hover:bg-[#d4183d]/10">Retry</button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {mail.loading ? <ThreadListSkeleton /> : (
              <ThreadList
                threads={visible}
                selectedKey={selectedKey}
                accountsById={accountsById}
                showAccount={!accountId && (accounts ?? []).length > 1}
                emptyTitle={search ? 'No matches' : EMPTY_TEXT[folder].title}
                emptyHint={search ? 'Try another word, a name or an address.' : EMPTY_TEXT[folder].hint}
                onOpen={openThread}
                onStar={(thread) => mail.toggleThreadStar(thread).catch((err) => fail(err, 'Could not star.'))}
              />
            )}
          </div>
        </section>

        {/* ── Reader ──────────────────────────────────────────────────── */}
        <section aria-label="Conversation" className={cn('min-h-0 overflow-y-auto bg-white lg:block', selected ? 'block' : 'hidden')}>
          <ThreadReader
            thread={selected}
            bodies={mail.bodies}
            accountsById={accountsById}
            canSend
            canDelete
            onBack={() => setSelectedKey(null)}
            onArchive={archive}
            onDelete={setConfirmDelete}
            onMarkUnread={markUnread}
            onStarThread={(thread) => mail.toggleThreadStar(thread).catch((err) => fail(err, 'Could not star.'))}
            onStarMessage={(item) => mail.toggleStar(item).catch((err) => fail(err, 'Could not star.'))}
            onCompose={(mode, item) => startCompose(mode, item)}
            sourceOptions={sources.map((s) => ({ value: s.id, label: s.name }))}
            onLinkSource={(thread, id) => {
              const name = sources.find((s) => s.id === id)?.name ?? null;
              mail.linkThreadSource(thread, id, name)
                .then(() => toast.success(`Linked to ${name ?? 'the source'}`))
                .catch((err) => fail(err, 'Could not link.'));
            }}
          />
        </section>
      </div>

      <ComposeSheet
        draft={draft}
        sendableAccounts={accounts ?? []}
        onClose={() => setDraft(null)}
        onSent={(from) => { toast.success(`Sent from ${from}`); void mail.reload(); }}
      />

      <NewMailboxSheet
        open={newMailboxOpen}
        onClose={() => setNewMailboxOpen(false)}
        onCreated={(created) => {
          toast.success(`${created.email} is ready`);
          void loadAccounts().then(() => { update({ box: created.id, folder: null }); setSelectedKey(null); });
        }}
      />

      <MailboxAccessSheet
        open={accessOpen}
        accounts={accounts ?? []}
        initialAccountId={accountId}
        onClose={() => setAccessOpen(false)}
      />

      <ConfirmDelete
        thread={confirmDelete}
        busy={deleting}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
};

const ConfirmDelete: React.FC<{ thread: InboxThread | null; busy: boolean; onCancel: () => void; onConfirm: () => void }> = ({ thread, busy, onCancel, onConfirm }) => {
  useEffect(() => {
    if (!thread) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [thread, busy, onCancel]);
  if (!thread) return null;
  const count = thread.messages.length;
  return (
    <div className="media-scope fixed inset-0 z-[9999] grid place-items-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="mail-delete-title">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full max-w-[400px] rounded-2xl bg-white p-5 shadow-[0_20px_60px_rgb(0_0_0/0.2)]">
        <h2 id="mail-delete-title" className="text-[16px] font-semibold text-foreground">Delete this conversation?</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-black/55">
          {count === 1 ? 'The message is' : `All ${count} messages are`} removed for everyone, for good. Archive keeps it out of the way instead.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="lg" className="!h-11 md:!h-10" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger" size="lg" className="!h-11 md:!h-10" onClick={onConfirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Button>
        </div>
      </div>
    </div>
  );
};

export default MailPage;
