// Virtual grouping for Inbox and Project: computes groups from the flat,
// already-fetched root task list, keyed by the field's own value. Never
// writes to the store; a group is a display grouping only, the same
// read-only relationship Sort already has to `order`. See docs/roadmap.md
// (Phase 2.8) and docs/resolution-log.md.
import { sortTasks } from './sort.js';
import { relativeLabel } from './date.js';

export const GROUP_MODES = ['none', 'priority', 'date', 'createdAt'];

const PRIORITY_GROUPS = [
  { key: 1, label: 'Priority 1' },
  { key: 2, label: 'Priority 2' },
  { key: 3, label: 'Priority 3' },
  { key: 4, label: 'No priority' }
];

function byDateKey(tasks, sortMode, keyFn, { noneLabel, order }) {
  const map = new Map();
  for (const t of tasks) {
    const key = keyFn(t);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  const dated = [...map.keys()].filter((k) => k !== null).sort((a, b) => (order === 'desc' ? b.localeCompare(a) : a.localeCompare(b)));
  const groups = dated.map((key) => ({ key, label: relativeLabel(key), tasks: sortTasks(map.get(key), sortMode) }));
  if (map.has(null)) groups.push({ key: null, label: noneLabel, tasks: sortTasks(map.get(null), sortMode) });
  return groups;
}

// Returns [{ key, label, tasks }] for "priority", "date", or "createdAt".
// Callers render real Sections instead when mode is "none".
export function groupTasks(tasks, mode, sortMode) {
  if (mode === 'priority') {
    return PRIORITY_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      tasks: sortTasks(tasks.filter((t) => t.priority === g.key), sortMode)
    }));
  }
  if (mode === 'date') {
    return byDateKey(tasks, sortMode, (t) => t.due?.date || null, { noneLabel: 'No date', order: 'asc' });
  }
  if (mode === 'createdAt') {
    // Bucketed to the calendar day a task was added, since the raw
    // createdAt timestamp is unique per task and would not group anything.
    return byDateKey(tasks, sortMode, (t) => (t.createdAt ? t.createdAt.slice(0, 10) : null), {
      noneLabel: 'No date',
      order: 'desc'
    });
  }
  return [];
}
