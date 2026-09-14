import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../lib/media/tokens.css';
import { cn } from '../lib/media/badgeColor';
import {
  absoluteTime,
  assignSource,
  getBody,
  getThread,
  listInbox,
  markRead,
  relativeTime,
  sendEmail,
  setArchived,
  setStarred,
  subscribeToMail,
  PRIORITY_CLASS,
  STATUS_CLASS,
  STATUS_LABEL,
  type EmailBody,
  type InboxFilter,
  type InboxItem,
} from '../lib/mail';
import { listSources, type Source } from '../lib/sources';
import { AlertTriangle, Mail, SearchX, X, type IconProps } from '../components/media/MediaIcons';
import { PageHeader } from '../components/media/MediaShared';
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
  Skeleton,
  Spinner,
  Textarea,
} from '../components/media/MediaUI';

/**
 * Unified email inbox — the three-pane shape (filters / list / reader).
 *
 * The one thing worth knowing before editing: message bodies are rendered inside
 * a sandboxed iframe, never with dangerouslySetInnerHTML. `body_html` is written
 * by whoever emailed us, so it is hostile input; `sandbox=""` denies it scripts,
 * forms, popups and same-origin access, which is the whole point.
 */

// ── Local icons (MediaIcons carries no mail-action glyphs) ────────────────────

const mk = (paths: React.ReactNode): React.FC<IconProps> => ({ size = 16, strokeWidth = 1.75, className }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true" focusable="false"
  >{paths}</svg>
);

const StarIcon = mk(<path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3z" />);
const ArchiveIcon = mk(<><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" /></>);
const ReplyIcon = mk(<><path d="M9 17l-6-6 6-6" /><path d="M3 11h8a8 8 0 018 8v1" /></>);
const LinkIcon = mk(<><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" /></>);

// ── Small pieces ──────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ item: InboxItem }> = ({ item }) => (
  <span
    className={cn(
      'inline-flex h-[19px] shrink-0 items-center whitespace-nowrap rounded-full border px-2 text-[10.5px] font-medium leading-none',
      STATUS_CLASS[item.sendStatus],
    )}
  >
    {STATUS_LABEL[item.sendStatus]}
  </span>
);

const SourceBadge: React.FC<{ item: InboxItem }> = ({ item }) => {
  if (!item.sourceName) return null;
  return (
    <span
      className={cn(
        'inline-flex h-[19px] shrink-0 items-center whitespace-nowrap rounded-full border px-2 text-[10.5px] font-medium leading-none',
        item.sourcePriority ? PRIORITY_CLASS[item.sourcePriority] : 'border-black/10 bg-black/[0.04] text-black/55',
      )}
      title={item.sourceSlug ?? undefined}
    >
      {item.sourceName}
    </span>
  );
};

const StarButton: React.FC<{ on: boolean; onToggle: () => void; label: string }> = ({ on, onToggle, label }) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={on}
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
    className={cn(
      'grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/35',
      on ? 'text-[#d99a3d]' : 'text-black/20 hover:text-black/45',
    )}
  >
    <StarIcon size={15} strokeWidth={on ? 2.2 : 1.8} className={on ? 'fill-[#d99a3d]' : ''} />
  </button>
);

/**
 * Hostile HTML goes in an iframe with an empty sandbox: no scripts, no forms,
 * no same-origin. The height is nudged to fit content where the browser allows
 * it, and falls back to a generous fixed height where it does not.
 */
const HtmlBody: React.FC<{ html: string | null; text: string | null }> = ({ html, text }) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(320);

  const srcDoc = useMemo(() => {
    const content = html
      ? html
      : `<pre style="white-space:pre-wrap;font:14px/1.6 ui-sans-serif,system-ui,sans-serif;margin:0">${
          (text ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))
        }</pre>`;
    return `<!doctype html><meta charset="utf-8"><base target="_blank">
<style>
  body{margin:0;padding:2px;font:14px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif;color:#0e0e10;word-break:break-word}
  img{max-width:100%;height:auto} table{max-width:100%}
  a{color:#1f64bb}
</style>${content}`;
  }, [html, text]);

  const onLoad = useCallback(() => {
    try {
      const doc = ref.current?.contentDocument;
      if (doc) setHeight(Math.min(Math.max(doc.body.scrollHeight + 16, 120), 4000));
    } catch {
      // Cross-origin content in the frame — keep the default height.
    }
  }, []);

  if (!html && !text) {
    return <div className="px-1 py-6 text-[13px] text-black/35">This message has no body.</div>;
  }

  return (
    <iframe
      ref={ref}
      title="Message body"
      sandbox=""
      srcDoc={srcDoc}
      onLoad={onLoad}
      style={{ height }}
      className="w-full border-0 bg-white"
    />
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'all', label: 'All mail' },
  { key: 'unread', label: 'Unread' },
  { key: 'starred', label: 'Starred' },
  { key: 'inbound', label: 'Received' },
  { key: 'outbound', label: 'Sent' },
  { key: 'archived', label: 'Archived' },
];

