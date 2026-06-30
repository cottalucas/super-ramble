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
  auth/                      the auth gate and current-user context
  store/                     the store interface; Firestore behind it
    index.js                 createStore: picks the adapter, exposes the interface
    tree.js                  pure ref-resolution for createProjectTree
    firestore-store.js       Firestore adapter (modular SDK, writeBatch)
    local-store.js           localStorage adapter (dev without keys)
  todoist/                   stubbed Todoist client contract (mock now)
  pipeline/                  the structuring core (phase 3)
    structure.js, contracts.js, prompt.js
  components/                Sidebar, TaskRow, QuickAddModal, pickers, sections
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
- `color`: string (design token name)
- `view`: "list" | "board" (default "list")
- `order`: number
- `isInbox`: boolean (exactly one true per user)
- `createdAt`, `updatedAt`

`users/{uid}/sections/{sectionId}`
- `projectId`: string
- `name`: string
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
- `reminders`: [{ type: "absolute"|"relative", at: string }]
- `completed`: boolean
- `completedAt`: string | null
- `order`: number
- `createdAt`, `updatedAt`

`users/{uid}/labels/{labelId}`
- `name`: string
- `color`: string

Nesting depth: at least two levels of sub-tasks. A project with sections and
nested tasks is creatable in one batched write, because that is exactly what the
pipeline calls. Firestore rules scope every collection above to its owner.

## The store interface (src/store/)

The app talks to this interface, never to Firestore directly. The app imports
`createStore`, never the SDK. One adapter sits behind the interface: Firestore
when configured and signed in, localStorage in local preview. Both adapters
implement the same methods, so the app and the evals see one shape.

Methods:

- Projects: `listProjects`, `getProject`, `createProject`, `updateProject`,
  `deleteProject` (cascades its sections and tasks).
- Sections: `listSections(projectId)`, `createSection`, `updateSection`,
  `deleteSection`.
- Tasks: `listTasks(filter)`, `createTask`, `updateTask`, `deleteTask`,
  `completeTask` (sets `completed` and `completedAt`).
- Labels: `listLabels`, `createLabel`, `updateLabel`, `deleteLabel`.
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

A stubbed contract for now. Live OAuth and REST v1 calls come later.

- `readProjects()` read the user's Todoist projects (names and ids).
- `readLabels()` read the user's Todoist labels.
- `createTree(tree)` batched create that mirrors `createProjectTree`.

Mock implementation in phase 2. The target is the Todoist REST API v1 at
developer.todoist.com, the unified API that merged the old REST and Sync APIs,
base URL `https://api.todoist.com/api/v1`. Do not build against the archived v6
Sync API. The batched create maps a project with sections and nested tasks to one
request: a new project, `item_add` per task, and `parent_id` for each sub-task.

## The pipeline (high level)

Four stages, detailed in [docs/llm-pipeline.md](llm-pipeline.md):

1. Transcribe: audio or text in, transcript out.
2. Classify: transcript plus existing projects and labels in, a flat-or-project
   decision with a visible reason out. Runs on Claude Haiku.
3. Structure: runs only for a project. Emits a tree shaped for
   `createProjectTree`, validated against a JSON schema. Runs on Haiku.
4. Write: runs only on explicit confirm. Translates the validated tree into a
   `createProjectTree` call. A pure function, no model call.

Structure emits a `createProjectTree` tree. That is why the task app is built
first.

## The /api Function contract

The browser holds no secret. It calls same-origin `/api/**`. The Function
verifies the Firebase Auth token, reads secrets, enforces per-user daily limits,
proxies the model and Todoist calls, and logs privacy-safe usage to
`users/{uid}/llmUsage/{YYYY-MM-DD}`. Endpoints: `POST /api/structure`,
`POST /api/todoist/oauth`, `GET /api/todoist/projects`, `POST /api/todoist/write`.
Raw prompts and responses are stored only when `LLM_STORE_RAW_TRACES=true`, off
in production.

## Secrets

Firebase web config lives in `.env.local` (gitignored); the `VITE_*` values are
public by design. The Anthropic key and the Todoist client secret are Firebase
Functions secrets, set with `firebase functions:secrets:set`. No key ever reaches
the browser.
