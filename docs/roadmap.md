# Roadmap

## Built

Phase 1: scaffold. The `docs/` set and conventions, the auth-gate seam, the store
interface seam, the eval and trace flywheel, Firebase wiring, and CI. Phase 1
also scaffolded the structuring pipeline boundary ahead of phase 3:
`src/pipeline/contracts.js` (a strict validator), `src/pipeline/prompt.js` (the
Haiku prompt builder), `src/pipeline/structure.js` (the injected-`callModel`
entry point), and the offline eval harness, now with seven fixtures plus
negative contract cases. The 2026-07-04 conflict between this code's contract
and [docs/llm-pipeline.md](llm-pipeline.md) is resolved: see the resolution log
entry dated 2026-07-06. The doc now matches the code, one combined decision
call with `confidence` and optional `sections`/`sectionRef`; `labels`, per-task
`description`, and project `color` stay out until a later pass.

Phase 2: the persisted task app shell.
- Sidebar nav: Add task, Search stub, Inbox, Today, Upcoming, and a Projects
  list. Projects is the only project grouping.
- Today view: tasks due today under a date header, with an overdue rollover
  section. List layout.
- Upcoming view: a horizontally scrollable multi-day window, one column per day
  with its own Add task affordance and a Today control top-right. Seven-day
  window. Superseded by phase 2.7's vertical agenda.
- Project view: title, optional collapsible sections, tasks, and sub-tasks
  nested under their parent. List layout, with a clean seam for Board later.
- Inbox: the default project, rendered like any project.
- Quick-add modal: name, description, Date picker (Today, Tomorrow, This weekend,
  Next week, No date, a month calendar, and a Time option), Priority picker (four
  flags), Labels, Reminders, and a footer project/section selector with Cancel
  and Add task.
- Task row: circular checkbox that completes, content, and a meta line with due
  time in green, label chips, and the project name when shown outside its
  project. Priority sets the checkbox ring color.
- Project overflow: Add project above, Add project below, Edit, Add section,
  Delete only. Edit opens the same panel Add Project uses, not an inline
  rename; siblings also reorder by drag. Superseded in a later fix pass (see
  docs/resolution-log.md): Favorites, Move, Duplicate, Share, Comments, View
  activity, templates, extensions, CSV, and the rest of the real Todoist
  menu stay out, per this doc's own Out of scope section.
- `store.createProjectTree` batch write, used by the normal Add flows.
- Native Todoist look against [docs/reference/](reference/).

Phase 2.5: task-app CRUD completeness.
- Task detail view: opening any task row in Inbox, Today, Upcoming, or Project
  view opens an editable panel, not Quick-add. Checkbox, editable content,
  editable description shown inline, "+ Add sub-task" that writes through
  `store.createProjectTree`, and a right rail for project (the same
  `ProjectPicker` Quick-add uses), date, priority, labels, and reminders.
  Content and description saves debounce; the rest saves on change through
  `store.updateTask`. Closed the one real gap against full CRUD.
- Delete confirmation on task, section, project, and label, through a shared
  `ConfirmDialog`. Each names what is being deleted and states the cascade
  when there is one: a project delete removes its sections and tasks, a
  section delete does not delete its tasks, a task delete removes its
  sub-tasks. No irreversible delete without a confirm step first. Sidebar's
  project delete moved off the native `window.confirm` onto the same dialog.
- Label CRUD stays inline in `src/components/LabelPicker.jsx`. Typing a name
  with no match shows a `Create "<name>"` option that calls `store.createLabel`
  and applies the label immediately. Each existing label also gets a delete
  affordance behind the same confirm dialog. There is still no separate Labels
  page.
- A light sort control (Priority, Date, or Manual) on Inbox, Today, and
  Project. Manual uses the existing `order` field; Priority and Date sort the
  already-fetched list client-side and never write to the store. There is
  still no reordering UI.
- `projects` gets a `description` field, shown and editable inline under the
  project title, with an "Add a description" placeholder when empty.

Phase 2.6: card density and single-list manual drag.
- Card density on Today and Upcoming: a style variant on the existing
  `TaskRow` (`variant="card"`), not a second row component, so every
  behavior (checkbox, complete, delete-with-confirm, open-task-detail) stays
  identical to the flat divider rows Inbox and Project keep. `TaskList`
  threads the variant down; `TaskRow` never forwards it to the sub-tasks it
  renders recursively, since Today and Upcoming never show nested children.
- Manual drag-and-drop reorder on Inbox, Today, and Project, the same three
  views with the sort control, active only when that view's Sort is Manual.
  Native HTML5 drag and drop, no new dependency. Reorder is scoped to
  whichever single list a `TaskList` instance renders (root siblings sharing
  a parent and a section, the no-section group, or, on Today, the Overdue
  group versus the Today group): drag state lives inside `TaskList`, so a
  drop on a row from a different `TaskList` instance has no matching drag id
  and does nothing. A drop recomputes `order` as sequential integers over
  that one list and persists every changed task through the existing
  `store.updateTask`; it never changes `parentId`, `sectionId`, `projectId`,
  or `due`. Upcoming has no sort control and stays undraggable, matching the
  decision that Manual is the only mode reorder makes sense against.
- Inbox needed no separate work; it already renders through the shared
  `ProjectView` and picked up both pieces for free.
- Deliberately still out: cross-section drag, cross-project drag,
  drag-to-reschedule by dropping a task onto a date, and the full Layout
  panel (Board, Calendar, Grouping, Filter). Each is a bigger, separate lift
  than a single-list manual reorder.

Phase 2.7, part 1: agenda Upcoming and drag-to-reschedule.
- Upcoming rebuilt as a single vertical list: an Overdue section first
  (anchored to today, so it only shows on the week that contains today), then
  one section per day, each with its own date header, card density from
  phase 2.6, and "+ Add task". Above the list, a week-strip header with
  "‹ Today ›" controls that page the whole strip and the list by one week;
  the strip never scrolls or filters on its own. The strip's own shape (what
  it's anchored to, how many rows, which pill highlights) changed twice in
  later passes; see docs/resolution-log.md for the current header.
- Drag-and-drop across day sections: dropping a task on a different day's
  section rewrites its `due.date`, keeping its time of day if it had one, and
  clearing to date-only if it did not. Not gated behind a sort control;
  Upcoming has none, so this is always available. Dragging within one
  section (a day, or Overdue) still reorders that section only, the same
  `store.updateTask`-recomputes-`order` mechanics as phase 2.6. Dropping a
  dated task onto Overdue is a no-op: Overdue is a rollup of many dates, not
  one day, so it is not a defined reschedule target. Dragging an overdue task
  onto a day rescues it forward, which is well-defined the same way. Rendered
  with `TaskRow` directly rather than through `TaskList`, because reschedule
  needs drag state shared across every section in the view, the opposite of
  `TaskList`'s per-instance isolation that phase 2.6 relies on; Inbox, Today,
  and Project are untouched by this.
