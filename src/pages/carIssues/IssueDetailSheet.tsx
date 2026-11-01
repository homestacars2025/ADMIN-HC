import React, { useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, Pencil, Trash2 } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { PhotoGrid, UploadProgress } from '../../components/shared/FileDrop';
import type { LightboxItem } from '../../components/shared/Lightbox';
import { DetailRow, Timeline } from '../../components/shared/PageBits';
import { FORM_TYPES, MAX_PHOTOS, resolveCarIssue, updateCarIssue, type Issue, type IssueType } from '../../lib/carIssues';
import { formatDate, istanbulDate } from '../../lib/customers';
import { DateField } from '../bookings/DateRangeField';
import { BookingSheet, FOOTER_BUTTON, Field, FormCard, INPUT, LicensePlate, Notice, PrimaryButton } from '../bookings/ui';
import { CarIcon, FileIcon } from '../customers/ui';
import { DESCRIPTION_HINT } from './IssueFormSheet';
import { DaysChip, StatusChip, TypeCards, TypeChip } from './ui';

const noSubmit = (event: React.FormEvent) => event.preventDefault();

const PhotoColumn: React.FC<{
  title: string;
  urls: string[];
  empty: string;
  onOpen: (items: LightboxItem[], start: number) => void;
}> = ({ title, urls, empty, onOpen }) => {
  const items = urls.map((url, index) => ({ url, label: `${title} ${index + 1}` }));
  const [first, ...rest] = items;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold text-black/65">
        {title}
        <span className="font-medium tabular-nums text-black/40">{urls.length}</span>
      </div>
      {first ? (
        <>
          <button type="button" aria-label={`Open ${first.label}`} onClick={() => onOpen(items, 0)} className="block aspect-[4/3] w-full overflow-hidden rounded-xl border border-subtle bg-black/[0.03]">
            <img src={first.url} alt={first.label} className="h-full w-full object-cover" />
          </button>
          {rest.length > 0 && (
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {rest.slice(0, 6).map((item, index) => (
                <button key={item.url} type="button" aria-label={`Open ${item.label}`} onClick={() => onOpen(items, index + 1)} className="block aspect-square overflow-hidden rounded-lg border border-subtle">
                  <img src={item.url} alt={item.label} loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-black/15 px-3 text-center text-[12.5px] text-black/45">{empty}</div>
      )}
    </div>
  );
};

export const IssueDetailSheet: React.FC<{
  issue: Issue;
  onClose: () => void;
  onEdit: () => void;
  onResolve: () => void;
  onDelete: () => void;
  onOpenPhoto: (items: LightboxItem[], start: number) => void;
}> = ({ issue, onClose, onEdit, onResolve, onDelete, onOpenPhoto }) => (
  <BookingSheet
    narrow
    label="Issue details"
    title={issue.model_name ?? 'Issue'}
    badge={<LicensePlate plate={issue.plate_number} />}
    subtitle={<span className="mt-1 flex flex-wrap gap-1.5"><TypeChip type={issue.type} /><StatusChip status={issue.status} /><DaysChip issue={issue} /></span>}
    dirty={false}
    saving={false}
    onClose={onClose}
    onSubmit={noSubmit}
    footer={() => (
      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <Button variant="secondary" size="lg" className={FOOTER_BUTTON} onClick={onDelete}><Trash2 size={14} /> Delete</Button>
        <Button variant="secondary" size="lg" className={FOOTER_BUTTON} onClick={onEdit}><Pencil size={14} /> Edit</Button>
        {issue.status === 'open' && <Button size="lg" className={`${FOOTER_BUTTON} col-span-2`} onClick={onResolve}><Check size={14} /> Mark resolved</Button>}
      </div>
    )}
  >
    <FormCard icon={<CarIcon size={15} />} title="Before and after">
      <div className="grid grid-cols-2 gap-3 sm:col-span-2">
        <PhotoColumn title="Before" urls={issue.damage_photos} empty="No damage photos" onOpen={onOpenPhoto} />
        <PhotoColumn title="After" urls={issue.repair_photos} empty={issue.status === 'open' ? 'Not repaired yet' : 'No repair photos'} onOpen={onOpenPhoto} />
      </div>
    </FormCard>

    <FormCard icon={<FileIcon size={15} />} title="Details">
      <dl className="grid grid-cols-1 gap-3.5 sm:col-span-2 sm:grid-cols-2">
        <DetailRow label="Reported by">{issue.discovered_by_name ?? '—'}</DetailRow>
        <DetailRow label="Discovered"><span className="tabular-nums">{formatDate(issue.discovered_at)}</span></DetailRow>
        <DetailRow label="Customer">{issue.customer_name ?? '—'}</DetailRow>
        <DetailRow label="Booking"><span className="font-mono tabular-nums">{issue.booking_number ?? '—'}</span></DetailRow>
        <DetailRow label="Description" span><span className="whitespace-pre-wrap">{issue.description || 'No description was added.'}</span></DetailRow>
      </dl>
    </FormCard>

    <FormCard icon={<CalendarDays size={15} />} title="Timeline">
      <div className="sm:col-span-2">
        <Timeline steps={[
          { label: 'Discovered', detail: formatDate(issue.discovered_at), done: true },
          {
            label: 'Resolved',
            detail: issue.status === 'resolved'
              ? `${formatDate(issue.resolved_at)}${issue.days_to_resolve !== null ? ` · ${issue.days_to_resolve} ${issue.days_to_resolve === 1 ? 'day' : 'days'}` : ''}`
              : 'Still open',
            done: issue.status === 'resolved',
          },
        ]} />
      </div>
    </FormCard>
  </BookingSheet>
);

export const ResolveSheet: React.FC<{ issue: Issue; onClose: () => void; onDone: (message: string) => void }> = ({ issue, onClose, onDone }) => {
  const today = useMemo(() => istanbulDate(), []);
  const [photos, setPhotos] = useState<File[]>([]);
  const [resolvedAt, setResolvedAt] = useState(today);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await resolveCarIssue(issue, photos, resolvedAt, note, (label, done, total) => setProgress({ label, done, total }));
      onDone('Issue marked as resolved.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "This issue wasn't resolved. Try again.");
      savingRef.current = false;
      setSaving(false);
      setProgress(null);
    }
  };

  return (
    <BookingSheet
      narrow
      label="Mark resolved"
      title="Mark resolved"
      subtitle={issue.plate_number ?? undefined}
      summary={progress ? <UploadProgress {...progress} /> : undefined}
      dirty={photos.length > 0 || Boolean(note.trim()) || resolvedAt !== today}
      saving={saving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(requestClose) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={requestClose}>Cancel</Button>
          <PrimaryButton saving={saving}>Confirm resolved</PrimaryButton>
        </div>
      )}
    >
      <FormCard icon={<CarIcon size={15} />} title="Repair photos">
        <PhotoGrid label="Repair photos (optional)" files={photos} max={MAX_PHOTOS} disabled={saving} onChange={setPhotos} />
      </FormCard>
      <FormCard icon={<CalendarDays size={15} />} title="Resolution">
        <DateField label="Resolved date" span value={resolvedAt} onChange={(day) => setResolvedAt(day || today)} />
        <Field label="Note" span hint="Saved at the end of the issue's description.">
          <textarea aria-label="Note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was done, and where?" className={`${INPUT} !h-auto resize-y py-2.5`} />
        </Field>
      </FormCard>
      {error && <Notice tone="red">{error}</Notice>}
    </BookingSheet>
  );
};

export const EditIssueSheet: React.FC<{ issue: Issue; onClose: () => void; onDone: (message: string) => void }> = ({ issue, onClose, onDone }) => {
  const [type, setType] = useState<IssueType>(issue.type);
  const [description, setDescription] = useState(issue.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const types = FORM_TYPES.includes(issue.type) ? FORM_TYPES : [...FORM_TYPES, issue.type];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await updateCarIssue(issue.id, type, description);
      onDone('Issue updated.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "This issue wasn't updated. Try again.");
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <BookingSheet
      narrow
      label="Edit issue"
      title="Edit issue"
      subtitle={issue.plate_number ?? undefined}
      dirty={type !== issue.type || description !== (issue.description ?? '')}
      saving={saving}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(requestClose) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" className={FOOTER_BUTTON} disabled={saving} onClick={requestClose}>Cancel</Button>
          <PrimaryButton saving={saving}>Save changes</PrimaryButton>
        </div>
      )}
    >
      <FormCard icon={<CarIcon size={15} />} title="Issue type">
        <TypeCards types={types} value={type} onChange={setType} />
      </FormCard>
      <FormCard icon={<FileIcon size={15} />} title="Description">
        <Field label="Description" span>
          <textarea aria-label="Description" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={DESCRIPTION_HINT} className={`${INPUT} !h-auto resize-y py-2.5`} />
        </Field>
      </FormCard>
      {error && <Notice tone="red">{error}</Notice>}
    </BookingSheet>
  );
};
