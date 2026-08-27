import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createLookup,
  deleteLookup,
  deriveKey,
  reorderLookups,
  updateLookup,
} from '../../lib/media/actions';
import { cn, tintedStyle } from '../../lib/media/badgeColor';
import { getAllLookups, getLookupUsage } from '../../lib/media/queries';
import type { LookupTable, MediaLookup } from '../../lib/media/types';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import {
  ArrowDown,
  ArrowUp,
  ListChecks,
  Plus,
  Tag,
  Trash2,
} from '../../components/media/MediaIcons';
import { MediaEmptyState, MediaNav, PageHeader } from '../../components/media/MediaShared';
import { toast } from '../../components/media/MediaToast';
import { Button, Input, Skeleton, Switch } from '../../components/media/MediaUI';
import { useMediaLookups } from './MediaLayout';
import { useConfirm } from './useConfirm';

/**
 * Goals and formats management — admin only, and not part of the staff build at all.
 *
 * The one structural trap here: `key` is the primary key AND the FK target for
 * `ideas`/`posts`, declared with no ON UPDATE and no ON DELETE. So the key is
 * derived from the label exactly once at creation and shown read-only afterwards,
 * and delete is disabled for anything in use — with the count and the
 * "Deactivate instead" hint shown in place of the button, rather than letting the
 * admin discover 23503 by clicking.
 */

const PALETTE = [
  '#f8b4b4', '#f6d68a', '#b7e0b7', '#b4e5f8',
  '#b4c6f8', '#c9b4f8', '#f8b4d9', '#cbd5e1',
];

interface PanelState {
  rows: MediaLookup[];
  usage: Record<string, number>;
  loading: boolean;
}

const ColorPicker: React.FC<{
  value: string | null;
  onChange: (color: string) => void;
  ariaLabel: string;
}> = ({ value, onChange, ariaLabel }) => (
  <div className="flex items-center gap-1" role="group" aria-label={ariaLabel}>
    {PALETTE.map((color) => {
      const active = (value ?? '').toLowerCase() === color.toLowerCase();
      return (
        <button
          key={color}
          type="button"
          aria-label={`Use colour ${color}`}
          aria-pressed={active}
          onClick={() => onChange(color)}
          className={cn(
            'h-5 w-5 rounded-full border transition-all duration-150 hover:scale-110',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40',
            active ? 'border-black/25 ring-2 ring-black/[0.08]' : 'border-black/10',
          )}
          style={{ backgroundColor: color }}
        />
      );
    })}
  </div>
);