- Verified `src/lib/date.js`'s `isToday` and `isOverdue` by hand against
  local timezones, DST transitions, and near-midnight datetimes: no real
  mismatch found. Both only ever key off `due.date`, a bare local-calendar-day
  string set directly from the user's local day selection; neither derives a
  day from parsing `due.datetime` as a UTC instant, so there was nothing to
  fix. `scripts/eval-date.mjs` (new, outside `evals/`) guards this going
  forward; `npm run eval` runs it alongside the unchanged pipeline eval.
- A "Seed sample data" button in the sidebar, seeding five representative
  Inbox tasks (one overdue, two due today at different times, one due
  tomorrow, one with no date) through the same `store.createTask` every
  other flow uses. Safe to click more than once: it skips any seed task
  whose content already exists. Extended in a later pass (see
  docs/resolution-log.md) to a full project tree, run against whichever
  store is active, not local preview only. Removed entirely once real usage
  started flowing through the app; see docs/resolution-log.md, 2026-07-08.

Phase 2.7, part 2: project hierarchy, Inbox, and Search.
- `projects` gets `parentProjectId`, added to `createProject` in both store
  adapters and to `tree.js`'s `projectDoc`, the same pattern phase 2.5 used
  for `description`. `deleteProject` in both adapters now also promotes
  direct children to the top level (`parentProjectId: null`) instead of
  deleting them, alongside its existing cascade of its own sections and
  tasks; the delete confirm dialog states this.
- A real Add Project dialog (`src/components/AddProjectModal.jsx`) replacing
  the old inline sidebar text field: Name, a Color swatch picker, and a
  Parent project selector, default No Parent. No Workspace field, no Access
  or sharing field, no Add-to-favorites toggle, no Layout picker; every new
  project still defaults to `view: "list"`.
- The sidebar renders nested projects recursively under "Projects," indented
  per level with a collapse chevron per parent, matching the interaction
  sections already use, though the collapse state itself is local to the
  sidebar and not persisted: projects carry no `collapsed` field, only
  sections do. No fixed depth limit; whatever depth exists renders.
- Inbox no longer shows a description field or placeholder. It is a fixed
  special project, not a general one; every other project still shows one.
- The Search nav item, and its stub input, are removed from the sidebar
  entirely. It was a placeholder with no logic behind it.

Phase 2.7, part 3: settings. Closes out phase 2.7.
- A Settings entry point: a gear icon in the sidebar head, next to the
  signed-in user's name, replacing the direct sign-out button that used to
  sit there. Opens `src/components/SettingsModal.jsx`, an Account section and
  a Theme section.
- Account: the signed-in name and email, read-only, straight from the
  Firebase Auth user object already on the auth context. Sign out sits behind
  the existing `ConfirmDialog` pattern; confirming calls Firebase Auth's
  sign-out. In local preview, where there is no real account, the section
  says so instead of showing a sign-out control that would do nothing.
- Theme: a Light/Dark toggle. Dark applies the token values from
  docs/design-system.md's "Dark theme tokens" section through
  `[data-theme="dark"]` in `src/styles.css`, mirroring how light is defined.
  The choice lives in `localStorage` (`src/lib/theme.js`), never a Firestore
  document, and an inline script in `index.html` reads it before first paint,
  so there is no flash of the wrong theme on load.
- Auditing the theme pass surfaced several hardcoded colors that bypassed the
  token system entirely and would have made dark mode partial rather than
  complete: hover-tint overlays fixed to black (wrong direction on a dark
  surface), the priority-checkbox fill tints hardcoded to the light priority
  colors instead of derived from the `--ds-p1/2/3` tokens, several surfaces
  (`.chip`, `.modal`, `.popover`, `.btn-ghost`) with a literal white or gray
  background, the toast fixed to the same value as the dark canvas (would
  have been invisible), and, the widest gap, every plain `input`/`textarea`
  in the app defaulting to the browser's white form-control background since
  no rule had ever set one. Fixed all of them; the hover tints and priority
  tints now use `color-mix()` against the relevant token so they track
  either theme automatically, and the base `input, textarea` rule now sets
  `background: transparent`, so this cannot regress silently for a future
  field that forgets to set its own background.

Deliberately still out of phase 2.7's settings: account deletion, a
cascading, account-wide delete that deserves its own scoped pass rather than
a rushed add here, two-factor auth, connected-account management, an
OS-synced "Auto Dark Mode," and any paid theme. None of these are
provider-managed or premium features we have a reason to build.

Phase 2.8, part 1: Board layout, grouping, and a persistent Layout preference.
Reopened Board a third time; see the resolution log entry dated 2026-07-05 for
why the earlier "reads as broken without drag-and-drop" objection no longer
holds. Settings' two-pane redesign, part of the original phase 2.8 scoping,
was not touched this pass; it stays Next, below, as part 2.

- `src/lib/layout.js` (`getLayout`/`setLayout`), mirroring `src/lib/theme.js`'s
  `localStorage` pattern exactly: one key, "list" or "board". The value lives
  in `AppData`'s context, not component state, so setting it in one view
  re-renders every other mounted view immediately; a page reload is not
  required to see it change elsewhere, and it survives a reload since it is
  read from `localStorage` on load.
- `src/components/LayoutTabs.jsx` (the List/Board toggle) and
  `src/components/LayoutControl.jsx` (a popover embedding `LayoutTabs`, then
  Group by, then Sort by) replace `src/components/SortControl.jsx` entirely
  (deleted). The trigger is labeled "Display", not the current layout name.
  Superseded in a later fix pass (see docs/resolution-log.md): Today and
  Upcoming get the full popover too, Group by and Sort by included, not just
  the tabs. Group None keeps each view's own fixed structure (Today's
  Overdue/Today split, Upcoming's day window); any other Group replaces it
  with virtual groups, same as Inbox and Project.
- `src/lib/group.js` (`groupTasks`): computes virtual groups from a flat root
  task list (`parentId: null`), keyed by the field's own value, never writing
  to the store. Priority groups are a fixed set of four (`Priority 1..3`,
  `No priority`), always rendered even when empty, so the column set is
  predictable. Date groups key by the literal `due.date` string, labeled with
  the existing `relativeLabel` helper, with a `No date` group last. Date added
  groups key by `createdAt` truncated to its calendar day, not the raw
  timestamp, since a raw timestamp is unique per task and would group
  nothing; there is no `No date` group here, every task has a `createdAt`.
- `ProjectView.jsx`: Group None renders the project's real Sections exactly as
  before (unchanged code path). Group Priority, Date, or Date added computes
  `groupTasks` over root tasks and renders those instead, as named sections
  (List, reusing `TaskList` so Sort and manual drag work the same as a real
  section) or as columns (Board, via the new `Board` component). Switching
  back to None restores the real Sections; grouping never mutates a task's
  `sectionId`, so nothing about a section changes while Group is briefly
  something else.
