// Small inline icons. Stroke inherits currentColor so nav and rows can tint them.
const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const IconInbox = (p) => (
  <svg {...base} className="icon" {...p}>
    <path d="M3 12h5l2 3h4l2-3h5" />
    <path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
  </svg>
);

export const IconToday = (p) => (
  <svg {...base} className="icon" {...p}>
    <rect x="4" y="5" width="16" height="16" rx="2" />
    <path d="M4 9h16M8 3v4M16 3v4" />
    <text x="12" y="17" fontSize="7" textAnchor="middle" stroke="none" fill="currentColor">
      {new Date().getDate()}
    </text>
  </svg>
);

export const IconUpcoming = (p) => (
  <svg {...base} className="icon" {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4M7 13h3M7 17h3M14 13h3" />
  </svg>
);

export const IconSearch = (p) => (
  <svg {...base} className="icon" {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4-4" />
  </svg>
);

export const IconPlus = (p) => (
  <svg {...base} className="icon" {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconHash = (p) => (
  <svg {...base} className="icon" {...p}>
    <path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" />
  </svg>
);

// `filled` (default false, every other caller unaffected): P1-P3 are solid
// flags in real Todoist, P4 (no priority) stays a hollow outline. Compared
// directly against a screenshot; see docs/resolution-log.md, 2026-07-10.
// The flag's pole (the vertical stroke) always stays stroked, never filled,
// even when filled is true: only the flag shape itself (the second path)
// fills, matching the real glyph rather than turning the whole icon into a
// solid block.
export const IconFlag = ({ filled = false, ...p }) => (
  <svg {...base} className="icon" {...p}>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" fill={filled ? 'currentColor' : 'none'} />
  </svg>
);

export const IconCheck = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 12l5 5L20 7" />
  </svg>
);

export const IconCaret = (p) => (
  <svg {...base} {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconDots = (p) => (
  <svg {...base} className="icon" {...p}>
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </svg>
);

export const IconClock = (p) => (
  <svg {...base} className="icon" {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </svg>
);

export const IconX = (p) => (
  <svg {...base} className="icon" {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconCalendarSmall = (p) => (
  <svg {...base} className="icon" {...p}>
    <rect x="4" y="5" width="16" height="16" rx="2" />
    <path d="M4 9h16M8 3v4M16 3v4" />
  </svg>
);

export const IconListView = (p) => (
  <svg {...base} className="icon" {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

export const IconBoardView = (p) => (
  <svg {...base} className="icon" {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16M15 4v16" />
  </svg>
);

export const IconSidebarToggle = (p) => (
  <svg {...base} className="icon" {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);

export const IconSparkle = (p) => (
  <svg {...base} className="icon" {...p}>
    <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
  </svg>
);

export const IconMic = (p) => (
  <svg {...base} className="icon" {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <path d="M12 19v3M9 22h6" />
  </svg>
);

export const IconStopCircle = (p) => (
  <svg {...base} className="icon" {...p}>
    <circle cx="12" cy="12" r="9" />
    <rect x="9" y="9" width="6" height="6" />
  </svg>
);

export const IconSettings = (p) => (
  <svg {...base} className="icon" {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
