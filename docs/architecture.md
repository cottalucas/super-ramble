# Architecture

## Priority

The data model is the contract that matters most. The Super Ramble pipeline
writes structured projects into the task store, so the store is built first and
the pipeline is built to fit it. A sub-task is a task with `parentId` set. That
single field is the structural capability the whole product is built around.

## Folder map

```
src/
  main.jsx, App.jsx          app entry and the signed-in shell
  firebase.js                Firebase init from env, guards missing config
  lib/crypto.js              AES-GCM client-side encrypt/decrypt seam
  lib/theme.js               Light/Dark preference, localStorage, no Firestore doc
  lib/layout.js              List/Board preference, localStorage, same pattern (phase 2.8)
  lib/sidebar.js             Sidebar hidden/shown preference, localStorage, same pattern (phase 2.8)
  lib/group.js               virtual Group-by computation (Priority, Date, Date added), no I/O (phase 2.8)
  lib/sort.js, lib/date.js, lib/colors.js   pure client-side helpers, no I/O
  auth/                      the auth gate and current-user context
  store/                     the store interface; Firestore behind it
    index.js                 createStore: picks the adapter, exposes the interface
    tree.js                  pure ref-resolution for createProjectTree
    firestore-store.js       Firestore adapter (modular SDK, writeBatch)
    local-store.js           localStorage adapter (dev without keys)
  todoist/                   stubbed Todoist client contract (mock now)
  pipeline/                  the structuring core (phase 3)
    structure.js, contracts.js, prompt.js
  components/                Sidebar, TaskRow, QuickAddModal, pickers, sections,
                              Board and LayoutControl/LayoutTabs (List/Board, Group, Sort, phase 2.8)
  views/                     Today, Upcoming, Project (renders Inbox too)
functions/                   the /api proxy
evals/                       fixtures, offline cases, gitignored runs
scripts/                     eval and trace tooling
docs/                        the source of truth, with reference/ screenshots
llm-traces/                  local raw traces (gitignored)
```

## Data model

Mirrors Todoist's REST v1 model closely so the pipeline maps cleanly to it.
Every document is scoped to the signed-in user under `users/{uid}`.

`users/{uid}/projects/{projectId}`
- `name`: string
- `description`: string (default '')
- `color`: string (design token name)
- `parentProjectId`: string | null (a project nested under another project;
  the Inbox is never a child and never a parent)
- `view`: "list" | "board" (default "list"). Written on every create, but not
  read by any view: phase 2.8 made Layout a single global `localStorage`
  preference (`src/lib/layout.js`), not a per-project setting, per the
  resolution log. Left on the schema rather than removed, since deleting it
  would touch both store adapters and `tree.js` for a field this pass was not
  scoped to remove; flagging the discrepancy rather than silently leaving it
  undocumented.
- `order`: number
- `isInbox`: boolean (exactly one true per user)
- `createdAt`, `updatedAt`

`users/{uid}/sections/{sectionId}`
- `projectId`: string
- `name`: string
- `description`: string (default ''), the same optional-blurb pattern
  `projects.description` already established. Set through the Add/Edit
  section form (`src/components/SectionForm.jsx`), shown read-only under the
  section head when non-empty (`.section-description` in List layout,
  `.board-col-desc` in Board). Not part of the Structure pipeline's own
  section contract (`ref`, `name` only); a pipeline-created section gets ''
  like every other field the pipeline does not emit.
- `order`: number
- `collapsed`: boolean

`users/{uid}/tasks/{taskId}`
- `projectId`: string
- `sectionId`: string | null
- `parentId`: string | null  (the field that makes a task a sub-task; this is the whole point)
- `content`: string
- `description`: string
- `priority`: 1 | 2 | 3 | 4  (1 = p1/red highest, 4 = none)
- `due`: { date: string|null, datetime: string|null, string: string|null, isRecurring: boolean } | null
- `labels`: string[]
- `completed`: boolean
- `completedAt`: string | null
- `order`: number
- `createdAt`, `updatedAt`

Removed `reminders` from this schema (was `[{ type: "absolute"|"relative",
at: string }]`, with `src/components/ReminderPicker.jsx` as its only editor).
It persisted correctly and its own chip label updated, so it was not a dead
control in the strict sense, but nothing anywhere in this app ever read
`task.reminders` to actually fire a notification: no delivery mechanism
existed, client-side or server-side. Removed outright rather than half-built
further, per the anti-pattern checklist's "no dead controls" spirit applied
one level up, a field with no consumer is the same trap as a button with no
handler. A future pass can reintroduce it once real notification delivery
(a scheduled Function, a service worker, or similar) is actually scoped;
until then, do not re-add the field or the picker on the assumption it was
an oversight.

`users/{uid}/labels/{labelId}`
- `name`: string
- `color`: string

`users/{uid}/comments/{commentId}`
- `taskId`: string
- `content`: string
- `postedAt`: string (ISO, same `now()` helper both store adapters already use)

`users/{uid}/todoistAuth/token`
- `accessToken`: string
- `refreshToken`: string | null (present for a Todoist app with refresh
  tokens enabled, the default for newly-created apps; absent for a legacy
  app)
- `expiresAt`: string (ISO), computed from the token response's `expires_in`
  seconds at exchange or refresh time; a legacy app's response carries no
  `expires_in` at all, treated as a 10-year value rather than assumed to
  never expire
- `scope`: string | null
- `clientId`, `redirectUri`: string, the values used for this exchange,
  reused for a later refresh or revoke so neither is a second hand-synced
  constant server-side
- `connectedAt`: string (ISO)

