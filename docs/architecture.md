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
Denied to every client read and write in `firestore.rules`, the same
treatment `structureTraces` gets below, but a distinct case for a distinct
reason: personal task text gets client-side encryption
(`src/lib/crypto.js`) before it ever reaches Firestore, so the server never
needs the plaintext. A Todoist access token can't get that treatment; the
Function has to read it in plaintext to call Todoist on the user's behalf.
Only the Function (Admin SDK) ever touches this collection. See
`docs/roadmap.md` (phase 3, part 8) and the resolution log's Todoist OAuth
entry.

`users/{uid}/structureTraces/{traceId}`
- `transcript`: string (the raw dump submitted to Structure)
- `existingProjectIds`: string[] (ids only, no names)
- `model`: string (the Anthropic model id the call actually used)
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
- `outcome`: `"pending" | "confirmed" | "cancelled"`
- `outcomeAt`: server timestamp | null
- `traceWriteFailed`: boolean, present and `true` only on a fallback marker
  (see below); absent on every normal trace document
- `errorCode`, `errorMessage`: string | null, present only alongside
  `traceWriteFailed: true`; the Firestore error from the primary write
  attempt, so a write failure is diagnosable from the trace collection
  itself, not just Cloud Logging

Written once per real Structure call, in production too, not gated behind a
debug flag: a full trace on success or an ordinary failure (refusal,
truncation, malformed JSON), or, if that write itself fails, a minimal
`traceWriteFailed` marker instead (no `transcript` or `response`, just
`ok: false`, `traceWriteFailed: true`, `errorCode`, `errorMessage`, and the
usual `createdAt`/`outcome`/`outcomeAt`). Never total silence: a 2026-07-08
review found real production calls that were billed in `llmUsage` but had no
matching `structureTraces` document at all, since the prior version of this
write's catch block only logged to Cloud Logging and returned `null`. See
the resolution log entry dated 2026-07-08 for the finding and the fallback
this added. `outcome` and `outcomeAt` are filled in later by
`POST /api/structure/outcome` when the user confirms or cancels the
proposal (a `traceWriteFailed` marker never gets a real outcome, since there
was never a proposal shown for it either: the original request still
returned its normal response or error to the caller). Denied to every client
read and write in `firestore.rules`; only the Function (Admin SDK) and the
local `scripts/list-traces.mjs` / `scripts/promote-trace.mjs` (also Admin
SDK, which bypasses rules) ever touch it. `list-traces.mjs` shows a
`traceWriteFailed` marker plainly instead of a blank transcript;
`promote-trace.mjs` refuses to promote one outright, since there is nothing
to promote. See `docs/llm-pipeline.md` and the resolution log entry dated
2026-07-07 for what this is for and why it reopens an earlier privacy
stance.

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

Both the UI and the later pipeline create through `createProjectTree`, so there
is one write path and one set of evals. Normal Add flows route through it too:
adding a task to an existing project calls `createProjectTree` with
`project: { id }` and one task.

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

**Due dates pass through unparsed.** This app currently carries `due` as a
natural-language string fallback (`due.string`; no date parser exists yet,
`docs/llm-pipeline.md`). Todoist's own API accepts a natural-language string
on `item_add` and parses it server-side, so the model's raw string is passed
straight through, unmodified. The exact field shape is a nested
`due: { string: "..." }` object, not a flat `due_string` key: the first
draft of this got that wrong, following a docs summary that flattened it,
and Todoist's own API accepted a flat `due_string` silently ("ok" in
`sync_status`) while leaving the due date `null`, an easy trap. Caught and
fixed only by a live write against a real account and reading the created
item back, not by the write call's own success response; see the resolution
log's Todoist OAuth entry and `scripts/eval-todoist.mjs`, which now asserts
the nested shape.

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
`POST /api/todoist/oauth`, `GET /api/todoist/status`,
`POST /api/todoist/disconnect`, `GET /api/todoist/projects`,
`POST /api/todoist/write`.

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
