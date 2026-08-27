import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteInfluencer, updateInfluencerStatus } from '../../lib/media/actions';
import { cn, toneFor, TONE_CLASSES, TONE_DOTS } from '../../lib/media/badgeColor';
import { formatCountry } from '../../lib/media/countries';
import { getInfluencers } from '../../lib/media/queries';
import {
  FINAL_DECISIONS,
  INFLUENCER_TYPES,
  labelFor,
  MESSAGING_STATUSES,
  type MediaInfluencer,
} from '../../lib/media/types';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import {
  ExternalLink,
  Mail,
  Megaphone,
  Pencil,
  Plus,
  SearchX,
  Trash2,
} from '../../components/media/MediaIcons';
import {
  MediaEmptyState,
  MediaNav,
  PageHeader,
  SearchInput,
} from '../../components/media/MediaShared';
import { toast } from '../../components/media/MediaToast';
import { Button, Select, Skeleton, type SelectOption } from '../../components/media/MediaUI';
import { InfluencerFormSheet } from './InfluencerFormSheet';
import { StatusSelect } from './StatusSelect';
import { useConfirm } from './useConfirm';

const ANY = '_any';

const COLUMNS = [
  'Influencer',
  'Followers',
  'Type',
  'Country',
  'Contact',
  'Messaging',
  'Decision',
  'Notes',
  '',
];

const FilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  allLabel: string;
  ariaLabel: string;
}> = ({ value, onChange, options, allLabel, ariaLabel }) => (
  <Select
    size="lg"
    ariaLabel={ariaLabel}
    value={value}
    options={[{ value: ANY, label: allLabel, muted: true }, ...options]}
    onChange={onChange}
    className={cn(
      'max-w-[168px] rounded-lg text-[12.5px]',
      value === ANY ? 'text-black/45' : 'text-[#0e0e10]',
    )}
  />
);

const InfluencersSkeleton: React.FC = () => (
  <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-36 shrink-0 rounded-lg" />
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="flex h-[62px] items-center gap-4 border-b border-black/[0.04] px-4 last:border-b-0"
        >
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex w-52 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-[22px] w-32 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-[26px] w-28 rounded-full" />
          <Skeleton className="h-[26px] w-24 rounded-full" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  </div>
);

