import React, { useState } from 'react';
import { Mail } from '../../components/media/MediaIcons';
import { InvestorAvatar } from '../../components/shared/PersonAvatar';
import { StatusImage } from '../../components/shared/StatusImage';
import { formatLira } from '../../lib/customers';
import {
  investorName,
  modelLabel,
  monthNet,
  telLink,
  whatsappLink,
  type InvestorModelGroup,
  type InvestorOverview,
} from '../../lib/investors';
import { cn } from '../../lib/media/badgeColor';
import { avatarBgGradient, toAvatarBg } from '../../lib/staffAvatar';
import { GroupUtilizationRing } from '../modelGroups/ModelGroupCard';

// ── 3D chips ─────────────────────────────────────────────────────────────────

export type GlossyTone = 'blue' | 'green' | 'coral' | 'violet';

const GLOSS: Record<GlossyTone, { from: string; to: string; glow: string }> = {
  blue: { from: '#9CC6F3', to: '#5A93DD', glow: 'rgb(90 147 221 / 0.45)' },
  green: { from: '#8EE0AE', to: '#2FAE66', glow: 'rgb(47 174 102 / 0.4)' },
  coral: { from: '#FFB4A6', to: '#EC6A55', glow: 'rgb(236 106 85 / 0.4)' },
  violet: { from: '#C9B8F7', to: '#8B6FE3', glow: 'rgb(139 111 227 / 0.4)' },
};

export type GlossyGlyph = 'in' | 'out' | 'net' | 'gauge';

const GLYPHS: Record<GlossyGlyph, React.ReactNode> = {
  in: <path d="M16.5 7.5l-9 9M7.5 9v7.5H15" />,
  out: <path d="M7.5 16.5l9-9M9 7.5h7.5V15" />,
  net: <path d="M9.5 5.5v12.2a.3.3 0 00.3.3 6.5 6.5 0 006.2-6.5M7 11.5l6-2.6M7 14.8l6-2.6" />,
  gauge: <><path d="M5 16a7 7 0 1114 0" /><path d="M12 16l3.4-4.4" /></>,
};

/**
 * A glossy rounded square with a white glyph, drawn to sit with the app's 3D icons
 * (the bookings and car sets) where there's no picture for a money figure.
 */
export const Glossy3D: React.FC<{ tone: GlossyTone; glyph: GlossyGlyph; size?: number; className?: string }> = ({ tone, glyph, size = 32, className }) => {
  const gloss = GLOSS[tone];
  return (
    <span
      aria-hidden="true"
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: `linear-gradient(150deg, ${gloss.from} 0%, ${gloss.to} 100%)`,
        boxShadow: `inset 0 ${size * 0.06}px ${size * 0.04}px rgb(255 255 255 / 0.55), inset 0 -${size * 0.08}px ${size * 0.12}px rgb(0 0 0 / 0.14), 0 ${size * 0.12}px ${size * 0.25}px -${size * 0.06}px ${gloss.glow}`,
      }}
    >
      <span className="pointer-events-none absolute inset-x-[14%] top-[7%] h-[34%] rounded-[40%] bg-gradient-to-b from-white/45 to-white/0" />
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative"
        style={{ filter: 'drop-shadow(0 1px 1px rgb(0 0 0 / 0.18))' }}
      >
        {GLYPHS[glyph]}
      </svg>
    </span>
  );
};

// ── Avatar ───────────────────────────────────────────────────────────────────

/** The shared investor picture: their photo, or the 3D investor on their own backdrop. */
export const InvestorPicture: React.FC<{ investor: InvestorOverview; size: number }> = ({ investor, size }) => (
  <InvestorAvatar
    person={{ avatar_url: investor.avatarUrl }}
    alt=""
    size={size}
    style={investor.avatarBg ? { background: avatarBgGradient(toAvatarBg(investor.avatarBg)) } : undefined}
  />
);

export const StatusChip: React.FC<{ active: boolean; className?: string }> = ({ active, className }) => (
  <span className={cn(
    'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold',
    active ? 'bg-[#22C55E]/[0.12] text-[#166534]' : 'bg-black/[0.06] text-black/50',
    className,
  )}>
    <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-[#22C55E]' : 'bg-black/30')} />
    {active ? 'Active' : 'Inactive'}
  </span>
);

// ── Contact ──────────────────────────────────────────────────────────────────

const WhatsAppGlyph: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 2.2a9.7 9.7 0 00-8.3 14.8L2.4 21.6l4.7-1.2A9.7 9.7 0 1012 2.2zm0 17.7a8 8 0 01-4.1-1.1l-.3-.2-2.8.7.8-2.7-.2-.3A8 8 0 1112 19.9zm4.4-6c-.2-.1-1.4-.7-1.7-.8s-.4-.1-.5.1-.6.8-.8.9-.3.2-.5.1a6.6 6.6 0 01-3.3-2.9c-.2-.4.2-.4.7-1.3a.4.4 0 000-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 00-.7.3 2.8 2.8 0 00-.9 2.1 5 5 0 001 2.6 11.2 11.2 0 004.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 001.7-1.2 2.1 2.1 0 00.1-1.2c0-.1-.2-.2-.4-.3z" />
  </svg>
);

