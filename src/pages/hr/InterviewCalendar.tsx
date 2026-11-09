import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/media/MediaUI';
import { istanbulDate } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import {
  clearOpenSlots,
  generateSlots,
  saveInterviewSettings,
  setSlotBlocked,
  type Applicant,
  type HrSlot,
  type Interview,
  type InterviewSettings,
  type Opening,
} from '../../lib/recruitment/hr';
import {
  DEFAULT_SLOT_MINUTES,
  INTERVIEW_LOCATIONS,
  SLOT_MINUTE_CHOICES,
  formatDayLabel,
  formatTime,
  istanbulDay,
  istanbulInstant,
} from '../../lib/recruitment/model';
import { SLOT_STATUS_LABELS } from '../../lib/recruitment/labels';
import { leaderboard } from '../../lib/recruitment/pipeline';
import { INPUT } from '../bookings/ui';
import { ConfirmationChip, StageChip } from './hrParts';

const LOCALE = 'en-GB';
const SELECT = cn(INPUT, 'cursor-pointer');
const minutesOf = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

const Card: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, aside, children }) => (
  <section className="surface-depth rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
    <header className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
      {aside}
    </header>
    {children}
  </section>
);

const Field: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className, children }) => (
  <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
    <span className="text-[12.5px] font-medium text-black/65">{label}</span>
    {children}
  </label>
);

/**
 * An opening's interview calendar: where and how long, a day's window turned into slots
 * by `recruitment_generate_slots`, the slots by day with who is in each, and the scored
 * interviews ranked out of 100. The same reads and writes as Team's.
 */
