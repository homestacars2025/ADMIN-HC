import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/media/badgeColor';
import { Select, Spinner, type SelectOption } from '../../components/media/MediaUI';

/**
 * The List view's inline editors.
 *
 * Every one commits through a caller-supplied `onSave` that resolves to a
 * boolean; `false` (server refused, RLS, network) restores the previous value, so
 * the grid never shows a change the database didn't accept. The parent owns the
 * value — these components hold only a draft and a saving flag.
 */

const NONE = '_none';

const CELL_IDLE =
  'w-full rounded-md px-2 py-1.5 text-left text-[12.5px] leading-snug transition-colors duration-150 ' +
  'hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40';

export const InlineText: React.FC<{
  value: string | null;
  placeholder: string;
  multiline?: boolean;
  ariaLabel: string;
  className?: string;
  onSave: (next: string | null) => Promise<boolean>;
}> = ({ value, placeholder, multiline, ariaLabel, className, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isEditing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [isEditing]);

  function startEditing() {
    setDraft(value ?? '');
    setIsEditing(true);
  }

  async function commit() {
    const next = draft.trim();
    setIsEditing(false);
    if (next === (value ?? '')) return;
    setIsSaving(true);
    await onSave(next || null);
    setIsSaving(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsEditing(false);
      return;
    }
    if (event.key !== 'Enter') return;
    // Multiline keeps Enter for newlines; ⌘/Ctrl+Enter is the commit.
    if (multiline && !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    commit();
  }

  if (isEditing) {
    const editClass =
      'w-full rounded-md border border-[#6ea4e7]/40 bg-white px-2 py-1.5 text-[12.5px] leading-snug outline-none ring-2 ring-[#6ea4e7]/15';
    return multiline ? (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        rows={3}
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        className={cn(editClass, 'resize-none')}
      />
    ) : (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        className={editClass}
      />
    );
  }

  return (
    <button type="button" aria-label={ariaLabel} onClick={startEditing} className={cn(CELL_IDLE, className)}>
      {isSaving ? (
        <span className="inline-flex items-center gap-1.5 text-black/40">
          <Spinner size={11} />
          Saving…
        </span>
      ) : value ? (
        <span className={cn('block text-black/75', multiline && 'line-clamp-3')}>{value}</span>
      ) : (
        <span className="text-black/25">{placeholder}</span>
      )}
    </button>
  );
};

export const InlineDate: React.FC<{
  value: string | null;
  ariaLabel: string;
  onSave: (next: string | null) => Promise<boolean>;
}> = ({ value, ariaLabel, onSave }) => {
  const [isSaving, setIsSaving] = useState(false);

  async function change(next: string) {
    setIsSaving(true);
    await onSave(next || null);
    setIsSaving(false);
  }

  return (
    <input
      type="date"
      value={value ? value.slice(0, 10) : ''}
      aria-label={ariaLabel}
      disabled={isSaving}
      onChange={(e) => change(e.target.value)}
      className={
        'w-[132px] rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[12.5px] ' +
        'tabular-nums text-black/75 transition-colors duration-150 ' +
        'hover:border-black/[0.08] hover:bg-black/[0.03] ' +
        'focus-visible:border-[#6ea4e7]/40 focus-visible:outline-none focus-visible:ring-2 ' +
        'focus-visible:ring-[#6ea4e7]/15 disabled:opacity-50'
      }
    />
  );
};

export const InlineSelect: React.FC<{
  value: string | null;
  options: ReadonlyArray<{ key: string; label: string; color: string | null }>;
  placeholder: string;
  ariaLabel: string;
  showDot?: boolean;
  onSave: (next: string | null) => Promise<boolean>;
}> = ({ value, options, placeholder, ariaLabel, showDot, onSave }) => {
  const [isSaving, setIsSaving] = useState(false);

  const selectOptions: SelectOption[] = [
    { value: NONE, label: placeholder, muted: true },
    ...options.map((o) => ({
      value: o.key,
      label: o.label,
      color: showDot ? o.color : undefined,
    })),
  ];

  // A value that no longer exists in the option list (a deactivated goal) is
  // added back as its raw key, so the cell shows what is stored rather than blank.
  if (value && !options.some((o) => o.key === value)) {
    selectOptions.push({ value, label: value });
  }

  async function change(next: string) {
    const mapped = next === NONE ? null : next;
    if (mapped === (value ?? null)) return;
    setIsSaving(true);
    await onSave(mapped);
    setIsSaving(false);
  }

  return (
    <Select
      size="sm"
      ariaLabel={ariaLabel}
      value={value || NONE}
      options={selectOptions}
      onChange={change}
      disabled={isSaving}
      className={cn(
        'max-w-[160px] border-transparent bg-transparent text-[12.5px] hover:bg-black/[0.03]',
        value ? 'text-black/75' : 'text-black/25',
      )}
    />
  );
};
