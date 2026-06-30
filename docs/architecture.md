# Architecture

## Priority

Voice is a thin input adapter. Structuring is the core. The folder layout and
the data flow keep that visible: capture feeds a transcript into the pipeline,
and the pipeline does the work that matters.

## Folder map

```
src/
  main.jsx, App.jsx          app entry and the auth-gate seam
  lib/firebase.js            Firebase init from env, guards missing config
  lib/store.js               store interface seam (Firestore behind it)
  lib/crypto.js              AES-GCM client-side encrypt/decrypt seam
  pipeline/                  the structuring core, not in the UI
    structure.js             transcript + projects -> validated scaffold
    contracts.js             the JSON contract and its strict validator
    prompt.js                Haiku prompt builder
  ui/Placeholder.jsx         the deployable placeholder page
functions/
  index.js                   the /api proxy
evals/                       fixtures, offline cases, gitignored runs
scripts/                     eval and trace tooling
llm-traces/                  local raw traces (gitignored)
```

## Data model

Everything lives under the signed-in user.

- `users/{uid}` profile and settings.
- `users/{uid}/drafts/{id}` a proposed scaffold awaiting confirm. Personal free
  text fields (transcript, task contents, project name) are stored as AES-GCM
  ciphertext, never plaintext.
- `users/{uid}/llmUsage/{YYYY-MM-DD}` privacy-safe usage for the day: requests,
  costUsd, inputTokens, outputTokens. Written by the Function only.

Firestore rules scope every document to its owner. Clients can read their own
usage but cannot write it.

## The store interface seam

The app talks to `lib/store.js`, never to Firestore directly. The seam is the
contract; Firestore sits behind it. Changing the store shape is a documented
decision, not a casual edit (see docs/orchestration.md, definition of done).
Any value carrying personal free text is encrypted through `lib/crypto.js`
before it reaches the store.

## The pipeline boundary

The UI never calls the model directly. The structuring call is injected as a
`callModel` function so one code path runs three ways:

- Offline evals: `callModel` returns a fixture's mocked response. No credits.
- Local live: `callModel` hits the Vite dev bridge. The key stays server-side.
- Production: `callModel` hits the `/api` Function.

`structure.js` validates every response against `contracts.js` before returning.
A response that drifts out of the contract throws, so the UI never renders an
unchecked shape.

## The /api Function contract

The browser holds no secret. It calls same-origin `/api/**`. The Function
verifies the Firebase Auth token, reads secrets, enforces per-user daily limits,
proxies the calls, and logs usage. Endpoints:

- `POST /api/structure` verify auth, check daily limits, call Haiku with the
  built prompt, validate, log usage, return the contract JSON.
- `POST /api/todoist/oauth` exchange the OAuth code for a token using the Todoist
  client secret. Scope `data:read_write`.
- `GET /api/todoist/projects` read the user's projects (names and ids) for
  routing.
- `POST /api/todoist/write` write the confirmed project-with-nested-tasks.

Per-user daily request and cost limits are enforced against
`users/{uid}/llmUsage/{YYYY-MM-DD}`. Raw prompts and responses are stored only
when `LLM_STORE_RAW_TRACES=true`, which is off in production.

## Todoist OAuth and write flow

Verified against the current Todoist API v1 (the unified API that merged the old
REST and Sync APIs). Base URL `https://api.todoist.com/api/v1`. Do not build
against the archived v6 Sync API or the deprecating `rest/v2` and `sync/v9`.

1. Authorize. OAuth 2.0 with scope `data:read_write`. The client secret is a
   Function secret; the token exchange happens server-side.
2. Read projects. `POST https://api.todoist.com/api/v1/sync` with
   `sync_token='*'` and `resource_types=["projects"]`. The response carries a
   `projects` array of names and ids. These names go into the prompt for
   routing.
3. Propose and confirm. The pipeline returns a scaffold. The user reviews and
   confirms in the UI. Nothing is written before this.
4. Write, batched and atomic. `POST https://api.todoist.com/api/v1/sync` with a
   commands array:
   - `project_add` with a `temp_id` (only when creating a new project; when
     routing into an existing project, skip this and use its real id).
   - `item_add` per task. Its `project_id` is the new project's `temp_id` or the
     existing project's real id.
   - `item_add` per sub-task. Its `parent_id` is the parent task's `temp_id`,
     which nests it. Sub-tasks are real tasks with a `parent_id`; that is how
     Todoist represents nesting.
   - The response returns `temp_id_mapping`, resolving each `temp_id` to the real
     server id.

Batching the whole scaffold in one commands array makes the confirm-to-write a
single request that either lands together or not at all.

## Secrets

Firebase web config lives in `.env.local` (gitignored); the `VITE_*` values are
public by design and carry no secret. The Anthropic key and the Todoist client
secret are Firebase Functions secrets, set with `firebase functions:secrets:set`.
No key ever reaches the browser.