export const InterviewCalendar: React.FC<{
  opening: Opening;
  settings: InterviewSettings | null;
  slots: HrSlot[];
  applicants: Applicant[];
  interviews: Interview[];
  profileId: string | null;
  onChanged: (message?: string) => void;
  onError: (message: string) => void;
  onOpenApplicant: (id: string) => void;
}> = ({ opening, settings, slots, applicants, interviews, profileId, onChanged, onError, onOpenApplicant }) => {
  const [location, setLocation] = useState<string>(settings?.location ?? '');
  const [minutes, setMinutes] = useState<number>(settings?.slotMinutes ?? DEFAULT_SLOT_MINUTES);
  const [notes, setNotes] = useState(settings?.notes ?? '');
  const [day, setDay] = useState(istanbulDate());
  const [from, setFrom] = useState('10:00');
  const [to, setTo] = useState('14:00');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLocation(settings?.location ?? '');
    setMinutes(settings?.slotMinutes ?? DEFAULT_SLOT_MINUTES);
    setNotes(settings?.notes ?? '');
  }, [settings]);

  const byId = useMemo(() => new Map(applicants.map((a) => [a.id, a])), [applicants]);
  const days = useMemo(() => {
    const map = new Map<string, HrSlot[]>();
    for (const slot of slots) {
      const key = istanbulDay(slot.startsAt);
      map.set(key, [...(map.get(key) ?? []), slot]);
    }
    return Array.from(map).sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);
  const ranked = useMemo(() => leaderboard(opening, applicants, interviews), [opening, applicants, interviews]);

  const run = async (work: () => Promise<string | undefined>) => {
    setBusy(true);
    try { onChanged(await work()); } catch (reason) { onError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
  };

  const windowOk = /^\d{4}-\d{2}-\d{2}$/.test(day) && minutesOf(to) - minutesOf(from) >= minutes;
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Interview settings">
          <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <Field label="Location">
              <select aria-label="Location" className={SELECT} value={location} onChange={(event) => setLocation(event.target.value)}>
                <option value="">Not set</option>
                {INTERVIEW_LOCATIONS.map((place) => <option key={place} value={place}>{place}</option>)}
                {location && !(INTERVIEW_LOCATIONS as readonly string[]).includes(location) && <option value={location}>{location}</option>}
              </select>
            </Field>
            <Field label="Slot length">
              <select aria-label="Slot length" className={SELECT} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
                {SLOT_MINUTE_CHOICES.map((n) => <option key={n} value={n}>{n} min</option>)}
              </select>
            </Field>
            <Field label="Notes for the team" className="sm:col-span-2">
              <input dir="auto" className={INPUT} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </div>
          <Button variant="outline" size="lg" className="mt-3 !h-11 md:!h-9" disabled={busy}
            onClick={() => run(async () => { await saveInterviewSettings(opening.id, { slotMinutes: minutes, location: location || null, notes }, profileId); return 'Settings saved'; })}>
            Save settings
          </Button>
        </Card>

        <Card title="Add slots for a day">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Day"><input type="date" className={INPUT} value={day} min={istanbulDate()} onChange={(event) => setDay(event.target.value)} /></Field>
            <Field label="From"><input type="time" className={INPUT} value={from} step={300} onChange={(event) => setFrom(event.target.value)} /></Field>
            <Field label="To"><input type="time" className={INPUT} value={to} step={300} onChange={(event) => setTo(event.target.value)} /></Field>
          </div>
          {!windowOk && <p className="mt-2 text-[12px] text-[#B45309]">The window has to end after it starts and fit one slot.</p>}
          <Button size="lg" className="mt-3 !h-11 px-4 md:!h-9" disabled={busy || !windowOk}
            onClick={() => run(async () => { const n = await generateSlots(opening.id, istanbulInstant(day, from), istanbulInstant(day, to), minutes); return `${plural(n, 'slot')} created`; })}>
            Create slots
          </Button>
        </Card>
      </div>

      {days.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-foreground">No slots yet</p>
          <p className="max-w-[340px] text-[13px] text-black/50">Add a day above. The team books shortlisted candidates into these slots.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {days.map(([key, list]) => (
            <Card key={key} title={formatDayLabel(key, LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })} aside={list.some((s) => s.status === 'open') ? (
              <Button variant="ghost" size="sm" className="!h-11 text-[#B91C1C] md:!h-8" disabled={busy}
                onClick={() => run(async () => { await clearOpenSlots(opening.id, istanbulInstant(key, '00:00'), istanbulInstant(nextDay(key), '00:00')); return 'Open slots removed'; })}>
                Remove open slots
              </Button>
            ) : undefined}>
              <ul className="flex flex-col divide-y divide-black/[0.05]">
                {list.map((slot) => {
                  const who = slot.applicantId ? byId.get(slot.applicantId) : undefined;
                  return (
                    <li key={slot.id} className={cn('flex min-h-[48px] flex-wrap items-center gap-2 py-1.5 text-[13px]', slot.status === 'blocked' && 'opacity-55')}>
                      <span className="font-mono font-semibold tabular-nums text-foreground">{formatTime(slot.startsAt, LOCALE)}–{formatTime(slot.endsAt, LOCALE)}</span>
                      {who ? (
                        <button type="button" className="min-w-0 truncate font-medium text-brand-strong hover:underline" onClick={() => onOpenApplicant(who.id)}><bdi dir="auto">{who.fullName}</bdi></button>
                      ) : <span className="text-black/45">{SLOT_STATUS_LABELS[slot.status] ?? slot.status}</span>}
                      {who && <ConfirmationChip status={who.confirmation} />}
                      {slot.status !== 'booked' && (
                        <button type="button" className="ms-auto min-h-[44px] text-[12.5px] font-medium text-black/55 hover:text-foreground md:min-h-0" disabled={busy} onClick={() => run(async () => { await setSlotBlocked(slot.id, slot.status === 'open'); return undefined; })}>
                          {slot.status === 'open' ? 'Block' : 'Unblock'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <Card title="Leaderboard" aside={<span className="text-[12.5px] text-black/45">Best interview score out of 100</span>}>
        {ranked.length === 0 ? <p className="text-[13px] text-black/50">No scored interviews yet</p> : (
          <ol className="flex flex-col divide-y divide-black/[0.05]">
            {ranked.map(({ applicant, score }, index) => (
              <li key={applicant.id} className="flex min-h-[52px] items-center gap-3 py-1.5">
                <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[12px] font-semibold', index === 0 ? 'bg-[#F5B301]/20 text-[#92400E]' : 'bg-black/[0.05] text-black/50')}>{index + 1}</span>
                <button type="button" className="min-w-0 flex-1 truncate text-start text-[13.5px] font-medium text-foreground hover:text-brand-strong" onClick={() => onOpenApplicant(applicant.id)}><bdi dir="auto">{applicant.fullName}</bdi></button>
                <span className="hidden sm:inline-flex"><StageChip stage={applicant.stage} /></span>
                <span aria-hidden="true" className="hidden h-2 w-28 overflow-hidden rounded-full bg-black/[0.06] sm:block"><span className="block h-full rounded-full bg-[#6EA4E7]" style={{ width: `${score.total}%` }} /></span>
                <strong className="w-16 text-end font-mono text-[13.5px] font-semibold tabular-nums text-foreground">{score.total}/100</strong>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
};

export default InterviewCalendar;