const PhoneGlyph: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16.5v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 011.1 3.8 2 2 0 013.1 1.6h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L7.1 9.4a16 16 0 006 6l1.2-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.8 2z" />
  </svg>
);

interface ContactAction { key: string; label: string; href: string; external?: boolean; icon: React.ReactNode; tone: string }

export function contactActions(investor: InvestorOverview): ContactAction[] {
  const wa = whatsappLink(investor.whatsapp ?? investor.phone);
  const tel = telLink(investor.phone ?? investor.whatsapp);
  const actions: Array<ContactAction | null> = [
    wa ? { key: 'wa', label: 'WhatsApp', href: wa, external: true, icon: <WhatsAppGlyph />, tone: 'text-[#128C4B] hover:bg-[#25D366]/[0.12]' } : null,
    tel ? { key: 'call', label: 'Call', href: tel, icon: <PhoneGlyph />, tone: 'text-[#2F6FB8] hover:bg-[#6EA4E7]/[0.14]' } : null,
    investor.email ? { key: 'mail', label: 'Email', href: `mailto:${investor.email}`, icon: <Mail size={16} />, tone: 'text-[#6D4FD1] hover:bg-[#8B5CF6]/[0.12]' } : null,
  ];
  return actions.filter((action): action is ContactAction => action !== null);
}

/** WhatsApp, call and email as round buttons; the ones with nothing to reach are left out. */
export const QuickActions: React.FC<{ investor: InvestorOverview; className?: string; labelled?: boolean }> = ({ investor, className, labelled }) => {
  const actions = contactActions(investor);
  const name = investorName(investor);
  if (actions.length === 0) return <span className={cn('text-[12px] text-black/35', className)}>No contact details</span>;
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {actions.map((action) => (
        <a
          key={action.key}
          href={action.href}
          target={action.external ? '_blank' : undefined}
          rel={action.external ? 'noopener noreferrer' : undefined}
          aria-label={`${action.label} ${name}`}
          title={action.label}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-black/[0.04] text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/40 md:h-9',
            labelled ? 'px-3.5' : 'w-11 md:w-9',
            action.tone,
          )}
        >
          {action.icon}
          {labelled && <span className="text-foreground/80">{action.label}</span>}
        </a>
      ))}
    </div>
  );
};

// ── Model strip ──────────────────────────────────────────────────────────────

const StripImage: React.FC<{ group: InvestorModelGroup }> = ({ group }) => {
  const [failed, setFailed] = useState(false);
  const label = modelLabel(group);
  return (
    <li className="relative min-w-0" title={`${label} · ${group.count} ${group.count === 1 ? 'car' : 'cars'}`}>
      <span className="block aspect-[4/3] overflow-hidden rounded-[10px] bg-[linear-gradient(160deg,#F7F9FC_0%,#EAF0F7_100%)]">
        {group.imageUrl && !failed ? (
          <img src={group.imageUrl} alt={label} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-cover" style={{ objectPosition: '50% 70%' }} />
        ) : (
          <span className="grid h-full w-full place-items-center"><StatusImage status="fleet" size={30} className="opacity-80" /></span>
        )}
      </span>
      <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#0F1117] px-1 font-mono text-[10.5px] font-semibold tabular-nums text-white ring-2 ring-white">
        {group.count}
      </span>
    </li>
  );
};

/** The four biggest models as small pictures with their counts, then "+N" for the rest. */
export const ModelStrip: React.FC<{ groups: InvestorModelGroup[] }> = ({ groups }) => {
  const top = groups.slice(0, 4);
  const more = groups.length - top.length;
  if (groups.length === 0) return null;
  return (
    <ul aria-label="Top models" className="grid grid-cols-5 gap-2 pt-1">
      {top.map((group) => <StripImage key={group.id ?? 'none'} group={group} />)}
      {more > 0 && (
        <li className="grid aspect-[4/3] place-items-center rounded-[10px] bg-black/[0.04] text-[13px] font-semibold tabular-nums text-black/55" title={`${more} more ${more === 1 ? 'model' : 'models'}`}>
          +{more}
        </li>
      )}
    </ul>
  );
};