Written by `POST /api/todoist/oauth` on a successful token exchange,
refreshed in place by `POST /api/todoist/write` when the stored token is
expired or within a minute of it, and deleted by `POST /api/todoist/disconnect`.
Denied to every client read and write in `firestore.rules`. `structureTraces`
below is no longer denied to a client read the same way, since the
async-Structure pass (docs/resolution-log.md); `todoistAuth` still is, a
distinct case for a distinct reason: personal task text is meant to get
client-side encryption (`src/lib/crypto.js`, the stable AES-GCM
encrypt/decrypt seam) before it reaches Firestore, so the server would never
need the plaintext, but that seam is not yet wired into `store/`; today the
store writes task and project text as plaintext, same as README's Privacy
section states. A Todoist access token can't get that treatment even once
the seam is wired in: the Function has to read it in plaintext to call
Todoist on the user's behalf, unlike task text, which only the browser ever
needs to read back. Only the Function (Admin SDK) ever touches this
collection. See `docs/roadmap.md` (phase 3, part 8) and the resolution log's
Todoist OAuth entry.

`users/{uid}/structureTraces/{traceId}`
- `transcript`: string (the raw dump submitted to Structure)
- `existingProjectIds`: string[] (ids only, no names)
- `status`: `"processing" | "done" | "failed"`. New as of the async-Structure
  pass (docs/resolution-log.md): distinct from `outcome` below, which is the
  user's own confirm/cancel decision, `status` is this job's own processing
  state. Set to `"processing"` at creation time (`POST /api/structure`'s fast
  enqueue write), flipped to `"done"` or `"failed"` by `processStructureTrace`
  (`functions/index.js`, an `onDocumentCreated` trigger on this same
  collection) once the real model call finishes. The client
  (`SuperRambleModal.jsx`) subscribes to this document via Firestore
  `onSnapshot` and resolves once `status` leaves `"processing"`.
- `model`: string (the Anthropic model id the call actually used; absent
  until `processStructureTrace` finishes, since only it knows which model
  answered)
- `priorErrors`: string[] | null (set only on the one corrective retry)
- `stopReason`: string | null
- `response`: object | null (the parsed structuring response; `null` on any
  failure, refusal, truncation, or malformed JSON)
- `rawText`: string | null (every `'text'` content block concatenated in
  order, not just `content[0]`; see `extractStructuredText` and the
  resolution log entry dated 2026-07-07)
- `responseId`: string | null (Anthropic's own request id, for cross-
  referencing an unexplained case with Anthropic support)
- `contentBlocks`: `{ type: string, text: string }[]` (every block Anthropic
  actually returned, in order; a non-`'text'` block's `text` is that block
  JSON-stringified and truncated to 2000 characters. Exists so an empty or
  unexpected `rawText` is diagnosable from the trace alone, not a mystery)
- `ok`: boolean (`response !== null` and `stopReason` not `"refusal"` or
  `"max_tokens"`; also `false` on a `traceWriteFailed` marker below)
