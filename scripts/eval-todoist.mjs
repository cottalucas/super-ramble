// Todoist translation checks: the priority-direction inversion and due
// string passthrough (item_add's nested due.string, not a flat due_string
// key, see below), plus the temp_id/section/parent resolution the batched
// Sync API write depends on. Deterministic logic, no model call, no live
// Todoist request, no credentials needed. Kept as its own script, outside
// evals/ and src/pipeline/, the same convention eval-date.mjs already set:
// this guards functions/todoist.js, not the Structure contract.
//
// The nested due shape is asserted here specifically because a live check
// against a real account (the resolution log's Todoist OAuth entry) found a
// flat due_string key silently accepted ("ok") by Todoist's own API while
// leaving the due date null; this case exists so that exact regression
// can't recur silently again.
//
// Priority direction matters specifically because this exact bug class
// already shipped once, in the Structure prompt (see the resolution log's
// priority-direction entry): this app is 1 = most urgent, Todoist's own API
// is 4 = most urgent. A second, independent translation path deserves its
// own independent regression guard, not a shared assumption that "the other
// one already checks this."
//
// Also covers parseOAuthReturn (src/todoist/oauthReturn.js), the pure
// decision logic behind the OAuth-return handling in App.jsx: given the raw
// query-string/sessionStorage values, does a real user decline
// (error=access_denied) get classified separately from "nothing to
// consume" and a validated success. This exists because of a real,
// live-caught bug: a failure in this app's own token-exchange call was
// surfacing to the user as "Todoist declined the connection," implying the
// user had personally rejected the request when they had not. See the
// resolution log's Todoist OAuth 502 entry.
//
// Run: npm run eval:todoist (also runs as part of npm run eval)

import { toTodoistPriority, buildSyncCommands, isTokenExpired } from '../functions/todoist.js';
import { parseOAuthReturn, extractOAuthParams } from '../src/todoist/oauthReturn.js';

const cases = [];
let passed = 0;
let failed = 0;

