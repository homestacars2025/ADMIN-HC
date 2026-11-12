import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Tooltip } from '../media/MediaUI';
import { Pencil } from '../media/MediaIcons';
import { useMoney } from '../../hooks/useMoney';
import { cn } from '../../lib/media/badgeColor';
import { avatarBgGradient, toAvatarBg } from '../../lib/staffAvatar';
import {
  actorInitials,
  auditActorIds,
  changedFields,
  fetchDeletedLedgerEntries,
  fetchLedgerHistory,
  fetchLedgerRefNames,
  loadLedgerActors,
  useLedgerActors,
  type AuditField,
  type LedgerActor,
  type LedgerAuditEntry,
  type LedgerRefNames,
} from '../../lib/ledgerActors';

/**
 * Who recorded a ledger line, and who last touched it: a 24px avatar at the end of
 * the row, a smaller one with a ✎ when it was edited, and the line's history on
 * click. Finance only: outside a provider that's `enabled`, none of it renders.
 */

interface LedgerActorsValue {
  enabled: boolean;
  actors: Map<string, LedgerActor>;
}

const LedgerActorsContext = createContext<LedgerActorsValue>({ enabled: false, actors: new Map() });

/** Loads everyone on a list in one call. `enabled` is the finance check; the RPC is the backstop. */
export const LedgerActorsProvider: React.FC<{
  ids: Iterable<string | null | undefined>;
  enabled: boolean;
  children: React.ReactNode;
}> = ({ ids, enabled, children }) => {
  const { actors, error } = useLedgerActors(ids, enabled);
  const value = useMemo(() => ({ enabled: enabled && !error, actors }), [enabled, error, actors]);
  return <LedgerActorsContext.Provider value={value}>{children}</LedgerActorsContext.Provider>;
};

export const useLedgerActorsEnabled = (): boolean => useContext(LedgerActorsContext).enabled;

// ── Formatting ───────────────────────────────────────────────────────────────

const STAMP_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** "12 Nov 2026, 14:05". */
export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : STAMP_FORMAT.format(date);
}

const FIELD_LABEL: Record<AuditField, string> = {
  amount: 'Amount',
  type: 'Type',
  direction: 'Direction',
  description: 'Description',
  car_id: 'Car',
  booking_id: 'Booking',
  account_id: 'Account',
};

/** "car_wash" → "Car wash"; "hgs" → "HGS". */
export function typeLabel(type: string): string {
  const value = type.trim().replace(/_/g, ' ');
  if (value.toLowerCase() === 'hgs') return 'HGS';
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : 'Entry';
}

const SYSTEM_NAME = 'System';
const SYSTEM_TIP = 'Automatic entry (HGS, fines, system)';

const recordedTip = (actor: LedgerActor | undefined, createdBy: string | null, at: string | null | undefined) => (
  createdBy ? `Recorded by ${actor?.fullName ?? 'someone'}${at ? ` · ${formatStamp(at)}` : ''}` : SYSTEM_TIP
);
const editedTip = (actor: LedgerActor | undefined, at: string | null | undefined) =>
  `Last edited by ${actor?.fullName ?? 'someone'}${at ? ` · ${formatStamp(at)}` : ''}`;

// ── Avatars ──────────────────────────────────────────────────────────────────

const SystemGlyph: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="7" width="14" height="11" rx="3" />
    <path d="M12 3v4M9 12h.01M15 12h.01M9.5 15.5h5" />
  </svg>
);

/** A photo when there is one, otherwise initials on the person's own colour. No `actor` and no `system`: still loading. */
export const ActorAvatar: React.FC<{
  actor?: LedgerActor | null;
  system?: boolean;
  size?: number;
  className?: string;
}> = ({ actor, system, size = 24, className }) => {
  const [failed, setFailed] = useState<string | null>(null);
  const base = cn('relative grid shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-[var(--surface,#fff)]', className);
  const box: React.CSSProperties = { width: size, height: size };
  if (system) {
    return (
      <span className={cn(base, 'bg-black/[0.06] text-black/45')} style={box} aria-hidden="true">
        <SystemGlyph size={Math.round(size * 0.62)} />
      </span>
    );
  }
  if (!actor) return <span className={cn(base, 'animate-pulse bg-black/[0.07]')} style={box} aria-hidden="true" />;
  if (actor.avatarUrl && failed !== actor.avatarUrl) {
    return (
      <span className={base} style={box} aria-hidden="true">
        <img src={actor.avatarUrl} alt="" loading="lazy" onError={() => setFailed(actor.avatarUrl)} className="h-full w-full object-cover object-top" />
      </span>
    );
  }
  return (
    <span
      className={cn(base, 'font-semibold tracking-[-0.02em] text-[#33465c]')}
      style={{ ...box, background: avatarBgGradient(toAvatarBg(actor.avatarBg)), fontSize: Math.max(8, Math.round(size * 0.4)) }}
      aria-hidden="true"
    >
      {actorInitials(actor.fullName)}
    </span>
  );
};