// ── Card ─────────────────────────────────────────────────────────────────────

export const InvestorCard: React.FC<{
  investor: InvestorOverview;
  monthShort: string;
  onOpen: () => void;
}> = ({ investor, monthShort, onOpen }) => {
  const name = investorName(investor);
  const person = investor.companyName && investor.fullName && investor.fullName.toLocaleLowerCase('tr') !== investor.companyName.toLocaleLowerCase('tr') ? investor.fullName : null;
  const net = monthNet(investor);

  return (
    <article
      aria-label={name}
      className={cn(
        'surface-depth group/card relative flex min-w-0 flex-col rounded-[22px] border border-subtle bg-surface p-4 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-14px_rgba(15,23,42,0.22)] sm:p-5',
        !investor.isActive && 'bg-[#FBFBFC]',
      )}
    >
      {/* The whole card opens the investor; the contact buttons sit above it. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${name}`}
        className="absolute inset-0 z-0 rounded-[22px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/50"
      />

      <div className="pointer-events-none relative flex items-start gap-3">
        <InvestorPicture investor={investor} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="truncate text-[16px] font-semibold tracking-[-0.015em] text-foreground">{name}</h2>
            <StatusChip active={investor.isActive} />
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-black/50">
            {person && <>{person} · </>}
            {investor.commissionRate !== null ? <><span className="font-medium tabular-nums text-black/65">{investor.commissionRate}%</span> commission</> : 'No commission set'}
          </p>
        </div>
      </div>

      <div className="pointer-events-none relative mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[32px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-foreground">
            {investor.carsTotal}<span className="ms-1.5 font-sans text-[15px] font-medium tracking-normal text-black/50">{investor.carsTotal === 1 ? 'car' : 'cars'}</span>
          </p>
          <p className="mt-1.5 text-[12.5px] text-black/50">
            <span className="tabular-nums">{investor.modelTypes}</span> {investor.modelTypes === 1 ? 'model' : 'models'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="text-end">
            <p className="text-[11.5px] text-black/45">Rented now</p>
            <p className="text-[14px] font-semibold tabular-nums text-foreground">
              {investor.carsRentedNow}<span className="font-normal text-black/40">/{investor.carsTotal}</span>
            </p>
          </div>
          <GroupUtilizationRing rate={investor.carsTotal > 0 ? investor.utilization : null} size={54} />
        </div>
      </div>

      <div className="pointer-events-none relative mt-4">
        {investor.modelGroups.length > 0
          ? <ModelStrip groups={investor.modelGroups} />
          : <p className="rounded-[12px] bg-black/[0.03] px-3 py-3 text-center text-[12.5px] text-black/45">No cars yet</p>}
      </div>

      <div className="pointer-events-none relative mt-4 flex items-end justify-between gap-3 border-t border-black/[0.06] pt-3.5">
        <div className="min-w-0">
          <p className="text-[11.5px] text-black/45">Net · {monthShort}</p>
          <p className={cn('font-mono text-[17px] font-semibold tabular-nums tracking-[-0.01em]', net < 0 ? 'text-[#B91C1C]' : net > 0 ? 'text-[#15803D]' : 'text-foreground')}>
            {formatLira(net)}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] tabular-nums text-black/45">
            IN {formatLira(investor.monthIn)} · OUT {formatLira(investor.monthOut)}
          </p>
        </div>
        <QuickActions investor={investor} className="pointer-events-auto relative z-[1]" />
      </div>
    </article>
  );
};

export const InvestorCardSkeleton: React.FC = () => (
  <div aria-hidden="true" className="flex flex-col rounded-[22px] border border-subtle bg-surface p-4 sm:p-5">
    <div className="flex items-center gap-3">
      <span className="h-12 w-12 animate-pulse rounded-full bg-black/[0.06]" />
      <span className="flex-1 space-y-2">
        <span className="block h-4 w-2/3 animate-pulse rounded bg-black/[0.06]" />
        <span className="block h-3 w-1/3 animate-pulse rounded bg-black/[0.05]" />
      </span>
    </div>
    <div className="mt-5 flex items-center justify-between">
      <span className="h-8 w-24 animate-pulse rounded bg-black/[0.06]" />
      <span className="h-[54px] w-[54px] animate-pulse rounded-full bg-black/[0.05]" />
    </div>
    <div className="mt-4 grid grid-cols-5 gap-2">{Array.from({ length: 5 }, (_, index) => <span key={index} className="aspect-[4/3] animate-pulse rounded-[10px] bg-black/[0.05]" />)}</div>
    <div className="mt-4 h-12 animate-pulse rounded-[12px] bg-black/[0.04]" />
  </div>
);
