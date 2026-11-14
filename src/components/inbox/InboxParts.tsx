import React, { useState } from 'react';
import {
  type ChatConversation,
  type PreviewKind,
  avatarTint,
  channelColor,
  channelLabel,
  contactLabel,
  initials,
} from '../../lib/inbox';

/** The brand blue, and the tint the Inbox uses for unread rows. */
export const BRAND = '#4ba6ea';
export const BRAND_STRONG = '#2F7FC4';

/**
 * A contact's picture: their photo, or their initials on a soft color that stays the
 * same for the same name. The small dot on the corner is the channel's (green for
 * WhatsApp), ringed in the surface color so it reads on any row.
 */
export const ContactAvatar: React.FC<{
  conversation: ChatConversation;
  size?: number;
  /** The channel dot; off where the channel is already spelled out. */
  dot?: boolean;
  ring?: string;
}> = ({ conversation, size = 40, dot = true, ring = '#fff' }) => {
  const name = contactLabel(conversation);
  const [failed, setFailed] = useState(false);
  const tint = avatarTint(name);
  const photo = conversation.contact?.avatar_url;
  const dotSize = Math.max(10, Math.round(size * 0.3));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        aria-hidden="true"
        className="grid h-full w-full place-items-center overflow-hidden rounded-full font-semibold"
        style={{ background: tint.bg, color: tint.fg, fontSize: Math.round(size * 0.35) }}
      >
        {photo && !failed
          ? <img src={photo} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
          : <bdi dir="auto">{initials(name)}</bdi>}
      </span>
      {dot && (
        <span
          title={channelLabel(conversation.channel)}
          className="absolute -bottom-px -end-px rounded-full"
          style={{ width: dotSize, height: dotSize, background: channelColor(conversation.channel), boxShadow: `0 0 0 2px ${ring}` }}
        />
      )}
    </span>
  );
};

// ── Icons ────────────────────────────────────────────────────────────────────

type IconProps = { size?: number; className?: string; strokeWidth?: number };

const icon = (paths: React.ReactNode) => {
  const Icon: React.FC<IconProps> = ({ size = 16, className, strokeWidth = 1.8 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {paths}
    </svg>
  );
  return Icon;
};

export const SearchIcon = icon(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>);
export const MicIcon = icon(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>);
export const CameraIcon = icon(<><path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13" r="3.5" /></>);
export const VideoIcon = icon(<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>);
export const FileIcon = icon(<><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></>);
export const PinIcon = icon(<><path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>);
export const StickerIcon = icon(<><path d="M20 12a8 8 0 11-8-8h3l5 5z" /><path d="M9 14.5a4 4 0 006 0M9 10h.01M15 10h.01" /></>);
export const SendIcon = icon(<path d="M5 12l14-7-5 15-2.5-6.5z" />);
export const PaperclipIcon = icon(<path d="M20.5 11.5l-8 8a5 5 0 01-7-7l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.4 8.4a1.7 1.7 0 01-2.4-2.4L15.5 7" />);
export const TemplateIcon = icon(<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></>);
export const AssignIcon = icon(<><circle cx="10" cy="8" r="3.5" /><path d="M3.5 19a6.5 6.5 0 0113 0M18 8v6M15 11h6" /></>);
export const UnreadIcon = icon(<><path d="M20 12.5V17a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h8.5" /><path d="M4 7l8 5 3.2-2" /><circle cx="19" cy="6" r="2.6" fill="currentColor" stroke="none" /></>);
export const ReadIcon = icon(<><path d="M4 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2z" /><path d="M4 7l8 6 8-6" /></>);
export const ProfileIcon = icon(<><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="11" r="2.5" /><path d="M5.5 17a3.5 3.5 0 017 0M15 10h3M15 14h3" /></>);
export const InfoIcon = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);
export const BackIcon = icon(<path d="M15 18l-6-6 6-6" />);
export const DownIcon = icon(<path d="M12 5v14M6 13l6 6 6-6" />);
export const DownloadIcon = icon(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />);
export const PlayIcon: React.FC<IconProps> = ({ size = 14, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}><path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z" fill="currentColor" /></svg>
);
export const PauseIcon: React.FC<IconProps> = ({ size = 14, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}><rect x="6" y="5" width="4.5" height="14" rx="1.2" fill="currentColor" /><rect x="13.5" y="5" width="4.5" height="14" rx="1.2" fill="currentColor" /></svg>
);
export const ChatIcon = icon(<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />);

const KIND_ICON: Record<PreviewKind, React.FC<IconProps>> = {
  audio: MicIcon,
  image: CameraIcon,
  video: VideoIcon,
  document: FileIcon,
  location: PinIcon,
  sticker: StickerIcon,
};

/** The small type icon before "Voice message", "Photo" and the rest. */
export const PreviewKindIcon: React.FC<{ kind: PreviewKind; className?: string }> = ({ kind, className }) => {
  const Icon = KIND_ICON[kind];
  return <Icon size={14} className={className} />;
};
