// Stage 3 (Write): translate a validated Structure response into the shape
// store.createProjectTree expects. Pure, no model call, no write of its own.
// Nested subtasks flatten into parentRef siblings; sections and each task's
// sectionRef carry through unchanged. See docs/llm-pipeline.md.

// The model's due is a natural-language or ISO string, not yet normalized to
// the store's { date, datetime, string, isRecurring } shape (no date parser
// exists yet, see docs/llm-pipeline.md). Carried as the human-readable
// fallback so nothing crashes and the text is not silently dropped; it will
// not bucket into Today/Upcoming until a real parser lands.
export function toDue(raw) {
  return raw == null ? null : { date: null, datetime: null, string: raw, isRecurring: false };
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
