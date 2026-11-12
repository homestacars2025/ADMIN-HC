import React from 'react';
import type { IconProps } from '../media/MediaIcons';

/**
 * Mail-only glyphs. MediaIcons carries the shared set (arrows, search, X…);
 * these are the ones only a mail client needs, drawn on the same 24px grid with
 * the same stroke so the two sets sit together.
 */
const mk = (paths: React.ReactNode, name: string): React.FC<IconProps> => {
  const Icon: React.FC<IconProps> = ({ size = 16, strokeWidth = 1.75, className }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  );
  Icon.displayName = name;
  return Icon;
};

export const StarIcon = mk(<path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3z" />, 'StarIcon');
export const ArchiveIcon = mk(<><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" /></>, 'ArchiveIcon');
export const UnarchiveIcon = mk(<><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M12 18v-6M9.5 14.5 12 12l2.5 2.5" /></>, 'UnarchiveIcon');
export const ReplyIcon = mk(<><path d="M9 17l-6-6 6-6" /><path d="M3 11h8a8 8 0 018 8v1" /></>, 'ReplyIcon');
export const ReplyAllIcon = mk(<><path d="M7 17l-5-5 5-5" /><path d="M12 17l-5-5 5-5" /><path d="M7 12h7a7 7 0 017 7v1" /></>, 'ReplyAllIcon');
export const ForwardIcon = mk(<><path d="M15 17l6-6-6-6" /><path d="M21 11h-8a8 8 0 00-8 8v1" /></>, 'ForwardIcon');
export const TrashIcon = mk(<><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></>, 'TrashIcon');
export const PaperclipIcon = mk(<path d="M21.4 11.1l-9.2 9.2a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5" />, 'PaperclipIcon');
export const InboxIcon = mk(<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.9A2 2 0 0016.7 4H7.3a2 2 0 00-1.8 1.1z" /></>, 'InboxIcon');
export const SendIcon = mk(<><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></>, 'SendIcon');
export const MailOpenIcon = mk(<><path d="M3 9.5l9-6 9 6V19a1 1 0 01-1 1H4a1 1 0 01-1-1z" /><path d="M3 9.5l9 6 9-6" /></>, 'MailOpenIcon');
export const MailDotIcon = mk(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>, 'MailDotIcon');
export const ReceivedIcon = mk(<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>, 'ReceivedIcon');
export const LayersIcon = mk(<><path d="M12 2l10 6-10 6L2 8z" /><path d="M2 16l10 6 10-6" /></>, 'LayersIcon');
export const LinkIcon = mk(<><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" /></>, 'LinkIcon');
export const BoldIcon = mk(<path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z" />, 'BoldIcon');
export const ItalicIcon = mk(<path d="M14 5h-4M14 19h-4M14 5l-4 14" />, 'ItalicIcon');
export const UnderlineIcon = mk(<path d="M7 4v7a5 5 0 0010 0V4M5 20h14" />, 'UnderlineIcon');
export const ListBulletIcon = mk(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />, 'ListBulletIcon');
export const ListNumberIcon = mk(<path d="M10 6h10M10 12h10M10 18h10M4 5h1v4M4 9h2M4 15.5a1 1 0 011.8-.6c.3.5 0 1-.4 1.4L4 18h2" />, 'ListNumberIcon');
export const QuoteIcon = mk(<path d="M7 7H4v5h3l-1 5M17 7h-3v5h3l-1 5" />, 'QuoteIcon');
export const ClearFormatIcon = mk(<path d="M4 7V5h11v2M9.5 5l-3 14M14 14l6 6M20 14l-6 6" />, 'ClearFormatIcon');
export const BellIcon = mk(<><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 003.4 0" /></>, 'BellIcon');
export const BellOffIcon = mk(<><path d="M8.7 3A6 6 0 0118 8c0 2.7.4 4.6 1 6M17 17H3s3-2 3-9a5.9 5.9 0 01.3-1.8" /><path d="M10.3 21a1.9 1.9 0 003.4 0M2 2l20 20" /></>, 'BellOffIcon');
export const FileIcon = mk(<><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></>, 'FileIcon');
export const ComposeIcon = mk(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></>, 'ComposeIcon');
export const RefreshIcon = mk(<><path d="M21 12a9 9 0 01-15.5 6.2L3 16" /><path d="M3 12A9 9 0 0118.5 5.8L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></>, 'RefreshIcon');
export const MoreIcon = mk(<path d="M12 6h.01M12 12h.01M12 18h.01" />, 'MoreIcon');
