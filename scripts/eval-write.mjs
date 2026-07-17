// Stage 3 (Write) editable-preview coverage. Not part of the LLM/pipeline
// eval: pure logic on src/pipeline/write.js, no model, no credits, no
// evals/ fixtures, the same "its own script" shape scripts/eval-date.mjs and
// scripts/eval-todoist.mjs already use. Proves what SuperRambleModal.jsx's
// editable preview relies on: updateTaskAtRef removes or edits exactly the
// task or sub-task its ref points to, its sub-tasks going with a removed
// task since they live nested inside it, and toProjectTree needed no
// changes of its own to honor an edited structured object, since it already
// only ever reads whatever tasks/project it is handed. See
// docs/llm-pipeline.md, "Eval assertions per stage" (Write) and "Live
// capture and the eval flywheel".
//
// Run: npm run eval:write (also runs as part of npm run eval)

import { toProjectTree, updateTaskAtRef } from '../src/pipeline/write.js';

let passed = 0;
let failed = 0;

function check(id, describe, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${describe}${ok ? '' : `  (got ${a}, want ${e})`}`);
}

function contents(tree) {
  return tree.tasks.map((t) => t.content);
}

// flattenTasks interleaves a task's own subtasks immediately after it, so a
// flat array index does not line up with baseStructured()'s own task order
// once subtasks are in the mix; look up by content instead of assuming a
// position.
function taskByContent(tree, content) {
  return tree.tasks.find((t) => t.content === content);
}

// A representative "structured" response, shaped exactly like a real
// validated Structure output: one section, one task with two sub-tasks, one
// section-less task. Rebuilt fresh per case below (never shared/mutated
// across cases), the same discipline every case here relies on to prove
// updateTaskAtRef itself never mutates its input.
function baseStructured() {
  return {
    decision: 'project',
    reasoning: 'r',
    confidence: 0.9,
    targetProjectId: null,
    project: { name: 'Original Project' },
    sections: [{ ref: 'sec1', name: 'Section One' }],
    tasks: [
      {
        content: 'Task A',
        priority: 2,
        due: null,
        sectionRef: 'sec1',
        subtasks: [
          { content: 'Sub A1', priority: 2, due: null },
          { content: 'Sub A2', priority: 3, due: null }
        ]
      },
      { content: 'Task B', priority: 1, due: 'today', sectionRef: null, subtasks: [] }
    ],
    needsClarification: false,
    clarificationQuestion: null
  };
}

const inboxId = 'inbox-1';

// --- Baseline: unedited structured object produces every task, unchanged ---
{
  const s = baseStructured();
  const tree = toProjectTree(s, { inboxId }).trees[0];
  check('baseline-all-content-present', 'an unedited response produces every task and sub-task', contents(tree), [
    'Task A',
    'Sub A1',
    'Sub A2',
    'Task B'
  ]);
  check('baseline-project-name', 'an unedited response keeps the model\'s own project name', tree.project.name, 'Original Project');
}

// --- Removing a root task removes its sub-tasks with it ---
{
  const s = baseStructured();
  s.tasks = updateTaskAtRef(s.tasks, 't0', () => null); // Task A, and Sub A1/A2 nested inside it
  const tree = toProjectTree(s, { inboxId }).trees[0];
  check(
    'remove-root-task-cascades',
    'removing a root task removes its own sub-tasks too, the same cascade store.deleteTask uses',
    contents(tree),
    ['Task B']
  );
}

// --- Removing one sub-task leaves its parent and sibling untouched ---
{
  const s = baseStructured();
  s.tasks = updateTaskAtRef(s.tasks, 't0s1', () => null); // Sub A2 only
  const tree = toProjectTree(s, { inboxId }).trees[0];
  check(
    'remove-one-subtask',
    'removing a sub-task removes only that sub-task, its parent and sibling stay',
    contents(tree),
    ['Task A', 'Sub A1', 'Task B']
  );
}

// --- updateTaskAtRef never mutates its input ---
{
  const s = baseStructured();
  const before = JSON.stringify(s.tasks);
  updateTaskAtRef(s.tasks, 't0', () => null);
  check('update-task-at-ref-pure', 'updateTaskAtRef never mutates the tasks array it is given', JSON.stringify(s.tasks), before);
}

// --- Editing a root task's content carries through, the old content does not survive alongside it ---
{
  const s = baseStructured();
  s.tasks = updateTaskAtRef(s.tasks, 't0', (t) => ({ ...t, content: 'Task A, edited' }));
  const tree = toProjectTree(s, { inboxId }).trees[0];
  check(
    'edit-root-content',
    'editing a root task\'s content replaces it, sub-tasks are untouched',
    contents(tree),
    ['Task A, edited', 'Sub A1', 'Sub A2', 'Task B']
  );
}

// --- Editing a sub-task's content carries through ---
{
  const s = baseStructured();
  s.tasks = updateTaskAtRef(s.tasks, 't0s0', (t) => ({ ...t, content: 'Sub A1, edited' }));
  const tree = toProjectTree(s, { inboxId }).trees[0];
  check('edit-subtask-content', 'editing a sub-task\'s content replaces it', contents(tree), [
    'Task A',
    'Sub A1, edited',
    'Sub A2',
    'Task B'
  ]);
}

// --- Renaming the project carries through toProjectTree, only for a confident new project ---
{
  const s = baseStructured();
  s.project = { ...s.project, name: 'Renamed Project' };
  const tree = toProjectTree(s, { inboxId }).trees[0];
  check('rename-project', 'an edited project name reaches the produced tree, not the model\'s original name', tree.project.name, 'Renamed Project');
}

// --- Routing into an existing project (targetProjectId set) ignores project.name entirely, edited or not ---
{
  const s = baseStructured();
  s.decision = 'tasks';
  s.targetProjectId = 'proj-existing';
  s.project = null;
  const tree = toProjectTree(s, { inboxId }).trees[0];
  check('routed-project-uses-id-not-name', 'routing into an existing project writes by id, never a name', tree.project, {
    id: 'proj-existing'
  });
}

// --- Editing a root task's priority carries through toProjectTree ---
{
  const s = baseStructured();
  s.tasks = updateTaskAtRef(s.tasks, 't0', (t) => ({ ...t, priority: 1 }));
  const tree = toProjectTree(s, { inboxId }).trees[0];
  check('edit-priority', "editing a task's priority replaces it, other fields untouched", taskByContent(tree, 'Task A').priority, 1);
}

// --- Editing a task's due carries through toDue() unchanged at Confirm-time ---
{
  const s = baseStructured();
  s.tasks = updateTaskAtRef(s.tasks, 't0', (t) => ({ ...t, due: '2026-07-20' }));
  const tree = toProjectTree(s, { inboxId }).trees[0];
  const due = taskByContent(tree, 'Task A').due;
  check('edit-due-date', 'an edited raw due string flows straight through toDue() at Confirm-time', due.date, '2026-07-20');
  check('edit-due-string-verbatim', "toDue()'s own string field carries the edited raw value verbatim", due.string, '2026-07-20');
}

// --- Clearing a task's due writes null through, same as the model never stating one ---
{
  const s = baseStructured();
  s.tasks = updateTaskAtRef(s.tasks, 't1', (t) => ({ ...t, due: null })); // Task B started with due: 'today'
  const tree = toProjectTree(s, { inboxId }).trees[0];
  check('clear-due', "clearing a task's due writes a null due through, same as no due at all", taskByContent(tree, 'Task B').due, null);
}

// --- Editing a root task's sectionRef carries through ---
{
  const s = baseStructured();
  s.tasks = updateTaskAtRef(s.tasks, 't1', (t) => ({ ...t, sectionRef: 'sec1' })); // Task B started with no section
  const tree = toProjectTree(s, { inboxId }).trees[0];
  check('edit-section', "editing a task's sectionRef moves it into that section", taskByContent(tree, 'Task B').sectionRef, 'sec1');
}

// --- Editing a task's description carries through, description absent on the model's own raw response flattens to '' ---
{
  const s = baseStructured();
  s.tasks = updateTaskAtRef(s.tasks, 't0', (t) => ({ ...t, description: 'Bring extra socks' }));
  const tree = toProjectTree(s, { inboxId }).trees[0];
  check(
    'edit-description',
    "editing a task's description replaces it, a real already-existing task field Structure's own contract never populates",
    taskByContent(tree, 'Task A').description,
    'Bring extra socks'
  );
  check(
    'description-defaults-empty',
    "a task Structure never gave a description flattens to '', not undefined",
    taskByContent(tree, 'Task B').description,
    ''
  );
}

// --- Full editable-preview path: a removal, a content edit, and a rename together ---
{
  const s = baseStructured();
  s.tasks = updateTaskAtRef(s.tasks, 't1', () => null); // remove Task B entirely
  s.tasks = updateTaskAtRef(s.tasks, 't0s0', (t) => ({ ...t, content: 'Sub A1, edited' }));
  s.project = { ...s.project, name: 'Renamed Project' };
  const tree = toProjectTree(s, { inboxId }).trees[0];
  check(
    'full-edit-path-contents',
    'a removed task is absent, an edited task\'s new content is present, both survive alongside an untouched sibling',
    contents(tree),
    ['Task A', 'Sub A1, edited', 'Sub A2']
  );
  check('full-edit-path-project-name', 'the same edited tree also carries the renamed project through', tree.project.name, 'Renamed Project');
}

// --- A standalone root task (with its own subtask), alongside normal project
// tasks, produces a second tree routed to the real Inbox, docs/llm-pipeline.md
// Stage 2 ---
{
  const s = baseStructured();
  s.tasks.push({
    content: 'Pick up milk and eggs',
    priority: 3,
    due: null,
    sectionRef: null,
    standalone: true,
    subtasks: [{ content: 'Grab a gallon of oat milk too', priority: 4, due: null }]
  });
  const { trees } = toProjectTree(s, { inboxId });
  check('standalone-produces-two-trees', 'a response with one standalone root task produces exactly two trees', trees.length, 2);
  check(
    'standalone-excluded-from-main-tree',
    'the main tree excludes the standalone task and its subtask entirely',
    contents(trees[0]),
    ['Task A', 'Sub A1', 'Sub A2', 'Task B']
  );
  check("standalone-tree-routes-to-inbox", "the second tree's project is the real Inbox, by id", trees[1].project, { id: inboxId });
  check(
    'standalone-tree-contents',
    'the second tree carries the standalone task and its own subtask',
    contents(trees[1]),
    ['Pick up milk and eggs', 'Grab a gallon of oat milk too']
  );
  check(
    'standalone-tree-section-null',
    "the standalone task's sectionRef is forced null, it left the project's own sections",
    trees[1].tasks[0].sectionRef,
    null
  );
}

console.log(`\n${passed}/${passed + failed} passed.`);
if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
