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
