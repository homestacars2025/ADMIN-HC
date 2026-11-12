import React, { useEffect, useMemo, useState } from 'react';
import { Check, Info } from '../../components/media/MediaIcons';
import {
  Button,
  Field,
  Input,
  Sheet,
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  Switch,
} from '../../components/media/MediaUI';
import StaffAvatar from '../../components/shared/StaffAvatar';
import {
  createMailbox,
  grantMailbox,
  listMailboxGrants,
  listTeamMembers,
  revokeMailbox,
  setMailboxCanSend,
  type CreatedMailbox,
  type EmailAccount,
  type MailboxGrant,
  type TeamMember,
} from '../../lib/mail';
import { cleanLocalPart, MAIL_DOMAIN } from '../../lib/mailThreads';
import { cn } from '../../lib/media/badgeColor';

const SWATCHES = ['#6ea4e7', '#4ba6ea', '#22a06b', '#e8a33d', '#e5604d', '#9b6dd7', '#d4549b', '#5b6b7b'];

function useTeamMembers(open: boolean) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || members) return undefined;
    let active = true;
    listTeamMembers()
      .then((rows) => { if (active) setMembers(rows); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load the team.'); });
    return () => { active = false; };
  }, [open, members]);
  return { members, error };
}

const MemberLine: React.FC<{ member: TeamMember }> = ({ member }) => (
  <span className="flex min-w-0 flex-1 items-center gap-2.5">
    <StaffAvatar profile={{ id: member.profileId, avatar_url: member.avatarUrl, avatar_bg: member.avatarBg, gender: member.gender }} size={32} alt="" />
    <span className="min-w-0">
      <span dir="auto" className="block truncate text-[13px] font-medium text-black/80">{member.fullName}</span>
      <span className="block truncate text-[11.5px] text-black/45">{member.position || member.email || ' '}</span>
    </span>
  </span>
);

// ── New mailbox ──────────────────────────────────────────────────────────────