- `inputTokens`, `outputTokens`, `costUsd`: number (absent on a
  `traceWriteFailed` marker; the model call's usage was already recorded in
  `llmUsage` before the trace write was attempted, so it isn't lost, just not
  duplicated onto a marker that isn't a real trace)
- `createdAt`: server timestamp
- `outcome`: `"pending" | "confirmed" | "cancelled" | "confirmed_with_edits"`
- `outcomeAt`: server timestamp | null
- `edits`: `{ removedTasks: { content: string, priority: number, sectionRef: string | null }[], projectNameChange: { from: string, to: string } | null, contentEdits: { originalContent: string, newContent: string }[], priorityEdits: { ref: string, from: number, to: number }[], dueEdits: { ref: string, from: string | null, to: string | null }[], sectionEdits: { ref: string, from: string | null, to: string | null }[], descriptionEdits: { ref: string, from: string, to: string }[] } | undefined`
  (present only when `outcome` is `"confirmed_with_edits"`, absent on every
  other outcome, never `null`). `response` above is always the model's real,
  untouched output; `edits` is the separate record of what the user actually
  changed in `SuperRambleModal.jsx`'s preview before Confirm. **Priority,
  due date, section membership, and, as of 2026-07-17 round 2, description
  are editable there now**, alongside the original per-task removal, inline
  project-name edit, and per-task content edits: each of the four newer
  kinds reuses `updateTaskAtRef` (`src/pipeline/write.js`), already generic
  enough to apply any field-level update, not a second update mechanism.
  Description is a real, already-existing task field
  (`users/{uid}/tasks/{taskId}.description` above), just never populated by
  Structure's own contract (`docs/llm-pipeline.md`, Stage 2); the preview's
  edit card writes a plain user-typed value, no model behind it, the same
  way typing one into the normal Add-task form has no model behind it
  either. `priorityEdits`/`dueEdits`/`sectionEdits`/`descriptionEdits` are
  keyed by `ref` (one of `flattenTasks`'s own refs, `t{i}`/`t{i}s{j}`),
  unlike `contentEdits`, which is matched by its own `originalContent`
  string instead; a due edit's `from`/`to` are always the plain raw due
  string (or `null`), never the store's parsed `{ date, datetime, string,
  isRecurring }` shape, the same value that actually lands in
  `edited.tasks[].due` and flows through `toDue()` unchanged at
  Confirm-time. The two together (`response` and `edits`) mean the original
  proposal and the human correction on top of it are both on the trace, not
  just the corrected result: `removedTasks` carries what a removed task
  looked like at the moment it was removed (its current content if it had
  already been edited, its real priority and section), `contentEdits`/
  `priorityEdits`/`dueEdits`/`sectionEdits`/`descriptionEdits` each carry
  only entries that actually changed a value, an edit clicked or typed back
  to its starting value is not reported. Written once, at Confirm, by the
  same `POST /api/structure/outcome` call every outcome already used;
  shape-checked by `isValidEdits` (`functions/index.js`) before ever
  reaching Firestore, since this is the one field on this collection a
  client actually writes content into, not just an enum value.
  **`gradeStructureTrace`'s auto-promotion path does not attempt to replay
  `priorityEdits`/`dueEdits`/`sectionEdits`/`descriptionEdits`**:
  `reconstructCorrectedTree` only ever replays `contentEdits`,
  `removedTasks`, and `projectNameChange` onto the cloned response; when any
  of these four arrays is non-empty on a `confirmed_with_edits` trace,
  auto-promotion is skipped outright and logged to `pipelineLearningLog`
  instead, the exact same fail-closed posture already documented below for
  an "edited, then removed" content edit reconstruction cannot locate.
  Replaying these onto the reconstructed tree is real, separate follow-up
  work, not attempted this pass. See `docs/llm-pipeline.md`'s "Live capture
  and the eval flywheel" section and the resolution log's editable-preview
  entries.
- `feedback`: `"up" | "down" | null`, default `null`. A thumbs up/down
  signal on the whole proposal, independent of `outcome`: the preview can
  send it any time it is showing, whether the user goes on to confirm,
  confirm with edits, or discard. Written by `POST /api/structure/feedback`
  (`functions/index.js`), a merge write, no `checkAndReserveLimit`/
  `logUsage` call (spends no model call, the same reason
  `/todoist/status`/`/todoist/disconnect` skip it too). A toggle, not an
  append-only log: a later call simply overwrites the earlier value.
  **Absent from grading and auto-promotion entirely, this pass, a stated
  scope boundary, not an oversight**: `gradeStructureTrace` never reads this
  field. A cheaper, second signal than `outcome`, worth capturing now;
  wiring it into grading is separate, future work.
- `traceWriteFailed`: boolean, present and `true` only on a fallback marker
  (see below); absent on every normal trace document
- `errorCode`, `errorMessage`: string | null. `errorCode` is only ever set
  alongside `traceWriteFailed: true` (the Firestore error from the enqueue
  write itself failing). `errorMessage` has two distinct sources as of the
  async-Structure pass: the same `traceWriteFailed` case, or
  `processStructureTrace` setting a plain, user-facing string when
  `status` is `"failed"` (the model declined, `max_tokens` truncation,
  invalid JSON, or the model call itself throwing) so the client's
  `onSnapshot` listener has something real to reject with.

Creation is now a two-phase write, not one, as of the async-Structure pass
(docs/resolution-log.md): `POST /api/structure` writes a fast, minimal
document (`transcript`, `existingProjectIds`, `priorErrors`, `status:
"processing"`, `createdAt`, `outcome: "pending"`, `outcomeAt: null`) and
responds immediately with `{ traceId }`, well under any timeout; every other
field above is filled in later by `processStructureTrace`, an
`onDocumentCreated` trigger on this same collection, once the real model
call finishes. This split exists because the old single synchronous write
(full trace, made only after the model call already returned) could not
survive a genuinely slow Structure call: docs/resolution-log.md's 2026-07-14
entries found real calls taking 91-98s, well inside this Function's own
120s `timeoutSeconds`, still failing with a bare `502` because Firebase
Hosting's `/api/**` rewrite proxy (or a layer in front of it) cuts the
connection around 90-100s regardless. The enqueue write itself can still
fail; unlike the old single write, nothing has been billed yet at that
point, so this case gets a plain error back to the caller, not a fallback
marker (see `createProcessingTrace`, `functions/index.js`). The *later*
write, from `processStructureTrace` once the model call has already been
billed, is the one that still needs the old fallback reasoning: if that
write itself fails, there is no separate fallback document (this write
targets a document that already exists), so it logs every diagnostic detail
directly to Cloud Logging instead, the same "nothing else will ever record
that this call happened" posture the original fallback used, now applied to
a different write site. A `traceWriteFailed` marker (no `transcript` or
`response`, just `ok: false`, `traceWriteFailed: true`, `errorCode`,
`errorMessage`, and the usual `createdAt`/`outcome`/`outcomeAt`) is therefore
still possible, but now only from the enqueue write's own failure, not from
the model-call write's failure the way it originally was: a 2026-07-08
review found real production calls that were billed in `llmUsage` but had no
matching `structureTraces` document at all, since the prior version of that
write's catch block only logged to Cloud Logging and returned `null`. See
the resolution log entry dated 2026-07-08 for the finding and the fallback
this originally added. `outcome` and `outcomeAt` are filled in later by
`POST /api/structure/outcome` when the user confirms, confirms with edits,
or cancels the proposal (a `traceWriteFailed` marker never gets a real
outcome, since there was never a proposal shown for it either: the original
request still returned its normal response or error to the caller). Write is
denied to every client in `firestore.rules`, owner included: only the
Function (Admin SDK, both the enqueue write and `processStructureTrace`) and
the local `scripts/list-traces.mjs` / `scripts/promote-trace.mjs` (also
Admin SDK, which bypasses rules) ever write here. Read is now allowed to the
owner (`allow read: if isOwner(uid)`), a change from full denial, added in
the same pass so the client can `onSnapshot` its own trace document
(`SuperRambleModal.jsx`) to learn when `processStructureTrace` finishes.
`list-traces.mjs` shows a `traceWriteFailed` marker plainly instead of a
blank transcript; `promote-trace.mjs` refuses to promote one outright, since
there is nothing to promote. See `docs/llm-pipeline.md` and the resolution
log entry dated 2026-07-07 for what this is for and why it reopens an
earlier privacy stance.

`referenceExamples/{exampleId}` (top-level, not nested under `users/{uid}`:
a reference example teaches the live model on every future call regardless
of whose transcript prompted it, so it is not one user's data)
- `transcript`: string
- `response`: object, the same shape as a Structure response
- `source`: `"seed" | "auto-promoted" | "manual"` (the third value is not
  part of this collection's original two-value design; `scripts/review-queue.mjs`
  needed a way to mark a human's own manual promotion as distinct from
  both the original four hand-picked examples and an automatic one, and
  reusing either existing value for that would have been actively
  misleading provenance, not a simplification)
- `addedAt`: server timestamp
- `promotedFromTraceId`: string | null (the `structureTraces` document this
  came from, `null` for a seed)
- `notes`: string | null

Fetched fresh on every real `/api/structure` call (`functions/index.js`,
ordered `addedAt` descending, capped at 30), formatted into the same
labeled `PAST REFERENCE EXAMPLES` prompt block the old file-based version
produced, and appended to `STRUCTURE_SYSTEM_PROMPT_RULES`. Bounded at 30
documents: once a write would take the collection over that, the oldest
non-seed document is deleted, never one of the original four. Never read or
written by the client SDK; only the Function (the `/api/structure` handler
that reads it, and the `structureTraces` trigger below that may write to
it) and local scripts (`scripts/seed-reference-examples.mjs`,
`scripts/review-queue.mjs`) touch it. See `docs/llm-pipeline.md`, Stage 2.

`pipelineLearningLog/{logId}` (also top-level, for the same reason)
- `date`: server timestamp
- `kind`: `"auto-promoted" | "flagged"`
- `uid`: string (not part of this collection's original field list; without
  it, nothing reading this top-level collection could find the trace back
  under its owning `users/{uid}/structureTraces` subcollection to review or
  promote it, so it is written anyway, a functional requirement rather than
  optional detail)
- `traceId`: string
- `summary`: string, one line built from the grader's own notes
- `resolved`: boolean, `false` by default
- `mirrored`: boolean, `false` by default (also not in the original field
  list, for the same reason as `uid`: `scripts/sync-learnings.mjs` needs a
  way to know which entries it has already mirrored into
  `docs/pipeline-learnings.md`, so a second run only appends what is new)

Written by the `structureTraces` trigger below, once per graded trace that
the grader actually flagged (a plain "ok" on both signals writes nothing
here; there is nothing worth a human's monthly attention in it). Updated by
`scripts/review-queue.mjs` (`resolved`) and `scripts/sync-learnings.mjs`
(`mirrored`). Never read or written by the client SDK. See
`docs/llm-pipeline.md`'s "Live capture and the eval flywheel" section.

Nesting depth: no fixed depth limit on `parentId` or `parentProjectId`, the
UI just renders whatever depth exists. A sub-task can have its own sub-task,
and so on; a task row's visual indent still caps at two steps (`sub`/`sub2`
in `src/styles.css`) so deep hierarchies do not push content off-screen, but
the data itself nests as deep as the user builds it. A project with sections
and nested tasks is creatable in one batched write, because that is exactly
what the pipeline calls. Firestore rules scope every collection above to its
owner.

Deleting a project cascades its own sections and tasks, but promotes its
direct children to the top level (`parentProjectId: null`) rather than
deleting them too. A project is a bigger container than a section; destroying
a whole child project's tasks as a side effect of deleting its parent would be
a surprising, hard-to-undo blast radius. The confirm dialog states this.

## The store interface (src/store/)

The app talks to this interface, never to Firestore directly. The app imports
`createStore`, never the SDK. One adapter sits behind the interface: Firestore
when configured and signed in, localStorage in local preview. Both adapters
implement the same methods, so the app and the evals see one shape.

Methods:

- Projects: `listProjects`, `getProject`, `createProject` (accepts
  `parentProjectId`), `updateProject`, `deleteProject` (cascades its own
  sections and tasks, promotes direct child projects to the top level).
- Sections: `listSections(projectId)`, `createSection`, `updateSection`,
  `deleteSection`, `moveSectionToProject(sectionId, projectId)` (moves the
  section and cascades every task under it, direct and nested, to the new
  project; see the resolution log entry dated 2026-07-08 for why the cascade
  is required, not optional).
- Tasks: `listTasks(filter)`, `createTask`, `updateTask`, `deleteTask`,
  `completeTask` (sets `completed` and `completedAt`).
- Labels: `listLabels`, `createLabel`, `updateLabel`, `deleteLabel`.
- Comments: `listComments(taskId)` (oldest first), `createComment({ taskId, content })`.
  No update or delete this pass; see docs/roadmap.md.
- Bootstrap: `ensureInbox` (creates the single Inbox project on first run).
- Batch: `createProjectTree({ project, sections, tasks })`.

`createProjectTree` writes a whole tree in one batch and returns the created ids.
`project` is `{ id }` to route into an existing project, or `{ name, color, ... }`
to create a new one. `sections` and `tasks` carry local refs (`ref`) that
`tasks` reference through `parentRef` and `sectionRef`. The store pre-generates
ids, resolves every ref to an id, and commits in one batch. The pure
ref-resolution lives in `src/store/tree.js` and is shared by both adapters.
`createProjectTree` itself only ever sees one tree per call; it has no notion
of `standalone` or a multi-tree response, that split happens one layer up.

Both the UI and the later pipeline create through `createProjectTree`, so there
is one write path and one set of evals. Normal Add flows route through it too:
adding a task to an existing project calls `createProjectTree` with
`project: { id }` and one task.

`src/pipeline/write.js`'s `toProjectTree` (the pipeline's own translation
step, not part of the store interface itself) can call `createProjectTree`
more than once for a single confirmed response: it returns `{ trees }`, one
entry per `createProjectTree` call, a second entry appearing only when the
Structure response marked a root task `standalone: true` (docs/llm-pipeline.md,
Stage 2), a genuine outlier routed to the real Inbox separately from the
rest of the response's own project. `SuperRambleModal.jsx`'s Confirm handler
awaits each tree in order, main project first; this is no longer one atomic
batch across both when a second tree exists, since the two are genuinely
independent writes into different projects, and the second's own failure
should not undo the first's already-landed success. See
docs/llm-pipeline.md's Stage 3 for the full contract, including how a
partial failure is reported.

## The Todoist client (src/todoist/)

Live as of phase 3, part 8, for OAuth connect and a one-shot, new-project-only
write. This is not sync: a second, independent write of a confirmed Super
Ramble project into the user's real Todoist account, alongside the existing
local `store.createProjectTree` write, at the same Confirm click. After that
write the local copy and the Todoist copy have no relationship; editing one
never touches the other. The word "sync" is deliberately avoided in every
piece of UI copy and doc prose describing this feature, since it implies
two-way behavior this does not have.

- `beginTodoistConnect()` redirects to Todoist's OAuth authorize screen
  (`https://app.todoist.com/oauth/authorize`), scope `data:read_write`, a
  CSRF `state` stashed in `sessionStorage` for the round trip. The app has no
  client-side router; `redirect_uri` is the app's own root URL
  (`https://super-ramble.web.app/`, `TODOIST_REDIRECT_URI`), matching what is
  registered on the Todoist app console, not a dedicated callback route.
  Hardcoded rather than derived from `window.location.origin`, since only
  that exact URL is registered; connect only completes end to end from the
  deployed app, not a local dev server.
- `hasTodoistOAuthReturn()` / `consumeTodoistOAuthReturn()` detect and
  consume the `?code&state` the browser lands back on. Called once from
  `App.jsx` on load: verifies `state` against the stashed value, then strips
  the query params via `history.replaceState` so a refresh never re-triggers
  the exchange.
- `exchangeTodoistCode(code, getAuthToken)` calls `POST /api/todoist/oauth`,
  which exchanges the code for a token using `TODOIST_CLIENT_SECRET.value()`
  and stores it under `users/{uid}/todoistAuth/token` (data model above).
- `getTodoistStatus(getAuthToken)` calls `GET /api/todoist/status`; the only
  way the client learns whether a connection exists, since the token itself
  is never client-readable. Fetched once on app load (`AppData.jsx`) and
  re-fetched after connect/disconnect, not polled.
- `disconnectTodoist(getAuthToken)` calls `POST /api/todoist/disconnect`,
  which revokes the token against Todoist's own real revoke endpoint
  (`DELETE https://api.todoist.com/api/v1/access_tokens`, verified live
  against developer.todoist.com, not assumed) before deleting the stored
  copy. The stored copy is deleted either way, even if the revoke call
  itself fails; the response's `revoked` field says which actually
  happened, so the client never overclaims.
- `readProjects()` / `readLabels()` stay stubbed. Not needed until Structure
  can route a Super Ramble proposal into an existing Todoist project, a
  separate future pass; see `docs/roadmap.md`.
- `createTodoistClient({ getAuthToken }).createTree(tree)` calls
  `POST /api/todoist/write` with the exact `{ project, sections, tasks }`
  shape `store.createProjectTree` and `src/pipeline/write.js`'s
  `toProjectTree` already produce, no client-side adapter: this pass only
  ever calls it with a fresh `{ name }` project (the new-project-only
  scope), and `functions/todoist.js` maps that shape directly to Sync API
  commands server-side.

The target is the Todoist REST API v1 at developer.todoist.com, the unified
API that merged the old REST and Sync APIs, base URL
`https://api.todoist.com/api/v1`. Not the archived v6 Sync API. The batched
write (`functions/todoist.js`, `buildSyncCommands`) is one
`POST /api/v1/sync` call, form-urlencoded, a `commands` array of
`project_add` (a fresh `temp_id`), `section_add` per section (`project_id`
referencing the project's `temp_id`), and `item_add` per task (`project_id`,
optional `section_id`, optional `parent_id` for a sub-task, `priority`, and
a nested `due: { string }`). The response's `temp_id_mapping` maps every
`temp_id` to its real Todoist id; returned to the client as-is, unused by
anything this pass builds.

**Priority direction is inverted between the two schemas**, and gets its own
guard, not just a manual check: this app's `priority` is 1 = p1/red/most
urgent, 4 = none (the data model above). Todoist's own API priority runs the
other way, 4 = most urgent, 1 = normal. `toTodoistPriority` in
`functions/todoist.js` is `5 - localPriority`. This exact class of bug
already shipped once, in the Structure prompt; see the resolution log's
priority-direction entry and `scripts/eval-todoist.mjs`, which asserts the
direction deterministically, no live call needed.

**The Todoist push still passes `due.string` through unparsed, on purpose,
distinct from the local store's own due below.** `toDue()`
(`src/pipeline/write.js`) now runs the model's raw due string through
chrono-node before it reaches the local store (see docs/llm-pipeline.md's
Stage 3, and "Natural-language date parsing" below), so a Structure-created
task buckets into Today/Upcoming like any other task. The Todoist push is
unaffected by that parsing: Todoist's own API already accepts a
natural-language string on `item_add` and parses it server-side itself, so
`functions/todoist.js` still only ever reads `t.due.string` (never `date`
or `datetime`) and forwards the model's raw string straight through,
unmodified, exactly as before. The exact field shape is a nested
`due: { string: "..." }` object, not a flat `due_string` key: the first
draft of this got that wrong, following a docs summary that flattened it,
and Todoist's own API accepted a flat `due_string` silently ("ok" in
`sync_status`) while leaving the due date `null`, an easy trap. Caught and
fixed only by a live write against a real account and reading the created
item back, not by the write call's own success response; see the resolution
log's Todoist OAuth entry and `scripts/eval-todoist.mjs`, which now asserts
the nested shape.

**Natural-language date parsing (Write stage).** `toDue(raw)`
(`src/pipeline/write.js`) parses the model's raw due string with
`chrono-node` (a real dependency as of this pass, added because hand-rolling
relative-date parsing correctly is exactly the class of bug this repo has
already shipped once, the UTC-vs-local-day mismatch `scripts/eval-date.mjs`
guards against), anchored to the real current moment, local time, not UTC.
`string` always carries the raw input through verbatim, so the Todoist push
above keeps working unchanged. `date` is set whenever chrono resolves a
calendar day; `datetime` only when chrono found a real stated time with its
own certainty (`isCertain('hour')`), never a midnight or noon default chrono
guessed in for a phrase with no stated time. `isRecurring` is a separate
signal from chrono's own date resolution, checked independently against the
raw text ("every," "each," "daily," "weekly," and similar): "daily" alone
resolves to no single date at all, but still sets `isRecurring: true`.
Anything chrono cannot parse at all ("asap," "sometime," an empty string)
fails closed to the exact prior shape (`date: null, datetime: null, string:
raw, isRecurring: false`), never throws, never guesses. See
`scripts/eval-date-parse.mjs` for the full, deterministic coverage.

**Token refresh.** The Todoist app behind `VITE_TODOIST_CLIENT_ID` has
refresh tokens enabled (the default for a newly-created app): a token
exchange or refresh returns a short-lived `access_token` (`expires_in`
around one hour) plus a `refresh_token`, rotated on every refresh. Before
every `/api/todoist/write` call, `isTokenExpired` (`functions/todoist.js`)
checks the stored `expiresAt` with a one-minute safety buffer; if expired,
the Function refreshes first (`grant_type=refresh_token` against the same
token endpoint) and persists the rotated tokens before attempting the
write. A legacy app (refresh tokens disabled) would instead get one
long-lived token and no `refresh_token` at all; the fallback expiry
(`TODOIST_LEGACY_EXPIRES_IN_SECONDS`, ten years) and the "no refresh token
stored, fail with a clear reconnect message" path both cover that case too,
though the app actually connected to this project is the refresh-enabled
kind, verified with the user directly rather than assumed, since guessing
wrong here means every write past the first hour would have silently
401'd.

## The pipeline (high level)

Three stages, detailed in [docs/llm-pipeline.md](llm-pipeline.md). Classify and
Structure are one combined call, not two; this was a real conflict between
this doc and the shipped code, resolved per the resolution log entry dated
2026-07-06.

1. Transcribe: audio or text in, transcript out. Real and live, on Groq's
   hosted Whisper Large v3 Turbo (`POST /api/transcribe`); text input stays a
   pass-through. See docs/llm-pipeline.md, Stage 1.
2. Structure: transcript plus existing projects in, one call that both
   decides flat-or-project (with a visible reason) and, when it is a project,
   emits the tree shaped for `createProjectTree`, validated against a JSON
   Schema the API itself enforces (structured outputs). Runs on Claude
   Sonnet, a deliberate, named exception to every other model call's
   Haiku default: docs/brief.md's "the structure has to be genuinely good"
   constraint makes this one call worth the extra cost. See the resolution
   log entry dated 2026-07-06 for the model id and the cost math.
3. Write: runs only on explicit confirm. Translates the validated response
   into a `createProjectTree` call, flattening nested sub-tasks into
   `parentRef` siblings. A pure function, no model call.

Structure emits a `createProjectTree` tree. That is why the task app is built
first.

## The /api Function contract

The browser holds no secret. It calls same-origin `/api/**`. The Function
verifies the Firebase Auth token, reads secrets, enforces per-user daily limits,
proxies the model and Todoist calls, and logs privacy-safe usage to
`users/{uid}/llmUsage/{YYYY-MM-DD}`. Endpoints: `POST /api/transcribe`,
`POST /api/structure`, `POST /api/structure/outcome`,
`POST /api/structure/feedback`,
`POST /api/todoist/oauth`, `GET /api/todoist/status`,
`POST /api/todoist/disconnect`, `GET /api/todoist/projects`,
`POST /api/todoist/write`.

The whole Function (`exports.api`, one `onRequest` handling every route
above) sets `timeoutSeconds: 120`, not the unconfigured firebase-functions
v2 default of 60s: a rich, multi-thread `/api/structure` transcript (Sonnet,
`max_tokens: 8192`, up to 30 reference examples formatted into the system
prompt) can genuinely run past 60s, and a platform-level kill mid-call
happens before `logStructureTrace` or any of the three deliberate 502
branches (`docs/llm-pipeline.md`, Stage 2) ever run, reaching the browser as
a bare, unexplained 502 with no `structureTraces` document to show for it.
**This does not fully close that failure for real traffic, and live testing
found the actual behavior is more specific than Firebase's own docs alone
predicted.** Firebase's hosting docs (firebase.google.com/docs/hosting/functions)
state a flat 60-second cap on Hosting's `/api/**` rewrite, ahead of
whatever `timeoutSeconds` this Function itself sets. Real, live testing
against the deployed site after this change (three real calls, complex
multi-thread transcripts, `docs/resolution-log.md`, the dated live-
verification entry) found the actual cutoff is not exactly 60s: Cloud
Run's own request log reported real backend latencies of 91–98 seconds for
these calls before a `502` reached the browser, confirmed via both the
Cloud Functions and Cloud Run Admin APIs to be well under this Function's
own configured `timeoutSeconds`/`template.timeout` of 120s, so this
Function's own limit was never what ended these calls. Something upstream
of this Function, almost certainly still Hosting's rewrite proxy or the
Google Frontend layer in front of it, cuts the connection somewhere around
90–100 seconds in practice, not the documented 60s figure exactly, and
substitutes its own generic infrastructure error page for whatever this
Function was actually about to return. The practical effect is the same
either way: a real user's complex transcript can still fail with an
unhelpful, generic `502` after this change, sourced from a layer this
app's own `timeoutSeconds` config does not reach or control. One nuance
worth keeping precise: for two of the three real failed calls tested live,
the Function itself ran to completion within that window, correctly wrote
a `structureTraces` document, and correctly generated its own explained
`max_tokens`-truncation `502` body (the exact 2026-07-07 truncation
handling, a real, working, and now more reliably-reached code path since
`timeoutSeconds: 120` gives it more room to finish); the browser still
never saw that explained response, since the upstream cutoff had already
substituted its own generic error page by the time it would have arrived.
For the third, most complex call, no trace was written at all, meaning
even that improved path did not get far enough before the same upstream
cutoff. `timeoutSeconds: 120` is still real and worth keeping regardless:
it is what actually governs this Function on any path that does not go
through the Hosting rewrite (a direct Cloud Run invocation, the emulator,
or a future architecture change), it removes an implicit, undocumented
dependency on a platform default that could change, and it demonstrably
gives the Function's own explained-error code paths more room to complete
before the true root cause was reproduced live. The exact identity of the
upstream layer enforcing this ~90–100s cutoff was not conclusively
determined in this pass; the clearest next diagnostic would be calling
this Function's own direct Cloud Run URL rather than the Hosting rewrite,
which needs a real, explicitly-authorized auth token and was correctly not
attempted by extracting one from a live browser session without that
authorization. Closing this fully needs a separate, scoped decision (most
likely calling this Function's own Cloud Run URL directly for the
`/structure` route, bypassing the Hosting rewrite and whatever sits in
front of it, with its own CORS and client changes); see the resolution log
entries for the dates this was found, live-tested, and flagged, not
solved.

A follow-up narrowed where inside this Function the ~90-100s is actually
going. An Anthropic Workbench call using the exact same system prompt
(`STRUCTURE_SYSTEM_PROMPT_RULES` plus the live `referenceExamples` pool),
the exact same `STRUCTURE_JSON_SCHEMA`, and the exact same complex test
transcript finished in about 10 seconds, a ~10x gap against the 91-98s
this Function took on the deployed site for the identical request. That
rules out the model call itself as the bottleneck and points at time spent
inside this Function's own execution instead: a cold start, a Firestore
round trip (`checkAndReserveLimit`, `fetchReferenceExamples`, `logUsage`,
`logStructureTrace`, all in the `/structure` path), or CPU throttling from
too small a memory allocation, `256MiB`, firebase-functions v2's
unconfigured default, discovered alongside the `timeoutSeconds` finding
above. Two changes test this directly rather than guessing: the
`/structure` handler now logs each of those four phases' own duration to
Cloud Logging unconditionally (`console.log('structure phase timings', ...)`,
not gated behind `STORE_RAW_TRACES`, so this is visible on every real call
going forward), and `exports.api` now also sets `memory: '512MiB'`
alongside `timeoutSeconds: 120`, a first, moderate test of the
CPU-throttling theory. See the resolution log entry for the actual
phase-level breakdown from live testing, not a guess: whether 512MiB
closes the gap, and if not, where the phase timings show the time
actually going.

**This whole "closing this fully needs..." problem is superseded, not
solved via the diagnostic named above.** The async-Structure pass
(docs/resolution-log.md) sidesteps the Hosting-cutoff question entirely
instead of answering it: `POST /api/structure` no longer holds a long-lived
HTTP request open for a slow model call at all, so there is nothing left
for Hosting's rewrite (or whatever sits in front of it) to cut off around
90-100s. The real work moved to `processStructureTrace`, an
`onDocumentCreated` trigger invoked directly by Eventarc, never through the
Hosting rewrite; see "Background triggers" below for its own contract. The
direct-Cloud-Run-URL diagnostic (`scripts/diagnose-hosting-cutoff.mjs`) is
still real, standalone follow-up work for confirming exactly which upstream
layer was responsible, if that is ever still worth knowing, but it is no
longer a blocker for the user-facing bug this section originally described.

`/api/todoist/oauth` and `/api/todoist/write` are real as of phase 3, part 8
(the "The Todoist client" section above has the full detail: OAuth exchange,
refresh, the batched Sync API write, the priority-direction and due-string
translation). `/api/todoist/status` and `/api/todoist/disconnect` are new
additions this same pass, not stubs carried over from an earlier phase:
neither model call nor Todoist itself needed them, but a connect/disconnect
flow does, since the stored token is never client-readable and Todoist's own
revoke has to be called from somewhere that holds the client secret. Neither
touches `checkAndReserveLimit`/`logUsage`; none of the four Todoist
endpoints spend a model call or count against the daily LLM request/cost
ceiling. `/api/todoist/projects` stays a stub, unchanged from phase 2: not
needed until Structure can route into an existing Todoist project.

`POST /api/transcribe` (Stage 1, docs/llm-pipeline.md): audio in, transcript
out, via Groq's hosted Whisper Large v3 Turbo. Shares `checkAndReserveLimit`/
`logUsage` and the same `llmUsage` daily ceiling `/api/structure` already
uses, not a second parallel limit system; `logUsage` gained an optional
`audioSeconds` counter for it. No dedicated trace collection, unlike
`structureTraces` below: a fixed third-party call with no prompt of our own
has nothing for a trace-and-eval flywheel to feed. See the resolution log
entry dated 2026-07-08.

Every `/api/structure` call, success or failure, also writes one
`users/{uid}/structureTraces` document (full field list in the data model
above): the transcript, the parsed response or `null`, and token/cost usage,
separate from the `llmUsage` daily counters. This is unconditional, in
production too. `LLM_STORE_RAW_TRACES` is still a real, separate flag; it
still only drives a local `console.log`, still off in production. The two
are not the same mechanism: the trace write is permanent, per-user
persistence, on by default everywhere; the debug flag is a transient log
line, opt-in, for local debugging. `POST /api/structure/outcome` fills in the
one thing a trace cannot know on its own, whether the user actually confirmed
or cancelled the proposal. See `docs/llm-pipeline.md` for how this feeds the
offline eval suite, and the resolution log entry dated 2026-07-07 for why
this reopens what this doc used to say about raw traces staying off in
production.

### Background triggers

`functions/index.js` exports two Firestore triggers alongside the HTTP
endpoints above, both on `users/{uid}/structureTraces/{traceId}`, neither
ever running as part of a live user request:

`processStructureTrace`, `onDocumentCreated` (not `onDocumentWritten`: a
created-document trigger fires exactly once per document, so this
trigger's own later write-back can never retrigger itself, unlike
`gradeStructureTrace` below, which needs an explicit guard for that same
reason). Fires the moment `POST /api/structure`'s fast enqueue write
creates a new document with `status: "processing"`; does the real
Structure work that write intentionally deferred (reconstructing
`existingProjects` name+id pairs from `users/{uid}/projects` via Admin SDK,
since the trace document itself only ever stores ids;
`fetchReferenceExamples`; the actual `client.messages.create` call,
unchanged in shape from what the synchronous path used to do inline;
`logUsage` against the same `users/{uid}/llmUsage/{today}` document
`checkAndReserveLimit` already reasons about), then merge-writes the result
(`model`, `stopReason`, `response`, `rawText`, `responseId`,
`contentBlocks`, `ok`, token/cost fields, `status: "done" | "failed"`, and
`errorMessage` on failure). Guards a real race on that final write: `POST
/api/structure/outcome` can land while this trigger is still mid-flight (the
user can Discard while the waiting UI is still up,
`SuperRambleModal.jsx`), so the final write re-reads the document
immediately beforehand and only ever includes `outcome: "pending"` if
nothing real has been decided yet, never stomping a real `"cancelled"` back
to `"pending"`. `timeoutSeconds: 180` / `memory: '512MiB'`, reasoned from
real Cloud Logging data (`scripts/structure-timing-stats.mjs`), not copied
from `exports.api`'s own values: see the resolution log entry for the async-
Structure pass. See "The /api Function contract" above for why this split
exists at all (Firebase Hosting's rewrite proxy cutting off a genuinely slow
synchronous call around 90-100s) and `docs/llm-pipeline.md` for the full
Stage 2 contract this trigger fulfills.

`gradeStructureTrace`, `onDocumentWritten`. Fires asynchronously, after
`POST /api/structure/outcome` has already responded to the client. Guarded
against retriggering on its own write (it checks `judgedAt` is not already
set before doing anything, the same field its own write sets, so the write
that grades a trace produces a second invocation that immediately no-ops
rather than a loop). Grades on this app's default Haiku model, never
Sonnet, the same model rule `scripts/grade-traces.mjs` already followed as
a manual script; when the outcome is `"confirmed_with_edits"` and the
grader flags the original response, it also attempts to reconstruct the
corrected tree from `response` plus `edits` and, if that reconstruction and
a contract validation both succeed, writes it into `referenceExamples`
automatically. See `docs/llm-pipeline.md`'s "Live capture and the eval
flywheel" section for the full mechanism, including what makes
reconstruction fail and why that is a real, known limitation, not an
oversight. Its own guard (`!afterData.outcome || afterData.outcome ===
"pending"` returns early) already means it never grades a trace still
mid-flight in `processStructureTrace`: `response` is absent until that
trigger's own final write lands, so this trigger's `!afterData.response`
guard defers grading regardless of which of the two triggers' writes landed
first.

## Secrets

Firebase web config lives in `.env.local` (gitignored); the `VITE_*` values are
public by design. `VITE_TODOIST_CLIENT_ID` is one of them: the Todoist app's
own OAuth client id, not a secret, used client-side to build the authorize
URL (`src/todoist/index.js`) and sent along with the OAuth exchange so the
Function never needs a second, hand-synced copy of it. The Anthropic key, the
Todoist client secret (`TODOIST_CLIENT_SECRET`), and the Groq API key
(`GROQ_API_KEY`, `POST /api/transcribe`) are Firebase Functions secrets, set
with `firebase functions:secrets:set`. No key ever reaches the browser.

`.env.local` is read by both `npm run dev` and any production build made from
this checkout; Vite loads it for every build regardless of mode, so a local
convenience flag left on ships straight into the deployed bundle.
`npm run verify:prod-env` must pass before any `firebase deploy` that includes
a hosting rebuild: it checks `.env.local` directly for
`VITE_ENABLE_LOCAL_PREVIEW=true`, the exact mistake that shipped local-preview
mode (a fake signed-in user, no real Firebase Auth) to production. See the
resolution log entry dated 2026-07-07 for what that outage looked like and
why bundle-sniffing after the fact is not enough on its own.
