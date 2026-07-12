// Pure Todoist Sync API translation: priority-direction mapping and the
// batched command shape. No Firebase/Anthropic imports on purpose, so this
// is safe to require from functions/index.js and to import from the offline
// eval script (scripts/eval-todoist.mjs) with no live dependency and no
// credentials. Command shape verified directly against
// developer.todoist.com/api/v1 before writing this: POST /api/v1/sync,
// form-urlencoded, a `commands` array of `{ type, uuid, temp_id, args }`,
// `temp_id_mapping` in the response. See docs/architecture.md.

const crypto = require('crypto');

// This app: priority 1 = p1/red/most urgent, 4 = none (docs/architecture.md).
// Todoist's own API priority runs the other way: 4 = most urgent, 1 = normal.
// This exact class of bug already shipped once, in the Structure prompt; see
// the resolution log's priority-direction entry. Do not "simplify" this to a
// 1:1 copy, the direction really is inverted.
function toTodoistPriority(localPriority) {
  return 5 - localPriority;
}

// tree is the exact shape store.createProjectTree (and src/pipeline/write.js's
// toProjectTree) already produce: { project: { name }, sections: [{ ref, name }],
// tasks: [{ ref, parentRef, sectionRef, content, priority, due }] }. This
// write is new-project-only (docs/roadmap.md); tree.project is always a
// fresh { name }, never an existing { id }, so every command below is a
// brand-new temp_id. This is a one-shot create, not a sync: there is no
// lookup against anything already in the user's Todoist account.
//
// due, when present, carries the model's raw natural-language string in
// due.string (no date parser exists yet, see docs/llm-pipeline.md); passed
// straight through as the item_add command's own nested due.string, which
// Todoist's own API parses server-side, unmodified. This has to be the
// nested { due: { string } } shape, not a flat due_string key: verified
// live against a real account (see the resolution log's Todoist OAuth
// entry) after a flat due_string silently returned "ok" and left the due
// date null, an easy trap the docs summary alone did not catch.
function buildSyncCommands(tree) {
  const commands = [];
  const projectTempId = `project-${crypto.randomUUID()}`;

  commands.push({
    type: 'project_add',
    temp_id: projectTempId,
    uuid: crypto.randomUUID(),
    args: { name: tree.project.name }
  });

  const sectionTempIds = {};
  (tree.sections || []).forEach((s) => {
    const tempId = `section-${crypto.randomUUID()}`;
    sectionTempIds[s.ref] = tempId;
    commands.push({
      type: 'section_add',
      temp_id: tempId,
      uuid: crypto.randomUUID(),
      args: { name: s.name, project_id: projectTempId }
    });
  });

  const taskTempIds = {};
  (tree.tasks || []).forEach((t) => {
    taskTempIds[t.ref] = `item-${crypto.randomUUID()}`;
  });

  (tree.tasks || []).forEach((t) => {
    const args = {
      content: t.content,
      project_id: projectTempId,
      priority: toTodoistPriority(t.priority)
    };
    if (t.sectionRef && sectionTempIds[t.sectionRef]) args.section_id = sectionTempIds[t.sectionRef];
    if (t.parentRef && taskTempIds[t.parentRef]) args.parent_id = taskTempIds[t.parentRef];
    const dueString = t.due && t.due.string;
    if (dueString) args.due = { string: dueString };

    commands.push({
      type: 'item_add',
      temp_id: taskTempIds[t.ref],
      uuid: crypto.randomUUID(),
      args
    });
  });

  return commands;
}

// A stored access token is treated as expired a minute early, so a refresh
// has room to complete before the real deadline rather than racing it.
// Fails closed on a missing expiresAt (treated as expired, forcing a
// refresh attempt) rather than assuming a token with no known expiry is
// still good.
function isTokenExpired(expiresAtIso, bufferMs = 60_000) {
  if (!expiresAtIso) return true;
  return new Date(expiresAtIso).getTime() - bufferMs <= Date.now();
}

module.exports = { toTodoistPriority, buildSyncCommands, isTokenExpired };