export const NewMailboxSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreated: (mailbox: CreatedMailbox) => void;
}> = ({ open, onClose, onCreated }) => {
  const [localPart, setLocalPart] = useState('');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { members, error: membersError } = useTeamMembers(open);

  useEffect(() => {
    if (!open) return;
    setLocalPart(''); setLabel(''); setColor(SWATCHES[0]); setGranted(new Set()); setError(null); setSaving(false);
  }, [open]);

  const clean = cleanLocalPart(localPart);
  const address = `${clean || 'name'}@${MAIL_DOMAIN}`;

  const toggle = (profileId: string) => setGranted((current) => {
    const next = new Set(current);
    if (next.has(profileId)) next.delete(profileId); else next.add(profileId);
    return next;
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clean) { setError('Enter the part before @ — for example "sales".'); return; }
    setSaving(true);
    setError(null);
    try {
      const created = await createMailbox({ localPart: clean, label: label.trim(), color, grantProfiles: Array.from(granted) });
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the mailbox.');
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={saving ? () => undefined : onClose} ariaLabel="New mailbox" maxWidthClass="sm:max-w-[520px]">
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>New mailbox</SheetTitle>
          <SheetDescription>An address at {MAIL_DOMAIN}, for the whole team or just the people you pick.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <Field label="Address">
            <div className="flex items-center overflow-hidden rounded-lg border border-input focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20">
              <input
                autoFocus
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value)}
                placeholder="sales"
                aria-label="Address, the part before @"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-11 min-w-0 flex-1 bg-transparent px-3 text-[14px] outline-none md:h-10"
              />
              <span className="flex h-11 items-center border-s border-black/[0.06] bg-black/[0.025] px-3 text-[13px] text-black/50 md:h-10">@{MAIL_DOMAIN}</span>
            </div>
          </Field>

          <div className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-[#FAFBFC] px-4 py-3">
            <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-semibold uppercase text-white" style={{ backgroundColor: color }}>
              {(label.trim() || clean || '?').charAt(0)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-foreground">{label.trim() || (clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'New mailbox')}</span>
              <span className={cn('block truncate text-[13px] tabular-nums', clean ? 'text-brand-strong' : 'text-black/35')} aria-live="polite">{address}</span>
            </span>
          </div>

          <Field label="Name shown in the inbox">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Sales" className="!h-11 md:!h-10" />
          </Field>

          <Field label="Colour">
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={`Colour ${swatch}`}
                  aria-pressed={color === swatch}
                  className="grid h-11 w-11 place-items-center rounded-full transition-transform hover:scale-105 md:h-9 md:w-9"
                  style={{ backgroundColor: swatch, boxShadow: color === swatch ? `0 0 0 2px #fff, 0 0 0 4px ${swatch}` : undefined }}
                >
                  {color === swatch && <Check size={15} strokeWidth={2.6} className="text-white" />}
                </button>
              ))}
              <label className="relative grid h-11 w-11 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-black/20 text-[10px] text-black/45 md:h-9 md:w-9" title="Custom colour">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom colour" />
                +
              </label>
            </div>
          </Field>

          <Field label={`Team access${granted.size ? ` · ${granted.size}` : ''}`}>
            <p className="-mt-0.5 text-[12px] text-black/45">Optional. Admins always see every mailbox. You can change this later in Team access.</p>
            {membersError && <p role="alert" className="text-[12px] text-[#b3122f]">{membersError}</p>}
            {!members && !membersError && <div className="flex items-center gap-2 py-2 text-[12.5px] text-black/45"><Spinner size={12} /> Loading the team…</div>}
            {members && (
              <ul className="max-h-[260px] divide-y divide-black/[0.05] overflow-y-auto rounded-xl border border-black/[0.07]">
                {members.map((member) => {
                  const on = granted.has(member.profileId);
                  return (
                    <li key={member.profileId}>
                      <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-black/[0.02]">
                        <MemberLine member={member} />
                        <input type="checkbox" checked={on} onChange={() => toggle(member.profileId)} className="h-5 w-5 shrink-0 accent-[#6ea4e7]" aria-label={`Give ${member.fullName} access`} />
                      </label>
                    </li>
                  );
                })}
                {members.length === 0 && <li className="px-3 py-3 text-[12.5px] text-black/45">No active team members.</li>}
              </ul>
            )}
          </Field>

          <div className="flex gap-2.5 rounded-xl bg-emerald-500/[0.07] px-3.5 py-3 text-[12.5px] leading-relaxed text-emerald-800">
            <Info size={15} className="mt-0.5 shrink-0" />
            <span>The mailbox is ready straight away. It receives and sends with no extra setup.</span>
          </div>

          {error && <p role="alert" className="rounded-lg bg-[#d4183d]/[0.07] px-3 py-2 text-[12.5px] text-[#b3122f]">{error}</p>}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" size="lg" className="!h-11 md:!h-10" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" size="lg" className="!h-11 md:!h-10" disabled={saving || !clean}>
            {saving && <Spinner size={13} />} Create mailbox
          </Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
};

// ── Who sees which mailbox ───────────────────────────────────────────────────

