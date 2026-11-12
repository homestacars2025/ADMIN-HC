import React from 'react';
import type { IconProps } from '../../components/media/MediaIcons';

/** Mail-action glyphs MediaIcons doesn't carry, drawn on the same 24px, 1.75 stroke grid. */
const mk = (paths: React.ReactNode): React.FC<IconProps> => {
  const Icon: React.FC<IconProps> = ({ size = 16, strokeWidth = 1.75, className }) => (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true" focusable="false"
    >{paths}</svg>
  );
  return Icon;
};

export const StarIcon = mk(<path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3z" />);
export const ArchiveIcon = mk(<><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" /></>);
export const ReplyIcon = mk(<><path d="M9 17l-6-6 6-6" /><path d="M3 11h8a8 8 0 018 8v1" /></>);
export const ReplyAllIcon = mk(<><path d="M12 17l-6-6 6-6" /><path d="M7 17l-6-6 6-6" /><path d="M6 11h7a8 8 0 018 8v1" /></>);
export const ForwardIcon = mk(<><path d="M15 17l6-6-6-6" /><path d="M21 11h-8a8 8 0 00-8 8v1" /></>);
export const TrashIcon = mk(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>);
export const PaperclipIcon = mk(<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l8.6-8.6a3.7 3.7 0 015.2 5.2l-8.6 8.6a1.8 1.8 0 01-2.6-2.6l7.9-7.9" />);
export const InboxIcon = mk(<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6l3.5-7z" /></>);
export const SendIcon = mk(<><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></>);
export const MailUnreadIcon = mk(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 7l10 6 10-6" /><circle cx="19" cy="5" r="3" fill="currentColor" stroke="none" /></>);
export const UsersIcon = mk(<><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" /></>);
export const BellIcon = mk(<><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 003.4 0" /></>);
export const BellOffIcon = mk(<><path d="M8.7 3A6 6 0 0118 8c0 2.4.4 4.3 1 5.7M17 17H3s3-2 3-9a5.9 5.9 0 01.3-1.7" /><path d="M10.3 21a1.9 1.9 0 003.4 0M2 2l20 20" /></>);
export const BoldIcon = mk(<path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z" />);
export const ItalicIcon = mk(<path d="M19 4h-9M14 20H5M15 4L9 20" />);
export const UnderlineIcon = mk(<><path d="M6 4v6a6 6 0 0012 0V4" /><path d="M4 20h16" /></>);
export const ListBulletIcon = mk(<><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>);
export const ListNumberIcon = mk(<><path d="M10 6h10M10 12h10M10 18h10M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></>);
export const LinkIcon = mk(<><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" /></>);
export const QuoteIcon = mk(<path d="M3 21c3 0 7-1 7-8V5H3v8h4M14 21c3 0 7-1 7-8V5h-7v8h4" />);
export const ClearFormatIcon = mk(<><path d="M4 7V4h16v3M9 20h6M12 4v16" /><path d="M3 3l18 18" /></>);
export const FileIcon = mk(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></>);
export const MenuIcon = mk(<path d="M3 6h18M3 12h18M3 18h18" />);
export const ChevronLeftIcon = mk(<path d="M15 18l-6-6 6-6" />);
export const EyeIcon = mk(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const ImageOffIcon = mk(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21M2 2l20 20" /></>);
export const TextIcon = mk(<path d="M4 6h16M4 10h16M4 14h10M4 18h12" />);