- `src/components/Board.jsx`: a generic column-of-cards renderer, sharing one
  drag state across the whole board the same way phase 2.7's cross-day
  reschedule needed shared state instead of `TaskList`'s per-instance
  isolation. Board only reports "a card moved from column A to column B" or
  "reorder column C"; the caller decides what that writes, via `onReorder`
  and `onCrossColumnDrop`, including the no-op cases (Today's Overdue column,
  Date-added groups). Cards are root tasks only, no nested sub-task cards,
  matching the precedent Today and Upcoming's card view already set.
- Cross-column drop semantics, all through the existing `store.updateTask`,
  no new store method: Group None writes `sectionId` (the column key, or
  `null` for the "No section" column), the one new cross-section case this
  phase allows. Group Priority writes `priority`. Group Date writes `due`,
  via `rescheduleDue` (keeping time of day) or `null` for the "No date"
  column. Group Date added is a no-op on cross-column drop, since `createdAt`
  is a system timestamp, not a drag-writable field, the same reasoning
  Overdue's non-reschedule-target status already established.
- `TodayView.jsx`'s Board is a fixed two-column `Board` (Overdue, Today).
  Dropping on Today reschedules via `rescheduleDue(..., todayISO())`;
  dropping on Overdue is a no-op.
- `UpcomingView.jsx`'s Board restores phase 2's original horizontal window:
  today plus the next six days, no Overdue column, since phase 2 never had
  one. Superseded in a later fix pass (see docs/resolution-log.md, dated
  after this one): Board now pages by week through the same `weekOffset`
  state and the same "‹ Today ›" control List uses, not the open-ended
  free-scroll this entry originally shipped; at `weekOffset` 0 it still
  starts on today. The existing phase 2.7 drag machinery (`sectionKeyFor`,
  `handleDrop`, `handleDropOnSection`, `renderRow`) is layout-agnostic, keyed
  on section keys rather than the visual shape, so it drives both the
  vertical List agenda and the horizontal Board columns unchanged.
- `src/lib/sidebar.js` (`getSidebarHidden`/`setSidebarHidden`), the same
  `localStorage` pattern again. A toggle icon sits in the sidebar's own head
  next to Settings when shown; when hidden, a small fixed icon at the
  content's top-left brings it back. `App.jsx`'s `Shell` holds the boolean.
- Found and fixed a real bug during live verification: `Board`'s
  `dragOverColKey` state starts at `null`, which collided with a column whose
  real key is legitimately `null` (the "No section" or "No date" column), so
  that column showed a permanent drag-over outline before any drag had
  happened. Fixed by also requiring a drag to be in progress
  (`dragId && dragOverColKey === col.key`).
- Verified Sort, Group, and Layout do not reset each other: set Sort to Date,
  switch Group to Priority, confirmed Sort's checkmark and the date-ordering
  inside the ungrouped column both survived; switched Layout to Board,
  confirmed both Group (Priority columns) and Sort (still Date-ordered within
  a column) survived that switch too. Checked live in Inbox, cross-checked
  against `localStorage` after each drag to confirm the written field
  (`priority`, `sectionId`, `due`) matched what the UI showed, not just that
  the card visually moved.

Deliberately still out this pass: Label as a Group-by field (a task can carry
more than one label, so it needs different, multi-membership drag semantics
than a single-valued field like Priority or Date; it deserves its own scoped
pass), Calendar layout (not reopened this round), the Filter section of the
Layout panel, and cross-project drag.

Phase 2.8, part 3: position-aware drag in ProjectView's List layout, and the
sidebar popover clipping fix. See the resolution log entry dated 2026-07-06.

- The sidebar's "Project options" and "Section options" popovers, and every
  other `Popover` consumer, now portal to `document.body` and position with
  `position: fixed` computed from the trigger's own bounding rect, instead of
  `position: absolute` inside the sidebar's `overflow-y: auto`. The old
  absolute positioning was clipped by that overflow regardless of z-index;
  portaling is the actual fix, not a z-index bump.