// ── A floating panel ─────────────────────────────────────────────────────────

const PANEL_WIDTH = 320;

/** Anchored under the trigger (above it when there's no room), inside the viewport, on top of any sheet. */
const Popover: React.FC<{
  anchor: HTMLElement;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ anchor, label, onClose, children }) => {
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
      const below = window.innerHeight - rect.bottom;
      const maxHeight = Math.max(160, Math.min(420, (below >= 240 ? below : rect.top) - 16));
      setStyle(below >= 240 || below >= rect.top
        ? { left, width, top: rect.bottom + 6, maxHeight }
        : { left, width, bottom: window.innerHeight - rect.top + 6, maxHeight });
    };
    place();
    panel.current?.focus({ preventScroll: true });
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const onScroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) onClose();
    };
    // Captured on window first, so Escape closes the popover and not the sheet under it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      event.preventDefault();
      onClose();
      anchor.focus();
    };
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, onClose]);

  return ReactDOM.createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      style={{ position: 'fixed', zIndex: 10002, ...style }}
      className="overflow-y-auto overscroll-contain rounded-2xl border border-black/[0.07] bg-white p-1.5 text-start shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.06)] outline-none"
    >
      {children}
    </div>,
    document.body,
  );
};

// ── History ──────────────────────────────────────────────────────────────────

function useAuditValue(refs: LedgerRefNames | null) {
  const { format } = useMoney();
  return useCallback((field: AuditField, value: unknown): string => {
    if (value === null || value === undefined || value === '') return field === 'account_id' ? 'None' : '—';
    const id = Number(value);
    switch (field) {
      case 'amount': return format(Number(value));
      case 'direction': return String(value).toUpperCase() === 'IN' ? 'In' : 'Out';
      case 'car_id': return refs?.cars.get(id) ?? `Car #${value}`;
      case 'booking_id': return refs?.bookings.get(id) ?? `Booking #${value}`;
      case 'account_id': return refs?.accounts.get(id) ?? `Account #${value}`;
      case 'type': return typeLabel(String(value));
      default: return String(value);
    }
  }, [format, refs]);
}

const ActionChip: React.FC<{ action: 'update' | 'delete' | 'create' }> = ({ action }) => (
  <span className={cn(
    'inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-[10.5px] font-semibold',
    action === 'delete' ? 'bg-[#DC2626]/[0.08] text-[#B91C1C]' : action === 'update' ? 'bg-[#6EA4E7]/[0.14] text-[#2f6db5]' : 'bg-black/[0.05] text-black/55',
  )}>
    {action === 'delete' ? 'Deleted' : action === 'update' ? 'Edited' : 'Recorded'}
  </span>
);

interface HistoryState {
  entries: LedgerAuditEntry[];
  refs: LedgerRefNames | null;
  actors: Map<string, LedgerActor>;
}

const HistoryEvent: React.FC<{
  actor: LedgerActor | undefined;
  system?: boolean;
  action: 'update' | 'delete' | 'create';
  at: string | null | undefined;
  children?: React.ReactNode;
}> = ({ actor, system, action, at, children }) => (
  <li className="flex gap-2.5 rounded-xl px-2.5 py-2">
    <ActorAvatar actor={actor} system={system} size={24} className="mt-0.5 ring-0" />
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-[12.5px] font-semibold text-foreground">{system ? SYSTEM_NAME : actor?.fullName ?? 'Someone'}</span>
        <ActionChip action={action} />
      </div>
      <div className="text-[11.5px] tabular-nums text-black/45">{formatStamp(at)}</div>
      {children}
    </div>
  </li>
);

