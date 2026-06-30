// Date helpers for due meta, the Today and Upcoming views, and the date picker.
// All dates are local. A due is { date, datetime, string, isRecurring }.

const MS_DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
