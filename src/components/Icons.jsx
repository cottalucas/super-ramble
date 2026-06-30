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

export const IconFlag = (p) => (
  <svg {...base} className="icon" {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
);

export const IconBell = (p) => (
  <svg {...base} className="icon" {...p}>
    <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
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