const LedgerHistory: React.FC<{
  ledgerId: string;
  createdBy: string | null;
  createdAt: string | null | undefined;
  creator: LedgerActor | undefined;
}> = ({ ledgerId, createdBy, createdAt, creator }) => {
  const [state, setState] = useState<HistoryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const valueOf = useAuditValue(state?.refs ?? null);

  useEffect(() => {
    let active = true;
    setError(null);
    (async () => {
      const entries = await fetchLedgerHistory(ledgerId);
      const [refs, actors] = await Promise.all([fetchLedgerRefNames(entries), loadLedgerActors(auditActorIds(entries))]);
      if (active) setState({ entries, refs, actors });
    })().catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : "Couldn't load the history.");
    });
    return () => { active = false; };
  }, [ledgerId, attempt]);

  return (
    <div>
      <div className="px-2.5 pb-1 pt-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-black/40">History</div>
      {error ? (
        <div role="alert" className="px-2.5 pb-2 text-[12.5px] text-black/55">
          Couldn't load the history.{' '}
          <button type="button" className="font-semibold text-[#2f6db5] hover:underline" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      ) : !state ? (
        <div aria-busy="true" className="space-y-2 px-2.5 py-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-black/[0.06]" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-black/[0.05]" />
        </div>
      ) : (
        <ol className="divide-y divide-black/[0.04]">
          {state.entries.map((entry) => {
            const changes = changedFields(entry.oldRow, entry.newRow);
            return (
              <HistoryEvent
                key={entry.id}
                actor={entry.changedBy ? state.actors.get(entry.changedBy) : undefined}
                system={!entry.changedBy}
                action={entry.action}
                at={entry.changedAt}
              >
                {entry.action === 'update' && changes.length > 0 && (
                  <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12px]">
                    {changes.map((change) => (
                      <React.Fragment key={change.field}>
                        <dt className="text-black/45">{FIELD_LABEL[change.field]}</dt>
                        <dd className="min-w-0 break-words text-black/75">
                          <span className="text-black/40 line-through decoration-black/25">{valueOf(change.field, change.from)}</span>
                          <span aria-hidden="true" className="mx-1 text-black/30">→</span>
                          <span className="sr-only"> changed to </span>
                          <span className="font-medium">{valueOf(change.field, change.to)}</span>
                        </dd>
                      </React.Fragment>
                    ))}
                  </dl>
                )}
                {entry.action === 'update' && changes.length === 0 && (
                  <div className="mt-1 text-[12px] text-black/45">Other details changed.</div>
                )}
              </HistoryEvent>
            );
          })}
          <HistoryEvent actor={creator} system={!createdBy} action="create" at={createdAt} />
        </ol>
      )}
      {state && state.entries.length === 0 && !error && (
        <p className="px-2.5 pb-2 text-[11.5px] text-black/40">Not edited since it was recorded.</p>
      )}
    </div>
  );
};

// ── The avatars on a row ─────────────────────────────────────────────────────

/**
 * The creator's avatar, the last editor's on top with a ✎, and the line's history
 * on click. Renders nothing outside an enabled provider.
 */
export const LedgerStamp: React.FC<{
  ledgerId: string;
  createdBy: string | null | undefined;
  createdAt: string | null | undefined;
  updatedBy: string | null | undefined;
  updatedAt: string | null | undefined;
  className?: string;
}> = ({ ledgerId, createdBy = null, createdAt, updatedBy = null, updatedAt, className }) => {
  const { enabled, actors } = useContext(LedgerActorsContext);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!enabled) return null;

  const creator = createdBy ? actors.get(createdBy) : undefined;
  const editor = updatedBy ? actors.get(updatedBy) : undefined;
  const recorded = recordedTip(creator, createdBy, createdAt);
  const edited = updatedBy ? editedTip(editor, updatedAt) : null;

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${recorded}${edited ? `. ${edited}` : ''}. Show history`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/35 md:h-9 md:w-10',
          open && 'bg-black/[0.05]',
          className,
        )}
      >
        <Tooltip content={recorded}>
          <ActorAvatar actor={creator} system={!createdBy} size={24} />
        </Tooltip>
        {updatedBy && (
          <Tooltip content={edited}>
            <span className="relative -ms-1.5 mt-2.5 inline-flex">
              <ActorAvatar actor={editor} size={18} />
              <span aria-hidden="true" className="absolute -bottom-0.5 -end-1 grid h-[11px] w-[11px] place-items-center rounded-full bg-[#6EA4E7] text-white ring-[1.5px] ring-white">
                <Pencil size={7} strokeWidth={2.6} />
              </span>
            </span>
          </Tooltip>
        )}
      </button>
      {open && button.current && (
        <Popover anchor={button.current} label="History" onClose={close}>
          <LedgerHistory ledgerId={ledgerId} createdBy={createdBy} createdAt={createdAt} creator={creator} />
        </Popover>
      )}
    </>
  );
};

// ── Deleted entries ──────────────────────────────────────────────────────────

interface DeletedState {
  entries: LedgerAuditEntry[];
  refs: LedgerRefNames;
  actors: Map<string, LedgerActor>;
}

const DeletedRow: React.FC<{ entry: LedgerAuditEntry; refs: LedgerRefNames; actors: Map<string, LedgerActor> }> = ({ entry, refs, actors }) => {
  const { format } = useMoney();
  const row = entry.oldRow ?? {};
  const received = String(row.direction ?? '').toUpperCase() === 'IN';
  const bookingId = Number(row.booking_id);
  const deleter = entry.changedBy ? actors.get(entry.changedBy) : undefined;
  const createdBy = (row.created_by as string | null | undefined) ?? null;
  const creator = createdBy ? actors.get(createdBy) : undefined;
  const type = typeLabel(String(row.type ?? ''));
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-[13.5px] font-medium text-foreground line-through decoration-black/25">{type}</span>
          {Number.isFinite(bookingId) && bookingId > 0 && (
            <span className="font-mono text-[11.5px] text-black/45">{refs.bookings.get(bookingId) ?? `#${bookingId}`}</span>
          )}
        </div>
        {typeof row.description === 'string' && row.description && (
          <div className="truncate text-[12px] text-black/50">{row.description}</div>
        )}
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-black/55">
          <ActorAvatar actor={deleter} system={!entry.changedBy} size={18} className="ring-0" />
          <span className="min-w-0 truncate">
            Deleted by <span className="font-medium text-black/75">{entry.changedBy ? deleter?.fullName ?? 'someone' : SYSTEM_NAME}</span>
            <span className="tabular-nums"> · {formatStamp(entry.changedAt)}</span>
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-black/40">
          {createdBy ? `Recorded by ${creator?.fullName ?? 'someone'}` : 'Automatic entry'}
          {typeof row.created_at === 'string' && ` · ${formatStamp(row.created_at)}`}
        </div>
      </div>
      <div className={cn('shrink-0 font-mono text-[13.5px] font-medium tabular-nums line-through decoration-black/25', received ? 'text-[#15803D]/70' : 'text-[#B91C1C]/70')}>
        {received ? '+' : '−'}{format(Math.abs(Number(row.amount) || 0))}
      </div>
    </li>
  );
};

