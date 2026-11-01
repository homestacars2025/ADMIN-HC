import React from 'react';
import { StaffAvatar } from '../../components/shared/StaffAvatar';
import { daysOpen, daysTone, type Issue, type IssueStatus, type IssueType } from '../../lib/carIssues';
import { formatDate } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import type { ProfileOption } from '../../lib/notifications';
import { LicensePlate } from '../bookings/ui';

export const TYPE_CONFIG: Record<IssueType, { label: string; color: string; icon: React.ReactNode }> = {
  accident: {
    label: 'Accident',
    color: '#DC2626',
    icon: <><path d="M10.3 3.9L2.5 17.4A2 2 0 004.2 20.4h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  },
  damage: {
    label: 'Damage',
    color: '#EA580C',
    icon: <path d="M12 2l2.4 5.6L20 9l-4 4.2.9 6.8L12 16.8 7.1 20l.9-6.8L4 9l5.6-1.4L12 2z" />,
  },
  mechanical: {
    label: 'Mechanical',
    color: '#2563EB',
    icon: <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />,
  },
  sound: {
    label: 'Sound',
    color: '#7C3AED',
    icon: <><path d="M11 5L6.5 9H3v6h3.5L11 19V5z" /><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" /></>,
  },
  other: {
    label: 'Other',
    color: '#6B7280',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.6 2.6 0 015 .9c0 1.7-2.5 2.1-2.5 3.6M12 17h.01" /></>,
  },
  maintenance: {
    label: 'Maintenance',
    color: '#0891B2',
    icon: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  },
};

export const TypeIcon: React.FC<{ type: IssueType; size?: number }> = ({ type, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(TYPE_CONFIG[type] ?? TYPE_CONFIG.other).icon}
  </svg>
);

export const TypeChip: React.FC<{ type: IssueType }> = ({ type }) => {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.other;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none" style={{ color: config.color, background: `${config.color}1a` }}>
      <TypeIcon type={type} size={12} />
      {config.label}
    </span>
  );
};

export const StatusChip: React.FC<{ status: IssueStatus }> = ({ status }) => (
  <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none', status === 'open' ? 'bg-[#DC2626]/[0.1] text-[#B91C1C]' : 'bg-[#16A34A]/[0.1] text-[#15803D]')}>
    <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', status === 'open' ? 'bg-[#DC2626]' : 'bg-[#16A34A]')} />
    {status === 'open' ? 'Open' : 'Resolved'}
  </span>
);

const DAYS_CLASS = {
  neutral: 'bg-black/[0.05] text-black/60',
  amber: 'bg-[#F59E0B]/[0.16] text-[#92400E]',
  red: 'bg-[#DC2626]/[0.1] text-[#B91C1C]',
};

export const DaysChip: React.FC<{ issue: Issue }> = ({ issue }) => {
  if (issue.status === 'resolved') {
    if (issue.days_to_resolve === null) return null;
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-[#16A34A]/[0.1] px-2.5 py-1 text-[12px] font-semibold leading-none tabular-nums text-[#15803D]">
        Fixed in {issue.days_to_resolve} {issue.days_to_resolve === 1 ? 'day' : 'days'}
      </span>
    );
  }
  const days = daysOpen(issue);
  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none tabular-nums', DAYS_CLASS[daysTone(days)])}>
      Open {days} {days === 1 ? 'day' : 'days'}
    </span>
  );
};

const Thumbnail: React.FC<{ issue: Issue; className?: string }> = ({ issue, className }) => {
  const config = TYPE_CONFIG[issue.type] ?? TYPE_CONFIG.other;
  const photo = issue.damage_photos[0];
  return (
    <span className={cn('relative block overflow-hidden bg-black/[0.03]', className)}>
      {photo
        ? <img src={photo} alt={`${issue.plate_number ?? 'Car'} damage`} loading="lazy" className="h-full w-full object-cover" />
        : <span className="grid h-full w-full place-items-center" style={{ color: config.color, background: `${config.color}12` }}><TypeIcon type={issue.type} size={26} /></span>}
    </span>
  );
};

const Reporter: React.FC<{ issue: Issue; staff: Record<string, ProfileOption> }> = ({ issue, staff }) => (
  <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-black/55">
    <StaffAvatar profile={issue.discovered_by ? staff[issue.discovered_by] : null} alt="" size={22} />
    <span className="min-w-0 truncate">{issue.discovered_by_name ?? 'Unknown'} · <span className="tabular-nums">{formatDate(issue.discovered_at)}</span></span>
  </span>
);

const Linked: React.FC<{ issue: Issue }> = ({ issue }) => {
  const link = [issue.customer_name, issue.booking_number].filter(Boolean).join(' · ');
  return link ? <p className="truncate text-[12.5px] text-black/55">{link}</p> : null;
};

export interface CardActions {
  onOpen: () => void;
  onDragStart?: () => void;
}

const interactive = (label: string, onOpen: () => void) => ({
  role: 'button',
  tabIndex: 0,
  'aria-label': label,
  onClick: onOpen,
  onKeyDown: (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  },
});

export const IssueCard: React.FC<CardActions & { issue: Issue; staff: Record<string, ProfileOption> }> = ({ issue, staff, onOpen, onDragStart }) => (
  <div
    {...interactive(`Issue on ${issue.plate_number ?? 'car'}`, onOpen)}
    draggable={Boolean(onDragStart)}
    onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; onDragStart?.(); }}
    className={cn(
      'surface-depth flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-subtle bg-surface transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40',
      onDragStart && 'active:cursor-grabbing',
    )}
  >
    <div className="relative">
      <Thumbnail issue={issue} className="aspect-[16/9]" />
      {issue.damage_photos.length > 1 && (
        <span className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">+{issue.damage_photos.length - 1}</span>
      )}
    </div>
    <div className="flex min-w-0 flex-1 flex-col gap-2 p-3.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <LicensePlate plate={issue.plate_number} />
        <span className="min-w-0 truncate text-[13px] text-black/55">{issue.model_name}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <TypeChip type={issue.type} />
        <DaysChip issue={issue} />
      </div>
      <p className={cn('line-clamp-2 text-[13px] leading-snug', issue.description ? 'text-black/70' : 'text-black/35')}>{issue.description || 'No description'}</p>
      <div className="mt-auto flex flex-col gap-1 pt-1">
        <Linked issue={issue} />
        <Reporter issue={issue} staff={staff} />
      </div>
    </div>
  </div>
);

