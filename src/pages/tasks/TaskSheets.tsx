import React, { useState } from 'react';
import { toast } from '../../components/media/MediaToast';
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
  Textarea,
} from '../../components/media/MediaUI';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { PRIORITY_STYLES, type TaskPriority } from '../../lib/notifications';
import {
  cancelTask,
  createTask,
  formatDue,
  isTaskOpen,
  isTaskOverdue,
  istanbulLocalToIso,
  proofLink,
  taskAssignee,
  type AdminTask,
} from '../../lib/tasks';
import {
  AssignField,
  FIELD_CLASS,
  PRIMARY_BUTTON,
  PriorityChip,
  StatusChip,
  errorText,
  type DepartmentOption,
  type StaffOption,
} from './shared';

const PRIORITIES = Object.keys(PRIORITY_STYLES) as TaskPriority[];

export const NewTaskSheet: React.FC<{
  staff: StaffOption[];
  departments: DepartmentOption[];
  onClose: () => void;
  onCreated: () => void;
}> = ({ staff, departments, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assign, setAssign] = useState({ assignee: '', department: '' });
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [requiresProof, setRequiresProof] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error('Enter a title.');
      return;
    }
    if (!assign.assignee && !assign.department) {
      toast.error('Choose a person or a department.');
      return;
    }

    setSaving(true);
    try {
      const count = await createTask({
        title: title.trim(),
        description: description.trim() || null,
        assignee: assign.assignee || null,
        department: assign.department || null,
        dueAt: due ? istanbulLocalToIso(due) : null,
        priority,
        requiresProof,
      });
      if (count === 0) {
        toast.warning('Nobody is active in that department, so no task was created.');
      } else {
        toast.success(`Created for ${count} staff`);
        onCreated();
      }
    } catch (error) {
      toast.error(`Couldn't create the task: ${errorText(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} ariaLabel="New task">
      <form onSubmit={submit} className="flex h-full flex-col">
        <SheetHeader>
          <SheetTitle>New task</SheetTitle>
          <SheetDescription>A department gets one copy per active member.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <Field label="Title">
            <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 md:h-9" />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </Field>
          <AssignField assignee={assign.assignee} department={assign.department} staff={staff} departments={departments} onChange={setAssign} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Due date and time (Istanbul)">
              <input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} className={FIELD_CLASS} />
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className={FIELD_CLASS}>
                {PRIORITIES.map((option) => <option key={option} value={option}>{PRIORITY_STYLES[option].label}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-[13px] text-foreground">
            <input type="checkbox" checked={requiresProof} onChange={(event) => setRequiresProof(event.target.checked)} className="h-4 w-4 accent-brand-strong" />
            Requires a proof photo
          </label>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" size="lg" className="h-11 !border-subtle px-4 md:h-9" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="lg" disabled={saving} className={PRIMARY_BUTTON}>{saving ? 'Creating…' : 'Create task'}</Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
};

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 border-b border-subtle py-2.5 text-[13px] last:border-b-0">
    <span className="shrink-0 text-black/45">{label}</span>
    <span className="min-w-0 text-right text-foreground">{children}</span>
  </div>
);

export const TaskDetailSheet: React.FC<{
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
  const overdue = isTaskOverdue(task);

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

  const openProof = async () => {
    // Opened first: a window opened after an await counts as a pop-up.
    const tab = window.open('', '_blank');
    try {
      const url = await proofLink(task.proof_url as string);
      if (tab) tab.location.href = url;
    } catch (error) {
      tab?.close();
      toast.error(`Couldn't open the proof: ${errorText(error)}`);
    }
  };

  return (
    <Sheet open onClose={onClose} ariaLabel={task.title}>
      <SheetHeader>
        <div className="pr-8">
          <SheetTitle>{task.title}</SheetTitle>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusChip status={task.status} />
            <PriorityChip priority={task.priority} />
            {overdue && (
              <span className="inline-flex h-6 items-center rounded-full bg-red-500/10 px-2.5 text-[11.5px] font-medium text-red-600">Overdue</span>
            )}
          </div>
        </div>
      </SheetHeader>
      <SheetBody>
        {task.description && <p className="whitespace-pre-wrap text-[13.5px] text-black/70">{task.description}</p>}
        <div>
          <DetailRow label="Assignee">
            {assignee ? (
              <span className="inline-flex items-center gap-2">
                <StaffAvatar profile={assignee} size={24} />
                {assignee.full_name}
              </span>
            ) : 'Nobody'}
          </DetailRow>
          <DetailRow label="Department">{departmentLabel}</DetailRow>
          <DetailRow label="Kind">{task.kind === 'recurring' ? 'Recurring' : 'One-off'}</DetailRow>
          <DetailRow label="Due">{formatDue(task.due_at)}</DetailRow>
          <DetailRow label="Proof required">{task.requires_proof ? 'Yes' : 'No'}</DetailRow>
          {task.completed_at && <DetailRow label="Completed">{formatDue(task.completed_at)}</DetailRow>}
          {task.missed_at && <DetailRow label="Missed">{formatDue(task.missed_at)}</DetailRow>}
          {task.cancel_reason && <DetailRow label="Cancelled because">{task.cancel_reason}</DetailRow>}
        </div>

        {task.completion_notes && (
          <section>
            <h3 className="mb-1 text-[13.5px] font-medium text-foreground">Note</h3>
            <p className="whitespace-pre-wrap text-[13px] text-black/70">{task.completion_notes}</p>
          </section>
        )}

        {task.proof_url && (
          <button type="button" onClick={openProof} className="min-h-[44px] self-start text-[13px] font-medium text-brand-strong hover:underline">
            Open proof photo
          </button>
        )}

        {isTaskOpen(task.status) && (cancelling ? (
          <form onSubmit={submitCancel} className="flex flex-col gap-2 rounded-xl border border-subtle p-4">
            <Field label="Reason for cancelling">
              <Input autoFocus value={reason} onChange={(event) => setReason(event.target.value)} className="h-11 md:h-9" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="lg" className="h-11 px-3 md:h-9" disabled={busy} onClick={() => setCancelling(false)}>Keep task</Button>
              <Button type="submit" variant="destructive" size="lg" className="h-11 px-3 md:h-9" disabled={busy || !reason.trim()}>
                {busy ? 'Cancelling…' : 'Cancel task'}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="lg" className="h-11 self-start !border-subtle px-3 md:h-9" onClick={() => setCancelling(true)}>
            Cancel this task
          </Button>
        ))}
      </SheetBody>
    </Sheet>
  );
};
