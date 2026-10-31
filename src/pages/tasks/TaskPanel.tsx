import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { toast } from '../../components/media/MediaToast';
import { X } from '../../components/media/MediaIcons';
import { Button, Field, Input, Sheet, SheetBody, SheetHeader, SheetTitle } from '../../components/media/MediaUI';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { cn } from '../../lib/media/badgeColor';
import {
  cancelTask,
  formatDue,
  isTaskOpen,
  isTaskOverdue,
  proofLink,
  taskAssignee,
  type AdminTask,
} from '../../lib/tasks';
import { PriorityChip, StatusChip, errorText } from './shared';

interface TimelineStep {
  label: string;
  at: string;
  color: string;
}

function timelineOf(task: AdminTask): TimelineStep[] {
  const creator = Array.isArray(task.creator) ? task.creator[0] : task.creator;
  const steps: TimelineStep[] = [
    { label: creator?.full_name ? `Created by ${creator.full_name}` : 'Created', at: task.created_at, color: '#D4D4D4' },
  ];
  if (task.assigned_to) steps.push({ label: 'Assignee notified', at: task.created_at, color: '#6EA4E7' });
  if (task.due_soon_notified_at) steps.push({ label: 'Reminded: due soon', at: task.due_soon_notified_at, color: '#F59E0B' });
  if (task.overdue_notified_at) steps.push({ label: 'Reminded: overdue', at: task.overdue_notified_at, color: '#DC2626' });
  if (task.completed_at) steps.push({ label: 'Done', at: task.completed_at, color: '#16A34A' });
  if (task.missed_at) steps.push({ label: 'Missed', at: task.missed_at, color: '#DC2626' });
  if (task.status === 'cancelled') steps.push({ label: 'Cancelled', at: task.updated_at, color: '#9CA3AF' });
  return steps;
}

const Lightbox: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => ReactDOM.createPortal(
  <div role="dialog" aria-label="Proof photo" onClick={onClose} className="fixed inset-0 z-[10003] grid place-items-center bg-black/80 p-4">
    <button type="button" aria-label="Close" onClick={onClose} className="absolute end-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white">
      <X size={18} />
    </button>
    <img src={url} alt="Proof" className="max-h-full max-w-full rounded-xl object-contain" />
  </div>,
  document.body,
);

const ProofView: React.FC<{ proof: string }> = ({ proof }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    proofLink(proof)
      .then((link) => { if (!cancelled) setUrl(link); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [proof]);

  if (failed) return <p className="text-[13px] text-red-600">Couldn't load the proof photo.</p>;
  if (!url) return <div className="h-40 animate-pulse rounded-xl bg-black/[0.04]" />;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Open proof photo" className="block overflow-hidden rounded-xl border border-subtle">
        <img src={url} alt="Proof" className="max-h-56 w-full object-cover" />
      </button>
      {open && <Lightbox url={url} onClose={() => setOpen(false)} />}
    </>
  );
};

export const TaskPanel: React.FC<{
  task: AdminTask;
  departmentLabel: string;
  startCancelling: boolean;
  onClose: () => void;
  onChanged: () => void;
}> = ({ task, departmentLabel, startCancelling, onClose, onChanged }) => {
  const [cancelling, setCancelling] = useState(startCancelling);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const assignee = taskAssignee(task);
  const timeline = useMemo(() => timelineOf(task), [task]);

  const submitCancel = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await cancelTask(task.id, reason.trim());
      toast.success('Task cancelled');
      onChanged();
      onClose();
    } catch (error) {
      toast.error(`Couldn't cancel: ${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} ariaLabel={task.title} maxWidthClass="sm:max-w-[480px]">
      <SheetHeader>
        <div className="pe-8">
          <SheetTitle>{task.title}</SheetTitle>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusChip status={task.status} overdue={isTaskOverdue(task)} />
            <PriorityChip priority={task.priority} />
            {task.kind === 'recurring' && <span className="text-[12px] text-black/50">↻ Recurring</span>}
          </div>
        </div>
      </SheetHeader>
      <SheetBody>
        {task.description && <p dir="auto" className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-black/70">{task.description}</p>}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <div>
            <dt className="text-[12px] text-black/45">Assignee</dt>
            <dd className="mt-1 flex items-center gap-2 text-foreground">
              {assignee ? <><StaffAvatar profile={assignee} size={24} />{assignee.full_name}</> : 'Nobody'}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-black/45">Department</dt>
            <dd className="mt-1 text-foreground">{departmentLabel}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-black/45">Due</dt>
            <dd className={cn('mt-1', isTaskOverdue(task) ? 'font-medium text-red-600' : 'text-foreground')}>{formatDue(task.due_at)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-black/45">Proof photo</dt>
            <dd className="mt-1 text-foreground">{task.requires_proof ? 'Required' : 'Not required'}</dd>
          </div>
        </dl>

        <section>
          <h3 className="mb-2 text-[13.5px] font-medium text-foreground">Timeline</h3>
          <ol>
            {timeline.map((step, index) => (
              <li key={step.label} className="relative flex gap-3 pb-3 last:pb-0">
                {index < timeline.length - 1 && <span aria-hidden="true" className="absolute bottom-0 start-[4px] top-3 w-px bg-[var(--border-subtle)]" />}
                <span aria-hidden="true" className="mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: step.color }} />
                <div className="min-w-0">
                  <div className="text-[13px] text-foreground">{step.label}</div>
                  <div className="text-[11.5px] text-black/45">{formatDue(step.at)}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {task.cancel_reason && (
          <section>
            <h3 className="mb-1 text-[13.5px] font-medium text-foreground">Why it was cancelled</h3>
            <p dir="auto" className="text-[13px] text-black/70">{task.cancel_reason}</p>
          </section>
        )}

        {task.completion_notes && (
          <section>
            <h3 className="mb-1 text-[13.5px] font-medium text-foreground">Note</h3>
            <p dir="auto" className="whitespace-pre-wrap text-[13px] text-black/70">{task.completion_notes}</p>
          </section>
        )}

        {task.proof_url && (
          <section>
            <h3 className="mb-2 text-[13.5px] font-medium text-foreground">Proof</h3>
            <ProofView proof={task.proof_url} />
          </section>
        )}

        {isTaskOpen(task.status) && (cancelling ? (
          <form onSubmit={submitCancel} className="flex flex-col gap-2 rounded-xl border border-subtle p-4">
            <Field label="Reason for cancelling">
              <Input autoFocus value={reason} onChange={(event) => setReason(event.target.value)} className="h-11 md:h-9" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="!h-11 px-3 md:!h-10"
                disabled={busy}
                onClick={() => setCancelling(false)}>Keep task</Button>
              <Button
                type="submit"
                variant="destructive"
                size="lg"
                className="!h-11 px-3 md:!h-10"
                disabled={busy || !reason.trim()}>
                {busy ? 'Cancelling…' : 'Cancel task'}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="outline"
            size="lg"
            className="!h-11 self-start px-3 md:!h-10"
            onClick={() => setCancelling(true)}>
            Cancel this task
          </Button>
        ))}
      </SheetBody>
    </Sheet>
  );
};
