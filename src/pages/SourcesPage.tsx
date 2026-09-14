import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../lib/media/tokens.css';
import { cn } from '../lib/media/badgeColor';
import {
  deleteContact,
  dueLabel,
  dueState,
  humanise,
  listContacts,
  listSources,
  updateSource,
  upsertContact,
  DUE_CLASS,
  INVENTORY_LABEL,
  INVENTORY_TYPES,
  KIND_LABEL,
  KINDS,
  LICENSE_LABEL,
  LICENSE_REQUIREMENTS,
  PRIORITIES,
  STAGE_LABEL,
  STAGES,
  TECH_LABEL,
  TECH_MODELS,
  type Priority,
  type Source,
  type SourceContact,
  type Stage,
} from '../lib/sources';
import { PRIORITY_CLASS, relativeTime, type InboxItem } from '../lib/mail';
import { listInbox } from '../lib/mail';
import { supabase } from '../lib/supabase';
import { AlertTriangle, ExternalLink, Plus, SearchX, Trash2, X } from '../components/media/MediaIcons';
import { PageHeader } from '../components/media/MediaShared';
import {
  Button, Field, Input, Select, Sheet, SheetBody, SheetFooter, SheetHeader, SheetTitle,
  Skeleton, Spinner, Switch, Textarea,
} from '../components/media/MediaUI';

/**
 * Distribution-source CRM: a stage Kanban over `integration_sources`, plus a
 * detail drawer that edits every field in place.
 *
 * Stage changes happen by dragging a card between columns. The move is applied
 * optimistically and rolled back if the write fails — with 11 columns, waiting
 * for a round trip before the card moves makes the board feel broken.
 */

const PRIORITY_RANK: Record<Priority, number> = { top: 0, high: 1, medium: 2, low: 3 };

// ── Card ──────────────────────────────────────────────────────────────────────

const SourceCard: React.FC<{
  source: Source;
  onOpen: () => void;
  onDragStart: () => void;
}> = ({ source, onOpen, onDragStart }) => {
  const due = dueState(source.next_action_due);
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={cn(
        'cursor-pointer rounded-xl border bg-white p-2.5 transition-all',
        'hover:border-[#6ea4e7]/40 hover:shadow-[0_2px_8px_rgb(0_0_0/0.06)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/35',
        due === 'overdue' ? 'border-[#d4183d]/30' : 'border-black/[0.07]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-[#0e0e10]">
          {source.name}
        </span>
        <span className={cn(
          'inline-flex h-[18px] shrink-0 items-center rounded-full border px-1.5 text-[10px] font-medium uppercase leading-none',
          PRIORITY_CLASS[source.priority],
        )}>
          {source.priority}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-black/45">
        <span>{KIND_LABEL[source.kind] ?? humanise(source.kind)}</span>
        {source.supports_istanbul && (
          <span className="inline-flex h-[17px] items-center rounded-full border border-[#3f9b6d]/25 bg-[#3f9b6d]/10 px-1.5 text-[10px] font-medium text-[#2f7553]">
            İstanbul
          </span>
        )}
        {source.is_turkish_local && (
          <span className="inline-flex h-[17px] items-center rounded-full border border-black/10 bg-black/[0.03] px-1.5 text-[10px] text-black/50">
            Local
          </span>
        )}
      </div>

      {source.next_action && (
        <div className="mt-1.5 border-t border-black/[0.05] pt-1.5">
          <div className="truncate text-[11.5px] text-black/60">{source.next_action}</div>
          <div className={cn('text-[10.5px] tabular-nums', DUE_CLASS[due])}>{dueLabel(source.next_action_due)}</div>
        </div>
      )}
    </div>
  );
};

// ── Detail drawer ─────────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="flex flex-col gap-2.5 border-t border-black/[0.06] pt-4 first:border-0 first:pt-0">
    <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#6ea4e7]">{title}</h3>
    {children}
  </section>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-1 gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center sm:gap-3">
    <span className="text-[12px] text-black/45">{label}</span>
    <div className="min-w-0 text-[13px] text-[#0e0e10]">{children}</div>
  </div>
);

const Bool: React.FC<{ value: boolean | null; onChange: (v: boolean) => void; label: string }> = ({ value, onChange, label }) => (
  <Switch checked={value === true} onChange={onChange} ariaLabel={label} />
);