export const MailboxAccessSheet: React.FC<{
  open: boolean;
  accounts: EmailAccount[];
  initialAccountId: string | null;
  onClose: () => void;
}> = ({ open, accounts, initialAccountId, onClose }) => {
  const { members, error: membersError } = useTeamMembers(open);
  const [grants, setGrants] = useState<MailboxGrant[] | null>(null);
  const [grantsError, setGrantsError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    setAccountId(initialAccountId ?? accounts[0]?.id ?? null);
    setError(null);
    let active = true;
    listMailboxGrants()
      .then((rows) => { if (active) { setGrants(rows); setGrantsError(null); } })
      .catch((err: unknown) => { if (active) setGrantsError(err instanceof Error ? err.message : 'Could not load access.'); });
    return () => { active = false; };
    // Reloaded each time the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const grantFor = useMemo(() => {
    const map = new Map<string, MailboxGrant>();
    (grants ?? []).filter((g) => g.accountId === accountId).forEach((g) => map.set(g.profileId, g));
    return map;
  }, [grants, accountId]);
  const countFor = (id: string) => (grants ?? []).filter((g) => g.accountId === id).length;

  const change = async (member: TeamMember, next: { sees: boolean; canSend: boolean }) => {
    if (!accountId) return;
    const current = grantFor.get(member.profileId);
    const key = `${accountId}:${member.profileId}`;
    setBusy(key);
    setError(null);
    try {
      if (!next.sees && current) await revokeMailbox(accountId, member.profileId);
      else if (next.sees && !current) await grantMailbox(accountId, member.profileId, next.canSend);
      else if (next.sees && current && current.canSend !== next.canSend) await setMailboxCanSend(accountId, member.profileId, next.canSend);
      setGrants((list) => {
        const rest = (list ?? []).filter((g) => !(g.accountId === accountId && g.profileId === member.profileId));
        return next.sees ? [...rest, { accountId, profileId: member.profileId, canSend: next.canSend }] : rest;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change access.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} ariaLabel="Team access to mailboxes" maxWidthClass="sm:max-w-[560px]">
      <SheetHeader>
        <SheetTitle>Team access</SheetTitle>
        <SheetDescription>Who on the team sees each mailbox in their Inbox, and who can send from it. Admins always see everything.</SheetDescription>
      </SheetHeader>
      <SheetBody>
        <div role="tablist" aria-label="Mailbox" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {accounts.map((a) => {
            const active = a.id === accountId;
            return (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setAccountId(a.id)}
                className={cn('inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] transition-colors md:h-9', active ? 'font-semibold text-foreground' : 'border-black/[0.08] font-medium text-black/60 hover:bg-black/[0.03]')}
                style={active ? { borderColor: a.color ?? '#6ea4e7', backgroundColor: `${a.color ?? '#6ea4e7'}1f` } : undefined}
              >
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: a.color ?? '#9aa5b1' }} />
                {a.emailAddress.split('@')[0]}
                {grants && <span className="text-[11.5px] tabular-nums text-black/40">{countFor(a.id)}</span>}
              </button>
            );
          })}
        </div>

        {account && <p className="-mt-2 text-[12.5px] text-black/50">{account.label} · {account.emailAddress}</p>}

        {(membersError || grantsError) && <p role="alert" className="text-[12.5px] text-[#b3122f]">{membersError ?? grantsError}</p>}
        {(!members || !grants) && !membersError && !grantsError && (
          <div className="flex items-center gap-2 py-4 text-[12.5px] text-black/45"><Spinner size={12} /> Loading…</div>
        )}

        {members && grants && account && (
          <div className="overflow-hidden rounded-xl border border-black/[0.07]">
            <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 border-b border-black/[0.06] bg-[#FAFBFC] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-black/40">
              <span>Member</span>
              <span className="text-center">Sees</span>
              <span className="text-center">Sends</span>
            </div>
            <ul className="divide-y divide-black/[0.05]">
              {members.map((member) => {
                const grant = grantFor.get(member.profileId);
                const sees = Boolean(grant);
                const canSend = grant?.canSend ?? false;
                const working = busy === `${account.id}:${member.profileId}`;
                return (
                  <li key={member.profileId} className="grid min-h-[56px] grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 px-3 py-2">
                    <MemberLine member={member} />
                    <span className="grid place-items-center">
                      {working ? <Spinner size={13} /> : (
                        <Switch checked={sees} onChange={(value) => void change(member, { sees: value, canSend: value ? true : false })} ariaLabel={`${member.fullName} sees ${account.emailAddress}`} activeClass="bg-[#6ea4e7]" />
                      )}
                    </span>
                    <span className="grid place-items-center">
                      <Switch checked={canSend} disabled={!sees || working} onChange={(value) => void change(member, { sees: true, canSend: value })} ariaLabel={`${member.fullName} can send from ${account.emailAddress}`} />
                    </span>
                  </li>
                );
              })}
              {members.length === 0 && <li className="px-3 py-4 text-[12.5px] text-black/45">No active team members.</li>}
            </ul>
          </div>
        )}
        {error && <p role="alert" className="rounded-lg bg-[#d4183d]/[0.07] px-3 py-2 text-[12.5px] text-[#b3122f]">{error}</p>}
      </SheetBody>
      <SheetFooter>
        <Button size="lg" className="!h-11 md:!h-10" onClick={onClose}>Done</Button>
      </SheetFooter>
    </Sheet>
  );
};