const LookupPanel: React.FC<{
  table: LookupTable;
  title: string;
  description: string;
  onChanged: () => void;
}> = ({ table, title, description, onChanged }) => {
  const [state, setState] = useState<PanelState>({ rows: [], usage: {}, loading: true });
  const [draftLabel, setDraftLabel] = useState('');
  const [draftColor, setDraftColor] = useState<string>(PALETTE[0]);
  const [creating, setCreating] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    const [rows, usage] = await Promise.all([getAllLookups(table), getLookupUsage(table)]);
    if (signal?.cancelled) return;
    setState({ rows, usage, loading: false });
  }, [table]);

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const takenKeys = useMemo(() => state.rows.map((r) => r.key), [state.rows]);
  const previewKey = draftLabel.trim() ? deriveKey(draftLabel, takenKeys) : '';

  async function refresh() {
    await load();
    onChanged();
  }

  async function add() {
    if (!draftLabel.trim()) {
      toast.error('Label is required');
      return;
    }
    setCreating(true);
    const result = await createLookup(table, {
      label: draftLabel,
      color: draftColor,
      sortOrder: state.rows.length + 1,
      takenKeys,
    });
    setCreating(false);

    if (!result.ok) {
      toast.error(result.error ?? "Couldn't add that entry");
      return;
    }
    setDraftLabel('');
    toast.success('Entry added');
    await refresh();
  }

  async function patch(row: MediaLookup, changes: Parameters<typeof updateLookup>[2]) {
    const before = state.rows;
    setBusyKey(row.key);
    setState((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.key === row.key ? { ...r, ...changes } : r)),
    }));

    const result = await updateLookup(table, row.key, changes);
    setBusyKey(null);

    if (!result.ok) {
      setState((prev) => ({ ...prev, rows: before }));
      toast.error(result.error ?? "Couldn't save that change");
      return;
    }
    onChanged();
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...state.rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);

    const before = state.rows;
    setState((prev) => ({ ...prev, rows: next }));

    const result = await reorderLookups(table, next.map((r) => r.key));
    if (!result.ok) {
      setState((prev) => ({ ...prev, rows: before }));
      toast.error(result.error ?? "Couldn't reorder the list");
      return;
    }
    onChanged();
  }

  function askDelete(row: MediaLookup) {
    confirm.ask({
      title: `Delete “${row.label}”?`,
      description:
        'This entry will be removed from the list permanently. This cannot be undone.',
      confirmLabel: 'Delete entry',
      onConfirm: async () => {
        const result = await deleteLookup(table, row.key);
        if (!result.ok) {
          toast.error(result.error ?? "Couldn't delete that entry");
          return;
        }
        toast.success('Entry deleted');
        await refresh();
      },
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-black/[0.07] bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.014em] text-black/85">
          <Tag size={15} strokeWidth={1.75} className="text-[#6ea4e7]" />
          {title}
        </h2>
        <p className="text-[12.5px] leading-relaxed text-black/45">{description}</p>
      </div>

      {state.loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[52px] w-full rounded-xl" />
          ))}
        </div>
      ) : state.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/[0.09] bg-black/[0.012] px-4 py-6 text-center text-[12.5px] text-black/40">
          Nothing in this list yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {state.rows.map((row, index) => {
            const inUse = state.usage[row.key] ?? 0;
            const busy = busyKey === row.key;

            return (
              <li
                key={row.key}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border border-black/[0.06] px-3 py-2.5 transition-colors',
                  'sm:flex-row sm:items-center sm:gap-3',
                  row.is_active ? 'bg-white' : 'bg-black/[0.015]',
                )}
              >
                {/* Reorder */}
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Move ${row.label} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="text-black/30 hover:text-black/70"
                  >
                    <ArrowUp size={12} strokeWidth={2} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Move ${row.label} down`}
                    disabled={index === state.rows.length - 1}
                    onClick={() => move(index, 1)}
                    className="text-black/30 hover:text-black/70"
                  >
                    <ArrowDown size={12} strokeWidth={2} />
                  </Button>
                </div>

                {/* Label + immutable key */}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Input
                    value={row.label}
                    aria-label={`Label for ${row.key}`}
                    disabled={busy}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        rows: prev.rows.map((r) =>
                          r.key === row.key ? { ...r, label: e.target.value } : r,
                        ),
                      }))
                    }
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== row.label) patch(row, { label: next });
                    }}
                    className="h-8"
                  />
                  <span
                    className="text-[11px] font-medium tabular-nums text-black/30"
                    title="The stored key is fixed once the entry is created — ideas and posts reference it."
                  >
                    key: {row.key}
                  </span>
                </div>

                {/* Colour */}
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className="inline-flex h-[22px] items-center rounded-full border px-2.5 text-[11.5px] font-medium"
                    style={tintedStyle(row.color)}
                  >
                    {row.label || row.key}
                  </span>
                  <ColorPicker
                    value={row.color}
                    ariaLabel={`Colour for ${row.label}`}
                    onChange={(color) => patch(row, { color })}
                  />
                </div>

                {/* Active + usage + delete */}
                <div className="flex shrink-0 items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-[11.5px] font-medium text-black/45">
                    <Switch
                      checked={row.is_active}
                      disabled={busy}
                      ariaLabel={`${row.is_active ? 'Deactivate' : 'Activate'} ${row.label}`}
                      activeClass="bg-[#6ea4e7]"
                      onChange={(next) => patch(row, { is_active: next })}
                    />
                    {row.is_active ? 'Active' : 'Off'}
                  </label>

                  {inUse > 0 ? (
                    // Delete is impossible here: the FK has no ON DELETE, so
                    // Postgres would answer 23503. Say why, and point at the
                    // action that does work.
                    <span
                      className="whitespace-nowrap rounded-full bg-black/[0.045] px-2 py-0.5 text-[11px] font-medium tabular-nums text-black/45"
                      title="Deactivate instead — deleting would break the ideas and posts that reference this entry."
                    >
                      {inUse} in use · Deactivate instead
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${row.label}`}
                      onClick={() => askDelete(row)}
                      className="text-black/30 hover:bg-[#d4183d]/10 hover:text-[#d4183d]"
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add row */}
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-black/[0.09] bg-black/[0.012] px-3 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Input
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
            placeholder={table === 'goals' ? 'e.g. Retention' : 'e.g. Behind the scenes'}
            aria-label={`New ${table === 'goals' ? 'goal' : 'format'} label`}
            className="h-8"
          />
          <span className="text-[11px] font-medium tabular-nums text-black/30">
            {previewKey ? `key: ${previewKey} — fixed once created` : 'key is derived from the label'}
          </span>
        </div>
        <ColorPicker value={draftColor} ariaLabel="Colour for the new entry" onChange={setDraftColor} />
        <Button size="lg" iconStart onClick={add} disabled={creating} className="shrink-0">
          <Plus size={15} strokeWidth={2} />
          {creating ? 'Adding…' : 'Add'}
        </Button>
      </div>

      <ConfirmDialog
        state={confirm.state}
        pending={confirm.pending}
        onCancel={confirm.cancel}
        onConfirm={confirm.confirm}
      />
    </section>
  );
};

const MediaListsPage: React.FC = () => {
  const { reload } = useMediaLookups();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Section Setup"
        title="Lists"
        subtitle="The goals and formats every idea and post is tagged with — rename, recolour, reorder, or retire them."
      />
      <MediaNav />

      <div className="flex flex-col gap-5">
        <LookupPanel
          table="goals"
          title="Goals"
          description="What a piece of content is meant to achieve. The colour drives the badge tint and the calendar chip rail."
          onChanged={reload}
        />
        <LookupPanel
          table="formats"
          title="Formats"
          description="How the content is produced — reel, carousel, story, and anything else the team shoots."
          onChanged={reload}
        />

        <MediaEmptyState
          Icon={ListChecks}
          title="Deactivate rather than delete"
          description="An entry in use by an idea or a post can't be deleted — the reference would break. Turning it off hides it from every picker while the rows that already use it keep their label."
        />
      </div>
    </div>
  );
};

export default MediaListsPage;
