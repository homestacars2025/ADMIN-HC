import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../lib/media/tokens.css';
import { cn } from '../lib/media/badgeColor';
import {
  absoluteTime,
  assignSource,
  deleteMessages,
  getBodies,
  getThread,
  inboundSince,
  latestInboundAt,
  listAccounts,
  listInbox,
  setArchivedMany,
  setReadMany,
  setStarred,
  subscribeToMail,
  unreadByAccount,
  type CreatedMailbox,
  type EmailAccount,
  type EmailBody,
  type InboxFilter,
  type InboxItem,
} from '../lib/mail';
import {
  groupConversations,
  quoteBlock,
  replyRecipients,
  replySubject,
  textToHtml,
  type Conversation,
  type ReplyMode,
} from '../lib/mailThreads';
import { sanitizeOutgoingHtml } from '../lib/sanitizeEmail';
import { listSources, type Source } from '../lib/sources';
import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { AlertTriangle, Search, X } from '../components/media/MediaIcons';
import { PageHeader } from '../components/media/MediaShared';
import { Button, Select } from '../components/media/MediaUI';
import { ConfirmDialog, type ConfirmState } from '../components/media/ConfirmDialog';
import ConversationList from '../components/mail/ConversationList';
import ConversationReader from '../components/mail/ConversationReader';
import Composer, { NEW_DRAFT, type ComposeDraft } from '../components/mail/Composer';
import NewMailboxSheet from '../components/mail/NewMailboxSheet';
import { FOLDERS, MailSidebar, MailToolbarCompact } from '../components/mail/MailSidebar';
import { ComposeIcon, RefreshIcon } from '../components/mail/MailIcons';

/**
 * Mail — a three-column mail client over `email_messages`.
 *
 * Mailboxes and folders on the left, conversations in the middle, the open
 * thread on the right. Below `xl` the left column folds into a chip row; below
 * `lg` the list and the reader take turns.
 *
 * Live updates: `email_messages` is not in the realtime publication today, so
 * the page polls a tiny "anything new since…" query every 30 s while the tab is
 * visible, and checks at once when the tab comes back. The realtime
 * subscription stays wired, so adding the table to the publication makes new
 * mail appear instantly with no change here.
 *
 * Mailbox and folder live in the URL (`?box=…&folder=unread`), so refresh and
 * back keep them.
 */

const POLL_MS = 30_000;
const SOUND_KEY = 'mail.sound';
const FOLDER_KEYS = new Set<string>(FOLDERS.map((f) => f.key));

const EMPTY_HINT: Record<InboxFilter, string> = {
  all: 'New mail appears here as soon as it arrives.',
  unread: 'You are all caught up.',
  starred: 'Star a conversation to keep it here.',
  inbound: 'Nothing received yet.',
  outbound: 'Nothing sent from here yet.',
  archived: 'Archived conversations land here.',
};

/** A short two-note chime, generated so there is no audio file to ship. */
function playChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.12;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    // Audio is a nicety; a blocked context must not break the page.
  }
}

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'bad' | 'mail';
  action?: { label: string; run: () => void };
}

function matches(m: InboxItem, q: string): boolean {
  return [m.subject, m.fromName, m.fromEmail, m.preview, m.sourceName, m.contactName, m.accountLabel, m.accountEmail, ...m.toEmails]
    .some((v) => (v ?? '').toLowerCase().includes(q));
}

