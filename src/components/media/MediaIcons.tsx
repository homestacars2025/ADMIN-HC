import React from 'react';

/**
 * The icon set for the Media section.
 *
 * Drawn on lucide's geometry — 24×24 viewBox, round caps and joins, currentColor
 * stroke — so `size` / `strokeWidth` behave exactly as the spec's `size={14}
 * strokeWidth={1.75}` convention expects, without pulling lucide-react into a
 * react-scripts 5 dependency tree.
 */

export interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function makeIcon(
  paths: React.ReactNode,
  displayName: string,
): React.FC<IconProps> {
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
  Icon.displayName = displayName;
  return Icon;
}

export const Lightbulb = makeIcon(
  <>
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5a6 6 0 0 0-12 0c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
    <path d="M9 18h6" />
    <path d="M10 22h4" />
  </>,
  'Lightbulb',
);

export const CalendarRange = makeIcon(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <path d="M17 14h-6M13 18H7M7 14h.01M17 18h.01" />
  </>,
  'CalendarRange',
);

export const CalendarDays = makeIcon(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
  </>,
  'CalendarDays',
);

export const CalendarPlus = makeIcon(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <path d="M12 14v5M9.5 16.5h5" />
  </>,
  'CalendarPlus',
);

export const Megaphone = makeIcon(
  <>
    <path d="m3 11 18-5v12L3 14v-3z" />
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </>,
  'Megaphone',
);

export const Plus = makeIcon(<path d="M5 12h14M12 5v14" />, 'Plus');

export const Search = makeIcon(
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </>,
  'Search',
);

export const SearchX = makeIcon(
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m13.5 8.5-5 5M8.5 8.5l5 5" />
    <path d="m21 21-4.3-4.3" />
  </>,
  'SearchX',
);

export const Pencil = makeIcon(
  <>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    <path d="m15 5 4 4" />
  </>,
  'Pencil',
);

export const Sparkles = makeIcon(
  <>
    <path d="M12 3 13.6 8.4 19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" />
    <path d="M19 15v3M20.5 16.5h-3M5 4v2M6 5H4" />
  </>,
  'Sparkles',
);

export const ArrowUpRight = makeIcon(<path d="M7 7h10v10M7 17 17 7" />, 'ArrowUpRight');

export const StickyNote = makeIcon(
  <>
    <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z" />
    <path d="M15 3v6h6" />
  </>,
  'StickyNote',
);

export const CheckCircle2 = makeIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </>,
  'CheckCircle2',
);

export const CircleDashed: React.FC<IconProps> = ({
  size = 16,
  strokeWidth = 1.75,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="9" strokeDasharray="3.2 3.2" />
  </svg>
);
CircleDashed.displayName = 'CircleDashed';

export const ShieldCheck = makeIcon(
  <>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </>,
  'ShieldCheck',
);

export const Lock = makeIcon(
  <>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>,
  'Lock',
);

export const ChevronLeft = makeIcon(<path d="m15 18-6-6 6-6" />, 'ChevronLeft');
export const ChevronRight = makeIcon(<path d="m9 18 6-6-6-6" />, 'ChevronRight');
export const ChevronDown = makeIcon(<path d="m6 9 6 6 6-6" />, 'ChevronDown');
export const ChevronUp = makeIcon(<path d="m18 15-6-6-6 6" />, 'ChevronUp');

export const List = makeIcon(
  <path d="M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13" />,
  'List',
);

export const ListChecks = makeIcon(
  <>
    <path d="m3 7 2 2 4-4M3 17l2 2 4-4" />
    <path d="M13 6h8M13 12h8M13 18h8" />
  </>,
  'ListChecks',
);

export const ExternalLink = makeIcon(
  <>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </>,
  'ExternalLink',
);

export const Maximize2 = makeIcon(
  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />,
  'Maximize2',
);

export const Loader2 = makeIcon(<path d="M21 12a9 9 0 1 1-6.219-8.56" />, 'Loader2');

export const Mail = makeIcon(
  <>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </>,
  'Mail',
);

export const Hash = makeIcon(<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />, 'Hash');

export const X = makeIcon(<path d="M18 6 6 18M6 6l12 12" />, 'X');

export const Check = makeIcon(<path d="M20 6 9 17l-5-5" />, 'Check');

export const Trash2 = makeIcon(
  <>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6M14 11v6" />
  </>,
  'Trash2',
);

export const AlertTriangle = makeIcon(
  <>
    <path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" />
    <path d="M12 9v4M12 17h.01" />
  </>,
  'AlertTriangle',
);

export const ArrowUp = makeIcon(<path d="M12 19V5M5 12l7-7 7 7" />, 'ArrowUp');
export const ArrowDown = makeIcon(<path d="M12 5v14M19 12l-7 7-7-7" />, 'ArrowDown');

export const Tag = makeIcon(
  <>
    <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z" />
    <path d="M7.5 7.5h.01" />
  </>,
  'Tag',
);

export const Palette = makeIcon(
  <>
    <path d="M12 22a10 10 0 1 1 10-10c0 1.7-1.3 3-3 3h-1.8a2 2 0 0 0-1.4 3.4 2 2 0 0 1-1.4 3.4z" />
    <path d="M7.5 10.5h.01M10.5 7.5h.01M14.5 7.5h.01M17 11h.01" />
  </>,
  'Palette',
);

export const Info = makeIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </>,
  'Info',
);
