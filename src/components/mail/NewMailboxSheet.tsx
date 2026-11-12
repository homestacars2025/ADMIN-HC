import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/media/badgeColor';
import { createMailbox, listTeamMembers, type CreatedMailbox, type TeamMemberOption } from '../../lib/mail';
import { cleanLocalPart } from '../../lib/mailThreads';
import { AlertTriangle, Check, CheckCircle2 } from '../media/MediaIcons';
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
  Skeleton,
  Spinner,
} from '../media/MediaUI';

/**
 * Creates a mailbox through `create_mailbox`.
 *
 * The function owns every rule: admin only, the domain, cleaning the local part,
 * refusing duplicates, and the optional access grants. This sheet only previews
 * what it will do and reports what it said.
 */

const DEFAULT_COLOR = '#6ea4e7';
const SWATCHES = ['#6ea4e7', '#4f9d8f', '#e0a43a', '#d9665b', '#8e6fd8', '#3f8fd2', '#5b6b7f', '#d26aa3'];

interface Props {
  open: boolean;
  /** The address domain, read from the existing mailboxes. */
  domain: string;
  onClose: () => void;
  onCreated: (mailbox: CreatedMailbox) => void;
}

const NewMailboxSheet: React.FC<Props> = ({ open, domain, onClose, onCreated }) => {
  const [localPart, setLocalPart] = useState('');
  const [label, setLabel] = useState('');
  const [labelTouched, setLabelTouched] = useState(false);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [members, setMembers] = useState<TeamMemberOption[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh form each time it opens.
  useEffect(() => {
    if (!open) return;
    setLocalPart(''); setLabel(''); setLabelTouched(false); setColor(DEFAULT_COLOR);
    setGranted(new Set()); setError(null); setSaving(false);

    let alive = true;
    setMembers(null); setMembersError(null);
    listTeamMembers()
      .then((m) => alive && setMembers(m))
      .catch((err) => alive && setMembersError(err instanceof Error ? err.message : 'Could not load the team.'));
    return () => { alive = false; };
  }, [open]);

  const cleaned = cleanLocalPart(localPart);
  const suggestedLabel = cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1).replace(/[._-]+/g, ' ') : '';
  const shownLabel = labelTouched ? label : suggestedLabel;
  const address = `${cleaned || 'name'}@${domain}`;
  const changedByCleaning = localPart.trim() !== '' && localPart.trim().toLowerCase() !== cleaned;

  const toggle = (id: string) => setGranted((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submit = async () => {
    if (!cleaned) { setError('Enter the part before the @.'); return; }
    setSaving(true);
    setError(null);
    try {
      const created = await createMailbox({
        localPart: cleaned,
        label: shownLabel.trim(),
        color,
        grantProfiles: Array.from(granted),
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the mailbox.');
      setSaving(false);
    }
  };

  const grantedNames = useMemo(
    () => (members ?? []).filter((m) => granted.has(m.profileId)).map((m) => m.name.split(' ')[0]),
    [members, granted],
  );

  return (
    <Sheet open={open} onClose={saving ? () => {} : onClose} ariaLabel="New mailbox" maxWidthClass="sm:max-w-[520px]" blocking={saving}>
      <SheetHeader>
        <SheetTitle>New mailbox</SheetTitle>
        <SheetDescription>Ready the moment it is created: it receives and sends with no extra setup.</SheetDescription>
      </SheetHeader>
      <SheetBody>
        {/* Live preview of exactly what will exist. */}
        <div className="flex items-center gap-3 rounded-xl border border-black/[0.07] bg-gradient-to-b from-white to-black/[0.015] p-4">
          <span
            aria-hidden="true"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[17px] font-semibold text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.08)]"
            style={{ backgroundColor: color }}
          >
            {(shownLabel || cleaned || '?').charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-foreground">{shownLabel || 'Mailbox name'}</div>
            <div className={cn('truncate font-mono text-[13px]', cleaned ? 'text-black/65' : 'text-black/30')} aria-live="polite">{address}</div>
          </div>
        </div>

        <Field label="Address">
          <div className="flex h-10 items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20">
            <input
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              placeholder="sales"
              aria-label="Address, the part before the @"
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              className="min-w-0 flex-1 bg-transparent px-3 text-[14px] text-foreground outline-none placeholder:text-black/30"
            />
            <span className="flex items-center border-l border-black/[0.06] bg-black/[0.025] px-3 text-[13px] text-black/45">@{domain}</span>
          </div>
          {changedByCleaning && (
            <p className="text-[12px] text-black/45">Only letters, numbers, dots, dashes and underscores are kept.</p>
          )}
        </Field>

        <Field label="Display name">
          <Input
            value={shownLabel}
            onChange={(e) => { setLabelTouched(true); setLabel(e.target.value); }}
            placeholder="Sales"
            aria-label="Display name"
            className="h-10 text-[14px]"
          />
        </Field>

        <Field label="Colour">
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => {
              const on = c.toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={on}
                  onClick={() => setColor(c)}
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
                    on && 'ring-2 ring-black/15 ring-offset-2',
                  )}
                  style={{ backgroundColor: c }}
                >
                  {on && <Check size={14} strokeWidth={3} className="text-white" />}
                </button>
              );
            })}
            <label className="relative grid h-8 cursor-pointer place-items-center rounded-full border border-dashed border-black/20 px-3 text-[12px] font-medium text-black/55 hover:border-black/35">
              Custom
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Custom colour"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </Field>

        <Field label={<span>Team access <span className="font-normal text-black/40">(optional)</span></span>}>
          <p className="-mt-0.5 text-[12px] text-black/45">
            Saved with the mailbox, for the Team inbox. Admins always see every mailbox.
          </p>
          <div className="max-h-[240px] overflow-y-auto rounded-xl border border-black/[0.07]">
            {members === null && !membersError ? (
              <div className="flex flex-col gap-2 p-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
              </div>
            ) : membersError ? (
              <div className="p-3 text-[12.5px] text-destructive">{membersError}</div>
            ) : members && members.length === 0 ? (
              <div className="p-4 text-center text-[12.5px] text-black/40">No active team members.</div>
            ) : (
              <ul className="divide-y divide-black/[0.04]">
                {(members ?? []).map((m) => {
                  const on = granted.has(m.profileId);
                  return (
                    <li key={m.profileId}>
                      <label className="flex min-h-[48px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-black/[0.02]">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(m.profileId)}
                          className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-foreground">{m.name}</span>
                          <span className="block truncate text-[11.5px] text-black/45">{[m.position, m.email].filter(Boolean).join(' · ')}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {grantedNames.length > 0 && (
            <p className="text-[12px] text-black/50">Access for {grantedNames.join(', ')}.</p>
          )}
        </Field>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/[0.05] px-3 py-2 text-[12.5px] text-destructive">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            {error}
          </div>
        )}
      </SheetBody>
      <SheetFooter>
        <Button variant="outline" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="default" size="lg" onClick={() => void submit()} disabled={saving || !cleaned}>
          {saving ? <Spinner size={13} /> : <CheckCircle2 size={15} />}
          {saving ? 'Creating…' : 'Create mailbox'}
        </Button>
      </SheetFooter>
    </Sheet>
  );
};

export default NewMailboxSheet;