const MailPage: React.FC = () => {
  const { profile } = useCurrentProfile();
  const canCreateMailbox = profile?.role === 'admin';

  const [searchParams, setSearchParams] = useSearchParams();
  const boxId = searchParams.get('box');
  const folderParam = searchParams.get('folder') ?? 'all';
  const folder: InboxFilter = FOLDER_KEYS.has(folderParam) ? (folderParam as InboxFilter) : 'all';

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [unreadPerAccount, setUnreadPerAccount] = useState<Record<string, number>>({});
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // The open conversation is remembered by one of its message ids, so it stays
  // open across reloads even if an older message joins it.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [thread, setThread] = useState<InboxItem[]>([]);
  const [bodies, setBodies] = useState<Record<string, EmailBody>>({});
  const [readerLoading, setReaderLoading] = useState(false);

  const [draft, setDraft] = useState<ComposeDraft | null>(null);
  const [draftSeq, setDraftSeq] = useState(0);
  const [newMailboxOpen, setNewMailboxOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [soundOn, setSoundOn] = useState(() => {
    try { return window.localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; }
  });

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = useCallback((t: Omit<Toast, 'id'>) => {
    window.clearTimeout(toastTimer.current);
    setToast({ ...t, id: Date.now() });
    toastTimer.current = window.setTimeout(() => mounted.current && setToast(null), t.action ? 6000 : 3500);
  }, []);

  const setParam = useCallback((key: 'box' | 'folder', value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && !(key === 'folder' && value === 'all')) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
    setAnchorId(null);
  }, [setSearchParams]);

  // ── Loading ──────────────────────────────────────────────────────────────

  const loadSeq = useRef(0);
  const load = useCallback(async (quiet = false) => {
    const seq = ++loadSeq.current;
    if (!quiet) setLoading(true);
    try {
      const [rows, unread] = await Promise.all([
        listInbox(folder, sourceFilter, boxId),
        unreadByAccount().catch(() => null),
      ]);
      // A slower, older request must not overwrite a newer folder's rows.
      if (!mounted.current || seq !== loadSeq.current) return;
      setItems(rows);
      if (unread) setUnreadPerAccount(unread);
      setError(null);
    } catch (err) {
      if (mounted.current && seq === loadSeq.current) setError(err instanceof Error ? err.message : 'Could not load mail.');
    } finally {
      if (mounted.current && seq === loadSeq.current) setLoading(false);
    }
  }, [folder, sourceFilter, boxId]);

  useEffect(() => { void load(); }, [load]);

  const loadAccounts = useCallback(async () => {
    const list = await listAccounts();
    if (mounted.current) setAccounts(list);
    return list;
  }, []);

  useEffect(() => {
    loadAccounts().catch((err) => mounted.current && setError(err instanceof Error ? err.message : 'Could not load mailboxes.'));
    listSources().then((s) => mounted.current && setSources(s)).catch(() => {});
  }, [loadAccounts]);

  // ── New mail ─────────────────────────────────────────────────────────────

  // Null until the database says where "new" starts.
  const since = useRef<string | null>(null);
  useEffect(() => {
    latestInboundAt()
      .then((at) => { since.current = at ?? new Date(0).toISOString(); })
      .catch(() => { since.current = new Date().toISOString(); });
  }, []);
  const loadRef = useRef(load);
  loadRef.current = load;
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const openByIdRef = useRef<(id: string) => void>(() => {});

  const checkForNew = useCallback(async () => {
    if (!since.current) return;
    try {
      const fresh = await inboundSince(since.current);
      if (!mounted.current || fresh.length === 0) return;
      since.current = fresh[fresh.length - 1].createdAt;
      const last = fresh[fresh.length - 1];
      const box = accountsRef.current.find((a) => a.id === last.accountId);
      const who = last.fromName || last.fromEmail || 'someone';
      showToast({
        tone: 'mail',
        text: fresh.length === 1
          ? `New mail from ${who}${box ? ` · ${box.emailAddress}` : ''}: ${last.subject || '(no subject)'}`
          : `${fresh.length} new messages, latest from ${who}`,
        action: { label: 'Open', run: () => openByIdRef.current(last.id) },
      });
      if (soundRef.current) playChime();
      void loadRef.current(true);
    } catch {
      // The next tick tries again.
    }
  }, [showToast]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void checkForNew(); };
    const timer = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void checkForNew();
      void loadRef.current(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    const stop = subscribeToMail(() => { void checkForNew(); void loadRef.current(true); });
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      stop();
    };
  }, [checkForNew]);

  /**
   * Sources hands an address over as `?to=…&subject=…&account=<slug>`. It waits
   * for the mailboxes so the slug resolves to an id, then clears the params so
   * a refresh does not reopen the composer.
   */
  useEffect(() => {
    if (accounts.length === 0) return;
    const to = searchParams.get('to');
    if (!to) return;
    const slug = searchParams.get('account');
    const matched = slug ? accounts.find((a) => a.slug === slug) : undefined;
    setDraft({ ...NEW_DRAFT, to: [to], subject: searchParams.get('subject') ?? '', accountId: matched?.id ?? null });
    setDraftSeq((n) => n + 1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      ['to', 'subject', 'account'].forEach((k) => next.delete(k));
      return next;
    }, { replace: true });
  }, [accounts, searchParams, setSearchParams]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const conversations = useMemo(() => groupConversations(items), [items]);

  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () => (query ? conversations.filter((c) => c.messages.some((m) => matches(m, query))) : conversations),
    [conversations, query],
  );

  const selected = useMemo(
    () => (anchorId ? conversations.find((c) => c.messages.some((m) => m.id === anchorId)) ?? null : null),
    [conversations, anchorId],
  );

  /** The reader shows the whole thread, including messages outside the current folder. */
  const readerMessages = useMemo(() => {
    if (!anchorId) return [];
    const byId = new Map<string, InboxItem>();
    thread.forEach((m) => byId.set(m.id, m));
    selected?.messages.forEach((m) => byId.set(m.id, { ...byId.get(m.id), ...m }));
    return Array.from(byId.values()).sort((a, b) => (Date.parse(a.emailDate ?? '') || 0) - (Date.parse(b.emailDate ?? '') || 0));
  }, [anchorId, thread, selected]);

  const ownAddresses = useMemo(() => accounts.map((a) => a.emailAddress), [accounts]);
  const unreadInBox = boxId ? unreadPerAccount[boxId] ?? 0 : Object.values(unreadPerAccount).reduce((s, n) => s + n, 0);
  const domain = accounts.find((a) => a.isDefault)?.emailAddress.split('@')[1] ?? accounts[0]?.emailAddress.split('@')[1] ?? 'homestacars.com';

  const patchLocal = useCallback((ids: readonly string[], fields: Partial<InboxItem>) => {
    const set = new Set(ids);
    const apply = (m: InboxItem) => (set.has(m.id) ? { ...m, ...fields } : m);
    setItems((prev) => prev.map(apply));
    setThread((prev) => prev.map(apply));
  }, []);

  const refreshUnread = useCallback(() => {
    unreadByAccount().then((u) => mounted.current && setUnreadPerAccount(u)).catch(() => {});
  }, []);

  // ── Opening ──────────────────────────────────────────────────────────────

  const openConversation = useCallback(async (conversation: Conversation) => {
    const latest = conversation.latest;
    setAnchorId(latest.id);
    setThread(conversation.messages);
    setBodies({});
    setReaderLoading(true);
    try {
      const full = latest.threadKey ? await getThread(latest.threadKey) : conversation.messages;
      const merged = new Map<string, InboxItem>();
      [...full, ...conversation.messages].forEach((m) => merged.set(m.id, m));
      const all = Array.from(merged.values());
      const loaded = await getBodies(all.map((m) => m.id));
      if (!mounted.current) return;
      setThread(all);
      setBodies(loaded);

      const unreadIds = all.filter((m) => m.direction === 'inbound' && !m.isRead).map((m) => m.id);
      if (unreadIds.length) {
        patchLocal(unreadIds, { isRead: true });
        await setReadMany(unreadIds, true);
        refreshUnread();
      }
    } catch (err) {
      if (mounted.current) showToast({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not open the conversation.' });
    } finally {
      if (mounted.current) setReaderLoading(false);
    }
  }, [patchLocal, refreshUnread, showToast]);

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  openByIdRef.current = (id: string) => {
    const found = conversationsRef.current.find((c) => c.messages.some((m) => m.id === id));
    if (found) void openConversation(found);
    else {
      // Not in this folder or mailbox: widen to all mail first.
      setSearchParams(new URLSearchParams(), { replace: true });
      setSourceFilter(null);
      setSearch('');
      setAnchorId(id);
    }
  };

  // After widening to all mail, open the message the toast pointed at.
  useEffect(() => {
    if (!anchorId || loading || thread.length) return;
    const found = conversations.find((c) => c.messages.some((m) => m.id === anchorId));
    if (found) void openConversation(found);
  }, [anchorId, loading, thread.length, conversations, openConversation]);

  const closeReader = useCallback(() => { setAnchorId(null); setThread([]); setBodies({}); }, []);

  // ── Actions ──────────────────────────────────────────────────────────────

  const toggleStarMessage = useCallback(async (m: InboxItem) => {
    const next = !m.isStarred;
    patchLocal([m.id], { isStarred: next });
    try { await setStarred(m.id, next); }
    catch (err) {
      patchLocal([m.id], { isStarred: m.isStarred });
      showToast({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not update.' });
    }
  }, [patchLocal, showToast]);

  /** A conversation's star: clears every star in it, or stars its newest message. */
  const toggleStarConversation = useCallback(async (c: Conversation) => {
    const ids = c.starred ? c.messages.filter((m) => m.isStarred).map((m) => m.id) : [c.latest.id];
    patchLocal(ids, { isStarred: !c.starred });
    try { await Promise.all(ids.map((id) => setStarred(id, !c.starred))); }
    catch (err) {
      patchLocal(ids, { isStarred: c.starred });
      showToast({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not update.' });
    }
  }, [patchLocal, showToast]);

  const archive = useCallback(async () => {
    const ids = readerMessages.map((m) => m.id);
    if (!ids.length) return;
    const next = !readerMessages.every((m) => m.isArchived);
    try {
      await setArchivedMany(ids, next);
      closeReader();
      void load(true);
      showToast({
        tone: 'ok',
        text: next ? 'Conversation archived.' : 'Moved back to the inbox.',
        action: {
          label: 'Undo',
          run: () => { void setArchivedMany(ids, !next).then(() => load(true)); },
        },
      });
    } catch (err) {
      showToast({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not archive.' });
    }
  }, [readerMessages, closeReader, load, showToast]);

  const askDelete = useCallback(() => {
    const ids = readerMessages.map((m) => m.id);
    if (!ids.length) return;
    setConfirm({
      title: 'Delete this conversation?',
      description: ids.length === 1
        ? 'The message is deleted permanently. Archive it instead if you may need it later.'
        : `All ${ids.length} messages in it are deleted permanently. Archive it instead if you may need it later.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        await deleteMessages(ids);
        closeReader();
        void load(true);
        refreshUnread();
        showToast({ tone: 'ok', text: ids.length === 1 ? 'Message deleted.' : 'Conversation deleted.' });
      },
    });
  }, [readerMessages, closeReader, load, refreshUnread, showToast]);

  const runConfirm = useCallback(async () => {
    if (!confirm) return;
    setConfirmPending(true);
    try {
      await confirm.onConfirm();
      setConfirm(null);
    } catch (err) {
      showToast({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not delete.' });
    } finally {
      setConfirmPending(false);
    }
  }, [confirm, showToast]);

  const markUnread = useCallback(async () => {
    const target = [...readerMessages].reverse().find((m) => m.direction === 'inbound');
    if (!target) { showToast({ tone: 'bad', text: 'Only received mail can be marked unread.' }); return; }
    try {
      await setReadMany([target.id], false);
      patchLocal([target.id], { isRead: false });
      closeReader();
      refreshUnread();
    } catch (err) {
      showToast({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not update.' });
    }
  }, [readerMessages, patchLocal, closeReader, refreshUnread, showToast]);

  const linkSource = useCallback(async (sourceId: string) => {
    const s = sources.find((x) => x.id === sourceId);
    try {
      await Promise.all(readerMessages.map((m) => assignSource(m.id, sourceId)));
      patchLocal(readerMessages.map((m) => m.id), { sourceId, sourceName: s?.name ?? null, sourcePriority: s?.priority ?? null });
      showToast({ tone: 'ok', text: `Linked to ${s?.name ?? 'source'}.` });
    } catch (err) {
      showToast({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not link.' });
    }
  }, [readerMessages, sources, patchLocal, showToast]);

  // ── Composing ────────────────────────────────────────────────────────────

  const openDraft = useCallback((d: ComposeDraft) => { setDraft(d); setDraftSeq((n) => n + 1); }, []);

  const startNew = useCallback(() => {
    openDraft({ ...NEW_DRAFT, accountId: boxId });
  }, [boxId, openDraft]);

  const startReply = useCallback((m: InboxItem, mode: ReplyMode) => {
    const body = bodies[m.id];
    const original = body?.bodyHtml
      ? sanitizeOutgoingHtml(body.bodyHtml)
      : textToHtml(body?.bodyText ?? m.preview ?? '');
    const { to, cc } = replyRecipients(m, body?.ccEmails ?? [], ownAddresses, mode);
    openDraft({
      mode,
      to,
      cc,
      subject: replySubject(m.subject, mode),
      // A reply leaves from the mailbox the conversation lives in.
      accountId: m.accountId ?? boxId,
      quotedHtml: quoteBlock(m, original, mode, absoluteTime(m.emailDate)),
      threadKey: mode === 'forward' ? null : m.threadKey,
      inReplyTo: mode === 'forward' ? null : (body?.messageId ?? m.messageId),
      sourceId: m.sourceId,
      contactId: mode === 'forward' ? null : m.contactId,
      droppedAttachments: mode === 'forward' ? body?.attachments.length ?? 0 : 0,
    });
  }, [bodies, ownAddresses, boxId, openDraft]);

  const onSent = useCallback((message: string) => {
    setDraft(null);
    showToast({ tone: 'ok', text: message });
    void load(true);
    const key = readerMessages[readerMessages.length - 1]?.threadKey;
    if (key) getThread(key).then((t) => mounted.current && setThread(t)).catch(() => {});
  }, [load, readerMessages, showToast]);

  const onMailboxCreated = useCallback(async (mb: CreatedMailbox) => {
    setNewMailboxOpen(false);
    showToast({ tone: 'ok', text: `${mb.email} is ready. It receives and sends right away.` });
    try { await loadAccounts(); } catch { /* the toast already confirmed creation */ }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('box', mb.id);
      next.delete('folder');
      return next;
    }, { replace: true });
    setAnchorId(null);
    refreshUnread();
  }, [loadAccounts, refreshUnread, setSearchParams, showToast]);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      const next = !on;
      try { window.localStorage.setItem(SOUND_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      if (next) playChime();
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(true), checkForNew()]);
    if (mounted.current) setRefreshing(false);
  }, [load, checkForNew]);

  // ── Render ───────────────────────────────────────────────────────────────

  const sidebarProps = {
    accounts, boxId, folder, unreadPerAccount, unreadInBox, canCreateMailbox, soundOn,
    onSelectBox: (id: string | null) => setParam('box', id),
    onSelectFolder: (f: InboxFilter) => setParam('folder', f),
    onCompose: startNew,
    onNewMailbox: () => setNewMailboxOpen(true),
    onToggleSound: toggleSound,
  };

  const box = accounts.find((a) => a.id === boxId) ?? null;
  const folderLabel = FOLDERS.find((f) => f.key === folder)?.label ?? 'All mail';
  const reading = anchorId !== null;

  const sourceOptions = useMemo(
    () => [{ value: '', label: 'All sources' }, ...sources.map((s) => ({ value: s.id, label: s.name }))],
    [sources],
  );

  return (
    <div className="media-scope flex h-full min-h-[560px] flex-col bg-white">
      {/* While reading on a narrow screen, the message gets the whole height. */}
      <div className={cn('flex-col gap-3 border-b border-black/[0.06] px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:flex', reading ? 'hidden' : 'flex')}>
        <PageHeader eyebrow="Communication" title="Mail" subtitle="Every mailbox, every conversation, in one place." />
        <div className="flex items-center gap-2 xl:hidden">
          <Button variant="default" size="lg" onClick={startNew}><ComposeIcon size={15} />New message</Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.05] p-3 sm:mx-6">
          <AlertTriangle size={15} className="mt-px text-destructive" />
          <span className="text-[12.5px] text-destructive">{error}</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => void load()}>Retry</Button>
        </div>
      )}

      <div className={cn('xl:hidden', reading && 'hidden lg:block')}><MailToolbarCompact {...sidebarProps} /></div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:grid-cols-[236px_minmax(320px,400px)_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-r border-black/[0.06] bg-[#fbfbfc] xl:block">
          <MailSidebar {...sidebarProps} />
        </aside>

        <section aria-label="Conversations" className={cn('min-h-0 flex-col border-black/[0.06] lg:flex lg:border-r', reading ? 'hidden' : 'flex')}>
          <div className="flex flex-col gap-2 border-b border-black/[0.06] px-3 py-3 sm:px-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-semibold tracking-[-0.015em] text-foreground">{folderLabel}</h2>
                <p className="truncate text-[11.5px] text-black/40">
                  {box ? box.emailAddress : 'All mailboxes'} · {visible.length} conversation{visible.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refresh()}
                aria-label="Check for new mail"
                title="Check for new mail"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-black/45 hover:bg-black/[0.05] hover:text-black/80"
              >
                <RefreshIcon size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search subject, people, text, source"
                  aria-label="Search mail"
                  className="h-9 w-full rounded-lg border border-border bg-black/[0.02] pl-9 pr-8 text-[13px] text-foreground outline-none transition-colors placeholder:text-black/35 focus:border-primary focus:bg-white focus:ring-[3px] focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-black/40 hover:text-black/75">
                    <X size={13} />
                  </button>
                )}
              </label>
              {sources.length > 0 && (
                <div className="w-[132px] shrink-0">
                  <Select value={sourceFilter ?? ''} options={sourceOptions} onChange={(v) => { setSourceFilter(v || null); setAnchorId(null); }} ariaLabel="Filter by source" size="lg" />
                </div>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ConversationList
              conversations={visible}
              loading={loading}
              selectedKey={selected?.key ?? null}
              searching={Boolean(query)}
              emptyHint={EMPTY_HINT[folder]}
              onOpen={openConversation}
              onToggleStar={toggleStarConversation}
            />
          </div>
        </section>

        <section aria-label="Conversation" className={cn('min-h-0 min-w-0 lg:block', reading ? 'block' : 'hidden')}>
          <ConversationReader
            messages={readerMessages}
            bodies={bodies}
            loading={readerLoading}
            sources={sources}
            ownAddresses={ownAddresses}
            onBack={closeReader}
            onReply={startReply}
            onToggleStar={(m) => void toggleStarMessage(m)}
            onArchive={() => void archive()}
            onDelete={askDelete}
            onMarkUnread={() => void markUnread()}
            onLinkSource={(id) => void linkSource(id)}
          />
        </section>
      </div>

      {draft && (
        <Composer key={draftSeq} draft={draft} accounts={accounts} onClose={() => setDraft(null)} onSent={onSent} />
      )}

      <NewMailboxSheet open={newMailboxOpen} domain={domain} onClose={() => setNewMailboxOpen(false)} onCreated={(mb) => void onMailboxCreated(mb)} />

      <ConfirmDialog state={confirm} pending={confirmPending} onCancel={() => setConfirm(null)} onConfirm={() => void runConfirm()} />

      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={cn(
            'fixed bottom-5 left-1/2 z-[1200] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border py-2.5 pl-4 pr-2 text-[13px] shadow-[0_10px_30px_rgb(0_0_0/0.14)]',
            toast.tone === 'bad' ? 'border-destructive/25 bg-white text-destructive' : 'border-black/[0.08] bg-[#111418] text-white',
          )}
          style={{ animation: 'm-fade-in 160ms ease-out' }}
        >
          {toast.tone === 'mail' && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
          <span className="min-w-0 truncate">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => { toast.action?.run(); setToast(null); }}
              className={cn('shrink-0 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold', toast.tone === 'bad' ? 'text-destructive hover:bg-destructive/10' : 'text-[#9cc3f2] hover:bg-white/10')}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg', toast.tone === 'bad' ? 'hover:bg-destructive/10' : 'text-white/60 hover:bg-white/10 hover:text-white')}>
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
};

export default MailPage;