function check(id, describe, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  cases.push({ id, describe, ok, actual, expected });
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${describe}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

check('priority-1-most-urgent', 'local priority 1 (most urgent, red) maps to Todoist priority 4', toTodoistPriority(1), 4);
check('priority-2', 'local priority 2 maps to Todoist priority 3', toTodoistPriority(2), 3);
check('priority-3', 'local priority 3 maps to Todoist priority 2', toTodoistPriority(3), 2);
check('priority-4-none', 'local priority 4 (none) maps to Todoist priority 1 (normal)', toTodoistPriority(4), 1);

// A new project, one section, a root task in that section with a due
// string, and a sub-task with no due date at all, the same shape
// src/pipeline/write.js's toProjectTree produces for a confident new-project
// response.
const tree = {
  project: { name: 'Camping trip' },
  sections: [{ ref: 's1', name: 'Gear' }],
  tasks: [
    {
      ref: 't0',
      parentRef: null,
      sectionRef: 's1',
      content: 'Book campsite reservation',
      priority: 1,
      due: { date: null, datetime: null, string: 'today', isRecurring: false }
    },
    {
      ref: 't0s0',
      parentRef: 't0',
      sectionRef: null,
      content: 'Dig out sleeping bags from garage',
      priority: 4,
      due: null
    }
  ]
};

const commands = buildSyncCommands(tree);
const projectAdd = commands.find((c) => c.type === 'project_add');
const sectionAdd = commands.find((c) => c.type === 'section_add');
const parentItem = commands.find((c) => c.type === 'item_add' && c.args.content === 'Book campsite reservation');
const childItem = commands.find((c) => c.type === 'item_add' && c.args.content === 'Dig out sleeping bags from garage');

check('project-add-name', 'a project_add command carries the project name', projectAdd?.args.name, 'Camping trip');
check(
  'section-add-references-project',
  "a section_add command's project_id resolves to the project's own temp_id",
  sectionAdd?.args.project_id,
  projectAdd?.temp_id
);
check('item-priority-inverted', "a task stated urgent (local priority 1) carries Todoist priority 4", parentItem?.args.priority, 4);
check('item-section-resolves', "a task's section_id resolves to its section's temp_id", parentItem?.args.section_id, sectionAdd?.temp_id);
check(
  'item-due-string-passthrough',
  "the model's due string carries through unmodified, no parsing, as item_add's nested due.string (not a flat due_string key)",
  parentItem?.args.due?.string,
  'today'
);
check('subtask-parent-resolves', "a sub-task's parent_id resolves to its parent task's temp_id", childItem?.args.parent_id, parentItem?.temp_id);
check('subtask-priority-inverted', "a sub-task stated not urgent (local priority 4) carries Todoist priority 1", childItem?.args.priority, 1);
check('subtask-no-due', 'a task with no due date carries no due key at all, not an empty one', 'due' in (childItem?.args || {}), false);
check('subtask-no-section', 'a sub-task carries no section_id of its own, it belongs to its parent task', 'section_id' in (childItem?.args || {}), false);

check('token-expired-past', 'a past expiresAt is treated as expired', isTokenExpired(new Date(Date.now() - 1000).toISOString()), true);
check(
  'token-expired-within-buffer',
  'an expiresAt inside the 60-second safety buffer is treated as expired',
  isTokenExpired(new Date(Date.now() + 30_000).toISOString()),
  true
);
check('token-expired-future', 'a far-future expiresAt is not treated as expired', isTokenExpired(new Date(Date.now() + 3600_000).toISOString()), false);
check('token-expired-missing', 'a missing expiresAt fails closed, treated as expired', isTokenExpired(null), true);

check(
  'oauth-return-access-denied',
  'a real user decline (error=access_denied) is classified as its own distinct outcome',
  parseOAuthReturn({ code: null, state: 's1', error: 'access_denied', storedState: 's1' }),
  { error: 'access_denied' }
);
check(
  'oauth-return-other-error',
  'a non-decline error from Todoist (e.g. an authorize-step rejection) is still classified as an error, not silently dropped',
  parseOAuthReturn({ code: null, state: null, error: 'server_error', storedState: 's1' }),
  { error: 'server_error' }
);
check(
  'oauth-return-success',
  'a validated code+matching-state pair resolves to the code, never confused with an error outcome',
  parseOAuthReturn({ code: 'abc123', state: 's1', error: null, storedState: 's1' }),
  { code: 'abc123' }
);
check(
  'oauth-return-state-mismatch',
  'a state that does not match the stashed value is rejected outright (CSRF guard), not treated as a usable code',
  parseOAuthReturn({ code: 'abc123', state: 'wrong', error: null, storedState: 's1' }),
  null
);
check(
  'oauth-return-no-stashed-state',
  'a code with no stashed state to check against (e.g. sessionStorage was cleared) is rejected, not assumed valid',
  parseOAuthReturn({ code: 'abc123', state: 's1', error: null, storedState: null }),
  null
);
check(
  'oauth-return-nothing',
  'no code and no error at all resolves to null, nothing to consume',
  parseOAuthReturn({ code: null, state: null, error: null, storedState: null }),
  null
);

// A literal '+' in the raw query string is the actual, verified-live
// hazard (new URLSearchParams('a=b+c').get('a') is 'b c', not 'b+c'):
// Todoist's own redirect might not percent-encode a '+' inside an opaque,
// base64-shaped code value, silently corrupting it into a space before
// this app ever sees it. See the resolution log's double-submit/
// invalid_grant investigation entry.
check(
  'oauth-params-literal-plus-preserved',
  "a literal '+' in the code value is preserved, not silently turned into a space",
  extractOAuthParams('?code=abc+def&state=xyz').code,
  'abc+def'
);
check(
  'oauth-params-percent-encoded-plus-still-works',
  "a properly percent-encoded '+' (%2B) still decodes to a literal '+', unaffected by the fix above",
  extractOAuthParams('?code=abc%2Bdef&state=xyz').code,
  'abc+def'
);
check(
  'oauth-params-state-and-error-unaffected',
  'state and error extraction is unaffected by the plus-escaping fix',
  extractOAuthParams('?state=xyz&error=access_denied'),
  { code: null, state: 'xyz', error: 'access_denied' }
);

console.log(`\n${passed}/${passed + failed} passed.`);
if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
