import React, { useState } from 'react';
import { formatLira } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import type { ProfileOption } from '../../lib/notifications';
import {
  LEAD_STAGES,
  LEAD_TONES,
  carName,
  daysListed,
  leadStage,
  listedLabel,
  type InvestmentCheck,
  type LeadStage,
  type SourcingRow,
} from '../../lib/sourcing';
import { GroupImage } from '../modelGroups/ModelGroupCard';
import { AddedBy, DamageBadges, ExternalLinkIcon, GapPill, InvestmentPill, LeadSelect, PlatformChip } from './SourcingParts';

const km = (value: number) => `${value.toLocaleString('en-US')} km`;

// ── Card ─────────────────────────────────────────────────────────────────────

export const SourcingCard: React.FC<{
  row: SourcingRow;
  today: string;
  check: InvestmentCheck | null;
  addedBy: ProfileOption | undefined;
  moving: boolean;
  onOpen: () => void;
  onMove: (stage: LeadStage) => void;
}> = ({ row, today, check, addedBy, moving, onOpen, onMove }) => {
  const name = carName(row);
  const stage = leadStage(row.lead_status);
  const sold = row.listing_status === 'Sold';
  const title = [name, row.model_year].join(' · ');
  return (
    <article
      aria-label={`${name} ${row.model_year}`}
      draggable
      onDragStart={(event) => { event.dataTransfer.setData('text/plain', String(row.id)); event.dataTransfer.effectAllowed = 'move'; }}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(); }}
      tabIndex={0}
      className={cn(
        'surface-depth group/card cursor-pointer rounded-[16px] border border-subtle bg-surface p-2 outline-none transition-[box-shadow,opacity,transform] hover:shadow-[0_10px_28px_-12px_rgba(15,23,42,0.22)] focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 active:cursor-grabbing',
        (stage === 'Lost' || moving) && 'opacity-60',
      )}
    >
      <GroupImage src={row.group?.image_url ?? null} alt="" compact className="!aspect-[16/8] !rounded-[11px]">
        <PlatformChip row={row} className="absolute start-2 top-2" />
        {row.listing_url && (
          <a
            href={row.listing_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            aria-label={`Open the listing for ${title}`}
            className="absolute end-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-black/60 shadow-[0_1px_2px_rgba(15,23,42,0.10)] hover:text-brand-strong"
          >
            <ExternalLinkIcon />
          </a>
        )}
        {sold && <span className="absolute bottom-2 start-2 rounded-full bg-[#0F1117]/75 px-2 py-0.5 text-[11px] font-semibold text-white">Sold</span>}
      </GroupImage>

      <div className="px-1.5 pb-1 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-foreground">{name} <span className="font-normal text-black/50">{row.model_year}</span></h3>
            <p className="truncate text-[12px] text-black/50">{[row.trim_package, row.mileage_km !== null ? km(row.mileage_km) : null].filter(Boolean).join(' · ') || '—'}</p>
          </div>
          <AddedBy profile={addedBy} />
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {row.transmission && <span className="inline-flex h-6 items-center rounded-full border border-black/[0.06] bg-white px-2 text-[11.5px] text-black/65">{row.transmission}</span>}
          {row.fuel_type && <span className="inline-flex h-6 items-center rounded-full border border-black/[0.06] bg-white px-2 text-[11.5px] text-black/65">{row.fuel_type}</span>}
          <DamageBadges row={row} />
        </div>

        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[16px] font-semibold tabular-nums tracking-[-0.01em] text-foreground">{row.asking_price !== null ? formatLira(row.asking_price) : '—'}</div>
            <div className="truncate text-[11.5px] tabular-nums text-black/45">{row.target_price !== null ? `Target ${formatLira(row.target_price)}` : 'No target yet'}</div>
          </div>
          <GapPill asking={row.asking_price} target={row.target_price} />
        </div>

        <div className="mt-2.5 border-t border-black/[0.06] pt-2"><InvestmentPill check={check} /></div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="min-w-0 text-[11.5px] text-black/45">
            <div className="truncate">{[row.district, row.city].filter(Boolean).join(', ') || 'Location not set'}</div>
            <div className="truncate">{listedLabel(daysListed(row.listed_on, today))}</div>
          </div>
          <LeadSelect row={row} onMove={onMove} disabled={moving} />
        </div>
      </div>
    </article>
  );
};

// ── Board ────────────────────────────────────────────────────────────────────

/** One column per stage. Drag a card to another column, or pick the stage on the card, to move it. */
export const PipelineBoard: React.FC<{
  rows: SourcingRow[];
  today: string;
  checkFor: (row: SourcingRow) => InvestmentCheck | null;
  people: Record<string, ProfileOption>;
  moving: Set<number>;
  onOpen: (row: SourcingRow) => void;
  onMove: (row: SourcingRow, stage: LeadStage) => void;
}> = ({ rows, today, checkFor, people, moving, onOpen, onMove }) => {
  const [over, setOver] = useState<LeadStage | null>(null);
  const byStage = (stage: LeadStage) => rows.filter((row) => leadStage(row.lead_status) === stage);

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <div className="grid min-w-max auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 xl:min-w-0">
        {LEAD_STAGES.map((stage) => {
          const cards = byStage(stage);
          const tone = LEAD_TONES[stage];
          return (
            <section
              key={stage}
              aria-label={`${tone.label}, ${cards.length} ${cards.length === 1 ? 'lead' : 'leads'}`}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (over !== stage) setOver(stage); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); }}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                const id = Number(event.dataTransfer.getData('text/plain'));
                const row = rows.find((item) => item.id === id);
                if (row && leadStage(row.lead_status) !== stage) onMove(row, stage);
              }}
              className={cn('flex min-h-[220px] flex-col rounded-[18px] border p-2 transition-colors', over === stage ? 'border-dashed' : 'border-transparent')}
              style={{ background: over === stage ? tone.soft : '#F6F7F9', borderColor: over === stage ? tone.chip : undefined }}
            >
              <header className="flex items-center gap-2 px-1.5 pb-2 pt-1">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: tone.chip }} />
                <h2 className="text-[13px] font-semibold text-foreground">{tone.label}</h2>
                <span className="rounded-full bg-white px-1.5 text-[11.5px] font-medium tabular-nums text-black/50">{cards.length}</span>
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {cards.map((row) => (
                  <SourcingCard
                    key={row.id}
                    row={row}
                    today={today}
                    check={checkFor(row)}
                    addedBy={row.added_by ? people[row.added_by] : undefined}
                    moving={moving.has(row.id)}
                    onOpen={() => onOpen(row)}
                    onMove={(next) => onMove(row, next)}
                  />
                ))}
                {cards.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-[14px] border border-dashed border-black/[0.08] px-3 py-6 text-center text-[12px] text-black/35">
                    {over === stage ? 'Drop here' : 'Drag a card here'}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