export const IssueRow: React.FC<CardActions & { issue: Issue; staff: Record<string, ProfileOption> }> = ({ issue, staff, onOpen }) => (
  <li
    {...interactive(`Issue on ${issue.plate_number ?? 'car'}`, onOpen)}
    className="grid cursor-pointer grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-subtle px-4 py-3 transition-colors last:border-b-0 hover:bg-black/[0.015] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[#6EA4E7]/40 lg:grid-cols-[56px_minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto]"
  >
    <Thumbnail issue={issue} className="h-14 w-14 rounded-xl" />
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <LicensePlate plate={issue.plate_number} />
        <span className="min-w-0 truncate text-[13px] text-black/55">{issue.model_name}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5"><TypeChip type={issue.type} /></div>
    </div>
    <div className="flex flex-col items-end gap-1.5 lg:order-5">
      <StatusChip status={issue.status} />
      <DaysChip issue={issue} />
    </div>
    <p className={cn('col-span-3 line-clamp-2 text-[13px] leading-snug lg:order-3 lg:col-span-1', issue.description ? 'text-black/70' : 'text-black/35')}>{issue.description || 'No description'}</p>
    <div className="col-span-3 min-w-0 lg:order-4 lg:col-span-1">
      <Linked issue={issue} />
      <Reporter issue={issue} staff={staff} />
    </div>
  </li>
);

/** The five big type cards. A saved `maintenance` issue keeps its own card. */
export const TypeCards: React.FC<{ types: IssueType[]; value: IssueType; onChange: (type: IssueType) => void }> = ({ types, value, onChange }) => (
  <div role="radiogroup" aria-label="Issue type" className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-3">
    {types.map((type) => {
      const config = TYPE_CONFIG[type];
      const selected = type === value;
      return (
        <button
          key={type}
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onChange(type)}
          className={cn(
            'flex min-h-[76px] flex-col items-start justify-center gap-2 rounded-xl border-2 p-3 text-start text-[13.5px] font-semibold text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40',
            selected ? 'border-[#6EA4E7] bg-[#F1F6FD]' : 'border-[#EDEEF2] bg-white hover:bg-black/[0.02]',
          )}
        >
          <span className="grid h-8 w-8 place-items-center rounded-[10px]" style={{ color: config.color, background: `${config.color}1a` }}><TypeIcon type={type} size={16} /></span>
          {config.label}
        </button>
      );
    })}
  </div>
);