interface ComposeState {
  open: boolean;
  to: string;
  cc: string;
  subject: string;
  body: string;
  threadKey: string | null;
  inReplyTo: string | null;
  sourceId: string | null;
  contactId: string | null;
}

const EMPTY_COMPOSE: ComposeState = {
  open: false, to: '', cc: '', subject: '', body: '',
  threadKey: null, inReplyTo: null, sourceId: null, contactId: null,
};

const MailPage: React.FC = () => {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<InboxItem[]>([]);
  const [bodies, setBodies] = useState<Record<string, EmailBody>>({});
  const [readerBusy, setReaderBusy] = useState(false);

  const [compose, setCompose] = useState<ComposeState>(EMPTY_COMPOSE);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const showToast = useCallback((text: string, tone: 'ok' | 'bad') => {
    setToast({ text, tone });
    window.setTimeout(() => mounted.current && setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const rows = await listInbox(filter, sourceFilter);
      if (!mounted.current) return;
      setItems(rows);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : 'Could not load mail.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [filter, sourceFilter]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  useEffect(() => {
    listSources().then((s) => mounted.current && setSources(s)).catch(() => {});
  }, []);

  // Realtime keeps the list live; the 30s poll is the fallback for when the
  // socket cannot connect at all.
  useEffect(() => {
    const stop = subscribeToMail(() => { void load(); });
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => { stop(); window.clearInterval(timer); };
  }, [load]);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? thread.find((i) => i.id === selectedId) ?? null,
    [items, thread, selectedId],
  );

  /** Opening a message loads its thread, every body in it, and marks it read. */
  const open = useCallback(async (item: InboxItem) => {
    setSelectedId(item.id);
    setReaderBusy(true);
    try {
      const chain = item.threadKey ? await getThread(item.threadKey) : [item];
      if (!mounted.current) return;
      setThread(chain);

      const fetched = await Promise.all(chain.map((m) => getBody(m.id).catch(() => null)));
      if (!mounted.current) return;
      const next: Record<string, EmailBody> = {};
      fetched.forEach((b, i) => { if (b) next[chain[i].id] = b; });
      setBodies(next);

      if (!item.isRead) {
        await markRead(item.id);
        if (!mounted.current) return;
        setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, isRead: true } : m)));
      }
    } catch (err) {
      if (mounted.current) showToast(err instanceof Error ? err.message : 'Could not open message.', 'bad');
    } finally {
      if (mounted.current) setReaderBusy(false);
    }
  }, [showToast]);

  const patchLocal = (id: string, fields: Partial<InboxItem>) => {
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));
    setThread((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));
  };

  const toggleStar = useCallback(async (item: InboxItem) => {
    const next = !item.isStarred;
    patchLocal(item.id, { isStarred: next });          // optimistic
    try { await setStarred(item.id, next); }
    catch (err) {
      patchLocal(item.id, { isStarred: item.isStarred });
      showToast(err instanceof Error ? err.message : 'Could not update.', 'bad');
    }
  }, [showToast]);

  const toggleArchive = useCallback(async (item: InboxItem) => {
    const next = !item.isArchived;
    try {
      await setArchived(item.id, next);
      showToast(next ? 'Archived.' : 'Moved back to the inbox.', 'ok');
      if (selectedId === item.id) { setSelectedId(null); setThread([]); }
      void load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not archive.', 'bad');
    }
  }, [load, selectedId, showToast]);

  const linkSource = useCallback(async (item: InboxItem, sourceId: string) => {
    try {
      await assignSource(item.id, sourceId);
      const s = sources.find((x) => x.id === sourceId);
      patchLocal(item.id, { sourceId, sourceName: s?.name ?? null, sourcePriority: s?.priority ?? null });
      showToast(`Linked to ${s?.name ?? 'source'}.`, 'ok');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not link.', 'bad');
    }
  }, [sources, showToast]);

  const startReply = useCallback((item: InboxItem) => {
    const body = bodies[item.id];
    setCompose({
      open: true,
      to: item.direction === 'inbound' ? (item.fromEmail ?? '') : item.toEmails.join(', '),
      cc: '',
      subject: item.subject ? (/^re:/i.test(item.subject) ? item.subject : `Re: ${item.subject}`) : 'Re:',
      body: '',
      threadKey: item.threadKey,
      inReplyTo: body?.messageId ?? null,
      sourceId: item.sourceId,
      contactId: item.contactId,
    });
  }, [bodies]);

  const submitCompose = useCallback(async () => {
    if (!compose.to.trim() || !compose.subject.trim() || !compose.body.trim()) {
      showToast('Recipient, subject and message are all required.', 'bad');
      return;
    }
    setSending(true);
    try {
      await sendEmail({
        to: compose.to,
        cc: compose.cc,
        subject: compose.subject,
        // Plain-text composer: newlines become paragraphs, and the text is
        // escaped so a stray "<" cannot inject markup into our own outbound mail.
        bodyHtml: compose.body
          .split(/\n{2,}/)
          .map((p) => `<p>${p.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string)).replace(/\n/g, '<br/>')}</p>`)
          .join(''),
        threadKey: compose.threadKey,
        inReplyTo: compose.inReplyTo,
        sourceId: compose.sourceId,
        contactId: compose.contactId,
      });
      if (!mounted.current) return;
      setCompose(EMPTY_COMPOSE);
      showToast('Message handed to the sender.', 'ok');
      void load();
    } catch (err) {
      if (mounted.current) showToast(err instanceof Error ? err.message : 'Could not send.', 'bad');
    } finally {
      if (mounted.current) setSending(false);
    }
  }, [compose, load, showToast]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((m) =>
      (m.subject ?? '').toLowerCase().includes(q) ||
      (m.fromName ?? '').toLowerCase().includes(q) ||
      (m.fromEmail ?? '').toLowerCase().includes(q) ||
      (m.preview ?? '').toLowerCase().includes(q) ||
      (m.sourceName ?? '').toLowerCase().includes(q));
  }, [items, search]);

  const unread = useMemo(() => items.filter((m) => !m.isRead && m.direction === 'inbound').length, [items]);

  const sourceOptions = useMemo(
    () => [{ value: '', label: 'All sources' }, ...sources.map((s) => ({ value: s.id, label: s.name }))],
    [sources],
  );

  return (
    <div className="media-scope flex min-h-full flex-col bg-white">
      <div className="border-b border-black/[0.06] px-5 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader
            eyebrow="Communication"
            title="Mail"
            subtitle="Every message to and from the distribution sources, in one place."
          />
          <Button variant="default" size="sm" className="self-start" onClick={() => setCompose({ ...EMPTY_COMPOSE, open: true })}>
            New message
          </Button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-[#d4183d]/20 bg-[#d4183d]/[0.05] p-3 sm:mx-6 lg:mx-8">
          <AlertTriangle size={15} className="mt-px text-[#d4183d]" />
          <span className="text-[12.5px] text-[#d4183d]">{error}</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => { setLoading(true); void load(); }}>
            Retry
          </Button>
        </div>
      )}

      {/* Three panes on desktop; the reader takes over the screen on mobile. */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[210px_minmax(0,360px)_minmax(0,1fr)]">
        {/* ── Filters ──────────────────────────────────────────────────── */}
        <aside className={cn(
          'border-black/[0.06] px-3 py-4 lg:border-r',
          selectedId ? 'hidden lg:block' : 'block',
        )}>
          <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => { setFilter(f.key); setSelectedId(null); setThread([]); }}
                  className={cn(
                    'flex h-9 shrink-0 items-center justify-between gap-2 rounded-lg px-3 text-[13px] transition-colors',
                    active ? 'bg-[#6ea4e7]/10 font-semibold text-[#1f64bb]' : 'font-medium text-black/60 hover:bg-black/[0.03]',
                  )}
                >
                  {f.label}
                  {f.key === 'unread' && unread > 0 && (
                    <span className="rounded-full bg-[#6ea4e7] px-1.5 text-[10.5px] font-semibold text-white">{unread}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-4 hidden lg:block">
            <div className="mb-1.5 px-3 text-[10.5px] font-medium uppercase tracking-[0.12em] text-black/35">Source</div>
            <Select
              value={sourceFilter ?? ''}
              options={sourceOptions}
              onChange={(v) => { setSourceFilter(v || null); setSelectedId(null); }}
              ariaLabel="Filter by source"
              size="sm"
            />
          </div>
        </aside>

        {/* ── Message list ─────────────────────────────────────────────── */}
        <section className={cn(
          'border-black/[0.06] lg:border-r',
          selectedId ? 'hidden lg:block' : 'block',
        )}>
          <div className="border-b border-black/[0.06] p-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subject, sender, source…"
              aria-label="Search mail"
            />
          </div>

          <div className="divide-y divide-black/[0.04]">
            {loading ? (
              Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="m-3 h-16 rounded-lg" />)
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <SearchX size={22} strokeWidth={1.6} className="text-black/25" />
                <div className="text-[13.5px] font-medium text-black/60">No messages here</div>
                <div className="max-w-[260px] text-[12.5px] text-black/40">
                  {search ? 'Nothing matches that search.' : 'New mail appears here as soon as it arrives.'}
                </div>
              </div>
            ) : (
              visible.map((m) => {
                const active = m.id === selectedId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => void open(m)}
                    className={cn(
                      'flex w-full min-h-[64px] items-start gap-2 px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-[#6ea4e7]/[0.07]' : 'hover:bg-black/[0.015]',
                    )}
                  >
                    <StarButton on={m.isStarred} onToggle={() => void toggleStar(m)} label="Star message" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate text-[13px]', m.isRead ? 'text-black/70' : 'font-semibold text-[#0e0e10]')}>
                          {m.fromName || m.fromEmail || (m.toEmails[0] ?? 'Unknown')}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-black/40">{relativeTime(m.emailDate)}</span>
                      </div>
                      <div className={cn('truncate text-[12.5px]', m.isRead ? 'text-black/55' : 'font-medium text-black/80')}>
                        {m.subject || '(no subject)'}
                      </div>
                      <div className="truncate text-[12px] text-black/35">{m.preview || '—'}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <SourceBadge item={m} />
                        {m.direction === 'outbound' && <StatusBadge item={m} />}
                        {!m.sourceId && (
                          <span className="inline-flex h-[19px] items-center rounded-full border border-black/10 bg-black/[0.03] px-2 text-[10.5px] text-black/45">
                            Unlinked
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* ── Reader ───────────────────────────────────────────────────── */}
        <section className={cn('min-w-0', selectedId ? 'block' : 'hidden lg:block')}>
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-20 text-center">
              <Mail size={26} strokeWidth={1.5} className="text-black/20" />
              <div className="text-[13.5px] font-medium text-black/50">Pick a message to read it</div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.06] px-4 py-3">
                <button
                  type="button"
                  onClick={() => { setSelectedId(null); setThread([]); }}
                  className="grid h-7 w-7 place-items-center rounded-md text-black/45 hover:bg-black/[0.04] lg:hidden"
                  aria-label="Back to list"
                >
                  <X size={15} />
                </button>
                <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em] text-[#0e0e10]">
                  {selected.subject || '(no subject)'}
                </h2>
                <StarButton on={selected.isStarred} onToggle={() => void toggleStar(selected)} label="Star message" />
                <Button variant="outline" size="sm" onClick={() => void toggleArchive(selected)}>
                  <ArchiveIcon size={14} />
                  {selected.isArchived ? 'Unarchive' : 'Archive'}
                </Button>
                <Button variant="default" size="sm" onClick={() => startReply(selected)}>
                  <ReplyIcon size={14} />
                  Reply
                </Button>
              </div>

              {!selected.sourceId && (
                <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.06] bg-[#d99a3d]/[0.06] px-4 py-2.5">
                  <LinkIcon size={14} className="text-[#a6702a]" />
                  <span className="text-[12.5px] text-[#a6702a]">Not linked to a source.</span>
                  <div className="ml-auto w-[220px]">
                    <Select
                      value=""
                      options={[{ value: '', label: 'Link to a source…' }, ...sources.map((s) => ({ value: s.id, label: s.name }))]}
                      onChange={(v) => v && void linkSource(selected, v)}
                      ariaLabel="Link this message to a source"
                      size="sm"
                    />
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 py-4">
                {readerBusy ? (
                  <div className="flex items-center gap-2 py-8 text-[12.5px] text-black/45">
                    <Spinner size={13} /> Loading conversation…
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {(thread.length ? thread : [selected]).map((m) => {
                      const body = bodies[m.id];
                      return (
                        <article key={m.id} className="rounded-xl border border-black/[0.07] bg-white">
                          <header className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-black/[0.05] px-3.5 py-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-semibold text-[#0e0e10]">
                                {m.fromName || m.fromEmail || '—'}
                                {m.fromName && m.fromEmail && (
                                  <span className="ml-1.5 font-normal text-black/40">&lt;{m.fromEmail}&gt;</span>
                                )}
                              </div>
                              <div className="truncate text-[11.5px] text-black/45">
                                to {m.toEmails.join(', ') || '—'}
                                {body?.ccEmails.length ? ` · cc ${body.ccEmails.join(', ')}` : ''}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {m.direction === 'outbound' && <StatusBadge item={m} />}
                              <span className="text-[11px] tabular-nums text-black/40">{absoluteTime(m.emailDate)}</span>
                            </div>
                          </header>
                          <div className="px-3.5 py-2">
                            <HtmlBody html={body?.bodyHtml ?? null} text={body?.bodyText ?? null} />
                          </div>
                          {body && body.attachments.length > 0 && (
                            <footer className="flex flex-wrap gap-2 border-t border-black/[0.05] px-3.5 py-2">
                              {body.attachments.map((a, i) => (
                                <span key={i} className="inline-flex h-[22px] items-center rounded-full border border-black/10 bg-black/[0.03] px-2.5 text-[11.5px] text-black/60">
                                  {a.filename ?? `Attachment ${i + 1}`}
                                </span>
                              ))}
                            </footer>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Compose ────────────────────────────────────────────────────── */}
      <Sheet open={compose.open} onClose={() => setCompose(EMPTY_COMPOSE)} ariaLabel="Compose message" maxWidthClass="sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>{compose.threadKey ? 'Reply' : 'New message'}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <div className="flex flex-col gap-3">
            <Field label="To"><Input value={compose.to} onChange={(e) => setCompose((c) => ({ ...c, to: e.target.value }))} placeholder="name@example.com, other@example.com" /></Field>
            <Field label="Cc"><Input value={compose.cc} onChange={(e) => setCompose((c) => ({ ...c, cc: e.target.value }))} placeholder="Optional" /></Field>
            <Field label="Subject"><Input value={compose.subject} onChange={(e) => setCompose((c) => ({ ...c, subject: e.target.value }))} /></Field>
            <Field label="Message">
              <Textarea rows={12} value={compose.body} onChange={(e) => setCompose((c) => ({ ...c, body: e.target.value }))} placeholder="Write your message…" />
            </Field>
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => setCompose(EMPTY_COMPOSE)} disabled={sending}>Cancel</Button>
          <Button variant="default" size="sm" onClick={() => void submitCompose()} disabled={sending}>
            {sending ? <Spinner size={12} /> : null}
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </SheetFooter>
      </Sheet>

      {toast && (
        <div
          role="status"
          className={cn(
            'fixed bottom-5 left-1/2 z-[1200] -translate-x-1/2 rounded-full border px-4 py-2 text-[12.5px] shadow-[0_6px_24px_rgb(0_0_0/0.12)]',
            toast.tone === 'ok' ? 'border-black/10 bg-white text-[#0e0e10]' : 'border-[#d4183d]/25 bg-[#fff5f6] text-[#d4183d]',
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
};

export default MailPage;