- `TaskList`'s cross-section reparenting (2026-07-05) is now position-aware in
  Inbox and Project's List layout (Group None, Sort Manual only, unchanged
  gate): the pointer's position within the hovered row's top or bottom half
  decides "insert as a sibling immediately before this row" versus "nest as
  its new last sub-task", replacing the old rule where any non-true-sibling
  drop always nested. An indented placeholder line previews the outcome in
  place of the old whole-row highlight, using the same 30px/56px steps
  `.task-row.sub`/`.sub2` already define, colored with the existing
  `--ds-red` token. A drop zone after a list's last row, or in an empty
  section or the no-section list, always means "append as a sibling at the
  end of that exact list", closing the two real gaps: no way to land a task
  top-level in a different section, and no drop target in an empty one. The
  cycle guard (`isDescendant`) still blocks a drop that would make a task its
  own descendant's child, checked for both outcomes now, since "insert
  before" can also cycle when the target's parent is a descendant of the
  dragged task. Today, Upcoming, and task detail keep the exact reorder/
  reparent mechanics phase 2.8's earlier passes shipped, opted out by
  default (`TaskList`'s new `positionAware` prop), since they never nest
  sub-tasks and this task's scope is List-layout ProjectView only.

Phase 2.8, part 4: inline add-task, replacing the centered modal for every
in-list entry point. See the resolution log entry dated 2026-07-06.

- `src/components/TaskAddForm.jsx`: the add-task fields (name, description,
  the chip row, and the project/section-and-Cancel/Add-task footer) and the
  `store.createProjectTree` write, extracted out of `QuickAddModal.jsx` so
  the form and the write path exist exactly once. Three chrome wrappers
  consume it: `QuickAddModal.jsx` (unchanged centered overlay, still used for
  "Add sub-task" and any other caller with no row to expand into),
  `src/components/InlineTaskAdd.jsx` (new, a thin-bordered box with no
  backdrop that replaces a "+ Add task" line in place), and the sidebar's own
  Add task button, which now opens a `Popover` (see below) wrapping the same
  form instead of the centered modal, since it has no row to expand into.
- Converted every in-list "+ Add task" line to `InlineTaskAdd`: the
  no-section list and each named section in `ProjectView.jsx` (Inbox
  included), and each day's line in `UpcomingView.jsx`. Left untouched, and
  out of scope for this pass: Board layout's own add affordance in both
  `ProjectView.jsx` and `Board.jsx` (a column button, not a list line), and
  the Group-not-None virtual-groups add-line in `ProjectView.jsx` (mirroring
  Phase 2.8 part 3's own Group-None-only scoping for position-aware drag).
  Today has no per-bucket "+ Add task" line to convert; its only add
  entry point was already the sidebar's global button.
- `src/components/Popover.jsx`'s outside-click check now treats a click
  inside any `.popover`-classed element as "inside," not just its own
  `popRef`. Needed once a popover could contain another popover (a picker
  opened from inside the sidebar's Add-task popover): both portal to
  `document.body` as separate subtrees, so the old
  `popRef.current.contains(e.target)` check missed a click inside the nested
  one and closed the outer popover by mistake.

Phase 3, part 1: the real structuring call, live, and its entry point. See
the resolution log entry dated 2026-07-06.

- `functions/index.js`'s `/api/structure` stub is now a real Anthropic
  Messages API call, on Claude Sonnet rather than the app's Haiku default, a
  deliberate, named exception (docs/architecture.md, docs/llm-pipeline.md).
  The response shape is constrained directly by a JSON Schema passed through
  structured outputs (`output_config.format`), so `src/pipeline/prompt.js`'s
  system prompt no longer has to ask for "strict JSON, no prose". Real
  `costUsd`/`inputTokens`/`outputTokens` are logged, replacing the hardcoded
  zeros. `DAILY_REQUEST_LIMIT` stays 100; `DAILY_COST_LIMIT_USD` moved from 1
  to 4 to fit Sonnet's roughly 3x per-token cost for a single dogfooding user.
- `src/pipeline/contracts.js`'s validator now only has to check what a schema
  cannot (numeric ranges, `sectionRef`/`targetProjectId` resolution,
  `decision`/`project` coherence) plus a new grounding guard
  (`isGroundedInTranscript`, moved here from the offline eval harness so a
  real call gets the same no-invention guard the evals always had).
  `src/pipeline/structure.js` retries once, the prior errors appended to the
  prompt, and fails closed (no partial or guessed structure) if the retry
  also fails.
- `src/pipeline/write.js` (new): the Stage 3 Write function this doc already
  described but that did not exist in code yet. `toProjectTree` flattens a
  validated response's nested `subtasks` into the `parentRef` siblings
  `store.createProjectTree` expects. A task's `due` (a natural-language or
  ISO string from the model) is not yet parsed into the store's
  `{ date, datetime, string, isRecurring }` shape, no date parser exists;
  carried as the `string` fallback so nothing crashes, but it will not
  bucket into Today/Upcoming until a real parser lands, a known, flagged gap.
- The entry point: a "Super Ramble" nav item in `Sidebar.jsx`, right after
  Add task, and `src/components/SuperRambleModal.jsx` (new): a plain
  textarea, an honest tips list (no marketing copy), and a submit that calls
  `/api/structure` through `structureTranscript`. On success it shows
  `reasoning` and `confidence` above a preview of the proposed tree, Cancel
  and Confirm; only Confirm calls `store.createProjectTree`. A
  `needsClarification` response shows the question instead of a tree, no
  Confirm, since there is nothing to confirm. A failure after the one retry
  is a plain error state, no proposal.
- The preview reuses `TaskRow` (not `TaskList`, which hard-wires the real
  store, drag state, and task-detail/complete/delete flows that make no
  sense against a tree with no ids yet) with a new `readOnly` prop (default
  `false`, so every existing caller is unchanged): the checkbox is disabled,
  the row is not clickable, and Add-sub-task/"..." are hidden entirely
  rather than left clickable-but-dead. `buildChildrenMap` (already exported
  from `TaskRow.jsx`) builds the preview's parent-child map from local refs
  the same way it does from real ids.

Phase 3, part 2: live trace capture and the confirm/cancel outcome, so the
offline suite can grow from real usage and real user judgment, not stay a
static set. See docs/resolution-log.md, 2026-07-07.

- Every real Structure call now persists to `users/{uid}/structureTraces`
  (transcript, response, token/cost usage, `outcome`), unconditionally, in
  production too, not gated behind `LLM_STORE_RAW_TRACES` (still a separate,
  real flag, still just a local `console.log`). This reopens
  `docs/architecture.md`'s prior "raw traces off in production" stance on
  purpose; the resolution log states why. `POST /api/structure/outcome`
  records the user's own confirmed or cancelled decision, sent from
  `SuperRambleModal.jsx` right when Confirm or Cancel is clicked in the
  preview.
- `scripts/list-traces.mjs` and `scripts/promote-trace.mjs` (new, local,
  Application Default Credentials, not the Function's own path) review real
  traces, cancellations first since a rejected proposal is the highest-signal
  case, and turn a reviewed one into a new `evals/fixtures/*.json` entry. A
  confirmed trace promotes as-is (a person already accepted that exact tree);
  a cancelled trace needs a hand-written correction, never an auto-trusted
  copy of what nobody wanted. Neither script bypasses `validateStructure` or
  the grounding guard.
- The preview stays read-only (no way to edit a proposed tree before
  confirming), so the outcome this pass captures is exactly two states,
  confirmed or cancelled, not three. A future editable-preview pass would add
  "confirmed with edits" as a real third state; that is its own future
  decision, not approximated here.
- Also fixed, reported directly as a live bug: the Structure call's
  `max_tokens` was 4096, too low for a rich, multi-section dump, which
  truncated mid-JSON with no way to tell that apart from a genuinely
  malformed response. Raised to 8192, given its own distinct error message,
  and the raw-trace debug log moved earlier so a failure is actually visible
  in it. `evals/offline/guard-cases.mjs` (new) covers the retry-then-fail-
  closed path this surfaced had zero offline coverage for.
- Still not built, unrelated to the Firestore-backed capture above: a local
  file writer for `llm-traces/` itself (`npm run trace:summary` still has
  nothing to read; no Vite dev-bridge or emulator proxy exists for a local
  live call to write from), and `docs/llm-pipeline.md`'s empty-input/
  oversized-input guard cases. Each stays its own scoped pass.

Phase 3, part 3: task detail overflow menu, timestamps, and comments. See
docs/resolution-log.md, 2026-07-07.

- `TaskDetail.jsx`'s full-width "Delete task" button is gone from the main
  body. A small "..." trigger sits in the modal header, left of the existing
  close X, opening the same `Popover` Sidebar.jsx's project menu uses, with
  one item, "Delete task" in `--ds-red`. Confirm-before-delete is unchanged,
  the same `ConfirmDialog` flow. Reported directly against a screenshot: the
  Added/Updated timestamps this pass first put inside that same popover
  moved to the bottom of the right rail instead, below Reminders, after a
  hairline divider (`.detail-rail-divider`, `.detail-meta-line`); a static
  info line does not belong behind a menu trigger a user only opens to
  delete something. "Added <date>, <time>" always shows; "Updated <date>,
  <time>" shows only when `updatedAt` differs from `createdAt`.
- Comments: `users/{uid}/comments/{commentId}` (`taskId`, `content`,
  `postedAt`), a store method on both adapters (`listComments`,
  `createComment`), and `firestore.rules` scoped to the owner, matching the
  `tasks`/`labels` rule shape. `TaskDetail.jsx` renders each comment as an
  avatar-initial circle, its content, and a relative timestamp, under the
  sub-tasks list, with a single-line input below that posts on Enter, the
  same immediate-write convention every other field on this view already
  follows. Create and list only, this pass. No edit, no delete, no
  attachment affordance; each is a stated boundary, not a silent gap.

Phase 3, part 4: voice capture, Stage 1 (Transcribe) made real. See
docs/resolution-log.md, 2026-07-08. This entry claims a number this doc's
own Next section had reserved for the Todoist OAuth pass below; that entry
is renumbered to "Phase 3, part 5," bookkeeping only, not a re-scoping,
the same convention the 2026-07-07 comments entry above already used when
it displaced Todoist OAuth from "part 3" to "part 4."

- `POST /api/transcribe` (`functions/index.js`): audio in, transcript out,
  via Groq's hosted Whisper Large v3 Turbo (`whisper-large-v3-turbo`), an
  OpenAI-compatible transcription API. JSON request body
  (`audioBase64`/`mimeType`/`durationSeconds`), matching `/api/structure`'s
  own shape; the outgoing call to Groq is multipart, built with Node 20's
  native `fetch`/`FormData`/`Blob`, not a new `openai` dependency. A 300
  second (5 minute) duration cap and a 10MB decoded-payload cap, both
  rejected with `400` before any Groq call. Shares `checkAndReserveLimit`/
  `logUsage` and the one `users/{uid}/llmUsage` daily ceiling
  `/api/structure` already uses, not a second parallel limit system;
  `logUsage` gained an optional `audioSeconds` counter. No dedicated trace
  collection, a deliberate scope decision: Structure's trace-and-eval
  flywheel exists to improve a prompt of our own, Transcribe has none to
  improve, so there is nothing for a parallel collection to feed.
- `src/components/VoiceRecorder.jsx`: a mic control owning permission state,
  `MediaRecorder`, and a live audio-level indicator (the Web Audio API's
  `AnalyserNode` against the live stream, one CSS-scaled dot, no canvas, no
  waveform library), wired into `SuperRambleModal.jsx` alongside the
  existing textarea. All real permission states handled: granted starts
  recording immediately; denied shows an inline message without breaking
  typed input; no device found gets its own message; `getUserMedia`/
  `MediaRecorder` missing entirely degrades the control to disabled rather
  than throwing. Auto-stops and transcribes at the duration cap, timer
  visibly approaching it first. The transcribed text lands in the same
  textarea state as typed text (appended with a separator if non-empty,
  replacing if empty); nothing auto-submits, "Structure it" behaves exactly
  as it does for typed input, a deliberate checkpoint while voice quality is
  still being watched, not a placeholder for something more automatic.
- `docs/design-system.md` gained a "Recording indicator" section
  documenting the pattern (`--ds-red` active state, one scaled dot, a
  monospace timer) for reuse by a future recording control.

Phase 3, part 5: voice recording prominence, a copy pass, and a routing-
clarification refinement. See docs/resolution-log.md, 2026-07-08. This entry
claims the number the Next section reserved for the Todoist OAuth pass
below; that entry is renumbered to "Phase 3, part 6," bookkeeping only, not
a re-scoping, the same convention part 4 above already used.

- `VoiceRecorder.jsx` gains a `variant` prop, `"compact"` (the small idle
  control) and `"full"` (a dedicated centered view once recording starts: a
  bigger `AnalyserNode`-driven ring, a stop button, and a timer), replacing
  the single small widget part 4 shipped. One component stays mounted across
  the `state === 'input'` to `state === 'recording'` transition in
  `SuperRambleModal.jsx`, only its `variant` prop changing, so the active
  `MediaRecorder` session survives the swap instead of being torn down mid-
  recording. Escape and click-outside-to-close are now blocked during
  `recording`, the same guard `loading` already had. `docs/design-system.md`'s
  "Recording indicator" section rewritten for the two-variant shape.
- A copy pass on both layers: the primary button reads "Make tasks," not
  "Structure it," and the loading line reads "Turning what you said into
  tasks." `SYSTEM_PROMPT` (`src/pipeline/prompt.js` and `functions/index.js`,
  diff-verified identical) no longer uses "dump" as the noun for what the
  user said, and now tells the model to write `reasoning` the way a person
  would describe what they heard, not by echoing "the dump" or "the
  transcript" back. Not independently verified against a real live call this
  pass; see docs/resolution-log.md.
- The loading state cycles three short tips (naming an existing project,
  dependency phrasing becoming sub-tasks, urgency and dates carrying into
  priority and due date) every 3.4 seconds, replacing one static sentence.
- `needsClarification` narrowed to routing uncertainty only, never
  uncertainty about whether content is project-shaped; the confidence-based
  `"tasks"` fallback from the 2026-07-06 decision is untouched. See
  docs/llm-pipeline.md's Stage 2 section and
  `evals/fixtures/10-clarify-belongs-to-existing-or-new.json`.
- A hairline divider in the sidebar between Super Ramble and Inbox.

Phase 3, part 6: usable at phone width (375-428px), a defensive pass, not a
redesign. See docs/resolution-log.md, 2026-07-08. This entry claims the
number the Next section reserved for the Todoist OAuth pass below; that
entry is renumbered to "Phase 3, part 7," bookkeeping only, not a
re-scoping, the same convention used twice already in this doc.

- The sidebar becomes a closed-by-default overlay below 640px instead of a
  fixed flex sibling squeezing the content column; opens on tapping the
  reveal button, closes on an outside tap or Escape. The persisted show/hide
  preference (`src/lib/sidebar.js`) is untouched by this: it is a desktop
  choice, tracked separately in memory at phone width, verified directly by
  checking the stored value stayed unchanged across open/close cycles and a
  resize back to desktop.
- `Popover.jsx`'s two-pass positioning now resolves all four viewport edges
  (previously only the right one): clamps the left edge to a margin, flips
  above the anchor if it would overflow the bottom edge. Every picker built
  on `Popover` gets this for free.
- `.modal` gained a `max-height` and internal scroll (`.modal-body`) instead
  of letting a tall modal push its own footer off-screen on a short phone
  screen.
- Found and fixed live, not assumed from the CSS: `TaskDetail.jsx`'s
  two-column layout (a flexible main column beside a fixed 220px rail)
  crushed the main column to unreadable width below 640px, wrapping task
  titles character by character. Stacks vertically instead at that width.
- `VoiceRecorder.jsx`'s full-recording view and all six `SuperRambleModal`
  states (input, recording, loading, preview, error, needsClarification)
  verified live at 375/390/414/428px, in both themes.
- Board layout's own responsive behavior stays out of scope; a phone-width
  viewport always gets List, regardless of the stored Layout preference.
  Touch-based drag-and-drop reordering is a separate, later decision.

Phase 3, part 7: section options completeness (Edit, Move to project) and a
section description field. See docs/resolution-log.md, 2026-07-08. This
entry claims the number the Next section reserved for the Todoist OAuth pass
below; that entry is renumbered to "Phase 3, part 8," bookkeeping only, not
a re-scoping, the same convention used repeatedly above.

- Reported directly against a live Board-view screenshot: a section's own
  options menu only had Delete. Now has Edit and Move to..., matching what
  was asked for; Duplicate, Archive, and Copy link to section, all present
  in Todoist's own menu, stay out, the same precedent the Project overflow
  menu already set for exactly this kind of real-Todoist-menu trimming.
  `src/components/SectionOptionsMenu.jsx` (new): one Popover, Edit/Move
  to.../Delete, used identically by both List layout's section head
  (`ProjectView.jsx`) and Board layout's column head (`Board.jsx`), so a
  section gets the same menu regardless of layout. "Move to..." swaps the
  popover's own content to a project list (Inbox first, then
  `flattenProjectTree`, minus the section's current project) instead of a
  second nested Popover; simpler, and this menu is small enough that one
  panel swapping content reads fine.
- `sections` gains `description` (string, default ''), the same
  optional-blurb pattern `projects.description` already established in
  phase 2.5. `src/components/SectionForm.jsx` (new): the shared Add/Edit
  section form, a name field and a description field, replacing the old
  bare "Section name" input. Renders inline in place, the same convention
  `docs/design-system.md`'s "Inline add-task" section already set for
  `InlineTaskAdd`: a thin-bordered box, no backdrop, no centered card.
  Editing a section swaps its head row for this form in place, in both
  layouts; Board also gained a trailing "+ Add section" stub column, since
  Board previously had no way to add a section at all. A non-empty
  description shows read-only under the section head
  (`.section-description` in List, `.board-col-desc` in Board) once saved;
  editing only happens through the form, not by typing in place, unlike
  `ProjectDescription`'s own live-autosave textarea.
- `store.moveSectionToProject(sectionId, projectId)` (new, both adapters):
  moves the section's own `projectId`, and cascades every task under it,
  its direct tasks plus their whole sub-task chain via `parentId`, the same
  descendant walk `deleteTask` already uses, to the new project too. Moving
  only the section without its tasks would strand them: a task left on the
  old `projectId` while its section moved would render nowhere real, since
  every view filters tasks by `projectId`.

Phase 3, part 8: live Todoist OAuth connect and a one-shot, new-project-only
push. See docs/resolution-log.md, the Todoist OAuth entry. This entry
claims the number the Next section had reserved for it, bookkeeping only,
the same convention used repeatedly above.

- This is not sync. It is a second, independent write of a confirmed Super
  Ramble project into the user's real Todoist account, alongside the
  existing local `store.createProjectTree` write, at the same Confirm
  click. After that write, the local copy and the Todoist copy have no
  relationship; editing one never touches the other. "Sync" is deliberately
  avoided in every piece of UI copy and doc prose describing this feature.
- `SettingsModal.jsx` gains a Todoist section, next to Account and Theme:
  not connected shows a short line explaining what connecting does (push a
  confirmed project into the real account, on explicit choice each time,
  nothing automatic) and a "Connect Todoist" button; connected shows a
  "Connected" state and a "Disconnect" button. Local preview shows a note
  instead, the same pattern Account's own isLocal branch already uses:
  connect needs a real signed-in account.
- OAuth connect: `src/todoist/index.js` builds the authorize redirect
  (`https://app.todoist.com/oauth/authorize`, scope `data:read_write`, a
  CSRF `state` round-tripped through `sessionStorage`). The app has no
  client-side router, so `redirect_uri` is the app's own root URL
  (`https://super-ramble.web.app/`), not a dedicated callback route;
  `App.jsx` checks for `?code&state` once on load, verifies `state`, and
  strips the query params via `history.replaceState` so a refresh never
  re-triggers the exchange. `POST /api/todoist/oauth` (functions/index.js)
  exchanges the code for a token using `TODOIST_CLIENT_SECRET.value()` and
  stores it under `users/{uid}/todoistAuth/token`, denied to every client
  read and write in `firestore.rules`, the `structureTraces` treatment,
  documented in docs/architecture.md as its own distinct case (the Function
  has to read this one in plaintext, unlike encrypted personal task text).
- The Todoist app behind `VITE_TODOIST_CLIENT_ID` has refresh tokens
  enabled: the access token is short-lived (about an hour) and comes with a
  `refresh_token`, rotated on every refresh. `POST /api/todoist/write`
  refreshes the stored token first when it is expired or close to it,
  verified live against developer.todoist.com before assuming this shape
  rather than the simpler "token never expires" shape a legacy app would
  get; see docs/architecture.md's "Token refresh" note.
- `GET /api/todoist/status` and `POST /api/todoist/disconnect` are new,
  small additions this pass needed beyond the two originally-stubbed
  endpoints: the stored token is never client-readable, so Settings has no
  way to know whether a connection exists without asking the Function, and
  Disconnect has to be a server call since the client can't delete an
  admin-only document itself. Disconnect calls Todoist's own real revoke
  endpoint (`DELETE /api/v1/access_tokens`, verified live, not assumed)
  before deleting the stored token either way; the response's `revoked`
  field says which actually happened, so the UI never overclaims what
  Disconnect did.
- The write: in `SuperRambleModal.jsx`'s preview, when Todoist is connected
  and the response is a confident new project (`decision === "project"`, no
  `targetProjectId`), a toggle appears next to Confirm/Cancel, "Also create
  in Todoist," default off every time, never persisted: this is a second
  real external write, and confirm-before-write is the app's whole premise.
  Hidden entirely in every other case (routing into an existing project,
  loose tasks, not connected). On Confirm with the toggle on, the local
  write runs first; only if it succeeds does `createTodoistClient(...)
  .createTree(tree)` run, POSTing to `/api/todoist/write`. A Todoist-side
  failure never rolls back or blocks the local write that already landed;
  the toast says so plainly rather than presenting a single pass/fail.
- `functions/todoist.js` (new): the pure translation, no Firebase/Anthropic
  imports on purpose, so it is importable from `scripts/eval-todoist.mjs`
  with no live dependency. `toTodoistPriority` inverts this app's priority
  (1 = most urgent) to Todoist's own scale (4 = most urgent), the same bug
  class already fixed once in the Structure prompt (docs/resolution-log.md);
  `buildSyncCommands` maps a confirmed tree to a batched
  `POST /api/v1/sync` call (`project_add`, `section_add`, `item_add`,
  `temp_id`/`parent_id`/`section_id`, a nested `due: { string }` carrying
  the model's raw due string through unparsed). The command shape was
  checked against a docs summary before writing it, but the due field's
  exact shape was still wrong on the first pass, a flat `due_string` rather
  than nested `due: { string }`: Todoist's own API accepted it silently
  ("ok" in `sync_status`) while leaving the due date `null`. Only a live
  write against a real account, read back afterward, caught this; see the
  resolution log's Todoist OAuth entry.
- `scripts/eval-todoist.mjs` (new, following `scripts/eval-date.mjs`'s exact
  pattern: a plain Node script, no fixtures, no model, wired into
  `npm run eval`): asserts the priority-inversion direction both ways and
  that the due string carries through unmodified as the nested
  `due: { string }` shape, deterministic coverage for a path with no model
  call to mock.
- Deliberately not this pass, each its own future scoped pass: routing a
  Todoist push into an existing Todoist project (`readProjects`/
  `readLabels` stay stubbed), labels, per-task description, or project
  color on the push, and a real natural-language date parser (the pushed
  due string is still the model's raw string, exactly as the local store
  already carries it).

Phase 3, part 9: Todoist OAuth redirect-URI fix, and a sidebar "My
Projects" pattern. Two unrelated fixes shipped together in one pass, the
same bundling shape part 5 above already used. This entry claims the
number the Next section had reserved for it, bookkeeping only, the same
convention used repeatedly in this doc; the date-parser/labels/routing
entry that number used to point to is renumbered to "Phase 3, part 10"
below.

- The Todoist App Console's registered redirect URL was corrected to drop
  its trailing slash after part 8 shipped (Todoist rejects a trailing slash
  on a registered redirect URL as invalid); `TODOIST_REDIRECT_URI`
  (`src/todoist/index.js`) still had one, so the authorize redirect and the
  registered value no longer matched and Connect Todoist failed with
  "Invalid redirect URI." Dropped the trailing slash
  (`https://super-ramble.web.app`, no trailing `/`). This is the value's
  only copy: `functions/index.js`'s `/api/todoist/oauth` handler takes
  `redirectUri` from the request body rather than holding a second,
  hand-synced constant, so fixing the one constant fixed both the browser
  redirect and the server-side token exchange's own `redirect_uri` check at
  once, nothing else to keep in sync.
- Sidebar "My Projects": `Sidebar.jsx`'s `.nav-section-label` text changes
  from "Projects" to "My Projects," matching native Todoist. A chevron next
  to the label (`.nav-section-caret`) collapses the whole root project list
  at once, a separate, persisted preference from a single project's own
  children collapsing via its own `ProjectNode` caret (unpersisted,
  unchanged). `src/lib/projectsPanel.js` (new): the same
  `localStorage`-preference pattern `src/lib/theme.js`, `src/lib/layout.js`,
  and `src/lib/sidebar.js` already use, one new small file, not component
  state that resets on reload.
- Each sidebar project row's `.project-dot` (a filled circle) is replaced
  with `.project-hash`, a colored "#" character, matching Todoist's own
  sidebar convention; still driven by the same `colorHex(project.color)`
  value, now as text color instead of a background fill. `.project-dot`
  itself is untouched and still used everywhere else a project's color
  shows (the Add Project color picker, a task's meta line, a project view's
  own title): a sidebar-list-specific convention, not a global one.
- `docs/reference/` was checked for real Todoist sidebar screenshots before
  starting the sizing-audit half of this task; none exist yet, only the
  folder's own README placeholder. `.nav-item`, `.nav-section-label`,
  `.project-dot`/`.project-hash`, and `.count` sizing is therefore
  unchanged from before this pass, not touched on a guess; a future pass
  with real sidebar screenshots in `docs/reference/` should do that audit
  for real. See `docs/design-system.md`'s "Sidebar project list" section
  and `docs/reference/README.md`'s updated expected-set list.

Phase 2.8, part 2: Settings two-pane layout and user-avatar menu polish.
Built 2026-07-10, part of the same pass as the six-item Todoist-parity
work below. Corrected before building: this entry originally said "only
Account and Theme are real categories," written before phase 3 part 8
shipped the Todoist connect section; `SettingsModal.jsx` has three real
sections (Account, Theme, Todoist), so the two-pane category list is
three items, not two.

- Settings is a real two-pane layout: a category list on the left
  (Account, Theme, Todoist), the selected category's detail on the right.
  Each category's own content, field order, `isLocal` branches, and
  `ConfirmDialog` flows are unchanged from the old single stacked-list
  layout; only the chrome around them changed.
- The sidebar's avatar/name is now a real dropdown trigger: a name/task-
  count header, a divider, then a "Synced <time ago>" row, a client-side
  timestamp of the last successful store write (`AppData.jsx`'s `bump()`),
  not a real sync engine. Explicitly left out, per the roadmap's own
  Out-of-scope list and a real Todoist screenshot used for reference: Add
  a team, a duplicate Reporting entry, Print, What's new, Try Pro, the
  changelog line. Settings stays reachable the way it already was too (the
  gear icon), this is additive, not a replacement for it.

See docs/resolution-log.md, 2026-07-10, for what was verified live versus
only checked via build and eval.

Phase 3, part 11: reference examples moved from source files into Firestore,
and grading became automatic, triggered, with a real (bounded) auto-
promotion path instead of a person running a script by hand. See
docs/resolution-log.md's dated entry for this pass.

- `referenceExamples` (new, top-level Firestore collection,
  `docs/architecture.md`) replaces `src/pipeline/referenceExamples.js` and
  `functions/referenceExamples.js`, both deleted once
  `scripts/seed-reference-examples.mjs` confirmed the original four hand-
  picked examples landed with `source: "seed"`. `functions/index.js`'s
  `/api/structure` handler fetches the current pool at request time
  (`addedAt` descending, capped at 30) instead of reading a value frozen at
  build time; `src/pipeline/prompt.js`'s `SYSTEM_PROMPT` goes back to being
  just the written rules, the reference-example block is not something it
  builds anymore.
- `gradeStructureTrace` (new, `functions/index.js`), an `onDocumentWritten`
  trigger on `users/{uid}/structureTraces/{traceId}`: grades a trace on
  Haiku automatically the moment its outcome is written, the same call
  `scripts/grade-traces.mjs` already made by hand, now triggered instead of
  run as a batch job. `grade-traces.mjs` itself is unchanged, now a
  backfill tool for traces that predate the trigger or a failed
  invocation.
- Auto-promotion, the same trigger, right after grading: when a trace is
  `confirmed_with_edits` and the grader also flags the original response,
  the trigger reconstructs the corrected tree from `response` plus `edits`
  and, if that reconstruction and a contract check
  (`functions/contracts.js`, a new hand-synced copy of
  `src/pipeline/contracts.js` for the same cross-boundary reason
  `STRUCTURE_SYSTEM_PROMPT_RULES` already needs one) both succeed, writes
  it into `referenceExamples` as `source: "auto-promoted"`. Reconstruction
  is honest about a real limitation (an "edited, then removed" task cannot
  be recovered from the persisted diff alone) rather than guessing; when it
  can't fully account for the edits, promotion is skipped, not attempted
  with a possibly-wrong tree.
- `pipelineLearningLog` (new, top-level Firestore collection): one entry
  per trace the grader flagged, `kind: "auto-promoted"` or `"flagged"`.
  `scripts/review-queue.mjs` (new) lists unresolved flagged entries for the
  monthly human review, with an optional manual promotion
  (`source: "manual"`) reusing `scripts/promote-trace.mjs`'s own
  validation. `scripts/sync-learnings.mjs` (new) is the one step that
  mirrors resolved log entries into `docs/pipeline-learnings.md`, so that
  file stays something a person reads, not something a live Function
  writes to directly.
- `scripts/check-prompt-sync.mjs` stopped checking a
  `referenceExamples.js` pair (it no longer exists) and started checking
  `contracts.js`'s new pair instead, behaviorally (a shared set of probe
  cases run against both copies and compared), since a validator is code,
  not a string that can be diffed byte for byte the way `SYSTEM_PROMPT`
  can.
- Offline evals needed no mocking changes at all:
  `structureTranscript` (`src/pipeline/structure.js`) never imported
  `src/pipeline/prompt.js` or touched Firestore before this pass either, so
  removing prompt.js's own Firestore-adjacent dependency (there never was
  one directly, only via the now-deleted `referenceExamples.js` import)
  left the offline suite's zero-credit, zero-network guarantee completely
  intact, verified directly (`functions/node_modules` removed, full
  `npm run eval` rerun clean) rather than assumed.

Async Structure: the item the "Next" section below used to name is now
built. `POST /api/structure` enqueues only (a fast trace write, `status:
"processing"`, responds `{ traceId }` immediately); `processStructureTrace`
(new, `functions/index.js`, an `onDocumentCreated` trigger on
`users/{uid}/structureTraces/{traceId}`) does the real model call
asynchronously and merge-writes the result. The client
(`SuperRambleModal.jsx`) subscribes to its own trace document via Firestore
`onSnapshot` instead of awaiting one long HTTP response, exactly the
approach this section named. This closes the user-facing complex-transcript
`502` docs/resolution-log.md's 2026-07-14 entries root-caused (Firebase
Hosting's rewrite proxy cutting the connection around 90-100s): there is no
long-lived request left for that layer to cut off. See
`docs/architecture.md`'s "Background triggers" section for the full
contract, including the real outcome-race guard (a user can Discard while
still waiting) and `scripts/structure-timing-stats.mjs` for the real timing
data this pass's UI copy and trigger `timeoutSeconds` are both based on. See
the resolution log entry for this pass for live verification against the
deployed site.

Phase 3, part 12: five scoped pieces closing gaps found comparing this
app's own output against a real screenshot of Todoist's own "Text Scan" AI
feature on the identical input. See the resolution log's dated, itemized
entry for this pass for the full detail behind each.

- A real natural-language date parser (`chrono-node`, a new dependency) in
  `toDue()` (`src/pipeline/write.js`), replacing the human-readable-only
  fallback part 1 shipped: a Structure-created task now buckets into Today
  and Upcoming, matching Todoist's own bucketable date chip on the
  identical input. `scripts/eval-date-parse.mjs` (new) covers it.
- The editable preview extended to priority, due date, and section
  membership, alongside the removal/rename/content edits it already had;
  see `docs/design-system.md`'s "Super Ramble preview" section and
  `docs/llm-pipeline.md`'s "Live capture and the eval flywheel". The three
  new edit kinds are not yet replayed by `gradeStructureTrace`'s
  auto-promotion path, a stated scope boundary.
- A task-count summary and a pinned raw-input snippet at the top of the
  preview.
- A thumbs up/down feedback signal (`POST /api/structure/feedback`, new),
  independent of the existing confirm/cancel outcome telemetry, captured
  and persisted only this pass, not yet wired into grading.

`docs/architecture.md`'s `structureTraces` field list, `docs/llm-pipeline.md`,
and `docs/design-system.md` are all updated in the same pass.

## Next

Phase 1's real timing data (`scripts/structure-timing-stats.mjs`) is still a
small sample (8 real calls as of this pass). Re-run it periodically as more
real Structure calls accumulate, and revisit the waiting-state UI copy in
`SuperRambleModal.jsx` and `processStructureTrace`'s own `timeoutSeconds`
once a larger sample exists; both are explicitly reasoned from this small
sample today, not a final number.

`scripts/diagnose-hosting-cutoff.mjs` (the direct-Cloud-Run-URL test) is
still real, standalone follow-up work if it is ever still worth confirming
exactly which upstream layer enforced the ~90-100s cutoff; it is no longer
a blocker for the user-facing bug, now closed by the async-Structure work
above.

Phase 3, part 10: `labels`, per-task `description`, and project `color`
joining the Structure contract, each its own scoped pass, not bundled
together. Routing a Todoist push into an existing Todoist project, once
`readProjects`/`readLabels` are real. A real natural-language date parser,
the other item this entry used to name, is now built (phase 3 part 12,
above); it also feeds a future Todoist push a real, parsed date instead of
the model's raw string, though the two stay separate concerns, the push
itself untouched by that pass on purpose. This entry's number was bumped
from "part 9" to "part 10" when the redirect-URI-fix and sidebar entry
above claimed part 9, bookkeeping only, the same convention used repeatedly
in this doc. `docs/architecture.md`'s pipeline summary was brought in line
with the combined-call, Sonnet-exception shape in phase 3 part 1; nothing
outstanding there.

Two follow-ups from phase 3 part 12, above, each its own scoped pass:
replaying `priorityEdits`/`dueEdits`/`sectionEdits` onto
`gradeStructureTrace`'s auto-promotion tree (currently skipped outright
when any are present); and wiring the new thumbs up/down `feedback` field
into grading or auto-promotion, currently captured and persisted only.

## Out of scope

- Competing on capture quality or live-audio streaming.
- Auto-execution without confirmation.
- Calendar layout. Considered and declined outright when Board was first
  discussed, not reopened when Board was reopened in phase 2.8.
- A Filters page, a saved-filter query language, or the Layout panel's Filter
  section (by date, priority, or label). Grouping and sorting are in, phase
  2.8; filtering stays out; label, priority, and date stay task properties,
  not a separate filter system.
- A Labels management page. Labels are created, applied, and deleted inline
  from the label picker on a task, never from a standalone page. Label as a
  Group-by field is also out, phase 2.8, multi-valued fields need different
  drag semantics than Priority or Date.
- Search logic, Reporting, Favorites, Share, templates, CSV, attachments,
  location, deadline, extensions. Comments reopened phase 3 part 3; see the
  Built section above and docs/resolution-log.md, 2026-07-07.
- Cross-project drag, in every layout.
- Full account deletion, two-factor auth, connected-account management,
  OS-synced auto dark mode, and paid themes. Settings gets sign-out, a
  read-only account view, and a Light/Dark toggle in phase 2.7; nothing
  past that.