/** "Deleted entries": the lines removed from this customer's wallet, who removed them and when. */
export const DeletedLedgerEntries: React.FC<{ customerId: string; refreshKey?: number }> = ({ customerId, refreshKey = 0 }) => {
  const enabled = useLedgerActorsEnabled();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DeletedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !enabled) return undefined;
    let active = true;
    setError(null);
    (async () => {
      const entries = await fetchDeletedLedgerEntries(customerId);
      const [refs, actors] = await Promise.all([fetchLedgerRefNames(entries), loadLedgerActors(auditActorIds(entries))]);
      if (active) setState({ entries, refs, actors });
    })().catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : "Couldn't load deleted entries.");
    });
    return () => { active = false; };
  }, [open, enabled, customerId, refreshKey, attempt]);

  if (!enabled) return null;
  const panelId = `deleted-ledger-${customerId}`;

  return (
    <section aria-label="Deleted entries" className="rounded-2xl border border-subtle bg-surface">
      <button
        type="button"
        aria-pressed={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-4 text-start transition-colors hover:bg-black/[0.02] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/35 sm:px-5',
        )}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/[0.04] text-black/45">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium text-foreground">Deleted entries</span>
          <span className="block text-[12px] text-black/45">
            {open && state ? `${state.entries.length} ${state.entries.length === 1 ? 'entry' : 'entries'} removed from this wallet` : 'Who removed what, and when'}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors', open ? 'bg-[#6EA4E7]' : 'bg-black/[0.12]')}
        >
          <span className={cn('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-[inset-inline-start]', open ? 'start-[19px]' : 'start-[3px]')} />
        </span>
      </button>
      {open && (
        <div id={panelId} className="border-t border-subtle px-4 pb-2 sm:px-5">
          {error ? (
            <div role="alert" className="py-4 text-[12.5px] text-black/55">
              Couldn't load deleted entries.{' '}
              <button type="button" className="font-semibold text-[#2f6db5] hover:underline" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
            </div>
          ) : !state ? (
            <div aria-busy="true" className="space-y-2 py-4">
              <div className="h-3 w-2/3 animate-pulse rounded bg-black/[0.06]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-black/[0.05]" />
            </div>
          ) : state.entries.length === 0 ? (
            <p className="py-4 text-[12.5px] text-black/45">Nothing has been deleted from this wallet.</p>
          ) : (
            <ul className="divide-y divide-black/[0.05]">
              {state.entries.map((entry) => <DeletedRow key={entry.id} entry={entry} refs={state.refs} actors={state.actors} />)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
