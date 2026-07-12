// Date helpers for due meta, the Today and Upcoming views, and the date picker.
// All dates are local. A due is { date, datetime, string, isRecurring }.

const MS_DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function toISODate(d) {
  const x = startOfDay(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}

export function parseISODate(s) {
  // Treat a bare YYYY-MM-DD as local midnight, not UTC.
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  return new Date(startOfDay(d).getTime() + n * MS_DAY);
}

export function todayISO() {
  return toISODate(new Date());
}

// "July 2026" style, for Upcoming's month/year label.
export function formatMonthYear(d) {
  const x = new Date(d);
  return `${MONTHS_FULL[x.getMonth()]} ${x.getFullYear()}`;
}

// "30 Jun" style. Add the weekday for headers like "30 Jun . Today".
export function formatDayHeader(d) {
  const x = new Date(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]}`;
}

export function relativeLabel(dateISO) {
  if (!dateISO) return '';
  const today = startOfDay(new Date());
  const d = startOfDay(parseISODate(dateISO));
  const diff = Math.round((d - today) / MS_DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()];
  return formatDayHeader(d);
}

// Coarse "time ago" for the sidebar avatar menu's "Synced <time ago>" row,
// a client-side timestamp of the last successful store write, not a real
// sync engine (docs/roadmap.md). null in, null out: no write has happened
// yet this session (the initial data load on mount is a read, not a
// write, and does not set this).
export function timeAgo(ms) {
  if (!ms) return null;
  const diff = Date.now() - ms;
  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// The green meta line text for a task: date label plus time when present.
export function dueMeta(due) {
  if (!due) return '';
  const datePart = due.date ? relativeLabel(due.date) : '';
  let timePart = '';
  if (due.datetime) {
    const t = new Date(due.datetime);
    timePart = formatTime(t);
  }
  return [datePart, timePart].filter(Boolean).join(' ');
}

export function formatTime(d) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`;
}

export function isOverdue(due) {
  if (!due || !due.date) return false;
  return startOfDay(parseISODate(due.date)) < startOfDay(new Date());
}

export function isToday(due) {
  if (!due || !due.date) return false;
  return due.date === todayISO();
}

// Rewrite a due to a new calendar day, for drag-to-reschedule in Upcoming.
// Keeps the existing time of day when datetime was set; stays date-only
// otherwise. Verified local-day-safe: reads the old hour/minute with local
// getters and writes the new instant with the local constructor, so this
// never drifts across a UTC day boundary regardless of timezone or DST.
export function rescheduleDue(due, targetDateISO) {
  if (!due?.datetime) {
    return {
      date: targetDateISO,
      datetime: null,
      string: relativeLabel(targetDateISO),
      isRecurring: due?.isRecurring || false
    };
  }
  const old = new Date(due.datetime);
  const next = parseISODate(targetDateISO);
  next.setHours(old.getHours(), old.getMinutes(), 0, 0);
  return {
    date: targetDateISO,
    datetime: next.toISOString(),
    string: `${relativeLabel(targetDateISO)} ${formatTime(next)}`,
    isRecurring: due.isRecurring || false
  };
}

// Date picker presets. Each returns an ISO date or null.
export function presetDate(kind) {
  const now = new Date();
  switch (kind) {
    case 'today':
      return todayISO();
    case 'tomorrow':
      return toISODate(addDays(now, 1));
    case 'weekend': {
      // Next Saturday. If today is Saturday, use today.
      const day = now.getDay();
      const delta = (6 - day + 7) % 7;
      return toISODate(addDays(now, delta));
    }
    case 'nextweek': {
      // Next Monday.
      const day = now.getDay();
      const delta = (8 - day) % 7 || 7;
      return toISODate(addDays(now, delta));
    }
    case 'nodate':
    default:
      return null;
  }
}

export { MONTHS, WEEKDAYS, DOW_SHORT };