const MediaInfluencersPage: React.FC = () => {
  const [rows, setRows] = useState<MediaInfluencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(ANY);
  const [countryFilter, setCountryFilter] = useState(ANY);
  const [statusFilter, setStatusFilter] = useState(ANY);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MediaInfluencer | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    const data = await getInfluencers();
    if (signal?.cancelled) return;
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  // Country options come from the data, so the filter only ever offers real choices.
  const countryOptions = useMemo(() => {
    const codes = new Set(rows.map((r) => r.country).filter((c): c is string => Boolean(c)));
    return Array.from(codes)
      .sort((a, b) => formatCountry(a).localeCompare(formatCountry(b)))
      .map((code) => ({ value: code, label: formatCountry(code) }));
  }, [rows]);

  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      rows.filter((r) => {
        if (typeFilter !== ANY && r.type !== typeFilter) return false;
        if (countryFilter !== ANY && r.country !== countryFilter) return false;
        if (statusFilter !== ANY && r.messaging_status !== statusFilter) return false;
        if (!q) return true;
        return (
          (r.name ?? '').toLowerCase().includes(q) ||
          (r.email_contact ?? '').toLowerCase().includes(q) ||
          (r.url ?? '').toLowerCase().includes(q) ||
          (r.notes ?? '').toLowerCase().includes(q)
        );
      }),
    [rows, typeFilter, countryFilter, statusFilter, q],
  );

  const filtered =
    typeFilter !== ANY || countryFilter !== ANY || statusFilter !== ANY || Boolean(search.trim());

  function clearFilters() {
    setSearch('');
    setTypeFilter(ANY);
    setCountryFilter(ANY);
    setStatusFilter(ANY);
  }

  const saveStatus = useCallback(
    async (
      row: MediaInfluencer,
      field: 'messaging_status' | 'final_decision',
      value: string | null,
    ): Promise<boolean> => {
      const result = await updateInfluencerStatus(row.id, field, value);
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't update the status");
        return false;
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)));
      return true;
    },
    [],
  );

  const askDelete = useCallback(
    (row: MediaInfluencer) => {
      const name = row.name?.trim() || 'this influencer';
      confirm.ask({
        title: 'Delete this influencer?',
        description: `“${name}” and everything recorded about the outreach will be removed permanently. This cannot be undone.`,
        confirmLabel: 'Delete influencer',
        onConfirm: async () => {
          const result = await deleteInfluencer(row.id);
          if (!result.ok) {
            toast.error(result.error ?? "Couldn't delete the influencer");
            return;
          }
          setRows((prev) => prev.filter((r) => r.id !== row.id));
          toast.success('Influencer deleted');
        },
      });
    },
    [confirm],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Creator Outreach"
        title="Influencers"
        subtitle="Every creator on the radar — audience size, contact details, and where the conversation stands."
      />
      <MediaNav />

      {loading ? (
        <InfluencersSkeleton />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search influencers…"
              ariaLabel="Search influencers"
            />
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                value={typeFilter}
                onChange={setTypeFilter}
                allLabel="All types"
                ariaLabel="Filter by type"
                options={INFLUENCER_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              />
              <FilterSelect
                value={countryFilter}
                onChange={setCountryFilter}
                allLabel="All countries"
                ariaLabel="Filter by country"
                options={countryOptions}
              />
              <FilterSelect
                value={statusFilter}
                onChange={setStatusFilter}
                allLabel="All statuses"
                ariaLabel="Filter by messaging status"
                options={MESSAGING_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
              />
              {filtered && (
                <Button variant="ghost" size="sm" className="text-black/50" onClick={clearFilters}>
                  Clear
                </Button>
              )}
              <Button
                size="lg"
                iconStart
                className="shrink-0"
                onClick={() => {
                  setEditing(null);
                  setSheetOpen(true);
                }}
              >
                <Plus size={15} strokeWidth={2} />
                New influencer
              </Button>
            </div>
          </div>

          {visible.length === 0 ? (
            filtered ? (
              <MediaEmptyState
                Icon={SearchX}
                title="No influencers match those filters"
                description="Try a broader type, country, or messaging status — or clear the filters to see the full list."
                action={
                  <Button variant="outline" size="lg" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <MediaEmptyState
                Icon={Megaphone}
                title="No influencers yet"
                description="Track every creator you're talking to — who they are, how big their audience is, and where the conversation stands."
                action={
                  <Button
                    size="lg"
                    iconStart
                    onClick={() => {
                      setEditing(null);
                      setSheetOpen(true);
                    }}
                  >
                    <Plus size={15} strokeWidth={2} />
                    Add the first influencer
                  </Button>
                }
              />
            )
          ) : (
            <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm">
                    <tr className="border-b border-black/[0.07]">
                      {COLUMNS.map((label, i) => (
                        <th
                          key={i}
                          scope="col"
                          className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-black/40"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => {
                      const name = row.name?.trim() || 'Unnamed';
                      // Up to two initials, uppercased, falling back to "?".
                      const initials =
                        name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join('')
                          .toUpperCase() || '?';
                      const typeTone = toneFor(INFLUENCER_TYPES, row.type);

                      return (
                        <tr
                          key={row.id}
                          className="group/row border-b border-black/[0.04] align-middle transition-colors duration-150 last:border-b-0 hover:bg-black/[0.015]"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {/* The avatar colour encodes the type. */}
                              <span
                                aria-hidden="true"
                                className={cn(
                                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11.5px] font-semibold',
                                  TONE_CLASSES[typeTone],
                                )}
                              >
                                {initials}
                              </span>
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate text-[13px] font-semibold tracking-[-0.008em] text-black/85">
                                  {name}
                                </span>
                                {row.url && (
                                  <a
                                    href={row.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex w-fit max-w-[220px] items-center gap-1 truncate text-[11.5px] text-black/40 no-underline transition-colors duration-150 hover:text-[#6ea4e7]"
                                  >
                                    <span className="truncate">
                                      {row.url.replace(/^https?:\/\//, '')}
                                    </span>
                                    <ExternalLink size={10} strokeWidth={2} className="shrink-0" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-[13px] font-medium tabular-nums text-black/70">
                            {row.followers_count || '—'}
                          </td>

                          <td className="px-4 py-3">
                            {row.type ? (
                              <span
                                className={cn(
                                  'inline-flex h-[22px] w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-medium',
                                  TONE_CLASSES[typeTone],
                                )}
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn('h-1.5 w-1.5 rounded-full', TONE_DOTS[typeTone])}
                                />
                                {labelFor(INFLUENCER_TYPES, row.type)}
                              </span>
                            ) : (
                              <span className="text-[12.5px] text-black/25">—</span>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-black/60">
                            {formatCountry(row.country) || '—'}
                          </td>

                          <td className="px-4 py-3">
                            {row.email_contact ? (
                              <a
                                href={
                                  row.email_contact.includes('@')
                                    ? `mailto:${row.email_contact}`
                                    : `tel:${row.email_contact.replace(/\s/g, '')}`
                                }
                                className="inline-flex max-w-[180px] items-center gap-1.5 truncate text-[12.5px] text-black/60 no-underline transition-colors hover:text-[#6ea4e7]"
                              >
                                <Mail size={12} strokeWidth={1.75} className="shrink-0 text-black/30" />
                                <span className="truncate">{row.email_contact}</span>
                              </a>
                            ) : (
                              <span className="text-[12.5px] text-black/25">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <StatusSelect
                              value={row.messaging_status}
                              options={MESSAGING_STATUSES}
                              placeholder="Not set"
                              ariaLabel={`Messaging status for ${name}`}
                              onSelect={(next) => saveStatus(row, 'messaging_status', next)}
                            />
                          </td>

                          <td className="px-4 py-3">
                            <StatusSelect
                              value={row.final_decision}
                              options={FINAL_DECISIONS}
                              placeholder="Not set"
                              ariaLabel={`Final decision for ${name}`}
                              onSelect={(next) => saveStatus(row, 'final_decision', next)}
                            />
                          </td>

                          <td className="min-w-[200px] max-w-[280px] px-4 py-3">
                            {row.notes ? (
                              <p className="line-clamp-2 text-[12.5px] leading-relaxed text-black/50">
                                {row.notes}
                              </p>
                            ) : (
                              <span className="text-[12.5px] text-black/25">—</span>
                            )}
                          </td>

                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/row:opacity-100">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Edit ${name}`}
                                onClick={() => {
                                  setEditing(row);
                                  setSheetOpen(true);
                                }}
                                className="text-black/30 hover:text-black/70"
                              >
                                <Pencil size={13} strokeWidth={1.75} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Delete ${name}`}
                                onClick={() => askDelete(row)}
                                className="text-black/30 hover:bg-[#d4183d]/10 hover:text-[#d4183d]"
                              >
                                <Trash2 size={13} strokeWidth={1.75} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <InfluencerFormSheet
        open={sheetOpen}
        influencer={editing}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
        onSaved={() => load()}
      />

      <ConfirmDialog
        state={confirm.state}
        pending={confirm.pending}
        onCancel={confirm.cancel}
        onConfirm={confirm.confirm}
      />
    </div>
  );
};

export default MediaInfluencersPage;
