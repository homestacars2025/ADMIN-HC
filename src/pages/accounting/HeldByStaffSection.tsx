import React from 'react';
import { Button } from '../../components/media/MediaUI';
import { SkeletonRows } from '../../components/shared/PageBits';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { ageLabel, formatHeldAt, groupByHolder, heldAge, type HeldAge, type HeldEnvelope } from '../../lib/cashEnvelopes';
import { cn } from '../../lib/media/badgeColor';
import { formatMoney } from '../../lib/money';
import type { ProfileOption } from '../../lib/notifications';
import { LicensePlate } from '../bookings/ui';

/**
 * Cash still with the staff who took it, one group per holder: how many envelopes, how
 * much in each currency, and how long the oldest has been out. Over a day is amber, over
 * three days red. Each envelope goes into a safe through the usual receive sheet.
 */

const AGE_BADGE: Record<HeldAge, string> = {
  fresh: 'bg-black/[0.05] text-black/55',
  late: 'bg-[#F59E0B]/[0.16] text-[#92400E]',
  overdue: 'bg-[#DC2626]/10 text-[#B91C1C]',
};

const AgeBadge: React.FC<{ createdAt: string; now: number; prefix?: string }> = ({ createdAt, now, prefix }) => (
  <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums', AGE_BADGE[heldAge(createdAt, now)])}>
    {prefix}{ageLabel(createdAt, now)}
  </span>
);

const totalsText = (group: { totals: Array<{ currency: HeldEnvelope['currency']; total: number }> }) =>
  group.totals.map((row) => formatMoney(row.total, row.currency)).join(' · ') || formatMoney(0);

const Dash: React.FC = () => <span className="text-black/25">—</span>;

export const HeldByStaffSection: React.FC<{
  rows: HeldEnvelope[];
  people: Record<string, ProfileOption>;
  now: number;
  loading: boolean;
  wide: boolean;
  onReceive: (ref: string) => void;
}> = ({ rows, people, now, loading, wide, onReceive }) => {
  if (loading) return <div className="mt-4 max-w-[1100px] rounded-xl border border-subtle bg-surface"><SkeletonRows count={3} /></div>;
  if (rows.length === 0) {
    return <p className="mt-4 max-w-[1100px] rounded-xl border border-subtle bg-surface px-4 py-8 text-center text-[13.5px] text-black/45">No cash is with staff. Every envelope is in a safe or with the admin.</p>;
  }

  const receive = (envelope: HeldEnvelope, className?: string) => (
    <Button variant="outline" size="lg" className={cn('!h-11 whitespace-nowrap px-3 xl:!h-8', className)} onClick={() => onReceive(envelope.ref)} aria-label={`Receive ${envelope.ref} into safe`}>
      Receive into safe
    </Button>
  );

  return (
    <div className="mt-4 flex max-w-[1100px] flex-col gap-4">
      {groupByHolder(rows).map((group) => {
        const person = group.holderId ? people[group.holderId] : undefined;
        const name = person?.full_name ?? (group.holderId ? 'Unknown staff' : 'No holder');
        const count = group.envelopes.length;
        return (
          <section key={group.holderId ?? 'none'} aria-label={name} className="overflow-hidden rounded-xl border border-subtle bg-surface">
            <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-subtle bg-black/[0.015] px-3.5 py-3">
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <StaffAvatar profile={person ?? null} size={34} />
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-semibold text-foreground">{name}</span>
                  <span className="block text-[12px] text-black/50">{count === 1 ? '1 envelope' : `${count} envelopes`}</span>
                </span>
              </span>
              <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{totalsText(group)}</span>
              <AgeBadge createdAt={group.oldest} now={now} prefix="Oldest " />
            </header>

            {wide ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-[13px]">
                  <thead>
                    <tr className="border-b border-subtle text-[11.5px] text-black/45">
                      {['Envelope', 'Customer', 'Booking', 'Car'].map((label) => <th key={label} scope="col" className="px-2 py-1.5 text-start font-medium first:ps-3.5">{label}</th>)}
                      <th scope="col" className="px-2 py-1.5 text-end font-medium">Amount</th>
                      {['Purpose', 'Taken', 'Age'].map((label) => <th key={label} scope="col" className="px-2 py-1.5 text-start font-medium">{label}</th>)}
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.envelopes.map((envelope) => (
                      <tr key={envelope.id} className="border-b border-subtle last:border-b-0">
                        <td className="whitespace-nowrap px-2 py-2 ps-3.5 font-mono text-[12.5px] font-semibold text-foreground">{envelope.ref}</td>
                        <td className="max-w-[150px] truncate px-2 py-2 text-black/60">{envelope.customer ?? <Dash />}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono text-[12px] text-black/60">{envelope.booking_number ?? <Dash />}</td>
                        <td className="px-2 py-2">{envelope.plate ? <LicensePlate plate={envelope.plate} /> : <Dash />}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-end font-semibold tabular-nums text-foreground">{formatMoney(envelope.amount, envelope.currency)}</td>
                        <td className="max-w-[170px] truncate px-2 py-2 text-black/55" title={envelope.note ?? undefined}>{envelope.note ?? <Dash />}</td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums text-black/55">{formatHeldAt(envelope.created_at)}</td>
                        <td className="px-2 py-2"><AgeBadge createdAt={envelope.created_at} now={now} /></td>
                        <td className="px-2 py-1.5 pe-3.5 text-end">{receive(envelope)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="divide-y divide-[#F1F1F1]">
                {group.envelopes.map((envelope) => (
                  <li key={envelope.id} className="px-3.5 py-3 text-[13px]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block font-mono text-[13.5px] font-semibold text-foreground">{envelope.ref}</span>
                        <span className="block truncate text-black/60">{[envelope.customer, envelope.booking_number].filter(Boolean).join(' · ') || '—'}</span>
                      </span>
                      <span className="shrink-0 text-[16px] font-semibold tabular-nums text-foreground">{formatMoney(envelope.amount, envelope.currency)}</span>
                    </div>
                    {envelope.note && <p className="mt-1 break-words text-[12.5px] text-black/55">{envelope.note}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {envelope.plate && <LicensePlate plate={envelope.plate} />}
                      <span className="text-[12px] tabular-nums text-black/45">{formatHeldAt(envelope.created_at)}</span>
                      <AgeBadge createdAt={envelope.created_at} now={now} />
                    </div>
                    {receive(envelope, 'mt-2.5 w-full')}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
};