const Link: React.FC<{ href: string | null }> = ({ href }) =>
  href ? (
    <a href={href} target="_blank" rel="noreferrer noopener"
       className="inline-flex items-center gap-1 text-[#1f64bb] underline-offset-2 hover:underline">
      <span className="truncate">{href.replace(/^https?:\/\//, '')}</span>
      <ExternalLink size={12} />
    </a>
  ) : <span className="text-black/30">—</span>;

const SourceDetail: React.FC<{
  source: Source;
  onClose: () => void;
  onPatch: (fields: Partial<Source>) => void;
  onCompose: (email: string, name: string) => void;
}> = ({ source, onClose, onPatch, onCompose }) => {
  const [contacts, setContacts] = useState<SourceContact[]>([]);
  const [emails, setEmails] = useState<InboxItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [draft, setDraft] = useState<Partial<SourceContact> | null>(null);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const [c, e] = await Promise.all([
        listContacts(source.id),
        // Source correspondence, newest first — the same rows the Mail page shows.
        supabase.from('inbox_view').select('id, direction, send_status, subject, from_email, from_name, to_emails, email_date, is_read, is_archived, is_starred, thread_key, source_id, source_name, source_slug, source_priority, contact_id, contact_name, preview')
          .eq('source_id', source.id).order('email_date', { ascending: false }).limit(50)
          .then(({ data }) => (data ?? []) as unknown as InboxItem[]),
      ]);
      setContacts(c);
      setEmails(e);
    } catch {
      /* the drawer still renders the fields it already has */
    } finally {
      setBusy(false);
    }
  }, [source.id]);

  useEffect(() => { void reload(); }, [reload]);

  const saveContact = async () => {
    if (!draft) return;
    await upsertContact({ ...draft, source_id: source.id });
    setDraft(null);
    void reload();
  };

  return (
    <Sheet open onClose={onClose} ariaLabel={`${source.name} details`} maxWidthClass="sm:max-w-[640px]">
      <SheetHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SheetTitle>{source.name}</SheetTitle>
            <div className="mt-0.5 text-[12px] text-black/45">{source.slug ?? '—'}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-black/40 hover:bg-black/[0.05]">
            <X size={15} />
          </button>
        </div>
      </SheetHeader>

      <SheetBody>
        <div className="flex flex-col gap-4">
          <Section title="Pipeline">
            <Row label="Stage">
              <Select value={source.stage} ariaLabel="Stage" size="sm"
                      options={STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
                      onChange={(v) => onPatch({ stage: v as Stage })} />
            </Row>
            <Row label="Priority">
              <Select value={source.priority} ariaLabel="Priority" size="sm"
                      options={PRIORITIES.map((p) => ({ value: p, label: humanise(p) }))}
                      onChange={(v) => onPatch({ priority: v as Priority })} />
            </Row>
            <Row label="Overall score">
              <Input type="number" defaultValue={source.overall_score ?? ''} className="h-8"
                     onBlur={(e) => onPatch({ overall_score: e.target.value === '' ? null : Number(e.target.value) })} />
            </Row>
            <Row label="Next action">
              <Input defaultValue={source.next_action ?? ''} className="h-8"
                     onBlur={(e) => onPatch({ next_action: e.target.value || null })} />
            </Row>
            <Row label="Due">
              <Input type="date" defaultValue={source.next_action_due ?? ''} className="h-8"
                     onBlur={(e) => onPatch({ next_action_due: e.target.value || null })} />
            </Row>
          </Section>

          <Section title="General">
            <Row label="Website"><Link href={source.website} /></Row>
            <Row label="Kind">
              <Select value={source.kind} ariaLabel="Kind" size="sm"
                      options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                      onChange={(v) => onPatch({ kind: v as Source['kind'] })} />
            </Row>
            <Row label="Inventory">
              <Select value={source.inventory_type} ariaLabel="Inventory type" size="sm"
                      options={INVENTORY_TYPES.map((k) => ({ value: k, label: INVENTORY_LABEL[k] }))}
                      onChange={(v) => onPatch({ inventory_type: v as Source['inventory_type'] })} />
            </Row>
            <Row label="HQ country">{source.headquarters_country ?? '—'}</Row>
            <Row label="Supports İstanbul"><Bool value={source.supports_istanbul} label="Supports Istanbul" onChange={(v) => onPatch({ supports_istanbul: v })} /></Row>
            <Row label="Turkish local"><Bool value={source.is_turkish_local} label="Turkish local" onChange={(v) => onPatch({ is_turkish_local: v })} /></Row>
            <Row label="Suppliers (est.)">{source.suppliers_count_est ?? '—'}</Row>
            <Row label="TR locations (est.)">{source.turkey_locations_est ?? '—'}</Row>
            <Row label="Markets">{source.markets_note ?? '—'}</Row>
            <Row label="Tags">
              {source.tags?.length
                ? <div className="flex flex-wrap gap-1">{source.tags.map((t) => (
                    <span key={t} className="inline-flex h-[20px] items-center rounded-full border border-black/10 bg-black/[0.03] px-2 text-[11px] text-black/60">{t}</span>
                  ))}</div>
                : <span className="text-black/30">—</span>}
            </Row>
          </Section>

          <Section title="Joining requirements">
            <Row label="Licence">
              <Select value={source.license_requirement} ariaLabel="Licence requirement" size="sm"
                      options={LICENSE_REQUIREMENTS.map((l) => ({ value: l, label: LICENSE_LABEL[l] }))}
                      onChange={(v) => onPatch({ license_requirement: v as Source['license_requirement'] })} />
            </Row>
            <Row label="Contract required"><Bool value={source.requires_contract} label="Requires contract" onChange={(v) => onPatch({ requires_contract: v })} /></Row>
            <Row label="Certification"><Bool value={source.requires_certification} label="Requires certification" onChange={(v) => onPatch({ requires_certification: v })} /></Row>
            <Row label="Sandbox"><Bool value={source.has_sandbox} label="Has sandbox" onChange={(v) => onPatch({ has_sandbox: v })} /></Row>
            <Row label="Self sign-up"><Link href={source.self_signup_url} /></Row>
            <Row label="Other">{source.other_requirements ?? '—'}</Row>
          </Section>

          <Section title="Technical model">
            <Row label="Model">
              <Select value={source.tech_model} ariaLabel="Tech model" size="sm"
                      options={TECH_MODELS.map((t) => ({ value: t, label: TECH_LABEL[t] }))}
                      onChange={(v) => onPatch({ tech_model: v as Source['tech_model'] })} />
            </Row>
            <Row label="Content API"><Bool value={source.has_content_api} label="Content API" onChange={(v) => onPatch({ has_content_api: v })} /></Row>
            <Row label="Availability API"><Bool value={source.has_availability_api} label="Availability API" onChange={(v) => onPatch({ has_availability_api: v })} /></Row>
            <Row label="Booking API"><Bool value={source.has_booking_api} label="Booking API" onChange={(v) => onPatch({ has_booking_api: v })} /></Row>
            <Row label="Webhooks"><Bool value={source.has_webhooks} label="Webhooks" onChange={(v) => onPatch({ has_webhooks: v })} /></Row>
            <Row label="API docs"><Link href={source.api_docs_url} /></Row>
            <Row label="Time to live">
              {source.est_time_to_live_weeks_min ?? '?'}–{source.est_time_to_live_weeks_max ?? '?'} weeks
            </Row>
          </Section>

          <Section title="Cost">
            <Row label="Setup fee">{source.setup_fee_note ?? '—'}</Row>
            <Row label="Monthly fee">{source.monthly_fee_note ?? '—'}</Row>
            <Row label="Commission">{source.commission_note ?? '—'}</Row>
            <Row label="Quote only"><Bool value={source.pricing_is_quote_only} label="Quote only" onChange={(v) => onPatch({ pricing_is_quote_only: v })} /></Row>
          </Section>

          <Section title="Notes">
            <Textarea rows={4} defaultValue={source.notes ?? ''} onBlur={(e) => onPatch({ notes: e.target.value || null })} />
          </Section>

          <Section title={`Contacts (${contacts.length})`}>
            {busy ? <Skeleton className="h-14 rounded-lg" /> : contacts.length === 0 ? (
              <div className="text-[12.5px] text-black/35">No contacts yet.</div>
            ) : contacts.map((c) => (
              <div key={c.id} className="flex items-start gap-2 rounded-lg border border-black/[0.07] p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#0e0e10]">
                    {c.full_name ?? '—'}
                    {c.is_primary && <span className="rounded-full bg-[#6ea4e7]/12 px-1.5 text-[10px] font-medium text-[#1f64bb]">primary</span>}
                  </div>
                  <div className="text-[11.5px] text-black/45">{c.role_title ?? '—'}</div>
                  <div className="mt-0.5 text-[12px] text-black/60">{c.email ?? '—'}{c.phone ? ` · ${c.phone}` : ''}{c.whatsapp ? ` · wa ${c.whatsapp}` : ''}</div>
                </div>
                {c.email && (
                  <Button variant="outline" size="sm" onClick={() => onCompose(c.email!, source.name)}>Email</Button>
                )}
                <button type="button" aria-label="Delete contact"
                        onClick={() => { void deleteContact(c.id).then(reload); }}
                        className="grid h-7 w-7 place-items-center rounded-md text-black/30 hover:bg-[#d4183d]/10 hover:text-[#d4183d]">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {draft ? (
              <div className="flex flex-col gap-2 rounded-lg border border-[#6ea4e7]/30 bg-[#6ea4e7]/[0.04] p-2.5">
                <Input placeholder="Full name" value={draft.full_name ?? ''} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
                <Input placeholder="Role" value={draft.role_title ?? ''} onChange={(e) => setDraft({ ...draft, role_title: e.target.value })} />
                <Input placeholder="Email" value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                <Input placeholder="Phone" value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                <div className="flex items-center gap-2">
                  <Switch checked={draft.is_primary === true} onChange={(v) => setDraft({ ...draft, is_primary: v })} ariaLabel="Primary contact" />
                  <span className="text-[12px] text-black/55">Primary contact</span>
                  <div className="ml-auto flex gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
                    <Button variant="default" size="sm" onClick={() => void saveContact()}>Save</Button>
                  </div>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="self-start" onClick={() => setDraft({ is_primary: contacts.length === 0 })}>
                <Plus size={14} /> Add contact
              </Button>
            )}
          </Section>

          <Section title={`Correspondence (${emails.length})`}>
            {busy ? <Skeleton className="h-14 rounded-lg" /> : emails.length === 0 ? (
              <div className="text-[12.5px] text-black/35">No email linked to this source yet.</div>
            ) : (
              <div className="flex flex-col divide-y divide-black/[0.05] rounded-lg border border-black/[0.07]">
                {emails.map((m) => (
                  <div key={m.id} className="flex items-start gap-2 px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-[#0e0e10]">{m.subject || '(no subject)'}</div>
                      <div className="truncate text-[11.5px] text-black/45">
                        {m.direction === 'inbound' ? 'from ' : 'to '}
                        {m.direction === 'inbound' ? (m.fromName || m.fromEmail || '—') : (m.toEmails?.[0] ?? '—')}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-black/40">{relativeTime(m.emailDate)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </SheetBody>

      <SheetFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </SheetFooter>
    </Sheet>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const SourcesPage: React.FC = () => {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [istanbulOnly, setIstanbulOnly] = useState(false);
  const [localOnly, setLocalOnly] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const rows = await listSources();
      if (!mounted.current) return;
      setSources(rows);
      setError(null);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not load sources.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const say = (t: string) => { setToast(t); window.setTimeout(() => mounted.current && setToast(null), 3000); };

  const patch = useCallback(async (id: string, fields: Partial<Source>) => {
    const before = sources.find((s) => s.id === id);
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...fields } : s)));   // optimistic
    try {
      await updateSource(id, fields);
    } catch (err) {
      if (before) setSources((prev) => prev.map((s) => (s.id === id ? before : s)));  // rollback
      say(err instanceof Error ? err.message : 'Could not save.');
    }
  }, [sources]);

  const drop = useCallback((stage: Stage) => {
    const id = dragId.current;
    dragId.current = null;
    if (!id) return;
    const s = sources.find((x) => x.id === id);
    if (!s || s.stage === stage) return;
    void patch(id, { stage });
  }, [sources, patch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sources.filter((s) =>
      (!q || s.name.toLowerCase().includes(q) || (s.notes ?? '').toLowerCase().includes(q)) &&
      (!kindFilter || s.kind === kindFilter) &&
      (!priorityFilter || s.priority === priorityFilter) &&
      (!istanbulOnly || s.supports_istanbul === true) &&
      (!localOnly || s.is_turkish_local === true));
  }, [sources, search, kindFilter, priorityFilter, istanbulOnly, localOnly]);

  const byStage = useMemo(() => {
    const map = new Map<Stage, Source[]>(STAGES.map((s) => [s, []]));
    for (const s of filtered) map.get(s.stage)?.push(s);
    for (const list of Array.from(map.values())) {
      list.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.name.localeCompare(b.name));
    }
    return map;
  }, [filtered]);

  /** Anything due today or already past — the follow-up list that earns the page. */
  const dueNow = useMemo(
    () => filtered
      .filter((s) => ['overdue', 'today'].includes(dueState(s.next_action_due)))
      .sort((a, b) => (a.next_action_due ?? '').localeCompare(b.next_action_due ?? '')),
    [filtered],
  );

  const open = sources.find((s) => s.id === openId) ?? null;

  return (
    <div className="media-scope min-h-full bg-white px-5 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5">
        <PageHeader
          eyebrow="Distribution"
          title="Sources"
          subtitle="Every platform we distribute through, from first contact to live."
        />

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-[#d4183d]/20 bg-[#d4183d]/[0.05] p-3">
            <AlertTriangle size={15} className="mt-px text-[#d4183d]" />
            <span className="text-[12.5px] text-[#d4183d]">{error}</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => { setLoading(true); void load(); }}>Retry</Button>
          </div>
        )}

        {dueNow.length > 0 && (
          <div className="rounded-xl border border-[#d99a3d]/25 bg-[#d99a3d]/[0.06] p-3">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[#a6702a]">
              Follow up ({dueNow.length})
            </div>
            <div className="flex flex-col gap-1">
              {dueNow.map((s) => (
                <button key={s.id} type="button" onClick={() => setOpenId(s.id)}
                        className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-white/60">
                  <span className="text-[12.5px] font-medium text-[#0e0e10]">{s.name}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-black/55">{s.next_action ?? '—'}</span>
                  <span className={cn('shrink-0 text-[11px] tabular-nums', DUE_CLASS[dueState(s.next_action_due)])}>
                    {dueLabel(s.next_action_due)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[180px] flex-1 sm:max-w-[280px]">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or notes…" aria-label="Search sources" />
          </div>
          <Select value={kindFilter} ariaLabel="Filter by kind" size="default" minWidth={150}
                  options={[{ value: '', label: 'All kinds' }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))]}
                  onChange={setKindFilter} />
          <Select value={priorityFilter} ariaLabel="Filter by priority" size="default" minWidth={140}
                  options={[{ value: '', label: 'All priorities' }, ...PRIORITIES.map((p) => ({ value: p, label: humanise(p) }))]}
                  onChange={setPriorityFilter} />
          <label className="flex items-center gap-1.5 text-[12.5px] text-black/60">
            <Switch checked={istanbulOnly} onChange={setIstanbulOnly} ariaLabel="İstanbul only" /> İstanbul
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-black/60">
            <Switch checked={localOnly} onChange={setLocalOnly} ariaLabel="Turkish local only" /> Local
          </label>
          <span className="ml-auto text-[12px] tabular-nums text-black/40">{filtered.length} of {sources.length}</span>
        </div>

        {/* ── Kanban ───────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-64 w-[240px] shrink-0 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-black/10 px-6 py-14 text-center">
            <SearchX size={22} strokeWidth={1.6} className="text-black/25" />
            <div className="text-[13.5px] font-medium text-black/60">No source matches these filters</div>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-3">
            {STAGES.map((stage) => {
              const list = byStage.get(stage) ?? [];
              return (
                <div
                  key={stage}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(stage)}
                  className="flex w-[248px] shrink-0 flex-col gap-2 rounded-xl bg-black/[0.02] p-2"
                >
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-black/55">
                      {STAGE_LABEL[stage]}
                    </span>
                    <span className="text-[11px] tabular-nums text-black/35">{list.length}</span>
                  </div>
                  {list.map((s) => (
                    <SourceCard key={s.id} source={s} onOpen={() => setOpenId(s.id)} onDragStart={() => { dragId.current = s.id; }} />
                  ))}
                  {list.length === 0 && (
                    <div className="rounded-lg border border-dashed border-black/[0.08] px-2 py-5 text-center text-[11.5px] text-black/25">
                      Drop here
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <SourceDetail
          source={open}
          onClose={() => setOpenId(null)}
          onPatch={(fields) => void patch(open.id, fields)}
          onCompose={(email, name) => {
            // The Mail page owns composing; this hands the address over.
            window.location.assign(`/dashboard/mail?to=${encodeURIComponent(email)}&subject=${encodeURIComponent(name)}`);
          }}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[1200] -translate-x-1/2 rounded-full border border-[#d4183d]/25 bg-[#fff5f6] px-4 py-2 text-[12.5px] text-[#d4183d] shadow-[0_6px_24px_rgb(0_0_0/0.12)]">
          {toast}
        </div>
      )}
    </div>
  );
};

export default SourcesPage;
