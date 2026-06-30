# Resolution log

Append-only. Each entry is dated and records what was done and the decisions a
future agent should not relitigate.

## 2026-06-30: Phase 2 deployed to super-ramble.web.app (Spark plan)

Deployed phase 2 to https://super-ramble.web.app on the Spark no-cost plan,
Hosting and Firestore rules only. Functions were not deployed; the Claude
backend is phase 3 and needs Blaze then.

- Merged `feat/phase-2-task-app` to main through PR #1 after CI passed (build,
  offline evals, Function syntax check). Deployed commit: `efec8e1`.
- Ran `firebase deploy --only hosting,firestore:rules`. Did not run a full
  deploy, which would attempt Functions and fail on Spark.
- Created `.firebaserc` pointing the default project at `super-ramble` instead
  of running interactive `firebase init`, to avoid overwriting the
  owner-scoped `firestore.rules`.
- The production build needs the Firebase web config at build time. Pulled it
  with `firebase apps:sdkconfig` into a gitignored `.env.local` and rebuilt, so
  the deployed bundle runs the real Google auth gate and Firestore, not local
  mode. The web config is public by design and is never committed; only
  `.env.example` carries placeholder names.

Verified: the site loads (200), the deployed bundle boots to the auth gate with
a Continue with Google button, the console is clean, and no phase 2 code calls
`/api`. The `/api/**` rewrite returns 404 while Functions are undeployed, which
is harmless because no phase 2 view depends on it. The Firestore rules released
are the owner-scoped rules in the repo.

### Decisions not to relitigate

- Spark plan covers Hosting and Firestore. Functions stay undeployed until
  phase 3, which requires enabling Blaze first. Blaze has a free tier that
  covers low usage at effectively no cost. Do not upgrade the plan before
  phase 3 needs it.
- The `/api/**` rewrite stays in `firebase.json` now and resolves once the
  `api` Function is deployed in phase 3.

## 2026-06-30: Phase 2 docs population and task app shell

Populated the `docs/` set with full content, then built the persisted task app
shell to it.

Docs now contain:
- `brief.md`: the three stages, the unowned organize step, the product, the
  user, scope, the success signal, and the constraints.
- `architecture.md`: the full Firestore data model (projects, sections, tasks
  with `parentId`, labels under `users/{uid}`), the store interface and its
  `createProjectTree` batch method, the stubbed Todoist client contract, the
  four-stage pipeline at a high level, and the revised folder map.
- `design-system.md`: the `ds-` tokens verbatim, Inter, the native-Todoist
  principle, the litmus test, the stop-slop copy rules, and the anti-pattern
  checklist. Points at `docs/reference/` as the source of visual truth.
- `llm-pipeline.md`: the detailed Transcribe, Classify, Structure, Write
  contracts, the per-stage eval assertions, the guard suite, and the cost
  posture.
- `roadmap.md`: phase 2 items listed under Built.

Built: the store interface (`src/store/`) with a Firestore adapter and a
localStorage adapter behind one shape, sharing pure ref-resolution in
`tree.js`. The auth gate, the sidebar nav, the Today view with overdue
rollover, the horizontal Upcoming window, the Project view with collapsible
sections and two-level nested sub-tasks, Inbox as the default project, the
quick-add modal with the date, priority, label, and reminder pickers, and the
task row with the priority ring and green due meta. Updated `firestore.rules`
to scope every collection to its owner.

Verified live: create project, task, sub-task, set priority and date, complete
a task, and reload, all persist. `createProjectTree` resolves sections,
two-level nesting, and routing into an existing project, and rejects orphan
sub-tasks. Build clean, offline evals still 12/12.

### Decisions not to relitigate

- The task app is built before the pipeline because Structure emits a
  `createProjectTree` tree. The store is the contract.
- A sub-task is a task with `parentId` set. That single field is the structural
  capability the product is built around.
- One write path: the UI and the pipeline both create through
  `createProjectTree`. Normal Add flows route through it too.
- The app talks to the store interface, never to Firestore directly. Two
  adapters sit behind it; local mode runs when config is missing or preview is
  on, so the app boots without keys.
- The folder map changed this pass (`src/store/`, `src/views/`,
  `src/components/`, `src/auth/`, `src/firebase.js`); the doc changed with it.
- `docs/reference/` holds the screenshots that are the source of visual truth.
  They were not in the repo this pass, so the build followed the inline specs
  and the tokens; refine against the real images when they land.

## 2026-06-30: Scaffolding pass

Set up the deployable skeleton and the full `docs/` source-of-truth set. Built:
repo structure, Firebase wiring with a missing-config guard, the auth-gate seam,
the placeholder page, the structuring pipeline boundary (contract, strict
validator, prompt builder, injected `callModel`), the offline eval harness with
six synthetic fixtures and negative contract cases, local trace capture and the
trace summary, the `/api` Function stub with real auth, per-user daily limits and
usage logging, and CI for build plus offline evals plus a Function syntax check.

Verified the Todoist API before writing `docs/architecture.md`. The current API
is the unified v1 at `https://api.todoist.com/api/v1`, which merged the old REST
and Sync APIs. Sub-task nesting uses `parent_id`. A project with nested tasks is
created in one batched commands array at `POST /api/v1/sync` using `project_add`
with a `temp_id` and `item_add` commands that reference it, with `temp_id_mapping`
in the response. OAuth scope is `data:read_write`. The archived v6 Sync API and
the deprecating `rest/v2` and `sync/v9` are not used.

### Decisions not to relitigate

- Haiku only. One model, pinned via `ANTHROPIC_MODEL`. No Sonnet or Opus path.
- Capture stays simple. Voice is a thin record-then-transcribe adapter.
  Structuring is the core.
- The user confirms before any write. Nothing is written to Todoist without an
  explicit confirm. No auto-execution.
- `docs/` is the single source of truth. Root tool files only point to it.
- Design comes from screenshots of the live Todoist Ramble flow, later. Do not
  invent design tokens before the screenshots exist.
- Offline evals are the default no-credit check. Live evals are gated and
  bounded. The model is never called by the offline path.
- Secrets never in source. The Anthropic key and the Todoist client secret are
  Function secrets. No key reaches the browser.
- Personal free text is encrypted client-side before any Firestore write.
