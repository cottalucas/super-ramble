// Stage 3 (Write): translate a validated Structure response into the shape
// store.createProjectTree expects. Pure, no model call, no write of its own.
// Nested subtasks flatten into parentRef siblings; sections and each task's
// sectionRef carry through unchanged. See docs/llm-pipeline.md.

import { parse } from 'chrono-node';
import { toISODate } from '../lib/date.js';

// "every Monday," "daily," "weekly": a recurring signal chrono-node itself
// does not expose (it resolves "every Monday" to one concrete next-Monday
// date, no recurring flag; "daily"/"weekly" alone resolve to no date at
// all). Checked independently of whatever chrono does or does not resolve,
// so a pure-recurring phrase with no resolvable single date ("daily") still
// sets isRecurring true even though date/datetime stay null.
const RECURRING_RE = /\b(every|each)\b|\b(daily|weekly|monthly|yearly|annually|nightly)\b/i;

// The model's due is a natural-language or ISO string. Parsed with
// chrono-node, anchored to the real current moment (local time, matching
// this file's local-day convention, never UTC): a proven, purpose-built
// parser, not a second hand-rolled date system risking the exact class of
// UTC-vs-local-day bug scripts/eval-date.mjs already guards against
// elsewhere in this app. `forwardDate: true` is required, not optional: a
// bare weekday or "next Friday" must resolve into the future, verified
// directly (without it, chrono resolves a bare weekday that already passed
// this week into the past instead). `string` always carries the raw input
// verbatim, unchanged, so functions/todoist.js's existing `t.due.string`
// read (its only consumer) keeps working exactly as before. `datetime` is
// only ever set when chrono found a real time component with its own
// certainty (`isCertain('hour')`); chrono defaults a missing hour to
// midnight or noon depending on the phrase matched, and neither default is
// a real time the user stated. Fails closed on anything chrono cannot parse
// at all ("asap," "sometime," ""): the exact prior shape, date and datetime
// both null, never a throw, never a guessed value. See
// scripts/eval-date-parse.mjs and docs/llm-pipeline.md.
export function toDue(raw) {
  if (raw == null) return null;
  const isRecurring = RECURRING_RE.test(raw);
  let date = null;
  let datetime = null;
  try {
    const results = parse(raw, new Date(), { forwardDate: true });
    if (results.length) {
      const start = results[0].start;
      const resolved = start.date();
      date = toISODate(resolved);
      if (start.isCertain('hour')) datetime = resolved.toISOString();
    }
  } catch {
    // Fail closed: date/datetime stay null, string/isRecurring still carry through.
  }
  return { date, datetime, string: raw, isRecurring };
}

// One flat list, each root task immediately followed by its own subtasks,
// every entry carrying a local ref. Shared by the store-write shape below and
// by SuperRambleModal's unconfirmed preview, so what is previewed is
// provably the same tree that gets written.
export function flattenTasks(structured) {
  const flat = [];
  (structured.tasks || []).forEach((t, i) => {
    const ref = `t${i}`;
    flat.push({
      ref,
      parentRef: null,
      sectionRef: t.sectionRef || null,
      content: t.content,
      priority: t.priority,
      due: t.due
    });
    (t.subtasks || []).forEach((s, j) => {
      flat.push({
        ref: `${ref}s${j}`,
        parentRef: ref,
        sectionRef: null,
        content: s.content,
        priority: s.priority,
        due: s.due
      });
    });
  });
  return flat;
}

// The inverse of flattenTasks's own ref scheme (`t{i}` for a root task,
// `t{i}s{j}` for its j-th subtask): given a structured response's `tasks`
// array and a ref one of flattenTasks's own rows carries, returns a new
// tasks array with that exact task or subtask replaced by `updater(task)`,
// or removed entirely (its own subtasks going with it, since they live
// nested inside it) if `updater` returns null. Used by SuperRambleModal's
// editable preview (per-task removal, inline content edits) so editing
// never needs a second, hand-derived copy of the ref scheme flattenTasks
// already owns. Pure: never mutates the array or object passed in.
export function updateTaskAtRef(tasks, ref, updater) {
  const match = /^t(\d+)(?:s(\d+))?$/.exec(ref);
  if (!match) return tasks;
  const taskIndex = Number(match[1]);
  const subIndex = match[2] != null ? Number(match[2]) : null;
  const next = tasks.slice();
  if (subIndex == null) {
    const updated = updater(next[taskIndex]);
    if (updated == null) next.splice(taskIndex, 1);
    else next[taskIndex] = updated;
    return next;
  }
  const task = { ...next[taskIndex] };
  const subtasks = (task.subtasks || []).slice();
  const updated = updater(subtasks[subIndex]);
  if (updated == null) subtasks.splice(subIndex, 1);
  else subtasks[subIndex] = updated;
  task.subtasks = subtasks;
  next[taskIndex] = task;
  return next;
}

/**
 * @param {object} structured a response already validated by structureTranscript
 * @param {{ inboxId: string }} opts
 * @returns {{ project: object, sections: object[], tasks: object[] }} the store.createProjectTree call
 */
export function toProjectTree(structured, { inboxId }) {
  const project =
    structured.decision === 'project'
      ? structured.targetProjectId
        ? { id: structured.targetProjectId }
        : { name: structured.project.name }
      : { id: structured.targetProjectId || inboxId };

  const sections = (structured.sections || []).map((s) => ({ ref: s.ref, name: s.name }));
  const tasks = flattenTasks(structured).map((t) => ({ ...t, due: toDue(t.due) }));

  return { project, sections, tasks };
}
